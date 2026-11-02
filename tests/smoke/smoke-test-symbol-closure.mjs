// smoke-test-symbol-closure.mjs —— 符号闭环守卫（import/定义 ↔ 使用）
//
// 【为什么需要它】
//   2026-11-02 本轮真实事故：给 memory_note 加 project 参数时用了 `WHOIAM_NAME_RE`，
//   但**忘了把它加进 `import ... from './whoiam.js'`**。
//   - `node --check` 通过（只查语法）
//   - 静态 grep「符号出现过」也通过（使用点存在）
//   - 源码级断言 L1-6「用 WHOIAM_NAME_RE 校验」也通过（它只查有没有这段文字）
//   ⇒ 只有**真跑起来**才会 ReferenceError，而它被 try/catch 吞成「认领项目异常」，
//     表现成「功能坏了」而不是「少 import」。
//   ⇒ 本守卫用**静态方式**做「定义/导入 ↔ 使用」的闭环检查，把这类问题在提交前抓出来。
//
// 判据：`lib/index.js` 里引用的每一个**从本地模块导入的名字**，都必须在 import 里出现；
//       反之，每个从本地模块 import 进来的名字，都必须在正文里被至少使用一次（无死 import）。

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const SRC = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8')

let pass = 0, fail = 0
const ok = (c, n, e) => { if (c) { pass++; console.log('  ok   - ' + n + (e ? '  =>  ' + e : '')) } else { fail++; console.log('  FAIL - ' + n + (e ? '  =>  ' + e : '')) } }

/** 抽出所有「从相对路径 import 的名字」 */
function collectLocalImports(src) {
  const out = []
  // import { a, b as c } from './x.js'
  const re = /import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g
  let m
  while ((m = re.exec(src)) !== null) {
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => {
        const as = s.split(/\s+as\s+/)
        return (as[1] || as[0]).trim()
      })
    out.push({ names, from: m[2] })
  }
  return out
}

/** 去掉 import 区与注释后的正文（用于「是否被使用」判断） */
function bodyOf(src) {
  return src
    // 去掉块注释
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // 去掉行注释
    .replace(/^\s*\/\/.*$/gm, '')
    // 去掉 import 语句
    .replace(/^\s*import\s[\s\S]*?from\s*'[^']+'\s*$/gm, '')
}

const imports = collectLocalImports(SRC)
const body = bodyOf(SRC)
console.log('[符号闭环] 本地 import 语句 ' + imports.length + ' 条')

// ── 判据 A：动态 import 的文件里导出的名字，若在正文用到，必须在静态 import 里 ──
// 具体到本轮：whoiam.js 导出的名字若被正文直接引用（非 xxxPre(...) 形式的模块调用），
// 必须在 import 名单里。
{
  const whoiam = readFileSync(path.join(ROOT, 'lib', 'whoiam.js'), 'utf8')
  const exported = [...whoiam.matchAll(/export\s+const\s+(\w+)\s*=/g)].map((m) => m[1])
    .concat([...whoiam.matchAll(/export\s+function\s+(\w+)/g)].map((m) => m[1]))
  const importedNames = new Set()
  for (const im of imports) if (im.from === './whoiam.js') for (const n of im.names) importedNames.add(n)
  console.log('  whoiam.js 导出 ' + exported.length + ' 个；index.js 静态导入 ' + importedNames.size + ' 个')

  // 找出「正文里在用它，但没 import」的名字
  const missing = []
  for (const name of exported) {
    if (importedNames.has(name)) continue
    // 作为**裸标识符**被使用（不是 obj.name 形式）
    const bareUse = new RegExp('(?<![.\\w])' + name + '\\b')
    if (bareUse.test(body)) missing.push(name)
  }
  ok(missing.length === 0, '★A 被判据：whoiam.js 的导出若在正文裸用，必须在 import 名单里', missing.length ? ('缺失: ' + missing.join(', ')) : '0 处缺失')

  // 逐项复核本轮那个具体符号
  ok(importedNames.has('WHOIAM_NAME_RE'), '★A-2 WHOIAM_NAME_RE 已在 import 名单里')
  ok(/(?<![.\w])WHOIAM_NAME_RE\b/.test(body), '★A-3 WHOIAM_NAME_RE 在正文被真的用到（不是死 import）')
}

// ── 判据 B：本轮**新增/改动**涉及的模块，其 import 名必须被使用（防死 import 与拼错）──
//   ★刻意不检查全部 83 条 import：实测既有代码里已有 24 个历史死 import
//     （retryRename / deriveArmsHealthPre / deepScanPeerTransformers …），
//     把它们一并算进来会让本守卫**恒红**，那就等于没有守卫。
//     本守卫的职责是「**防止新增**这类问题」，故只覆盖本轮动到的模块。
{
  const WATCH = new Set(['./whoiam.js', './wb-project-split.js', './plan-store.js'])
  const dead = []
  for (const im of imports) {
    if (!WATCH.has(im.from)) continue
    for (const n of im.names) {
      const re = new RegExp('(?<![.\\w])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b')
      if (!re.test(body)) dead.push(n + ' (from ' + im.from + ')')
    }
  }
  const watched = imports.filter((im) => WATCH.has(im.from)).reduce((a, im) => a + im.names.length, 0)
  ok(dead.length === 0, '★B 本轮涉及模块无死 import', dead.length ? ('死 import ' + dead.length + ' 个: ' + dead.join(', ')) : ('检查 ' + watched + ' 个名字，0 死'))
  // 明确记录既有死 import 的数量，避免「以为全仓干净」
  const allDead = []
  for (const im of imports) {
    for (const n of im.names) {
      const re = new RegExp('(?<![.\\w])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b')
      if (!re.test(body)) allDead.push(n)
    }
  }
  console.log('  (info) 全仓既有死 import 共 ' + allDead.length + ' 个 —— 历史遗留，不在本守卫的判定面内')
}

// ── 判据 C：本轮新增的三个符号必须闭环（定义 + 使用 ≥2）──
{
  const cases = ['syncProjectCopiesPre', 'splitPlanByProjectPre', 'renderProjectCopyPre', 'planCopyState']
  for (const sym of cases) {
    const n = (SRC.match(new RegExp('\\b' + sym + '\\b', 'g')) || []).length
    ok(n >= 2, '★C ' + sym + ' 出现 ≥2 次（定义/导入 + 使用）', String(n))
  }
}

console.log('')
console.log('[symbol-closure] pass=' + pass + ' fail=' + fail)
process.exit(fail ? 1 : 0)
