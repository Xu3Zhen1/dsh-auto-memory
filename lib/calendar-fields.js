export function calendarFieldEncodePre(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
}

export function calendarFieldDecodePre(value) {
  return String(value || '').replace(/\\([\\|])/g, '$1')
}

export function calendarQuadrantPre(value) {
  return value === '不重要紧急' ? '紧急不重要' : String(value || '未分类').trim()
}

/* ══════════════════════════════════════════════════════════════════════════════
 * CALENDAR.md 的**解析与渲染唯一实现处**
 *
 * ★2026-11-12（切片 dedupe-calendar-format）：纯提取，**零行为变更**。
 *   提取前同一套格式逻辑有两份拷贝：
 *     · lib/index.js 的 MemoryEngine.parseCalendar() / renderCalendar()（类方法）
 *     · lib/migrate-pack.js 的 calendarMergePre() 内部两个局部闭包
 *   两处注释互相点名（migrate-pack 侧原文：「改为与 index.renderCalendar 同款缩进续行」），
 *   DRY-C1 报 9 处跨文件重复块。
 *
 * ★为什么放在**本文件**而不新建模块：
 *   lib/migrate-pack.js 有一条引擎红线守卫（smoke-test-migrate-pack.mjs 的 S10 段）：
 *   引擎必须「零 IO、可单测」，且其 import 面被约束为「node: 内置 + 本地零 IO 叶子模块」。
 *   本文件正好是那个叶子模块（零 import、零 IO）。扩展它既满足守卫意图，也不新增模块。
 *
 * ⚠️ 格式契约（改这里 = 改 CALENDAR.md 的磁盘格式，须格外小心）：
 *   ```
 *   # 日历与日程 (CALENDAR)
 *   ## YYYY-MM-DD
 *   - [x| ] HH:MM | 象限 | 标题 | 备注
 *       <缩进续行：多行备注的第 2 行起>
 *   ```
 *   行尾可带两种注释，**都必须先剥掉才能解析正文**（顺序不可颠倒）：
 *   · `<!-- calendar-fields: escaped-v1 -->` —— 标题/备注经 calendarFieldEncodePre 转义
 *   · `<!-- calendar-id: cal_<32hex> -->`    —— 条目稳定 id
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * 解析 CALENDAR.md 文本为条目数组。
 *
 * 续行语义（★最容易改错的地方）：
 *   多行备注的第 2 行起以**缩进**落盘。只有**紧跟在条目行之后**的缩进行才算续行 ——
 *   空行、日期标题、任何其它行都会**终止**续行段。缩进判定**先于**条目正则，
 *   因此备注里若自带 `- [ ] ...` 这类行，会被按续行收走，不会被误当成新条目。
 *
 * @param {string} text CALENDAR.md 原文
 * @returns {Array<{date:string, done:boolean, time:string, quadrant:string, title:string, note:string, id?:string}>}
 */
export function calendarParsePre(text) {
  const out = []
  const extras = []   // 与 out 同下标：该条目的续行原文（trim 后）
  let curDate = ''
  let cur = -1        // 正在收集续行的条目下标（-1 = 无）
  for (const raw of String(text || '').split('\n')) {
    let line = raw.trim()
    const identity = /\s*<!-- calendar-id: (cal_[0-9a-f]{32}) -->$/.exec(line)
    if (identity) line = line.slice(0, identity.index).trimEnd()
    const encodedFields = /\s*<!-- calendar-fields: escaped-v1 -->$/.exec(line)
    if (encodedFields) line = line.slice(0, encodedFields.index).trimEnd()
    // ① 空行终止续行段（渲染侧不产空白续行，这里对称收紧）
    if (!line) { cur = -1; continue }
    // ② 缩进续行：只认「紧跟条目之后」的那一段
    if (cur >= 0 && /^[ \t]/.test(raw)) { extras[cur].push(line); continue }
    // ③ 日期标题
    const dm = line.match(/^## (\d{4}-\d{2}-\d{2})/)
    if (dm) { curDate = dm[1]; cur = -1; continue }
    // ④ - [x] HH:MM | 象限 | 标题 | (备注)
    const m = line.match(/^- \[([ xX])\] (\d{1,2}:\d{2}|--:--) \| ([^|]+?) \| (.+?)(?: \| (.*))?$/)
    if (m) {
      out.push({
        date: curDate, done: m[1] !== ' ', time: m[2], quadrant: calendarQuadrantPre(m[3]),
        title: encodedFields ? calendarFieldDecodePre(m[4].trim()) : m[4].trim(),
        note: encodedFields ? calendarFieldDecodePre((m[5] || '').trim()) : (m[5] || '').trim(),
      })
      if (identity) out[out.length - 1].id = identity[1]
      extras.push([])
      cur = out.length - 1
      continue
    }
    cur = -1   // ⑤ 其它行（注释、自由文本）同样终止续行段
  }
  for (let i = 0; i < out.length; i++) {
    if (!extras[i].length) continue    // 无续行 ⇒ 逐字段与改动前完全一致
    out[i].note = (out[i].note ? out[i].note + '\n' : '') + extras[i].join('\n')
  }
  return out
}

/**
 * 把条目数组序列化为 CALENDAR.md 文本。
 *
 * 多行备注按**缩进续行**落盘（人看着是真换行，解析侧同款还原）。
 * 单行备注走原样拼接 ⇒ 与抽取前逐字节一致（` | ` 分隔与「地点:/提醒:」前缀拼接规则未变）。
 *
 * @param {Array} entries 条目数组
 * @returns {string} CALENDAR.md 文本
 */
export function calendarRenderPre(entries) {
  const byDate = {}
  for (const en of entries) { (byDate[en.date] ||= []).push(en) }
  const dates = Object.keys(byDate).sort()
  const lines = ['# 日历与日程 (CALENDAR)', '', '> 由 dsh-auto-memory 维护;AI 可从对话中提取 deadline/约定写入,用户也可在 GUI 操作。', '']
  for (const date of dates) {
    lines.push('## ' + date)
    for (const en of byDate[date].sort((a, b) => (a.time || '').localeCompare(b.time || ''))) {
      const mark = en.done ? 'x' : ' '
      // ★#254 B'：多行备注按**缩进续行**落盘（人看着是真换行，解析侧同款还原）。
      //   单行备注走原样拼接 ⇒ 与改动前逐字节一致（` | ` 分隔与「地点:/提醒:」前缀拼接规则未变）。
      const parts = en.note ? String(en.note).split('\n') : []
      const note = parts.length ? ' | ' + calendarFieldEncodePre(parts[0]) : ''
      lines.push('- [' + mark + '] ' + (en.time || '--:--') + ' | ' + (en.quadrant || '未分类') + ' | ' + calendarFieldEncodePre(en.title) + note + ((calendarFieldEncodePre(en.title) !== en.title || (parts.length && calendarFieldEncodePre(parts[0]) !== parts[0])) ? ' <!-- calendar-fields: escaped-v1 -->' : '') + (en.id ? ' <!-- calendar-id: ' + en.id + ' -->' : ''))
      for (let i = 1; i < parts.length; i++) lines.push('    ' + parts[i])
    }
    lines.push('')
  }
  return lines.join('\n')
}
