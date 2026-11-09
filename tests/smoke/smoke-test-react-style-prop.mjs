#!/usr/bin/env node
/**
 * 守卫：React 的 style prop 传了字符串 ⇒ React 抛 invariant #62
 * （"The style prop expects a mapping from style properties to values, not a string"）。
 *
 * 为什么必须单独成套：这类缺陷所有静态字符串断言、伪 React 夹具都是绿的——
 *   本轮 R131 的 h('div', { 'style': 'margin-top:6px' }) 就是这样漏掉的：
 *   测试只数接线、伪 h() 原样接受字符串；真浏览器里整页 Error: Minified React error #62
 *   ⇒「记忆页 / 设置入口空白」。
 *
 * 判据：解析 client.js 中每个 h(...) 调用的对象字面量 props，其 style 值不得是
 *   字符串字面量（必须是对象）。允许动态变量（style: someVar）。
 * 负控：注入一处字符串 style 后，同一判据必须命中（同进程自证灵敏度）。
 */
import { readFileSync } from 'node:fs'
const NL = String.fromCharCode(10)
const BT = 96
const CLIENT = 'G:/AMup/dsh-auto-memory/lib/client.js'
const src = readFileSync(CLIENT, 'utf8').split(String.fromCharCode(13) + NL).join(NL)
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m) } else { fail++; console.log('  FAIL ' + m) } }

/** 所有 h( 调用的对象字面量 props 区间（括号配平，跳过字符串）。 */
function hArgRanges(text) {
  const out = []
  const re = /(^|[^\w$.])h\s*\(/g
  let m
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length
    const start = i
    let depth = 1
    for (; i < text.length; i++) {
      const c = text[i]
      if (c === "'" || c === '"' || text.charCodeAt(i) === BT) {
        const q = c
        i++
        while (i < text.length) { if (text[i] === '\\') { i += 2; continue } if (text[i] === q) break; i++ }
        continue
      }
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) { out.push([start, i]); break } }
    }
  }
  return out
}

/** props 对象里 style 值为字符串字面量的出现（单/双引号）。 */
function styleStringViolations(text) {
  const bad = []
  for (const [s, e] of hArgRanges(text)) {
    const seg = text.slice(s, e)
    const re = /(?:^|[\s,{])['"]?style['"]?\s*:\s*(?:'[^']*'|"[^"]*")/g
    let m
    while ((m = re.exec(seg))) {
      const abs = s + m.index
      const line = text.slice(0, abs).split(NL).length
      bad.push({ line: line, snippet: seg.slice(m.index, m.index + 80).split(NL).join(' ') })
    }
  }
  return bad
}

console.log('[1] 正路径：client.js 中 h() 的 style 值必须是对象')
{
  const bad = styleStringViolations(src)
  ok(bad.length === 0, '零字符串 style（实际 ' + bad.length + ' 处' + (bad.length ? '：' + JSON.stringify(bad.slice(0, 3)) : '') + '）')
}

console.log('[2] 夹具自检：扫描器确实扫到 h() 的 props 对象（否则 [1] 可能零命中恒真）')
{
  const ranges = hArgRanges(src)
  ok(ranges.length > 1000, 'h() 调用参数区间命中数 ' + ranges.length + '（>1000）')
}

console.log('[3] 负控：注入一处字符串 style，同一判据必须命中（灵敏度自证）')
{
  const victim = "h('div', { 'data-x': '', 'style': 'margin-top:6px' }, null)"
  const bad = styleStringViolations(src + NL + victim + NL)
  ok(bad.length >= 1, '注入后命中 ' + bad.length + ' 处（必须 >=1）')
  const clean = src + NL + "h('div', { 'data-x': '', style: { marginTop: '6px' } }, null)" + NL
  ok(styleStringViolations(clean).length === 0, '对照：对象写法不误报')
}

console.log(NL + '结果: PASS=' + pass + ' FAIL=' + fail)
process.exit(fail ? 1 : 0)