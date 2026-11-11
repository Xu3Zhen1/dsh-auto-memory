#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""#201 / C-01 判据：doc 侧 token-id 路径只截断、不重复包装 specials。

背景（2026-11-11 取证）：
  python/worker_semantic_v1.py 的 real-provider 分支原为
      encode_items.append(self.embedder.build_doc_ids(ids))
  而 build_doc_ids 会加 [CLS]/[SEP]，随后 encode_ids 内部
  （m7_embedding_v1.py 的 part = [prefix + ids + suffix ...]）再加一次
  => corpus 侧 [CLS][CLS]+body+[SEP][SEP]:
     1) 与 query 侧（单包，见 encode_query 的 audit fix P1）模板不一致（template drift）；
     2) CHUNK_MAX_TOKENS=512 的 chunk 经双包后达 514 tokens，超出 512 预算。

修法：build_doc_ids 增加 wrap 关键字（默认 True 保持既有调用方逐字节不变），
      worker 调用点传 wrap=False => 只保留 512 截断职责，包装交给 encode_ids 单次完成。

判据设计（为何不能只断言「改过」）：
  A（兼容）：wrap=True 仍返回 prefix+body+suffix —— 防「顺手改坏默认值」；
  B（职责）：wrap=False 返回裸 body，不含任何 special token；
  C（端到端）：模拟真实链路 body -> (wrap=False) -> encode_ids 包装，最终长度必须 <= 512；
  D（负控）：同一链路改成 wrap=True 复算，长度必须 > 512 ——
     否则说明夹具造不出违规输入，C 就是恒真判据。

Run: python tests/test_c01_doc_ids_wrap.py   (exit code = 结果)
"""
import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'python'))

import m7_embedding_v1 as emb  # noqa: E402

MAX_TOTAL = 512
SPECIALS = ([101], [102])  # XLM-R: <s>=101, </s>=102（与 _specials 同形）


def _bind(cls):
    """把真实 build_doc_ids 绑到一个只提供 _specials() 的假对象上（不需要模型）。"""
    fake = types.SimpleNamespace()
    fake._specials = lambda: SPECIALS
    fake.build_doc_ids = types.MethodType(cls.build_doc_ids, fake)
    return fake


class DocIdsWrapTest(unittest.TestCase):

    def _classes(self):
        return [emb.BgeM3Embedder, emb.BgeM3OnnxInt8Embedder]

    def test_A_default_still_wraps(self):
        """断言 A：默认 wrap=True 行为不变（向后兼容）。"""
        for cls in self._classes():
            f = _bind(cls)
            body = list(range(10))
            got = f.build_doc_ids(body)  # 不传 wrap => 默认 True
            self.assertEqual(got, SPECIALS[0] + body + SPECIALS[1],
                             cls.__name__ + ': 默认必须仍包一次 specials')

    def test_B_nowrap_returns_bare_body(self):
        """断言 B：wrap=False 返回裸 body，不含 specials。"""
        for cls in self._classes():
            f = _bind(cls)
            body = list(range(10))
            got = f.build_doc_ids(body, wrap=False)
            self.assertEqual(got, body, cls.__name__ + ': wrap=False 必须返回裸 body')
            prefix, suffix = SPECIALS
            self.assertNotEqual(got[:len(prefix)], prefix,
                                cls.__name__ + ': wrap=False 不得含前缀 special')
            self.assertNotEqual(got[-len(suffix):], suffix,
                                cls.__name__ + ': wrap=False 不得含后缀 special')

    def test_C_end_to_end_within_budget(self):
        """断言 C（核心）：真实链路最终长度 <= 512。"""
        self.assertEqual(MAX_TOTAL, emb.CHUNK_MAX_TOKENS,
                         '夹具假设 CHUNK_MAX_TOKENS == 512；若常量变了本判据需同步')
        for cls in self._classes():
            f = _bind(cls)
            prefix, suffix = SPECIALS
            full_chunk = list(range(1000, 1000 + emb.CHUNK_MAX_TOKENS))  # 真实最坏情况
            body = f.build_doc_ids(full_chunk, wrap=False)
            wrapped = list(prefix) + list(body) + list(suffix)  # 模拟 encode_ids
            self.assertLessEqual(
                len(wrapped), MAX_TOTAL,
                cls.__name__ + ': 最终长度 %d 超预算 %d' % (len(wrapped), MAX_TOTAL))

    def test_D_negative_control_old_behavior_overflows(self):
        """断言 D（负控自证）：旧行为（双包）必须超出预算，否则 C 是恒真判据。"""
        for cls in self._classes():
            f = _bind(cls)
            prefix, suffix = SPECIALS
            full_chunk = list(range(1000, 1000 + emb.CHUNK_MAX_TOKENS))
            old_body = f.build_doc_ids(full_chunk)  # 旧：wrap 一次
            double = list(prefix) + list(old_body) + list(suffix)  # encode_ids 再包
            self.assertGreater(
                len(double), MAX_TOTAL,
                cls.__name__ + ': 旧行为应为 %d > %d；若不然本套件的负控失效'
                % (len(double), MAX_TOTAL))



    def test_E_worker_call_site_passes_wrap_false(self):
        '''断言 E（调用点）：worker 的 doc 路径必须传 wrap=False。

        为什么必须单独断言：只验 build_doc_ids 的语义，改完方法却忘了在 worker 传参
        会全绿 —— 缺陷仍在。故直接对调用点取证（源码层，与仓库既有惯例一致）。
        '''
        src_p = os.path.join(ROOT, 'python', 'worker_semantic_v1.py')
        with open(src_p, encoding='utf-8') as f:
            src = f.read()
        self.assertIn('build_doc_ids(ids, wrap=False)', src,
                      'worker doc 路径必须显式传 wrap=False（否则 encode_ids 会二次包装）')
        self.assertNotIn('build_doc_ids(ids))', src,
                        'worker 仍存在无 wrap 参数的老调用 ⇒ 双包未修')

if __name__ == '__main__':
    unittest.main(verbosity=2)