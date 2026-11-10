import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** 复现：子项目会话被接续后，新会话是否还知道自己的 projectTag。
 *  只读生产模块，不碰真实 ~/.dsh（全部在临时目录）。
 *  三种情形各跑一次，并**断言现状**（先记录事实，不预设应该怎样）。 */
const CS = await import('../lib/continuation-state.js')
const CI = await import('../lib/continue-identity.js')

const results = []
const rec = (name, got, note) => { results.push({ name, got, note }); console.log('  ' + name + ' => ' + JSON.stringify(got) + (note ? '   // ' + note : '')) }

function mk() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dam-repro-'))
  return { dir, file: path.join(dir, 'auto-continue.json') }
}
const SRC = 'src-session-aaa'
const NEW = 'session-new-bbb'

console.log('=== 情形 1：源会话有 projectTag（正常路径）===')
{
  const { dir, file } = mk()
  const token = await CS.reserveContinuedSource(file, SRC)
  await CS.finishContinuedSource(file, SRC, NEW, token, { projectTag: 'dsh-auto-memory' })
  const s = CS.continuedSourceState(file, SRC)
  rec('done 记录.projectTag', s && s.projectTag, '落盘成功')
  // 新会话侧：pending 表里有没有？
  const pend = path.join(dir, 'continue-identity-pending.json')
  const has = (() => { try { JSON.parse(readFileSync(pend, 'utf8')); return true } catch { return false } })()
  rec('pending 表存在', has, 'finishContinuedSource 是否写 pending')
  rmSync(dir, { recursive: true, force: true })
}

console.log('=== 情形 2：源会话**无** projectTag（你的实测现状）===')
{
  const { dir, file } = mk()
  const token = await CS.reserveContinuedSource(file, SRC)
  await CS.finishContinuedSource(file, SRC, NEW, token, {})   // 不传 projectTag
  const s = CS.continuedSourceState(file, SRC)
  rec('done 记录含 projectTag 字段', s ? Object.prototype.hasOwnProperty.call(s, 'projectTag') : null, '空则完全不写（无痕）')
  rec('done 记录截图', s && { from: s.from, to: s.to, projectTag: s.projectTag }, '与真机 5 条记录同形')
  rmSync(dir, { recursive: true, force: true })
}

console.log('=== 情形 3：pending 表 TTL 过期后，还能否按新会话 id 查到项目 ===')
{
  const { dir } = mk()
  const pend = path.join(dir, CI.CONTINUE_IDENTITY_FILE)
  const now = 1794300000000
  CI.putContinueIdentityPre(pend, { sessionId: NEW, projectTag: 'dsh-auto-memory', sourceSessionId: SRC, contSeq: 1, at: now })
  rec('TTL 内 lookup', (CI.lookupContinueIdentityPre(pend, NEW, now + 1000) || {}).projectTag)
  rec('TTL 外 lookup（+11min）', CI.lookupContinueIdentityPre(pend, NEW, now + 11 * 60 * 1000), 'null ⇒ 上层将回落工作区根')
  rmSync(dir, { recursive: true, force: true })
}

console.log('')
console.log('=== 现状汇总（这是「偏移」的可执行证据）===')
const byName = Object.fromEntries(results.map((r) => [r.name, r.got]))
const noPending = byName['pending 表存在'] === false
const persistedOk = byName['done 记录.projectTag'] === 'dsh-auto-memory'
const ttlGone = byName['TTL 外 lookup（+11min）'] === null
console.log('  · 有 tag ⇒ 落盘到 done 记录：' + persistedOk)
console.log('  · finishContinuedSource 会写 pending 表：' + (noPending ? '否（false）' : '是'))
console.log('  · TTL 过期后查不到：' + ttlGone)
console.log('')
console.log('  结论：接续携带 projectTag 的**唯一**运行期通道是 pending 表（10 分钟 TTL），')
console.log('        而 finishContinuedSource **不写** pending 表；done 记录虽落盘却不被身份层读取。')
console.log('        ⇒ 超过 TTL 或重启后，接续会话的 projectTag 必然为空 ⇒ 静默回落工作区根。')
process.exit(0)