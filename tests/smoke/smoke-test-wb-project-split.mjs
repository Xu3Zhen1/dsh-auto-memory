// smoke-test-wb-project-split.mjs —— 白板按项目切分（P0① ③）
//
// 对应定案与用户拍板（2026-11-02）：
//   · 归属用行内 tag `project: pkg-a`
//   · 没有归属的节 ⇒ 不备副本，且必须**降级可见**
//
// 本仓纪律：没见过失败的断言只是声称。底部有 mutate 自检。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'wb-project-split.js'), 'utf8')
const M = await import(pathToFileURL(path.join(ROOT, 'lib', 'wb-project-split.js')).href)

let pass = 0, fail = 0
const ok = (c, n, e) => { if (c) { pass++; console.log('  ok -', n + (e ? '  =>  ' + e : '')) } else { fail++; console.log('  FAIL -', n + (e ? '  =>  ' + e : '')) } }
const eq = (a, b, n) => ok(Object.is(a, b), n + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')

const P = (arr) => arr.join('\n')

console.log('\n[1] extractProjectPre：边界与字符集')
{
  eq(M.extractProjectPre('- project: pkg-a'), 'pkg-a', '带前导空格与冒号后空格')
  eq(M.extractProjectPre('project:pkg-a'), 'pkg-a', '紧贴无空格')
  eq(M.extractProjectPre('  project:   pkg-a'), 'pkg-a', '多个空格')
  eq(M.extractProjectPre('xx project: pkg-a'), 'pkg-a', '前面是空格 ⇒ 合法')
  eq(M.extractProjectPre('中文project: pkg-a'), '', '★左边紧邻汉字 ⇒ 拒绝（更长单词的一部分）')
  eq(M.extractProjectPre('xxproject: pkg-a'), '', '★左边紧邻字母 ⇒ 拒绝')
  eq(M.extractProjectPre('project: Pkg_A'), '', '★非 kebab-case ⇒ 拒绝')
  eq(M.extractProjectPre('project: 项目甲'), '', '中文项目名 ⇒ 拒绝（charset）')
  eq(M.extractProjectPre('project: pkg-a\nproject: pkg-b'), 'pkg-a', '多条取第一条')
  eq(M.extractProjectPre(''), '', '空串')
  eq(M.extractProjectPre(null), '', 'null 不抛')
}

console.log('\n[2] splitPlanByProjectPre：切分正确性')
{
  const plan = P([
    '# 项目白板 · 测试', '',
    '## 目标', '- project: pkg-a', '- 做甲的事', '',
    '## 当前状态', '- project: pkg-b', '- 乙的进度', '',
    '## 下一步', '- 没写归属', '',
  ])
  const r = M.splitPlanByProjectPre(plan)
  eq(r.total, 3, '识别 3 节')
  ok(!!r.byProject['pkg-a'], 'pkg-a 有分组')
  ok(!!r.byProject['pkg-b'], 'pkg-b 有分组')
  eq(r.byProject['pkg-a'].sections.length, 1, 'pkg-a 1 节')
  eq(r.byProject['pkg-b'].sections.length, 1, 'pkg-b 1 节')
  eq(r.unassigned.length, 1, '★1 节无归属')
  eq(r.unassigned[0].title, '下一步', '无归属的是「下一步」')
  eq(r.conflicts.length, 0, '无冲突')
}

console.log('\n[3] ★ 降级可见：无归属的节必须被**单独列出**，不能静默丢')
{
  const plan = P([
    '# 白板', '',
    '## A', '- project: pkg-a', '',
    '## B', '- 没写', '',
    '## C', '- 也没写', '',
  ])
  const r = M.splitPlanByProjectPre(plan)
  eq(r.unassigned.length, 2, '两个无归属节都被收进 unassigned（不丢）')
  eq(r.byProject['pkg-a'].sections.length, 1, 'pkg-a 只有 1 节')
  // 守恒：所有节都必须在某个桶里
  const inProj = Object.values(r.byProject).reduce((a, g) => a + g.sections.length, 0)
  eq(inProj + r.unassigned.length, r.total, '★守恒：分组 + 无归属 = 总节数（无节丢失）')
}

console.log('\n[4] 同一节写多个 project ⇒ 归第一个，并记冲突（不静默）')
{
  const plan = P([
    '# 白板', '',
    '## 混装', '- project: pkg-a', '- project: pkg-b', '- 两个都写了', '',
  ])
  const r = M.splitPlanByProjectPre(plan)
  eq(r.byProject['pkg-a'].sections.length, 1, '归 pkg-a')
  eq(r.conflicts.length, 1, '★记了 1 条冲突')
  eq(r.conflicts[0].picked, 'pkg-a', 'picked=pkg-a')
  eq(r.conflicts[0].others[0], 'pkg-b', 'others 含 pkg-b')
}

console.log('\n[5] 同名 project 分散在多节 ⇒ 合并到一组，保持原顺序')
{
  const plan = P([
    '# 白板', '',
    '## 一', '- project: pkg-a', '',
    '## 二', '- project: pkg-b', '',
    '## 三', '- project: pkg-a', '',
  ])
  const r = M.splitPlanByProjectPre(plan)
  eq(r.byProject['pkg-a'].sections.length, 2, 'pkg-a 合并 2 节')
  eq(r.byProject['pkg-a'].sections[0].title, '一', '第 1 节是「一」')
  eq(r.byProject['pkg-a'].sections[1].title, '三', '第 2 节是「三」（保序）')
}

console.log('\n[6] 完全没有 project 的白板 ⇒ 全部无归属（丙的常态）')
{
  const plan = P(['# 白板', '', '## A', '- x', '', '## B', '- y', ''])
  const r = M.splitPlanByProjectPre(plan)
  eq(Object.keys(r.byProject).length, 0, '没有任何项目分组')
  eq(r.unassigned.length, 2, '两节都无归属')
}

console.log('\n[7] renderProjectCopyPre：副本带来源头，不被误当真源')
{
  const secs = [{ title: '目标', text: '## 目标\n- project: pkg-a\n- 做甲的事' }]
  const out = M.renderProjectCopyPre('pkg-a', secs, { wsName: 'AMup', planRevision: 'abcdef1234567890' })
  ok(out.includes('项目白板副本 · pkg-a'), '标题含项目名')
  ok(out.includes('派生副本'), '★明确标注是派生副本')
  ok(out.includes('真源永远是 PLAN.md'), '★说明真源')
  ok(out.includes('pkg-a'), '含项目名')
  ok(out.includes('abcdef123456'), '含白板版本（截断显示）')
  ok(out.includes('## 目标'), '含节正文')
  ok(!out.includes('<!--'), '不引入 HTML 注释（避免泄漏到注入面）')
}

console.log('\n[8] 空输入不崩')
{
  const r = M.splitPlanByProjectPre('')
  eq(r.total, 0, '空串 ⇒ 0 节')
  eq(r.unassigned.length, 0, '无归属为空')
  const r2 = M.splitPlanByProjectPre(null)
  eq(r2.total, 0, 'null ⇒ 0 节')
  const out = M.renderProjectCopyPre('pkg-a', [], {})
  ok(out.includes('项目白板副本'), '空节列表仍产出合法头')
}

console.log('\n[9] mutate 自检：改坏实现，断言必须变红')
{
  // 每个变异必须配一个**它的语义**该被检出的用例（不能一律用同一个探针）：
  //   · charset 变异 ⇒ 用「中文项目名」验（边界检查本来就拦汉字，故必须两个一起放开才可能命中）
  //   · 边界变异   ⇒ 用「中文project:」验（左邻汉字应被拒）
  const mutations = [
    {
      name: '放宽 charset 为 /.+/',
      apply: (s) => s.replace(
        'export const PROJECT_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/',
        'export const PROJECT_NAME_RE = /.+/'),
      // charset 放开后，`project: pkg_a`（下划线）应被接受（原 charset 要求 kebab-case，拒它）
      // ⚠ 不能用「项目甲」做探针：tag 正则 `[\w-]+` 本身就不吃汉字，value 会被截成空 ⇒ 变异根本触发不到。
      probe: (MM) => MM.extractProjectPre('- project: pkg_a') !== '',
    },
    {
      name: '去掉左侧边界检查',
      apply: (s) => s.replace("if (prev && /[\\w\\u4e00-\\u9fff]/.test(prev)) return ''", ''),
      probe: (MM) => MM.extractProjectPre('中文project: pkg-a') !== '',
    },
    {
      name: '无归属节被静默丢弃',
      apply: (s) => s.replace('unassigned.push({ title: sec.title, text })', 'void 0'),
      probe: (MM) => MM.splitPlanByProjectPre(P(['## A', '- x'])).unassigned.length === 0,
    },
    {
      name: '冲突记录被删',
      apply: (s) => s.replace('if (found.length > 1) conflicts.push(', 'if (false) conflicts.push('),
      probe: (MM) => MM.splitPlanByProjectPre(P(['## M', '- project: pkg-a', '- project: pkg-b'])).conflicts.length === 0,
    },
  ]
  let detected = 0
  const fs = await import('node:fs')
  for (const mu of mutations) {
    const mutSrc = mu.apply(SRC)
    if (mutSrc === SRC) { console.log('  (skip) 变异未命中源码：' + mu.name); continue }
    const tmp = path.join(ROOT, 'lib', '.wb-project-split.MUT.mjs')
    try {
      fs.writeFileSync(tmp, mutSrc, 'utf8')
      const MM = await import(pathToFileURL(tmp).href + '?v=' + Date.now())
      if (mu.probe(MM)) { detected++; console.log('  ok - 变异被检出：' + mu.name) }
      else console.log('  FAIL - 变异未被检出：' + mu.name)
    } finally {
      try { fs.unlinkSync(tmp) } catch {}
    }
  }
  ok(detected === mutations.length, '★全部变异都被检出（断言非恒真）', 'detected=' + detected + '/' + mutations.length)
}

console.log('\n[wb-project-split] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail ? 1 : 0)
