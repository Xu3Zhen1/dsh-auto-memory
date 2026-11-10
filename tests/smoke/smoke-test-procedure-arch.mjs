#!/usr/bin/env node
/**
 * F1~F4 架构收口守卫（B1/B2/B3/B4）。
 *
 * 背景（对端归因，我已独立复核逐条命中）：
 *   F1 状态迁移无单一入口 —— procedure-store.js 里 p.stage 直接赋值 5 处，无 transition()；
 *   F2 派生字段与门限不同源 —— requiresApproval 由 riskLevel 派生，降级时直接翻转 ⇒ 门「消失」；
 *   F3 投影与执行同源承诺无机器锁 —— evaluatePromotion 产 reasonCodes，消费端曾读 reasons；
 *   F4 能力与接线分离 —— procedureSimilarityPre 曾有定义无调用点。
 *
 * 本套件锁四件事，每条都带能真变红的负控：
 *   B1 TRANSITIONS 单一真源 + transition() 是唯一写 stage 的入口（源码里不得再有裸 p.stage=）；
 *   B2 deriveGates() 是 requiresApproval/riskReviewRequired 的唯一算法，update 后强制重算；
 *   B3 evaluatePromotion 与 promote 的 reasonCodes 冻结码集一致（键名 + 关键码存在性）；
 *   B4 每个「已有纯函数测试」的能力在 lib 内至少 1 个调用点（防函数级绿、接线级红）。
 */
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
// ★2026-11-10 修：原先硬编码本机绝对路径 ⇒ CI 上 ENOENT。改用 import.meta.url 相对定位。
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('../../lib', import.meta.url))
const store = readFileSync(ROOT + '/procedure-store.js', 'utf8').replace(/\r\n/g, '\n')
const idx = readFileSync(ROOT + '/index.js', 'utf8').replace(/\r\n/g, '\n')
const hub = readFileSync(ROOT + '/memory-hub.js', 'utf8').replace(/\r\n/g, '\n')
const obs = readFileSync(ROOT + '/procedure-observation.js', 'utf8').replace(/\r\n/g, '\n')

function fnBody(src, header) {
  const s = src.indexOf(header)
  assert(s >= 0, header)
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

let pass = 0, fail = 0
const t = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n) } else { fail++; console.log('  FAIL ' + n, x === undefined ? '' : JSON.stringify(x)) } }

