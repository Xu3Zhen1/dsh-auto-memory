#!/usr/bin/env node
/**
 * 边界复核（对端提问）：update() 的 active→validated 回退，pin 是否应豁免？
 *
 * 问题来源（session-144dbaa2）："回退后 _stageMoves 留痕是否会把「用户手动 pin 后改内容」也一起回退？pin 是否应豁免？"
 *
 * 本套件**不改行为**，只把现状与理由钉成可复算的判据，防止将来有人"顺手加个 pin 豁免"而无据。
 * 结论（实测）：**不应豁免**。理由三条，逐条落成断言：
 *   ① pin 的既有语义（procedure-store.js:429 注释）是「豁免自动归档与 agent 改写」，不是豁免用户自己的内容/风险变更；
 *   ② 回退的触发条件是 approvalReset（内容/风险变更导致批准作废），pin 不改变"批准已作废"这个事实；
 *   ③ 若 pin 豁免回退，会留下「active + 批准已清零」的脏条目 —— 正是 a06/I335 那批修复要消灭的形态。
 */
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const STORE = 'G:/AMup/dsh-auto-memory/lib/procedure-store.js'
const store = readFileSync(STORE, 'utf8').replace(/\r\n/g, '\n')

let pass = 0, fail = 0
const t = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n) } else { fail++; console.log('  FAIL ' + n, x === undefined ? '' : JSON.stringify(x)) } }

function fnBody(src, header) {
  const s = src.indexOf(header); assert(s >= 0, header)
  let i = s + header.length - 1, d = 0
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '{') d++
    else if (c === '}') { d--; if (d === 0) return src.slice(s, i + 1) }
    else if (c === "'" || c === '"' || c === String.fromCharCode(96)) {
      const q = c; i++
      while (i < src.length) { if (src[i] === '\\') { i += 2; continue } if (src[i] === q) break; i++ }
    }
  }
  throw Error('unbalanced ' + header)
}

console.log('[P1] pin 的既有语义：豁免"自动"行为，不豁免用户自己的变更')
{
  const setPin = fnBody(store, 'function setPinned(procedureId, v) {')
  t('★setPinned 只动 pinned 字段（不碰 stage/approved）', /p\.pinned = v === true/.test(setPin) && !/p\.stage/.test(setPin) && !/p\.approved/.test(setPin))
  const auto = fnBody(store, 'function applyAutomaticTransitions(nowTs) {')
  t('★自动归档确实豁免 pinned（既有语义在此）', /p\.stage !== 'active' \|\| p\.pinned/.test(auto))
}

console.log('[P2] 回退的触发条件是 approvalReset，与 pin 无关')
{
  const upd = fnBody(store, 'function update(procedureId, patch) {')
  t('★回退发生在 approvalReset 分支内', /if \(approvalReset\)[\s\S]{0,200}transition\(p, 'validated', 'approval-reset'\)/.test(upd))
  t('★回退条件里不含 pinned（现状：不豁免）', !/approvalReset\s*&&\s*!p\.pinned/.test(upd))
  t('负控：若有人加了 pin 豁免，上面那条会红', (() => {
    const mutated = upd.replace("if (approvalReset) {", "if (approvalReset && !p.pinned) {")
    return /approvalReset\s*&&\s*!p\.pinned/.test(mutated)
  })())
}

console.log('[P3] 若 pin 豁免回退，会留下「active + 批准已清零」的脏条目')
{
  // 这是**推论**，用状态组合自证：active 且 requiresApproval && !approved 正是各门要拦的形态
  const doors = [...store.matchAll(/requiresApproval && !(?:p|q)?\.?approved/g)].length
  t('★全仓有多道门专门拦「active + 批准未完成」（>0）', doors > 0, { doors })
  t('★投影侧把它标成 approvalPending（视为待处理，不是正常态）', /approvalPending: !!\(p\.requiresApproval && !p\.approved\)/.test(store))
  // 结论：pin 不改变"批准作废"这个事实 ⇒ 不该豁免
}

console.log('\n结果: PASS=' + pass + ' FAIL=' + fail)
process.exit(fail ? 1 : 0)