/**
 * whoiam —— 身份层（`whoiam.md` 的扫描 / 解析 / 降级判定 / 一次性提示状态）。
 *
 * 设计定案：`G:\AMup\upstream-work\whoiam-定案.md`（2026-10-27 全部拍板）。
 * 本模块只做**纯函数与无副作用判定**；文件读写在调用方（index.js）完成。
 *
 * 核心约束（每条都有对应失败模式，不可简化）：
 *   ① frontmatter **只读**：本模块不提供任何写 frontmatter 的入口。
 *   ② `parent` 判空用 `== null`：插件解析器把 `parent: null` 解析成**字符串 "null"**，
 *      只有空值 token 才返回真 null（skill-export.js parseYamlScalarTokenPre L107）。
 *      ⇒ 根节点必须写 `parent:`（空值）；写 `parent: null` 会让根判定**恒假**。
 *   ③ 层级**只从 `parent` 读**，绝不从路径推：`wsKey` 是有损映射
 *      （`D:\repo\pkg-a` 与 `D:\repo--pkg-a` 同 key）⇒ 路径里没有可信的层级信息。
 *   ④ `name` 必须 kebab-case ASCII 且全局唯一：它会被注入与写入直接引用。
 *   ⑤ 缺 `whoiam.md` **不阻断**、不创建 —— 降级可见（source='降级'）。
 *   ⑥ `archived` 节点保留在树里，但**豁免** name 唯一性（否则归档永久霸占名字）。
 *   ⑦ 父节点不存在 ⇒ 标 `orphan` 并**跳过该节点**，其余照建；**不暂存**（磁盘即状态）。
 */

/** 身份来源标记。`降级` 是中文常量，与用户可见文案一致（定案原样）。 */
export const WHOIAM_SOURCES = Object.freeze({
  FILE: 'file',          // 正常：读到 whoiam.md 且合法
  DEGRADED: '降级',       // 缺 whoiam.md —— 不阻断，写入照常成功
  MISMATCH: 'mismatch',  // name 重复 / 非法字符集
  ORPHAN: 'orphan',      // parent 指向不存在的节点
  BAD: 'bad-frontmatter',// frontmatter 解析失败
})

/** `name` 字符集：与宿主 skill name 硬校验同构（skill-export.js:197 注释 / :481 throw）。 */
export const WHOIAM_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** `status` 只两个值（定案 §9.1）。省略视为 active。 */
export const WHOIAM_STATUSES_PRE_V1 = Object.freeze(['active', 'archived'])

/** 一次性提示：累计写 5 次、不设时间窗（定案 §9.3）。 */
export const WHOIAM_HINT_AFTER_WRITES_PRE_V1 = 5

/**
 * 判定单个 whoiam.md 的 frontmatter 是否合法。
 * @param {object|null} fm 解析后的扁平字段
 * @returns {{ok:boolean, reason?:string, detail?:string, status?:string}}
 */
export function validateWhoiamFrontmatterPre(fm) {
  if (!fm || typeof fm !== 'object') return { ok: false, reason: WHOIAM_SOURCES.BAD, detail: 'empty' }

  const name = typeof fm.name === 'string' ? fm.name.trim() : ''
  if (!name) return { ok: false, reason: WHOIAM_SOURCES.BAD, detail: 'missing name' }
  if (!WHOIAM_NAME_RE.test(name)) return { ok: false, reason: WHOIAM_SOURCES.MISMATCH, detail: 'invalid name "' + name + '" (kebab-case ASCII required)' }

  // ★ parent 判空：== null 同时覆盖 null 与 undefined。
  //   注意：解析器把字面 'null' 解析成字符串，本函数**故意不接受**它 ——
  //   接受等于给 schema 开口子，且会掩盖「根节点写错」这个真实错误。
  const parentRaw = fm.parent
  let parent = null
  if (parentRaw != null) {
    const p = typeof parentRaw === 'string' ? parentRaw.trim() : parentRaw
    if (p === '') parent = null
    else if (typeof p !== 'string') return { ok: false, reason: WHOIAM_SOURCES.BAD, detail: 'parent must be scalar' }
    else parent = p
  }

  const statusRaw = fm.status == null ? '' : String(fm.status).trim()
  const status = statusRaw === '' ? 'active' : statusRaw
  if (!WHOIAM_STATUSES_PRE_V1.includes(status)) {
    return { ok: false, reason: WHOIAM_SOURCES.MISMATCH, detail: 'invalid status "' + status + '" (allowed: ' + WHOIAM_STATUSES_PRE_V1.join('/') + ')' }
  }

  return { ok: true, name, parent, status }
}

