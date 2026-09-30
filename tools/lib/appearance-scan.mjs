/**
 * 外观层度量 · **唯一实现**（扫描器 CLI 与 smoke 套件共用，杜绝两份实现漂移）。
 *
 * 口径（R16 定稿）：
 *   ① **剥离注释**（注释里既有 issue 号又有说明文字，不是样式）
 *   ② **排除 issue/PR 号**（`PR #124` / `error #310` 长得像 3 位 hex，但不是颜色）
 *   ③ **掩掉 `var(--x, …)` 兜底**（兜底里的字面量是 token 化后的**有意保留**，客户改 token 即生效）
 *   ④ **单独统计 token 定义行**（`--dam-x: #fff` 是定义本身，不是裸值）
 * ⇒ 输出「真·无 token 承接的裸值」= 外观层归零指标。
 */

const ISSUE_CTX = /(PR|pr|issue|Issue|error|Error|backport)\s*#\d+\b/g
const HEX = /#[0-9a-fA-F]{3,8}\b/g
// ★须捕获**完整调用**（含参数）：只匹配 `rgba(` 会让 value 恒为该前缀、无法分组命名。
const RGBA_RAW = /rgba?\([^()]*\)/g
/**
 * 动态 rgba = **已由 token 驱动**，不是裸值：
 *   ① `rgba(var(--tile-rgb),.52)` ⇒ 掩码 var() 后残留 `rgba(,.52)`（首参为空）
 *   ② `'rgba(' + col.r + …` ⇒ 运行时拼接（JS 表达式，非字面量）
 * 两类都必须排除，否则会把「已经 token 化的写法」当成待清零的裸值。
 */
export function isDynamicRgba(s) { return /^rgba?\(\s*,/.test(s) || /^rgba?\(\s*['"]/.test(s) }
// ★2026-09-27 皮肤线演进:定义行同时识别 --skin-*(12 卷 §四 契约强制皮肤 token 以自身值定义,
// 与 --dam-* 同理「定义本身不是裸值」);使用侧零裸值判据不变。演进原因留痕(参照 r38 区间锁先例)。
const DEF = /--(dam|skin)-[a-z0-9-]+\s*:/

/** 剥离行注释与块注释（保留行结构） */
export function stripComments(src) {
  const out = []
  let inBlock = false
  for (const raw of String(src).split('\n')) {
    let line = raw.replace(/\r$/, '')
    if (inBlock) {
      const e = line.indexOf('*/')
      if (e < 0) { out.push(''); continue }
      line = line.slice(e + 2)
      inBlock = false
    }
    let acc = ''
    let i = 0
    while (i < line.length) {
      const two = line.slice(i, i + 2)
      if (two === '//') break
      if (two === '/*') { const e = line.indexOf('*/', i + 2); inBlock = e < 0; if (e < 0) break; i = e + 2; continue }
      acc += line[i]
      i += 1
    }
    out.push(acc)
  }
  return out.join('\n')
}

/** 掩掉 var(...)（迭代至收敛，处理 var(--a, var(--b, #fff)) 嵌套） */
/**
 * 掩掉 `var(--token, 兜底)` 整个调用。
 * ★为什么不能只写 `var\([^()]*\)`：兜底常是 `rgba(0,0,0,.22)` / `color-mix(...)`，**内层带括号**，
 *   简单字符类匹配不到 ⇒ 会把**已 token 化的合法兜底**当成裸值（R16 实测：假数 276 中绝大多数是这种）。
 *   这里做的是**括号配平扫描**（从 `var(` 起找到配对的 `)`），迭代至收敛以处理嵌套 var。
 */
export function maskVarCalls(s) {
  let prev = null
  let cur = String(s)
  while (prev !== cur) {
    prev = cur
    cur = swallowVar(cur, 'var(')
  }
  return cur
}

/** 括号配平地吞掉所有以 head 开头的调用（含嵌套） */
function swallowVar(src, head) {
  let out = ''
  let i = 0
  while (i < src.length) {
    if (src.startsWith(head, i)) {
      let depth = 0
      let j = i + head.length - 1
      for (; j < src.length; j += 1) {
        if (src[j] === '(') depth += 1
        else if (src[j] === ')') { depth -= 1; if (depth === 0) { j += 1; break } }
      }
      i = j
      continue
    }
    out += src[i]
    i += 1
  }
  return out
}

/** 掩掉「已在 token 定义行里出现过的」值（定义行内的兜底/reference 非裸值）—— 本函数仅按行处理，见 scanAppearance */

/**
 * 扫描一段源码。
 * @returns {{hex:number, rgba:number, hexInDef:number, rgbaInDef:number, defs:number, lines:number}}
 */
export function scanAppearance(src) {
  const stripped = stripComments(src)
  const rows = stripped.split('\n')
  let hex = 0, rgba = 0, hexInDef = 0, rgbaInDef = 0, defs = 0
  for (const row of rows) {
    const isDef = DEF.test(row)
    if (isDef) defs += 1
    const m = maskVarCalls(row.replace(ISSUE_CTX, '#ISSUE'));
    const h = (m.match(HEX) || []).length
    const r = (m.match(RGBA_RAW) || []).filter((x) => !isDynamicRgba(x)).length
    if (isDef) { hexInDef += h; rgbaInDef += r } else { hex += h; rgba += r }
  }
  return { hex, rgba, hexInDef, rgbaInDef, defs, lines: rows.length }
}

/** 逐处明细（供扫描器 CLI 打印；套件只用汇总） */
export function scanAppearanceDetail(src) {
  const rows = stripComments(src).split('\n')
  const hex = [], rgba = []
  rows.forEach((row, i) => {
    if (DEF.test(row)) return
    const m = maskVarCalls(row.replace(ISSUE_CTX, '#ISSUE'));
    for (const x of (m.match(HEX) || [])) hex.push({ value: x, line: i + 1, text: row.trim().slice(0, 110) })
    for (const x of (m.match(RGBA_RAW) || []).filter((y) => !isDynamicRgba(y))) rgba.push({ value: x, line: i + 1, text: row.trim().slice(0, 110) })
  })
  return { hex, rgba }
}