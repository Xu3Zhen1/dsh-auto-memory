/**
 * ACCEPT-E1 的 tests 证据生产者：跑本仓回归并输出 `ℹ tests/pass/fail` 汇总行。
 *
 * ★为什么不用 `node --test tests/smoke/`：
 *   本仓的套件是**自研 runner**（`tools/run-smoke.mjs`），输出不是 TAP，
 *   `parseNodeTest` 读不到 `ℹ tests` 行会抛错。而 `node --test` 直接跑这套件
 *   会把每个 .mjs 当独立测试文件、且部分套件依赖 runner 提供的并发/超时策略。
 *
 * ⇒ 这里做的是：**跑真的回归**（run-smoke 全量），然后把它的通过/失败数
 *   **翻译**成 TAP 汇总行。翻译必须保真：failed 数取自 runner 的 FAILED 计数，
 *   不是简单 `tests - pass`。
 *
 * ★诚实性：若 runner 输出里解析不到汇总行，**必须抛错**，绝不返回 0 值
 *   （否则"没跑"会被伪装成"跑了但零失败"，恰是 sdd-guard 头注禁止的形态）。
 */

import { spawnSync } from 'node:child_process'

const r = spawnSync(process.execPath, ['tools/run-smoke.mjs', '--jobs=4'], {
  encoding: 'utf8',
  maxBuffer: 1 << 26,
  cwd: process.cwd(),
})

const out = (r.stdout || '') + (r.stderr || '')

// runner 的汇总格式：`PASS 456 / FAIL 4 / TIMEOUT 0   (total 160.7s)`
const m = /PASS\s+(\d+)\s*\/\s*FAIL\s+(\d+)\s*\/\s*TIMEOUT\s+(\d+)/.exec(out)
if (!m) {
  console.error('无法从 run-smoke 输出解析汇总行；原始输出尾部：')
  console.error(out.split('\n').slice(-20).join('\n'))
  process.exit(1)
}

const pass = Number(m[1])
const fail = Number(m[2])
const timeout = Number(m[3])
const total = pass + fail + timeout

// 翻译成 parseNodeTest 认得的 TAP 汇总行（ℹ 前缀 = Node 22+ spec reporter 风格）
console.log(`ℹ tests ${total}`)
console.log(`ℹ pass ${pass}`)
console.log(`ℹ fail ${fail + timeout}`)
console.log(`ℹ skipped 0`)
console.log(`ℹ todo 0`)
console.error(`[真实回归] PASS=${pass} FAIL=${fail} TIMEOUT=${timeout}`)

/*
 * ★退出码语义（2026-11-12 修正，理由如下）：
 *   make-evidence 规定「产出者退出码非 0 ⇒ 结果不可采信」，它把退出码当作
 *   **「这份输出是否可信」**的信号，而不是「被测项目是否健康」的信号。
 *   我的第一版让退出码跟随回归红数 ⇒ 4 条基线既有红让整份证据被拒 ⇒
 *   **连"这次跑过了、红的是这 4 条"这个事实都写不进证据里**，
 *   只能得到「什么都没记录」。那比"记录了 4 条红"更糟。
 *
 *   ⇒ 正确做法：退出码表示**产出可信**（解析成功、数字自洽），
 *     被测项目的红数由 `fail` 字段如实承载，交给 ACCEPT-E1 判。
 *     这样证据里留下的是「总 460 / 过 456 / 红 4」，可审计；
 *     而 ACCEPT-E1 会因为 fail>0 判红 —— **红在被该红的地方**。
 *
 *   保留：解析失败时仍 exit 1（那是真的不可信，不能伪装成 0 值）。
 */
process.exit(0)
