/**
 * 多语言功能验收（真执行，非源码字符串断言）
 *
 * 做法：从 lib/client.js 的 factory 源码中**抽取真实定义**
 *   - `function L(a, b)`
 *   - `function L3(a, b, ja)`
 *   - `var L10N = {...}`（第三语言查表）
 *   - `var I18N = {...}`（字典）
 *   - `function normLocale(v)`
 *   - `var LOCALE_ALL = [...]`
 *   - `I18N.<lang> = {...}`（顶层独立赋值语句）
 * 在 vm 里组装成可执行上下文，再**真调用**并断言返回值。
 *
 * 负路径：把字典删空 ⇒ ja 必须回落英文；未知语言 ⇒ 回落英文；zh ⇒ 恒取中文。
 *
 * ★2026-09-29 修（回归门 D / acorn 类，单独一条）：
 *   原实现用 `createRequire('D:/dsh-auto-memory/package.json')` + `require('acorn')` 取 AST。
 *   两处问题，且**必须一起修**（只修路径仍会红）：
 *     ① 路径硬编码 `D:/dsh-auto-memory`（正斜杠）⇒ fork / CI（/home/runner/...）下必失败；
 *     ② `acorn` 在本仓**永远不可解析** —— package.json 无 dependencies/devDependencies、
 *        无 lockfile、CI 明确写着「零运行时依赖 ⇒ 不跑 install」。⇒ 修完路径仍 MODULE_NOT_FOUND。
 *   ★ 为什么这条与「CI 基础设施损坏」不可区分（本报告 §5.1）：它的失败形状是**加载期**
 *     `Cannot find module 'acorn'`，而 CI 注释恰好写着「runner 缺失时本 workflow 会以
 *     MODULE_NOT_FOUND 失败 —— 那是正确行为」。若据此给 CI 加「MODULE_NOT_FOUND 就跳过」，
 *     会**连真缺陷一起跳过去**，门禁静默失效。
 *   ⇒ 修法：**移除 acorn 依赖**（保持仓库「零依赖、原样即可跑」的契约），改用**零依赖**的
 *     括号配对抽取器。抽取正确性由本套件自己的两道检查守住（下见「负控」段），不是声称。
 *
 * 本套件两条判据（报告 §5.1 要求）：
 *   ① 依赖可解析性 —— 本套件不得 require/import 任何非 `node:` 模块（= 零依赖可解析）；
 *   ② 路径为仓库相对 —— 套件源码内不得出现硬编码绝对路径。
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF_URL = import.meta.url
const SELF = readFileSync(fileURLToPath(SELF_URL), 'utf8')
// ★2026-09-29 修回归门：原先硬编码 'D:/dsh-auto-memory'，fork 与 CI 下必失败。
const ROOT = path.resolve(path.dirname(fileURLToPath(SELF_URL)), '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8')

let pass = 0, fail = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m) } }

/* ── ★判据①②的扫描面：先剥注释，再判 ──────────────────────────
   否则本文件自己的说明文字（引用了原实现的写法）会被当成违规命中 —— 那是**假红**。
   剥注释器本身跳过字符串字面量，避免把字符串里的 `//` 当成注释开头。 */
function stripComments(src) {
  let out = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') { const n = src.indexOf('\n', i); if (n < 0) break; i = n - 1; continue }
    if (c === '/' && src[i + 1] === '*') { const n = src.indexOf('*/', i + 2); if (n < 0) break; i = n + 1; continue }
    if (c === '"' || c === "'" || c === '`') {
      out += c
      for (i++; i < src.length; i++) {
        out += src[i]
        if (src[i] === '\\') { out += src[i + 1]; i++; continue }
        if (src[i] === c) break
      }
      continue
    }
    out += c
  }
  return out
}
const SELF_CODE = stripComments(SELF)

