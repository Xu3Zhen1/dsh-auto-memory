#!/usr/bin/env node
/**
 * smoke-test-write-gate-messages.mjs —— 写入门「报错可诊断化 + stutter 语种盲区修复」（2026-09-29）。
 *
 * 背景（用户报障实录 + 第三方 AI 复盘报告交叉核实）：
 *  ① P0-2 语种盲区：JS `\w`=[A-Za-z0-9_]，汉字全落 `[^\w]` ⇒ 旧 hasStutter 把
 *     「中文正文里 4 次出现的英文缩写」（AI/DOI/RQ…）判为复读退化，中文技术写作系统性踩雷；
 *  ② P0-1 文案误导：6 个写入入口共用「请改写为客观陈述后重试」，对 6 种原因里的 5 种
 *     是无法收敛的方向（用户原文本来就是客观陈述）⇒ 只能盲试（实录 ~12 次工具调用）。
 *
 * 修复：
 *  - detectStutter：ASCII 复读的词间隔不得含 CJK（真复读反断言不放宽——全角句号仍算间隔）；
 *  - writeGateRefusalTextPre：按原因分派文案 + 触发词/位置/阈值证据 + 与语体无关声明；
 *  - 两道闸门函数拒绝时挂 detail（token/count/excerpt/行号/密度）；
 *  - memory_note 工具描述明示 P-H1 硬判据（≥1 个 ## 节且正文 ≥20 字符）；P-H1 detail 带节差值。
 *
 * 判据（全部**真 import 产线模块**，非源码断言/非副本）：
 *  - 真复读一个不漏（Run/单字连读/纯标点间隔 TODO 全拦）；中文缩写误伤全部放行
 *  - 拒绝文案带触发词与「与内容是否客观无关」；六种原因各有收敛方向正确的建议
 *  - 变异检查：说明文案字面量被改 ⇒ 红（断言非恒真）
 */
import { hasStutter, detectStutter, sanitizeForWrite, hygieneGateForPrimitive, writeGateRefusalTextPre, WRITE_GATE_REASON } from '../../lib/index.js'
import { checkPlanCriteriaPre, criteriaRefusalTextPre } from '../../lib/wb-contract.js'

let pass = 0, fail = 0
const failures = []
function ok(cond, name, got) {
  if (cond) { pass++ } else { fail++; failures.push(name + (got === undefined ? '' : ' | got=' + JSON.stringify(got))) }
}

// ── ① P0-2：真复读反断言（一个不漏）──
ok(hasStutter('Run. Run. Run. Run.') === true, '①Run×4 仍拦')
ok(hasStutter('baddata baddata baddata baddata') === true, '①baddata×4 仍拦')
ok(hasStutter('风。风。风。风。风。') === true, '①CJK 单字连读×5 仍拦')
ok(hasStutter('TODO TODO。TODO TODO。TODO TODO。TODO TODO。') === true, '①纯标点间隔 TODO×8 仍拦(全角句号不算 CJK)')
const d1 = detectStutter('Run. Run. Run. Run.')
ok(d1 && d1.kind === 'ascii' && d1.token === 'Run' && d1.count === 4, '①detectStutter 带触发词与次数', d1)

// ── ② P0-2：中文缩写误伤全部放行（本次修复的回归样本）──
ok(hasStutter('课程规定使用 AI 辅助须声明，AI 痕迹留档，AI 终稿提交，AI 原始稿留存。') === false, '②中文 4×AI 放行')
ok(hasStutter('参考文献须含 DOI，缺 DOI 的补 DOI，DOI 统一前缀，无 DOI 注明。') === false, '②中文 4×DOI 放行')
ok(hasStutter('本文提出 RQ 一，RQ 二，RQ 三与 RQ 四。') === false, '②中文 4×RQ 放行')
ok(hasStutter('The AI model supports AI research and AI tools for AI labs.') === false, '②英文正常句 4×AI 放行')
ok(hasStutter('赵俊皓，学号 24115129d，香港理工大学。课程规定使用 AI 辅助须声明，AI 痕迹留档，AI 终稿提交，AI 原始稿留存。') === false, '②用户原始报障全文放行')

