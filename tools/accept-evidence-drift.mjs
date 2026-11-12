/**
 * ACCEPT-E3 的 drift 证据生产者：契约漂移检测。
 *
 * 本仓的「契约」不是 OpenAPI/Protobuf，而是**字节级锁定**：
 *   · `skins/*.js` 源 ⟷ `lib/client.js` 产物（生成器 `--check`，SYNC-OK）
 *   · 三处字节哈希锁：`iter5-skin`(classicLF) / `settings-archive-interval` / `r26-cross-layer`
 *
 * ⇒ 这里的「漂移」定义为：**上述任一锁不再成立**。
 *   每条锁算一次 check；任一条红 ⇒ findings+1。
 *
 * ★诚实性：
 *   ① 若某个检查**跑不起来**（脚本异常/超时），必须计入 findings，
 *      不能记成「通过」——否则"没检查"会被伪装成"没漂移"。
 *   ② checks=0 时由 ACCEPT-E3 自己报错（"漂移检测没跑过，空集不构成通过"），
 *      所以这里必须真的产出非零 checks。
 */

import { spawnSync } from 'node:child_process'

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, cwd: process.cwd() })
  return { ok: r.status === 0, out: ((r.stdout || '') + (r.stderr || '')).trim(), status: r.status }
}

const items = []
let checks = 0
let findings = 0

// ① 生成器同步（源 ⟷ 产物）
checks++
{
  const r = run(process.execPath, ['tools/build-iter5-skin.mjs', '--check'])
  const synced = r.ok && /SYNC-OK/.test(r.out)
  if (!synced) { findings++; items.push('client.js 与 skins 源不同步（--check 未报 SYNC-OK）') }
}

// ② 三处字节哈希锁
for (const [label, filter] of [
  ['iter5-skin classicLF 锁', 'iter5-skin'],
  ['settings-archive-interval 锁', 'settings-archive-interval'],
  ['r26-cross-layer index 锁', 'r26-cross-layer'],
]) {
  checks++
  const r = run(process.execPath, ['tools/run-smoke.mjs', `--filter=${filter}`, '--jobs=1'])
  if (!r.ok) { findings++; items.push(`${label} 失配（${filter} 套件红）`) }
}

// ③ 工作区脏文件（未提交的产物漂移）
checks++
{
  const r = run('git', ['status', '--porcelain', '--', 'lib/client.js', 'skins/'])
  const dirty = r.out.split('\n').filter((l) => l.trim() && !/^\?\? artifacts\//.test(l.trim()))
  // 本检查只标记「lib/client.js 被改但 skins 未改」这类单边漂移；两边都改属正常开发态
  const clientDirty = dirty.some((l) => / lib\/client\.js$/.test(l))
  const skinsDirty = dirty.some((l) => /^.. skins\//.test(l))
  if (clientDirty && !skinsDirty) { findings++; items.push('lib/client.js 有改动但 skins 源无对应改动（单边漂移）') }
}

// 输出 parseDriftReport 认得的格式：
//   汇总行 `检查项 N · 通过 N · 漂移 N`（正则要求 passed + findings === checks，自洽）
//   漂移项逐行 `FAIL <描述>`
console.log(`检查项 ${checks} · 通过 ${checks - findings} · 漂移 ${findings}`)
for (const it of items) console.log(`FAIL ${it}`)
process.exit(findings > 0 ? 1 : 0)
