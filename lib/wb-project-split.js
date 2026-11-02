/**
 * wb-project-split.js —— 白板按项目切分（2026-11-02，P0① ③）
 *
 * 设计依据（用户 2026-11-02 拍板）：
 *   · 归属用**行内 tag**：卡片正文写 `project: pkg-a`（复用 extractTagsPre 的确定性抽取，零 LLM）
 *   · 副本落 `handoff/projects/<name>.md`（复用定案已有的位置）
 *   · **丙**：没有 project 的卡 ⇒ 只留在公共白板，**不备副本**，且必须**降级可见**
 *
 * 为什么单独成模块：
 *   `wb-sidecar.js` 1,412 行、职责是 sidecar 索引；项目切分是**另一个关注点**且要能被
 *   单测直接 import（不发 r26 锁、不依赖 index.js）。纯函数、零 IO，与本仓既有风格一致。
 *
 * ⚠ 为什么不复用 `extractTagsPre`：它的正则是 `/(?:tag|type|topic):/`，**不认识 `project:`**。
 *   改它的正则会影响 sidecar 的 tag 索引（现有行为的改变），而我们要的只是「抽出 project 值」。
 *   ⇒ 本模块自带一个**同边界规则**的窄正则（边界判据与 extractTagsPre 逐字一致，
 *     避免出现两套「什么算 tag」的口径）。
 */

/** project 值的字符集：与 whoiam 的 name 同构（kebab-case ASCII），避免与作用域树对不上。 */
export const PROJECT_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** project tag 的正则（**单一来源**，两个函数共用，避免两套口径）。 */
const PROJECT_TAG_RE = /project:[ \t]*[\w-]+/g

/** 从一次正则命中里取值并判边界；合法返回 name，否则 ''。 */
function pickProjectFromMatchPre(src, m) {
  const at = m.index
  const prev = at > 0 ? src[at - 1] : ''
  // 边界与 extractTagsPre 同口径：左边紧邻字母/数字/下划线/汉字 ⇒ 是更长单词的一部分
  if (prev && /[\w\u4e00-\u9fff]/.test(prev)) return ''
  const val = String(m[0]).slice('project:'.length).trim()
  return PROJECT_NAME_RE.test(val) ? val : ''
}

/**
 * 从一段文本抽 `project:` 值（可能多条，取**第一条合法**的）。
 * @returns {string} 合法则返回 name，否则 ''
 */
export function extractProjectPre(text) {
  const src = String(text == null ? '' : text)
  for (const m of src.matchAll(PROJECT_TAG_RE)) {
    const v = pickProjectFromMatchPre(src, m)
    if (v) return v
  }
  return ''
}

/** 抽本节出现的**全部**合法 project（去重保序）。 */
function collectProjectsPre(src) {
  const out = []
  for (const m of src.matchAll(PROJECT_TAG_RE)) {
    const v = pickProjectFromMatchPre(src, m)
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

/**
 * 把一份白板按 `project:` tag 切成 { byProject, unassigned }。
 *
 * 口径：
 *   · 以 `##` 小节为切分单位（与 planCardsPre / splitSectionsPre 同口径）
 *   · 一节里**任意位置**出现合法 `project: x` ⇒ 整节归 x
 *   · 一节里出现**多个不同** project ⇒ 归**第一个**，并记进 `conflicts`（不静默）
 *   · 无 project ⇒ 进 `unassigned`
 *
 * @param {string} planText 白板全文
 * @returns {{
 *   byProject: Record<string, { sections: Array<{title:string, text:string}>, chars:number }>,
 *   unassigned: Array<{title:string, text:string}>,
 *   conflicts: Array<{title:string, picked:string, others:string[]}>,
 *   total: number
 * }}
 */
export function splitPlanByProjectPre(planText) {
  const src = String(planText == null ? '' : planText).replace(/\r\n/g, '\n')
  const lines = src.split('\n')

  // 切节：保留 `##` 标题行本身（回写时要能还原）
  const raw = []
  let cur = null
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (cur) raw.push(cur)
      cur = { title: line.replace(/^##\s+/, '').trim(), lines: [line] }
      continue
    }
    if (cur) cur.lines.push(line)
  }
  if (cur) raw.push(cur)

  const byProject = Object.create(null)
  const unassigned = []
  const conflicts = []

  for (const sec of raw) {
    const text = sec.lines.join('\n')
    // 收集本节出现的**全部** project 值（按出现顺序，去重）
    const found = collectProjectsPre(text)

    if (!found.length) {
      unassigned.push({ title: sec.title, text })
      continue
    }
    const picked = found[0]
    if (found.length > 1) conflicts.push({ title: sec.title, picked, others: found.slice(1) })
    if (!byProject[picked]) byProject[picked] = { sections: [], chars: 0 }
    byProject[picked].sections.push({ title: sec.title, text })
    byProject[picked].chars += text.length
  }

  return { byProject, unassigned, conflicts, total: raw.length }
}

/**
 * 把某个项目的若干节渲染成一份**独立可读**的副本文件内容。
 * 带来源说明头，避免副本被误认为真源（真源永远是 PLAN.md）。
 *
 * @param {string} project
 * @param {Array<{title:string,text:string}>} sections
 * @param {{ wsName?: string, planRevision?: string, now?: number }} [opts]
 * @returns {string}
 */
export function renderProjectCopyPre(project, sections, opts = {}) {
  const list = Array.isArray(sections) ? sections : []
  const name = String(project || '').trim() || '(unknown)'
  const wsName = String(opts.wsName || '').trim()
  const rev = String(opts.planRevision || '').trim()
  const nowMs = Number(opts.now) || Date.now()
  const d = new Date(nowMs)
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())

  const head = [
    '# 项目白板副本 · ' + name,
    '',
    '> ⚠ 这是 `handoff/PLAN.md` 的**派生副本**，不是真源。真源永远是 PLAN.md。',
    '> 用途：本工作区多个会话并行时，各项目读回**自己那份**，不受他项目改写影响。',
    '> 盲改本文件会在下次白板写入时被覆盖。',
    '',
    '| 项 | 值 |',
    '|---|---|',
    '| 项目 | `' + name + '` |',
    '| 工作区 | ' + (wsName || '-') + ' |',
    '| 白板版本 | ' + (rev ? '`' + rev.slice(0, 12) + '…`' : '-') + ' |',
    '| 节数 | ' + list.length + ' |',
    '| 生成时间 | ' + stamp + ' |',
    '',
  ].join('\n')

  const body = list.map((s) => String(s && s.text || '').trim()).filter(Boolean).join('\n\n')
  return head + body + '\n'
}