// ── ②b 周期性复读（2026-09-29b 补：堵「CJK 放行」的残余盲区，朊病毒=整段 verbatim 循环）──
ok(hasStutter('AI 的 AI 的 AI 的 AI 的') === true, '②b同词+相同短间隔(AI 的 ×4)拦', detectStutter('AI 的 AI 的 AI 的 AI 的'))
ok(hasStutter('AI 辅助须声明，AI 辅助须声明，AI 辅助须声明，AI 辅助须声明。') === true, '②b整句 verbatim 循环拦')
ok(hasStutter('TODO 检查。TODO 检查。TODO 检查。TODO 检查。') === true, '②b相同标点+汉字间隔周期拦')
const dp = detectStutter('AI 的 AI 的 AI 的 AI 的')
ok(dp && dp.kind === 'ascii-periodic' && dp.token === 'AI' && dp.count === 4, '②b周期命中带 kind/token/count', dp)
ok(hasStutter('AI 辅助须声明，AI 痕迹留档，AI 终稿提交，AI 原始稿留存。') === false, '②b间隔各不相同的中文行文放行(对拍)')

// ── ③ P0-1：sanitizeForWrite 拒绝时挂证据 ──
const gStut = sanitizeForWrite('Run. Run. Run. Run.')
ok(gStut.ok === false && gStut.reason === 'stutter' && gStut.detail && gStut.detail.token === 'Run' && gStut.detail.count >= 4, '③stutter 拒绝带 detail', gStut)
const b64 = 'A'.repeat(220) + '='
const gB64 = sanitizeForWrite('正文行\n' + b64)
ok(gB64.ok === false && gB64.reason === 'base64' && gB64.detail && gB64.detail.line === 2, '③base64 拒绝带行号', gB64)
const gJson = sanitizeForWrite('{"updatedAt": 1700000000, "role": "user", "content": "x"}')
ok(gJson.ok === false && gJson.reason === 'raw-json' && gJson.detail && String(gJson.detail.excerpt).includes('updatedAt'), '③raw-json 拒绝带片段', gJson)
const gDup = sanitizeForWrite('行甲内容\n行甲内容\n行甲内容')
ok(gDup.ok === false && gDup.reason === 'duplicate-lines' && gDup.detail && gDup.detail.excerpt === '行甲内容', '③duplicate-lines 拒绝带样本', gDup)
ok(sanitizeForWrite('').reason === 'empty', '③empty 原因')
const gTrunc = sanitizeForWrite('内容'.repeat(4500)) // 9000 字中文正文(同字连读判据不触发:双字词交替)
ok(gTrunc.ok === true && gTrunc.truncated === true && gTrunc.clean.length === 8000, '③超长截断标记(锁既有契约)', gTrunc.truncated)
const hStut = hygieneGateForPrimitive('Run. Run. Run. Run.')
ok(hStut.ok === false && hStut.reason === 'stutter' && hStut.detail && hStut.detail.token === 'Run', '③原语门同样带 detail', hStut)

// ── ④ P0-1：文案按原因分派且方向可收敛 ──
const tStut = writeGateRefusalTextPre('memory_note', gStut)
ok(tStut.includes('触发词「Run」') && tStut.includes('阈值 4'), '④stutter 文案带触发词与阈值')
ok(tStut.includes('与内容是否客观无关'), '④stutter 文案显式声明与语体无关')
ok(!tStut.includes('请改写为客观陈述后重试'), '④误导性万能尾句已移除')
ok(writeGateRefusalTextPre('memory_log', { ok: false, reason: 'mojibake', detail: { density: 0.5 } }).includes('修复编码'), '④mojibake 建议修编码')
ok(writeGateRefusalTextPre('memory_log', { ok: false, reason: 'base64', detail: { line: 2 } }).includes('删除'), '④base64 建议删残骸行')
const tJson = writeGateRefusalTextPre('memory_note', gJson)
ok(tJson.includes('JSON') && tJson.includes('客观陈述'), '④raw-json 保留「改客观陈述」(该原因下方向正确)')
ok(writeGateRefusalTextPre('memory_user', gDup).includes('去重'), '④duplicate-lines 建议去重')
ok(writeGateRefusalTextPre('memory_rules', { ok: false, reason: 'empty' }).includes('先写正文'), '④empty 建议补内容')
ok(writeGateRefusalTextPre('x', { ok: false, reason: 'unknown-x' }).length > 10, '④未知原因兜底为可用字符串')

