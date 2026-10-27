// smoke-test-whoiam-identity.mjs —— whoiam 身份层负控
// 对应定案的「成功标准」：第 3 条（无 whoiam ⇒ 降级不阻断）、第 5 条（name 冲突拒绝建树）、
// 第 8 条（parent: 空值能建根 / parent: null 不能），外加 parent 环与 archived 豁免。
//
// 本仓纪律：没见过失败的断言只是声称。因此每条断言都配了「若实现被改坏则必红」的构造，
// 且底部有 mutate 自检：故意破坏实现，断言必须变红。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'whoiam.js'), 'utf8')

// 用插件自己的扁平 frontmatter 解析器（零新依赖，定案要求）
const { parseFrontmatterScalarsPre } = await import(
  pathToFileURL(path.join(ROOT, 'lib', 'skill-export.js')).href
)
const M = await import(pathToFileURL(path.join(ROOT, 'lib', 'whoiam.js')).href)

let pass = 0, fail = 0
const ok = (c, n) => { if (c) { pass++; console.log('  ok -', n) } else { fail++; console.log('  FAIL -', n) } }
const eq = (a, b, n) => ok(Object.is(a, b), n + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')

/** 把 YAML 文本喂给插件解析器，模拟真实读盘 */
function fmOf(yaml) {
  const r = parseFrontmatterScalarsPre('---\n' + yaml + '\n---\n\nbody\n')
  return r.ok ? r.data : null
}

console.log('\n[1] 成功标准第 8 条：parent 空值能建根 / parent: null 不能')
{
  const rootEmpty = fmOf('name: ws-main\nparent:\nstatus: active')
  const v1 = M.validateWhoiamFrontmatterPre(rootEmpty)
  ok(v1.ok, '空值 parent 通过校验')
  eq(v1.parent, null, '空值 parent 归一为 null（可建根）')

  const rootNull = fmOf('name: ws-main\nparent: null\nstatus: active')
  const v2 = M.validateWhoiamFrontmatterPre(rootNull)
  // ★ 关键负控：解析器把 null 解析成字符串 "null" ⇒ 不会被当成根
  ok(v2.ok && v2.parent === 'null', 'parent: null 被解析成字符串 "null"（不是根）')
  ok(v2.parent !== null, 'parent: null ⇒ parent !== null（若实现改成接受 "null" 则此断言红）')

  const tree = M.buildWhoiamTreePre([
    { path: 'whoiam.md', fm: rootEmpty },
    { path: 'projects/pkg-a/whoiam.md', fm: fmOf('name: pkg-a\nparent: ws-main\nstatus: active') },
  ])
  ok(tree.ok, '树构建成功')
  const ws = tree.nodes.find((n) => n.name === 'ws-main')
  const pj = tree.nodes.find((n) => n.name === 'pkg-a')
  eq(ws && ws.kind, 'workspace', '空值 parent ⇒ 工作区节点')
  eq(pj && pj.kind, 'project', '有 parent ⇒ 项目节点')
  eq(pj && pj.parent, 'ws-main', '项目节点记录父级 name')
}

console.log('\n[2] 成功标准第 3 条：无 whoiam ⇒ 降级、不阻断')
{
  const id = M.resolveWhoiamIdentityPre({ tree: { ok: true, nodes: [] }, wsKey: '--G-AMup--' })
  eq(id.source, '降级', '无节点 ⇒ source=降级')
  eq(id.scopeChain.length, 0, '降级时 scopeChain 为空')
  ok(!!id.wsKey, '降级仍返回 wsKey（不抛错、不阻断）')

  // 空树/缺字段也必须不抛
  let threw = false
  try { M.resolveWhoiamIdentityPre({}) } catch { threw = true }
  ok(!threw, '入参缺失也不抛（fail-soft）')
}

console.log('\n[3] 成功标准第 5 条：name 冲突 ⇒ 拒绝建树、不静默取一个')
{
  const dup = M.buildWhoiamTreePre([
    { path: 'a/whoiam.md', fm: fmOf('name: same\nparent:') },
    { path: 'b/whoiam.md', fm: fmOf('name: same\nparent:') },
  ])
  eq(dup.ok, false, '重复 name ⇒ ok=false')
  eq(dup.reason, 'mismatch', 'reason=mismatch')
  eq(dup.mismatches.length, 1, '记录 1 条 mismatch')
  eq(dup.mismatches[0].detail && dup.mismatches[0].detail.includes('duplicate'), true, 'mismatch 说明含 duplicate（指路而非静默）')
  // 「不静默取一个」的准确含义：冲突必须**外显**（ok=false + mismatch 记录双方路径），
  // 而不是「两条都不进树」——前者是定案要求，后者会白白丢掉一条可用信息。
  ok(dup.mismatches[0].detail.includes(' vs '), 'mismatch 同时给出冲突双方路径（可人工裁定）')
  ok(dup.ok === false && dup.reason === 'mismatch', '调用方无法把它当成成功（必须处理）')
}

console.log('\n[4] name 字符集：非 kebab-case ASCII ⇒ mismatch')
{
  for (const bad of ['项目甲', 'pkg_a', 'A B', 'pkg.a', 'Pkg-A']) {
    const t = M.buildWhoiamTreePre([{ path: 'x/whoiam.md', fm: fmOf('name: ' + bad + '\nparent:') }])
    eq(t.ok, false, 'name="' + bad + '" ⇒ 拒绝')
  }
  const good = M.buildWhoiamTreePre([{ path: 'x/whoiam.md', fm: fmOf('name: pkg-a\nparent:') }])
  eq(good.ok, true, 'name="pkg-a" ⇒ 通过')
}

console.log('\n[5] archived：保留在树里，但豁免 name 唯一性（定案 §9.1）')
{
  const t = M.buildWhoiamTreePre([
    { path: 'old/whoiam.md', fm: fmOf('name: reused\nparent: ws\nstatus: archived') },
    { path: 'new/whoiam.md', fm: fmOf('name: reused\nparent: ws\nstatus: active') },
    { path: 'whoiam.md', fm: fmOf('name: ws\nparent:') },
  ])
  eq(t.ok, true, 'archived 与 active 同名不冲突（归档豁免唯一性）')
  const arch = t.nodes.filter((n) => n.name === 'reused' && n.status === 'archived')
  const act = t.nodes.filter((n) => n.name === 'reused' && n.status === 'active')
  eq(arch.length, 1, '归档节点仍在树里（历史 parent 可解析）')
  eq(act.length, 1, '活跃节点也在树里')
}

console.log('\n[6] orphan：父节点不存在 ⇒ 标 orphan、跳过该节点、其余照建（不阻断）')
{
  const t = M.buildWhoiamTreePre([
    { path: 'whoiam.md', fm: fmOf('name: ws\nparent:') },
    { path: 'pkg/whoiam.md', fm: fmOf('name: child\nparent: not-yet-created') },
  ])
  eq(t.ok, true, '父节点缺失不使整棵树失败（不阻断）')
  eq(t.orphans.length, 1, '记录 1 条 orphan')
  ok(!t.nodes.some((n) => n.name === 'child'), 'orphan 节点被跳过（不进树）')
  ok(t.nodes.some((n) => n.name === 'ws'), '其余节点照建')
  ok(t.orphans[0].detail.includes('not found'), 'orphan 外显原因（不静默丢弃）')
}

console.log('\n[7] parent 环：不挂死（静默截断）')
{
  const t = M.buildWhoiamTreePre([
    { path: 'a/whoiam.md', fm: fmOf('name: a\nparent: b') },
    { path: 'b/whoiam.md', fm: fmOf('name: b\nparent: a') },
  ])
  let threw = false, id = null
  try { id = M.resolveWhoiamIdentityPre({ tree: t, wsKey: 'w', projectTag: 'a' }) } catch { threw = true }
  ok(!threw, 'parent 环不抛异常')
  ok(id && id.scopeChain.length <= 2, '环被截断（scopeChain 长度有限）')
}

console.log('\n[8] 一次性提示：累计 5 次才提示、提示后永不再提示（定案 §9.3）')
{
  let st = null
  const seq = []
  for (let i = 1; i <= 7; i++) {
    const r = M.bumpWhoiamHintPre(st, 'projects/pkg-a')
    seq.push(r.shouldHint)
    st = r.next
  }
  eq(JSON.stringify(seq), JSON.stringify([false, false, false, false, true, false, false]), '第 5 次提示、 thereafter 不再提示')
  ok(st['projects/pkg-a'].hintedAt > 0, '提示后写入 hintedAt')

  // 损坏状态 ⇒ 当无状态重新计数（fail-soft）
  const broken = M.bumpWhoiamHintPre('not-an-object', 'k')
  eq(broken.writes, 1, '损坏状态当作无状态（重新计数）')

  // 文案唯一来源
  ok(M.whoiamHintTextPre('projects/pkg-a').includes('未声明身份'), '提示文案含「未声明身份」')
}

console.log('\n[9] 硬约束：本模块不得提供写 frontmatter 的入口')
{
  ok(!/export function .*(write|set|update|patch).*Frontmatter/i.test(SRC), '无写 frontmatter 的导出（只读约束）')
  ok(/parent === 'null'/.test(SRC) === false, '实现未接受字符串 "null" 作为根（不开口子）')
}

console.log('\n[10] 变异自检：改坏实现，断言必须变红')
{
  const variants = [
    ['parent 判空改成 ===null', SRC.replace('if (parentRaw != null)', 'if (parentRaw !== null)')],
    ['archived 不再豁免唯一性', SRC.replace("if (v.status === 'archived') {", 'if (false) {')],
    ['orphan 不跳过而是当根', SRC.replace('continue\n    }\n    resolved.push(n)', 'n.kind = "workspace"\n    }\n    resolved.push(n)')],
    ['name 正则放松', SRC.replace(/export const WHOIAM_NAME_RE = .*/, 'export const WHOIAM_NAME_RE = /^.+$/')],
    ['提示阈值改 1', SRC.replace(/WHOIAM_HINT_AFTER_WRITES_PRE_V1 = 5/, 'WHOIAM_HINT_AFTER_WRITES_PRE_V1 = 1')],
  ]
  let detected = 0
  for (const [label, mutated] of variants) {
    if (mutated === SRC) { ok(false, '变异未生效（替换锚点失效，需修断言）：' + label); continue }
    const url = 'data:text/javascript;base64,' + Buffer.from(mutated, 'utf8').toString('base64')
    let mu = null
    try { mu = await import(url) } catch { ok(true, '变异体载入失败即视为检出：' + label); detected++; continue }

    let caught = false
    try {
      if (label.includes('parent 判空')) {
        // 变异后：undefined 走进 else 分支 ⇒ 报 bad-frontmatter；正确实现必须 ok 且 parent===null
        const v = mu.validateWhoiamFrontmatterPre({ name: 'w' })
        caught = !(v.ok && v.parent === null)
      } else if (label.includes('archived')) {
        // 变异后：archived 参与唯一性 ⇒ 同名冲突 ⇒ ok=false 且 mismatch 出现
        const t = mu.buildWhoiamTreePre([
          { path: 'o', fm: { name: 'r', parent: 'w', status: 'archived' } },
          { path: 'n', fm: { name: 'r', parent: 'w', status: 'active' } },
        ])
        caught = t.ok === false || t.mismatches.length > 0
      } else if (label.includes('orphan')) {
        const t = mu.buildWhoiamTreePre([
          { path: 'w', fm: { name: 'w', parent: null } },
          { path: 'c', fm: { name: 'c', parent: 'nope' } },
        ])
        caught = t.nodes.some((n) => n.name === 'c')
      } else if (label.includes('name 正则')) {
        const t = mu.buildWhoiamTreePre([{ path: 'x', fm: { name: '项目甲', parent: null } }])
        caught = t.ok === true
      } else if (label.includes('阈值')) {
        const r = mu.bumpWhoiamHintPre(null, 'k')
        caught = r.shouldHint === true
      }
    } catch { caught = true }
    if (caught) { detected++; ok(true, '变异被检出：' + label) } else { ok(false, '变异未被检出（断言太弱）：' + label) }
  }
  eq(detected, variants.length, '全部 ' + variants.length + ' 个变异都被检出（断言非恒真）')
}

console.log('\n[whoiam-identity] PASS ' + pass + ' / FAIL ' + fail)
if (fail) process.exit(1)