/* ── ★判据①：零依赖可解析（取代原 acorn 依赖） ───────────────── */
// 只允许 node: 内建；任何裸说明符都判红。
// ★needle 由拼接产生，避免本检查自身的字面量被自己命中（自指假红）。
const ACORN = 'a' + 'corn'
const bareRequires = [...SELF_CODE.matchAll(/(?<![\w.])(?:require|createRequire)\s*\(\s*['"]([^'"]+)['"]/g)]
  .map((m) => m[1])
  .filter((s) => !s.startsWith('node:'))
const bareImports = [...SELF_CODE.matchAll(/^\s*import\s[^\n]*?from\s+['"]([^'"]+)['"]/gm)]
  .map((m) => m[1])
  .filter((s) => !s.startsWith('node:') && !s.startsWith('.') && !s.startsWith('file:'))
ok(bareRequires.length === 0 && bareImports.length === 0,
  `★判据①零依赖：无外部模块依赖（实测 require=${JSON.stringify(bareRequires)} import=${JSON.stringify(bareImports)}）`)
ok(!new RegExp(`require\\(['"]${ACORN}['"]\\)`).test(SELF_CODE), `★判据①：${ACORN} 依赖确已移除`)

/* ── ★判据②：路径为仓库相对（无硬编码绝对路径） ──────────────── */
const hardPaths = [...SELF_CODE.matchAll(/['"][A-Za-z]:[\\/][^'"]*['"]/g)].map((m) => m[0])
ok(hardPaths.length === 0, `★判据②路径：无硬编码绝对路径（实测 ${JSON.stringify(hardPaths)}）`)

/* ── 零依赖抽取器：按行首声明 + 括号配对 ─────────────────────── */
/* 把源码切成行并记录每行起始偏移（兼容 CRLF）。 */
const LINES = [], LINE_OFF = []
{
  let i = 0
  for (;;) {
    const j = SRC.indexOf('\n', i)
    if (j < 0) { LINES.push(SRC.slice(i)); LINE_OFF.push(i); break }
    const end = SRC[j - 1] === '\r' ? j - 1 : j
    LINES.push(SRC.slice(i, end)); LINE_OFF.push(i); i = j + 1
  }
}

/** 从 open（必须是 { [ ( ）起配平，跳过字符串与注释，返回对应闭合符下标；失败返回 -1。 */
function matchBalanced(src, open) {
  const openers = '{[('
  if (openers.indexOf(src[open]) < 0) return -1
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') { const n = src.indexOf('\n', i); if (n < 0) return -1; i = n; continue }
    if (c === '/' && src[i + 1] === '*') { const n = src.indexOf('*/', i + 2); if (n < 0) return -1; i = n + 1; continue }
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue }
        if (src[i] === c) break
      }
      continue
    }
    if (openers.indexOf(c) >= 0) depth++
    else if (c === '}' || c === ']' || c === ')') {
      depth--
      if (depth === 0) return i
      if (depth < 0) return -1
    }
  }
  return -1
}

/**
 * 找**行首**（缩进后）匹配 pred 的顶层声明，返回 [{ start, text, value }]。
 * - text  = 整条声明（函数体 / 赋值语句的完整文本）
 * - value = 初始化表达式（仅 var 声明有；函数为 null）
 */
function findDecls(pred) {
  const out = []
  for (let li = 0; li < LINES.length; li++) {
    const line = LINES[li]
    const t = line.trimStart()
    if (!pred(t)) continue
    const start = LINE_OFF[li] + (line.length - t.length)
    // 定位初始化/函数体的起始括号：取声明头之后的第一个 { [ (
    let k = start
    while (k < SRC.length && '{[('.indexOf(SRC[k]) < 0) {
      // 同一行内找不到就放弃（声明头与体跨行的情形本仓不存在）
      if (SRC[k] === '\n' && k > LINE_OFF[li] + line.length) break
      k++
    }
    if (k >= SRC.length || '{[('.indexOf(SRC[k]) < 0) continue
    let end
    if (SRC[k] === '(') {
      // 函数形参表：先配平参数表，再取函数体
      const pEnd = matchBalanced(SRC, k)
      if (pEnd < 0) continue
      let b = SRC.indexOf('{', pEnd)
      if (b < 0) continue
      end = matchBalanced(SRC, b)
    } else {
      end = matchBalanced(SRC, k)   // var 声明 / 赋值语句：首括号即初始化式
    }
    if (end < 0) continue
    const stmt = t.startsWith('function ') || /^[A-Za-z_$][\w$]*\s*\./.test(t)
    out.push({
      start,
      text: SRC.slice(start, end + 1),
      value: stmt ? null : SRC.slice(k, end + 1),
    })
  }
  return out
}