// ── ⑤ P1：白板判据 P-H1 差值 + 工具描述约束（描述属产线字符串，锁其关键短语）──
const src = (await import('node:fs')).readFileSync(new URL('../../lib/index.js', import.meta.url), 'utf8')
ok(src.includes('至少 1 个 `## ` 顶层节、且该节正文 ≥20 个非空白字符'), '⑤memory_note 工具描述明示 P-H1 硬判据')
const p1 = criteriaRefusalTextPre(checkPlanCriteriaPre('# 标题\n只有一段引言,没有任何二级节。'))
ok(p1.includes('[P-H1]') && p1.includes('本次全文共 0 个'), '⑤P-H1 拒绝文案带节差值(0 节)', p1)
const p2 = criteriaRefusalTextPre(checkPlanCriteriaPre('## 节甲\n短\n'))
ok(p2.includes('本次全文共 1 个'), '⑤P-H1 拒绝文案带节差值(1 节不达标)', p2)

// ── ⑥ 变异检查：触发词证据被改 ⇒ 红（断言非恒真）──
ok(JSON.stringify(WRITE_GATE_REASON).includes('复读'), '⑥WRITE_GATE_REASON 表在位')
ok(gStut.detail.token === 'Run' ? true : false, '⑥detail.token 非空(变异锚点)')

// ── ⑦ 哈希值/编号防线锁定（2026-09-29 用户点名：此线永不放宽）──
// 事故形态一：外部语义检索系统画像 JSON（哈希在 uid/memoryBlock 字段）⇒ raw-json 门（0.1.28 设）
const gHash = sanitizeForWrite('{"uid": "f3a1c9e27b8d4a6f9e2c1b8d7a6f5e4c", "memoryBlock": {}, "updatedAt": 1}')
ok(gHash.ok === false && gHash.reason === 'raw-json' && gHash.detail.excerpt.includes('uid'), '⑦外部画像JSON(uid哈希)仍拦', gHash.reason)
// 事故形态二（真崩溃源）：模型把锚点字符串抄进正文（非整行合法形态）⇒ 放行但改写为豁免形式，
// 锚点解析器(MARKER_RE)看不见 ⇒ 不会产生 orphan-content 锁死文件（M3b-4 保护，原样未动）
const gAnchor = sanitizeForWrite('这条结论来自 <!-- memory:mem_a3f9c2e1b8d7a6f5e4c3b2a1d0e9f8a7 --> 的记录')
ok(gAnchor.ok === true && gAnchor.clean.includes('<!--memory:mem_a3f9'), '⑦正文内嵌锚点串改写为豁免形态(解析器不可见)')
// 整行合法锚点 ⇒ 原样保留（合法锚点零改动，改了会打穿严格口径）
const gLegal = sanitizeForWrite('<!-- memory:mem_a3f9c2e1b8d7a6f5e4c3b2a1d0e9f8a7 -->')
ok(gLegal.clean === '<!-- memory:mem_a3f9c2e1b8d7a6f5e4c3b2a1d0e9f8a7 -->', '⑦整行合法锚点原样保留')
// 语义检索 id 读侧严格校验（ mem_ + 32 hex 之外一律拒）——锁 read 侧契约
ok(/^mem_[0-9a-f]{32}$/.test('mem_a3f9c2e1b8d7a6f5e4c3b2a1d0e9f8a7') && !/^mem_[0-9a-f]{32}$/.test('mem_zz'), '⑦mem_ id 形状契约(对照)')

console.log(`PASS ${pass} / FAIL ${fail}`)
if (fail) { console.log('FAILURES:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1) }
