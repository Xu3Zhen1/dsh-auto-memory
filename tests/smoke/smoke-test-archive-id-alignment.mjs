#!/usr/bin/env node
/**
 * R136 守卫：归档「口径对齐」—— 给宿主的 sessionId 必须是会话头里的真实 id。
 *
 * 真根因（实测）：canonicalSessionId(segment) 恒补 `session-` 前缀，而本机 243 个中枢会话目录里
 * 237 个是裸 uuid 段、会话头 id 也是裸 uuid（headerId === canonical(segment) 仅 6/243）
 * ⇒ 插件拿 `session-<uuid>` 去 reg.archiveSession()，宿主 sessionKnown 认的是裸 uuid
 * ⇒ 180 个候选全部 WorkspaceUnknownSessionError，archived 恒 0。
 *
 * 判据（结构 + 行为两块，缺一不可）：
 *   A. 结构：sweep 里 rows 必须带 archiveId，归档调用必须用 archiveId 作 target；
 *   B. 行为：抽 _sessionHeaderOfDir 真跑——真实目录（.jsonl.zstd）能取到 header.id；
 *      并证明「取 canonical 与取 header.id」在本机真实样本上确实不同（否则 A 是空修的）。
 *   负控：把 target 改回 c.id，A 必须红；行为侧用真实目录样本，空集不算通过。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import assert from 'node:assert/strict'

const HOST = 'G:/AMup/dsh-auto-memory/lib/index.js'
const host = readFileSync(HOST, 'utf8').replace(/\r\n/g, '\n')
const HUB = 'C:/Users/ZHAN_ZC/.dsh/sessions/--C-Users-ZHAN_ZC-.dsh-aik_auto_memory_use--'

let pass = 0, fail = 0
const t = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n) } else { fail++; console.log('  FAIL ' + n, x === undefined ? '' : JSON.stringify(x)) } }

function extract(src, h) {
  const s = src.indexOf(h); assert(s >= 0, h)
  let d = 0
  for (let i = s + h.length - 1; i < src.length; i++) {
    if (src[i] === '{') d++
    if (src[i] === '}' && --d === 0) return src.slice(s, i + 1)
  }
  throw Error('unbalanced ' + h)
}

const sweep = extract(host, 'async sessionArchiveSweep(force) {')

console.log('[1] 结构：rows 带 archiveId，归档调用用 archiveId')
{
  t('★rows 行对象含 archiveId 字段', /const row = \{ id, archiveId, archived,/.test(sweep))
  t('★归档调用 target = c.archiveId || c.id', /const target = String\(c\.archiveId \|\| c\.id\)/.test(sweep))
  t('★archiveSession 收到的是 target（不是 c.id）', /await reg\.archiveSession\(target\)/.test(sweep))
  t('★已归档判定同时看 archiveId 与规范 id', /archivedSet\.has\(archiveId\) \|\| archivedSet\.has\(id\)/.test(sweep))
  t('账本仍按规范 id 记账（删除侧口径不变）', /archiveUpdates\[c\.id\] = now/.test(sweep))
  const mutated = sweep.replace('await reg.archiveSession(target)', 'await reg.archiveSession(c.id)')
  t('负控自检：target 退回 c.id 时上面那条判据必红', !/await reg\.archiveSession\(target\)/.test(mutated))
}

console.log('[2] 行为：_sessionHeaderOfDir 在真实会话目录上取到 header.id')
{
  const fnSrc = extract(host, '_sessionHeaderOfDir(dirPath) {')
  const fn = new Function('readdirSync', 'readFileSync', 'path', 'decodeZstdFramesHead',
    'return (function _sessionHeaderOfDir(dirPath) ' + fnSrc.slice(fnSrc.indexOf('{')) + ')'
  )(readdirSync, readFileSync, path, zlib.zstdDecompressSync)

  const segs = readdirSync(HUB).filter((s) => {
    try { return statSync(path.join(HUB, s)).isDirectory() } catch { return false }
  })
  t('样本目录数 > 0（空集不构成通过）', segs.length > 0, segs.length)
  let got = 0, diffs = 0
  const samples = []
  for (const seg of segs) {
    const h = fn(path.join(HUB, seg))
    if (h && h.id) got++
    const canonical = seg.startsWith('session-') ? seg : 'session-' + seg
    if (h && h.id && h.id !== canonical) { diffs++; if (samples.length < 3) samples.push({ seg, headerId: h.id, canonical }) }
  }
  t('★能读到 header.id 的比例 > 90%', got / segs.length > 0.9, { got, total: segs.length })
  t('★★本机样本中 header.id 与 canonical 不同的比例 > 90%（证明该修法确实必要）', diffs / segs.length > 0.9, { diffs, total: segs.length, samples })
}

console.log('\n结果: PASS=' + pass + ' FAIL=' + fail)
process.exit(fail ? 1 : 0)