/**
 * 把若干「已解析的 whoiam 条目」建成作用域树。
 *
 * 入参形状（每条由调用方从磁盘读出并解析）：
 *   { path, fm }              fm 为已解析扁平对象或 null（解析失败）
 *
 * 返回：
 *   { ok, nodes, orphans, mismatches, bad }
 *   - ok=false 仅当出现 **name 重复** 或 **非法字符集**（定案：拒绝建树，不静默取一个）
 *   - orphans: parent 指向不存在的节点（不暂存、每次重算）
 *   - 缺 whoiam 的目录不在此列（那是「没有条目」，由调用方标 source='降级'）
 */
export function buildWhoiamTreePre(entries) {
  const nodes = []
  const orphans = []
  const mismatches = []
  const bad = []
  const seenActive = new Map()   // name → path（仅 active 参与唯一性）
  const archRemoved = new Map()  // name → path（archived，仅用于诊断）

  for (const e of Array.isArray(entries) ? entries : []) {
    const p = e && e.path
    const v = validateWhoiamFrontmatterPre(e && e.fm)
    if (!v.ok) {
      if (v.reason === WHOIAM_SOURCES.BAD) bad.push({ path: p, detail: v.detail })
      else mismatches.push({ path: p, detail: v.detail })
      continue
    }

    // ★ 定案 §9.1：archived 保留在树里，但豁免 name 唯一性（否则永久霸占名字）
    if (v.status === 'archived') {
      if (!archRemoved.has(v.name)) archRemoved.set(v.name, p)
      nodes.push({ kind: 'project', name: v.name, parent: v.parent, status: 'archived', path: p })
      continue
    }

    if (seenActive.has(v.name)) {
      mismatches.push({ path: p, detail: 'duplicate name "' + v.name + '": ' + seenActive.get(v.name) + ' vs ' + p })
      continue
    }
    seenActive.set(v.name, p)

    nodes.push({
      // 节点类型由 parent 是否为空推出（不枚举 scope —— 定案）
      kind: v.parent == null ? 'workspace' : 'project',
      name: v.name,
      parent: v.parent,
      status: 'active',
      path: p,
    })
  }

  // 第二遍：解析父子关系（parent 指向不存在的 → orphan，跳过但保留在 orphans 里）
  const byName = new Map()
  for (const n of nodes) if (!byName.has(n.name)) byName.set(n.name, n)
  const resolved = []
  for (const n of nodes) {
    if (n.parent != null && !byName.has(n.parent)) {
      orphans.push({ path: n.path, name: n.name, parent: n.parent, detail: 'parent "' + n.parent + '" not found' })
      continue
    }
    resolved.push(n)
  }

  const hardFail = mismatches.length > 0
  return {
    ok: !hardFail,
    reason: hardFail ? WHOIAM_SOURCES.MISMATCH : undefined,
    nodes: resolved,
    orphans,
    mismatches,
    bad,
  }
}

/**
 * 计算某会话的身份。
 * 缺 whoiam（无可用节点）时**不报错**，返回 `source: '降级'`（定案：不阻断）。
 *
 * @param {object} args { tree, wsKey, projectTag? }
 */
export function resolveWhoiamIdentityPre(args = {}) {
  const { tree, wsKey } = args
  const projectTag = args.projectTag == null ? '' : String(args.projectTag)
  const nodes = (tree && Array.isArray(tree.nodes)) ? tree.nodes : []

  if (!nodes.length) {
    return { wsKey: wsKey == null ? '' : String(wsKey), projectTag, scopeChain: [], source: WHOIAM_SOURCES.DEGRADED }
  }

  const byName = new Map()
  for (const n of nodes) if (!byName.has(n.name)) byName.set(n.name, n)

  // 定位当前项目：优先 projectTag，否则退化到第一个 workspace 节点
  let cur = projectTag ? byName.get(projectTag) : null
  if (!cur) cur = nodes.find((n) => n.kind === 'workspace') || nodes[0]

  // 自下而上收集（防止 parent 环 —— 最多走 nodes.length 步）
  const scopeChain = []
  const seen = new Set()
  let at = cur
  let guard = 0
  while (at && guard++ <= nodes.length) {
    if (seen.has(at.name)) break   // 环：静默截断（不挂死）
    seen.add(at.name)
    scopeChain.push({ name: at.name, kind: at.kind, path: at.path })
    at = at.parent == null ? null : byName.get(at.parent)
  }

  return {
    wsKey: wsKey == null ? '' : String(wsKey),
    projectTag: cur ? cur.name : projectTag,
    scopeChain,
    source: WHOIAM_SOURCES.FILE,
  }
}