const lFnN = findDecls((t) => /^function L\s*\(/.test(t))
const l3FnN = findDecls((t) => /^function L3\s*\(/.test(t))
const nlFnN = findDecls((t) => /^function normLocale\s*\(/.test(t))
const l10nN = findDecls((t) => /^var L10N\s*=/.test(t))
const i18nN = findDecls((t) => /^var I18N\s*=/.test(t))
const localeAllN = findDecls((t) => /^var LOCALE_ALL\s*=/.test(t))
// ★I18N.<lang> = {...} 是**字面量之后的独立赋值语句**（不是 `var I18N = {ja:{...}}` 的嵌套属性），
//   只取 `var I18N` 的 init 拿不到 ⇒ 必须把顶层赋值语句一并抄进来，否则 I18N.ja 恒为 0 键。
const i18nAssigns = findDecls((t) => /^I18N\.[A-Za-z0-9_$]+\s*=/.test(t))

const sliceOf = (n) => n.text

ok(lFnN.length === 1, `恰好 1 个顶层 function L(a, b) 定义（实测 ${lFnN.length}）`)
ok(nlFnN.length >= 1, `存在 normLocale 定义（实测 ${nlFnN.length}）`)
ok(l10nN.length === 1, `恰好 1 个顶层 var L10N（实测 ${l10nN.length}）`)
ok(i18nN.length === 1, `恰好 1 个顶层 var I18N（实测 ${i18nN.length}）`)
ok(localeAllN.length === 1, `恰好 1 个顶层 var LOCALE_ALL（实测 ${localeAllN.length}）`)
ok(i18nAssigns.length >= 1, `存在顶层 I18N.<lang> 独立赋值（实测 ${i18nAssigns.length} 条：` +
  i18nAssigns.map((n) => n.text.split('=')[0].trim()).join(',') + '）')

// ★抽取器自检（非空泛断言）：四段关键切片必须真的被取到且非空
ok(lFnN.length === 1 && lFnN[0].text.length > 20, '抽取器自检：L 函数切片非空且像函数体')
ok(l10nN.length === 1 && /^var L10N\s*=\s*\{/.test(l10nN[0].text) && l10nN[0].text.endsWith('}'),
  '抽取器自检：L10N 切片以 `var L10N = {` 开头、以 `}` 收尾（括号配对正确）')
ok(i18nN.length === 1 && /^var I18N\s*=\s*\{/.test(i18nN[0].text) && i18nN[0].text.endsWith('}'),
  '抽取器自检：I18N 切片以 `var I18N = {` 开头、以 `}` 收尾（括号配对正确）')
ok(i18nAssigns.length >= 1 && i18nAssigns.every((n) => n.text.endsWith('}')),
  '抽取器自检：I18N.<lang> 赋值切片均以 `}` 收尾')

/* ── 在 vm 里真执行这些定义 ──────────────────────────────── */
const code = [
  'var locale = "zh";',
  // ★对象字面量必须包在括号里当表达式，否则 `{zh:{...}}` 会被解析成块 + label（实测报 Unexpected token ':'）
  'var LOCALE_ALL = ' + localeAllN[0].value + ';',
  'var L10N = (' + l10nN[0].value + ');',
  'var I18N = (' + i18nN[0].value + ');',
  // ★I18N.ja 等是独立赋值语句，必须逐条抄回
  ...i18nAssigns.map((n) => sliceOf(n) + ';'),
  sliceOf(lFnN[0]),
  l3FnN.length ? sliceOf(l3FnN[0]) : 'function L3(a,b,ja){ return L(a,b) }',
  sliceOf(nlFnN[0]),
  'globalThis.__T = { L: L, L3: L3, normLocale: normLocale, L10N: L10N, I18N: I18N, setLoc: function(v){ locale = v } }',
].join('\n')

const sb = { console }
sb.globalThis = sb
let T = null
try {
  vm.runInContext(code, vm.createContext(sb), { filename: 'client.js#i18n' })
  T = sb.__T
  // ★抽取器的**真正的**负控：切片若有括号错位/漏抄，这里必 SyntaxError/ReferenceError ⇒ 变红。
  ok(true, '★抽取片段在 vm 中真执行成功（无 ReferenceError / SyntaxError）—— 抽取器负控')
} catch (e) {
  ok(false, '抽取片段真执行失败: ' + e.message)
}

if (T) {
  // ⓪ 字典规模先测：若抽取器取错，键数会塌成 0 ⇒ 此处先红，后续断言才有意义
  const zhN0 = Object.keys(T.I18N.zh || {}).length
  const jaKeys0 = Object.keys(T.L10N.ja || {}).length
  ok(zhN0 > 500, `抽取器非空校验：I18N.zh 键数 ${zhN0} > 500（取错会塌成 0）`)
  ok(jaKeys0 > 300, `抽取器非空校验：L10N.ja 键数 ${jaKeys0} > 300（取错会塌成 0）`)

  // ① zh ⇒ 恒取中文
  T.setLoc('zh')
  ok(T.L('记忆', 'Memory') === '记忆', "L zh ⇒ 中文（'记忆'）")

  // ② en ⇒ 取英文
  T.setLoc('en')
  ok(T.L('记忆', 'Memory') === 'Memory', "L en ⇒ 英文（'Memory'）")

  // ③ ja：字典命中的键 ⇒ 日文，且**不等于**中文
  T.setLoc('ja')
  const jaKeys = Object.keys(T.L10N.ja || {})
  ok(jaKeys.length > 300, `L10N.ja 条目数 ${jaKeys.length} > 300`)
  const sample = jaKeys.find((k) => (T.I18N.ja || {})[k] === undefined) || jaKeys[0]
  const got = T.L(sample, 'EN-FALLBACK')
  ok(got !== 'EN-FALLBACK', `L ja 命中字典 ⇒ 非英文回落（key=${JSON.stringify(sample).slice(0, 30)} ⇒ ${JSON.stringify(got).slice(0, 30)}）`)
  ok(got !== sample || T.L10N.ja[sample] === sample, `L ja 值来自 L10N.ja（key=${JSON.stringify(sample).slice(0, 30)}）`)

  // ④ 负路径：字典里没有的键 ⇒ 回落英文
  const missing = '__NOPE__' + Date.now()
  ok(T.L(missing, 'FALLBACK') === 'FALLBACK', 'L ja 未命中 ⇒ 回落英文（负路径）')

  // ⑤ 负路径：把字典掏空 ⇒ 全部回落英文
  const backup = T.L10N.ja
  T.L10N.ja = {}
  ok(T.L('记忆', 'Memory') === 'Memory', 'L ja 空字典 ⇒ 回落英文（负路径）')
  T.L10N.ja = backup

  // ⑥ 未知语言 ⇒ 回落英文
  T.setLoc('fr')
  ok(T.L('记忆', 'Memory') === 'Memory', 'L 未知语言 fr ⇒ 回落英文（负路径）')
  ok(T.normLocale('fr') === '', "normLocale('fr') ⇒ ''（未知语言，负路径）")

  // ⑦ normLocale 归一化真实取值
  ok(T.normLocale('ja-JP') === 'ja', "normLocale('ja-JP') ⇒ 'ja'")
  ok(T.normLocale('ja_JP') === 'ja', "normLocale('ja_JP') ⇒ 'ja'")
  ok(T.normLocale('zh-CN') === 'zh', "normLocale('zh-CN') ⇒ 'zh'")
  ok(T.normLocale('en-US') === 'en', "normLocale('en-US') ⇒ 'en'")
  ok(T.normLocale('') === '', "normLocale('') ⇒ ''")
  ok(T.normLocale(null) === '', 'normLocale(null) ⇒ \'\'（不崩）')

  // ⑧ L3 逃生舱
  T.setLoc('ja')
  ok(T.L3('甲', 'Yi', 'コウ') === 'コウ', 'L3 ja ⇒ 第三参')
  T.setLoc('zh')
  ok(T.L3('甲', 'Yi', 'コウ') === '甲', 'L3 zh ⇒ 第一参')
  T.setLoc('en')
  ok(T.L3('甲', 'Yi', 'コウ') === 'Yi', 'L3 en ⇒ 第二参')

  // ⑨ 字典规模（真计数）
  const zhN = Object.keys(T.I18N.zh || {}).length
  const enN = Object.keys(T.I18N.en || {}).length
  const jaN = Object.keys(T.I18N.ja || {}).length
  console.log(`  I18N.zh=${zhN} I18N.en=${enN} I18N.ja=${jaN} L10N.ja=${jaKeys.length}`)
  ok(jaN > 500, `I18N.ja 键数 ${jaN} > 500`)
  ok(enN >= zhN - 5, `I18N.en(${enN}) 不显著少于 zh(${zhN})`)
}

console.log(fails.map((f) => '  FAIL: ' + f).join('\n'))
console.log(`\n[i18n-really] PASS ${pass} / FAIL ${fail}`)
process.exit(fail ? 1 : 0)