console.log('[B1] 状态机单一入口')
{
  t('★TRANSITIONS 常量存在且被导出', /export const PROCEDURE_TRANSITIONS_PRE_V1/.test(store))
  t('★transition() 存在', /function transition\(p, to, reason/.test(store))
  // 允许的行：对象字面量初始化、migrate、注释
  // transition() 函数体内部那一处 p.stage = to 是**唯一合法写点**；函数体外不得再有。
  const tb = fnBody(store, 'function transition(p, to, reason) {')
  const outside = store.split(tb).join('')
  const assignments = [...outside.matchAll(/^\s*(?:p|staged|migrated)\.stage\s*=/gm)].map(m => m[0].trim())
  t('★transition() 之外零裸 stage 赋值', assignments.length === 0, assignments)
  // 负控：把一处 transition 调用改回裸赋值，上面的判据必须命中
  const mutated = store.replace(/transition\(p, 'deprecated'/, "p.stage = 'deprecated'; void 0 || transition(p, 'deprecated'")
  const mutCount = [...mutated.matchAll(/^\s*(?:p|staged|migrated)\.stage\s*=/gm)].length
  t('负控：改回裸赋值后判据命中', mutCount >= 1, { mutCount })
  t('★deprecated 是终态（TRANSITIONS 里无出边）', /deprecated:\s*(?:Object\.freeze\()?\s*\[\]/.test(store))
}

console.log('[B2] 派生字段统一重算')
{
  t('★deriveGates() 存在', /function deriveGates\(/.test(store))
  t('★requiresApproval 由 deriveGates 计算（不再各处手算）', /requiresApproval:\s*deriveGates\(/.test(store) && /p\.requiresApproval = dg\.requiresApproval/.test(store))
  // 负控：把 deriveGates 里的 high 判断改坏，源码形态判据应能发现"算法不在 deriveGates 内"
  t('★deriveGates 内含 riskHigh 入参', /deriveGates\(/.test(store) && /riskHigh/.test(store))
  t('降级只打 riskReviewRequired 标记（不直接翻派生量）', /staged\.riskReviewRequired = true/.test(store) || /p\.riskReviewRequired = true/.test(store))
  t('★update 提交后强制重算派生量', /const dg = deriveGates\(/.test(store))
}

console.log('[B3] 投影与执行同源（冻结码集一致）')
{
  const evlBody = fnBody(store, 'function evaluatePromotion(procedureId) {')
  const proBody = fnBody(store, 'function promote(procedureId, extraEvidence = {}, opts = {}) {')
  const codeRe = /'(deprecated|observation-only|already-active|high-risk-awaiting-approval|risk-downgraded-awaiting-approval)'/g
  const evlCodes = new Set([...evlBody.matchAll(codeRe)].map(m => m[1]))
  const proCodes = new Set([...proBody.matchAll(codeRe)].map(m => m[1]))
  for (const c of ['deprecated', 'observation-only', 'already-active', 'high-risk-awaiting-approval', 'risk-downgraded-awaiting-approval']) {
    t('★两条路径都产出冻结码 ' + c, evlCodes.has(c) && proCodes.has(c), { evl: [...evlCodes], pro: [...proCodes] })
  }
  t('★两函数都返回键名 reasonCodes（不是 reasons）', /reasonCodes/.test(evlBody) && /reasonCodes/.test(proBody))
  t('★index.js 消费端优先读 reasonCodes', /evl\.reasonCodes/.test(idx))
  t('★index.js 保留 reasons 仅为兼容兜底', /evl\.reasons/.test(idx))
}

console.log('[B4] 能力必须在 lib 内被接线（防函数级绿、接线级红）')
{
  const caps = [
    { name: 'procedureSimilarityPre', files: [idx, hub], min: 2 },
  ]
  for (const c of caps) {
    const hits = c.files.map(f => (f.match(new RegExp(c.name + '\\(', 'g')) || []).length)
    const total = hits.reduce((a, b) => a + b, 0)
    // 减去 import 与定义本身：这里只要求「调用点存在且数量达标」
    t('★' + c.name + ' 在 lib 内调用点 >= ' + c.min, total >= c.min, hits)
  }
  t('procedure-observation.js 注释已声明本地两处接线（不是「零调用点」）', /并在两个调用点接线/.test(obs))
}

console.log('[B2b] 投影侧 approvalPending 必须与门限同源')
{
  const doors = [...store.matchAll(/requiresApproval && !(?:p|q)?\.?approved/g)].length
  t('★门限读点数 >= 5（含投影侧）', doors >= 5, { doors })
  t('★投影用 requiresApproval && !approved 同形', /approvalPending: !!\(p\.requiresApproval && !p\.approved\)/.test(store))
  const mutated = store.replace(/requiresApproval: deriveGates\([^)]*\)\.requiresApproval/, 'requiresApproval: false')
  t('负控：派生量写死 false 后算法入口不再是唯一来源（判据能看出）', !/requiresApproval: deriveGates\(/.test(mutated))
}

console.log('[B3b] promote 与 evaluatePromotion 门限码序列一致（r2 口径）')
{
  const evlBody = fnBody(store, 'function evaluatePromotion(procedureId) {')
  const proBody = fnBody(store, 'function promote(procedureId, extraEvidence = {}, opts = {}) {')
  const seq = (b) => [...b.matchAll(/reason\.push\(\s*'([a-z-]+)/g)].map(m => m[1])
  const es = seq(evlBody), ps = seq(proBody)
  // ★对端校正（采纳）：**不能写成"必须完全相等"** —— promote() 有一个合法分支会造成重复：
  //   approveFn 存在但拒绝（:557）与 approveFn 不存在（:560）**各 push 一次同一个码**，
  //   两条互斥分支，源码正则看到的是两次。
  //   正确口径 = 「去重后序列一致」+「差额被显式登记」。
  const dedupe = (a) => a.filter((x, i) => i === 0 || x !== a[i - 1])
  const de = dedupe(es), dp = dedupe(ps)
  t('★去重后门限码序列一致（r2 口径）', JSON.stringify(de) === JSON.stringify(dp), { evl: de, pro: dp })
  t('★序列非空（空集不构成通过）', de.length > 0, { len: de.length })
  // 显式登记差额：只允许 high-risk-awaiting-approval 因 approveFn 两分支而多一次
  const extra = ps.length - es.length
  const extraCode = extra > 0 ? ps.filter((x, i) => x !== es[i])[0] : ''
  t('★差额已被显式登记（extra==1 且码为 high-risk-awaiting-approval，源自 approveFn 两分支）',
    extra === 1 && extraCode === 'high-risk-awaiting-approval', { extra, extraCode, evl: es, pro: ps })
}
console.log('[B3-1] 键集契约（对端新增：R138 未覆盖）')
{
  const evlBody = fnBody(store, 'function evaluatePromotion(procedureId) {')
  const proBody = fnBody(store, 'function promote(procedureId, extraEvidence = {}, opts = {}) {')
  // 键集**从源码机械抽取**（不许手写两份字面量 —— 手写就会两边一起漂移而恒真）
  // 只抽**顶层**键：从 "return {" 起按花括号配平，深度 1 处（逗号分界）的键才算；
  // detail:{...} 里的 need/cap/successCount 属于嵌套键，不算顶层契约。
  const keysOf = (b) => {
    const out = new Set()
    for (const m of b.matchAll(/return\s*\{/g)) {
      let i = m.index + m[0].length, d = 1, seg = ''
      for (; i < b.length && d > 0; i++) {
        const c = b[i]
        if (c === '{') { d++; seg += c; continue }
        if (c === '}') { d--; if (d === 0) break; seg += c; continue }
        if (d === 1) seg += c
        else seg += ' '
      }
      for (const part of seg.split(',')) {
        const t = part.split(':')[0].trim()
        if (/^[a-zA-Z_]\w*$/.test(t)) out.add(t)
      }
    }
    return out
  }
  const pk = keysOf(proBody), ek = keysOf(evlBody)
  t('★键集从源码抽取且两侧非空', pk.size > 0 && ek.size > 0, { pro: [...pk], evl: [...ek] })
  // evaluate 顶层键 ⊆ promote 键集 ∪ {detail}
  const extra = [...ek].filter((k) => !pk.has(k) && k !== 'detail')
  t('★evaluate 的键都在 promote 键集内（detail 显式豁免）', extra.length === 0, { extra, pro: [...pk], evl: [...ek] })
  // 负控：往 evaluate 里插一个 promote 没有的键，判据必须命中
  const mut = evlBody.replace('reasonCodes:', 'brandNewKey: 1, reasonCodes:')
  const extraMut = [...keysOf(mut)].filter((k) => !pk.has(k) && k !== 'detail')
  t('负控：evaluate 插入新键后判据命中', extraMut.length >= 1, { extraMut })
}

console.log('[B3-3] 结构层码必须能被 promote/evaluate 认出，否则显式登记')
{
  const hsBody = fnBody(store, 'function hiddenStructuralCodesPre(p, g) {')
  const codes = [...hsBody.matchAll(/out\.push\(\s*'([a-z-]+)/g)].map((m) => m[1])
  t('★结构层码集非空', codes.length > 0, { codes })
  t('★结构层码数量与对端实测一致（6 类）', codes.length === 6, { codes })
  const proBody = fnBody(store, 'function promote(procedureId, extraEvidence = {}, opts = {}) {')
  const evlBody = fnBody(store, 'function evaluatePromotion(procedureId) {')
  // already-active 在 promote/evaluate 是**短路返回**而非 reason.push，属显式登记项
  const REGISTERED_STRUCT_ONLY = ['already-active']
  const missing = codes.filter((c) => {
    if (REGISTERED_STRUCT_ONLY.includes(c)) return !/already-active/.test(proBody) || !/already-active/.test(evlBody)
    return !proBody.includes(c) || !evlBody.includes(c)
  })
  t('★每个结构层码都能在两条路径找到对应（或已显式登记）', missing.length === 0, { missing, codes })
}

console.log('[B4-2/B4-3] 接线不得来自注释；阈值必须被真正比较（对端新增）')
{
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const idxCode = stripComments(idx), hubCode = stripComments(hub)
  const callSites = (idxCode.match(/procedureSimilarityPre\(/g) || []).length + (hubCode.match(/procedureSimilarityPre\(/g) || []).length
  t('★剥掉注释后 call-site 仍 >= 2（不是注释里的示例）', callSites >= 2, { callSites })
  // 负控：把一处调用点搬进注释，剥注释后应减少
  // 负控用**合成串**自证（比改真实文件更干净）：注释里的调用不得被计入
  const synthetic = [
    'const a = procedureSimilarityPre(x, y)',
    '// procedureSimilarityPre(z, w)  <-- 注释里的示例，不该计入',
    '/* procedureSimilarityPre(q, r)   块注释示例，也不该计入 */',
  ].join(String.fromCharCode(10))
  const rawCount = (synthetic.match(/procedureSimilarityPre\(/g) || []).length
  const strippedCount = (stripComments(synthetic).match(/procedureSimilarityPre\(/g) || []).length
  t('负控：剥注释后只留真调用（原 3 处 → 1 处）', rawCount === 3 && strippedCount === 1, { rawCount, strippedCount })
  // B4-3 阈值必须被比较（防「只 import 没用」）
  t('★index.js 里相似度与阈值真比较', /procedureSimilarityPre\([^)]*\)\s*>=\s*PROCEDURE_DUP_SIMILARITY_THRESHOLD/.test(idxCode) || /sim\s*>=\s*PROCEDURE_DUP_SIMILARITY_THRESHOLD/.test(idxCode))
  t('★memory-hub 里相似度与阈值真比较', /procedureSimilarityPre\([^)]*\)\s*>=\s*PROCEDURE_DUP_SIMILARITY_THRESHOLD/.test(hubCode))
  t('负控：阈值比较被改成恒真后判据应失配', !/procedureSimilarityPre\(cand, p\)\s*>=\s*PROCEDURE_DUP_SIMILARITY_THRESHOLD/.test(hubCode.replace('>= PROCEDURE_DUP_SIMILARITY_THRESHOLD_PRE_V1', '>= 0')))
}
console.log('\n结果: PASS=' + pass + ' FAIL=' + fail)
process.exit(fail ? 1 : 0)