/**
 * 一次性提示判定（定案 §9.3）。
 * 纯函数：不改入参。返回 { shouldHint, next } —— `next` 由调用方原子写盘。
 *
 * @param {object} prev  已读的 hint-state 内容（可为 null / 损坏对象）
 * @param {string} key   目录键（如 'projects/pkg-a'）
 */
export function bumpWhoiamHintPre(prev, key) {
  const k = String(key || '')
  const state = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? prev : {}  // 损坏 ⇒ 当无状态
  const cur = (state[k] && typeof state[k] === 'object') ? state[k] : {}
  const writes = Math.max(0, Number(cur.writes) || 0) + 1
  const hintedAt = Number(cur.hintedAt) || 0

  const shouldHint = hintedAt === 0 && writes >= WHOIAM_HINT_AFTER_WRITES_PRE_V1
  const next = { ...state, [k]: { writes, hintedAt: shouldHint ? Date.now() : hintedAt } }
  return { shouldHint, writes, next }
}

/** 一次性提示文案（进 HUD 与下一轮注入，两处同一句，避免两套口径）。 */
export function whoiamHintTextPre(dirLabel) {
  return '此目录未声明身份' + (dirLabel ? '（' + dirLabel + '）' : '') + '，建议添加 whoiam.md'
}

/** 固定文件名（全小写、连写、必带 .md —— 定案 §三）。 */
export const WHOIAM_FILENAME = 'whoiam.md'

/** 一次性提示状态文件名（落在 <memoryRoot>/<wsKey>/ 下，定案 §9.3）。 */
export const WHOIAM_HINT_STATE = 'whoiam-hint-state.json'

/**
 * 扫描入口：把「路径 → 文本」的读取器注入进来，产出 whoiam 条目列表。
 * 不在此处做任何 IO，便于测试与复用（调用方传 readTextSafe / readdir）。
 *
 * @param {object} args { wsRoot, readText, listDir, maxProjects }
 * @returns {Promise<{entries:Array, scanned:number, truncated:boolean}>}
 */
export async function parseWhoiamEntriesPre(args = {}) {
  const wsRoot = String(args.wsRoot || '')
  const readText = args.readText
  const listDir = args.listDir
  if (!wsRoot || typeof readText !== 'function' || typeof listDir !== 'function') {
    return { entries: [], scanned: 0, truncated: false }
  }
  const pathMod = args.path || null
  const join = pathMod ? pathMod.join : null
  if (!join) return { entries: [], scanned: 0, truncated: false }

  const entries = []
  let scanned = 0
  // ① 工作区根
  const rootWho = join(wsRoot, WHOIAM_FILENAME)
  const rootTxt = await readText(rootWho).catch(() => '')
  scanned++
  if (rootTxt) entries.push({ path: rootWho, fm: args.parseFrontmatter ? args.parseFrontmatter(rootTxt) : null })

  // ② 一级项目目录（只到一级，不递归 —— 定案 §八）
  const maxProjects = Math.max(1, Number(args.maxProjects) || 200)
  let names = []
  try { names = await listDir(wsRoot) } catch { names = [] }
  let truncated = false
  const dirs = []
  for (const n of Array.isArray(names) ? names : []) {
    if (n === 'node_modules' || n === '.git' || n === 'handoff' || n === '.dsh' || n === '.dsh-memory') continue
    if (dirs.length >= maxProjects) { truncated = true; break }
    dirs.push(n)
  }
  for (const d of dirs) {
    const f = join(wsRoot, d, WHOIAM_FILENAME)
    const txt = await readText(f).catch(() => '')
    scanned++
    if (txt) entries.push({ path: f, fm: args.parseFrontmatter ? args.parseFrontmatter(txt) : null })
  }
  return { entries, scanned, truncated }
}

/**
 * 渲染身份段（注入用）。纯函数：给定身份对象，产出稳定文本。
 * 纪律：降级必须**显式可见**（定案成功标准第 3 条），不得静默省略。
 */
export function renderWhoiamSegmentPre(ident) {
  if (!ident || typeof ident !== 'object') return ''
  if (ident.source === WHOIAM_SOURCES.DEGRADED) {
    return '[身份] 降级：本工作区无 whoiam.md 声明（source=降级，写入照常成功）'
  }
  if (ident.source === WHOIAM_SOURCES.MISMATCH) return '[身份] mismatch：identity 声明冲突，已拒绝建树'
  const chain = Array.isArray(ident.scopeChain) ? ident.scopeChain.map((n) => n && n.name).filter(Boolean).join(' < ') : ''
  return '[身份] wsKey=' + (ident.wsKey || '-') + ' · project=' + (ident.projectTag || '-') + ' · scope=' + (chain || '-')
}
