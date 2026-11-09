// smoke-test-continue-identity-pending.mjs —— D1 待续身份桥（模块行为 + 宿主接线 + 负控）
//
// 对应草案 §2（FORK-CONTINUATION-IDENTITY-TITLE-DRAFT）：接续建会话后新会话 agent 在 prompt 之后才出现，
// 首回合注入早于 rt.projectTag 写入 ⇒ 首屏身份会回落工作区根。D1 用 pending 表 + 读侧懒回填修这个时点缺口。
// 纪律：模块断言配真负控（变异必须被检出），接线断言配「变异副本必须判红」。
import { mkdtempSync, rmSync, readFileSync, writeFileSync, unlinkSync, utimesSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const M = await import(pathToFileURL(path.join(ROOT, 'lib', 'continue-identity.js')).href)
const IX = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8').replace(/\r\n/g, '\n')

let pass = 0, fail = 0
const ok = (c, n) => { if (c) { pass++; console.log('  ok -', n) } else { fail++; console.log('  FAIL -', n) } }
const eq = (a, b, n) => ok(Object.is(a, b), n + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']')

const dir = mkdtempSync(path.join(os.tmpdir(), 'dam-ci-'))
const file = path.join(dir, M.CONTINUE_IDENTITY_FILE)
// ★原始写盘必须同时 bump mtime：continuation-state 的读缓存按 (mtime,size) 命中，同刻同长改写会被
//   旧缓存顶掉（本仓 .pyc 同族坑）。测试用 utimes 制造唯一 mtime，保证读到的是刚写的字节。
const writeRaw = (v) => { writeFileSync(file, typeof v === 'string' ? v : JSON.stringify(v), 'utf8'); const t = new Date(Date.now() + 60000 + Math.floor(Math.random() * 1000) + 1); utimesSync(file, t, t) }

try {
  console.log('\n[1] put / lookup / remove 基本语义')
  {
    const rec = M.putContinueIdentityPre(file, { sessionId: 'session-new-1', projectTag: 'parsing', sourceSessionId: 'session-old-1', contSeq: 15 })
    eq(rec.projectTag, 'parsing', 'put 返回清洗后的记录')
    const hit = M.lookupContinueIdentityPre(file, 'session-new-1')
    eq(hit && hit.projectTag, 'parsing', 'lookup 命中 projectTag')
    eq(hit && hit.sourceSessionId, 'session-old-1', 'lookup 保留源会话')
    eq(M.lookupContinueIdentityPre(file, 'session-unknown'), null, '未知 session ⇒ null（不是抛错）')
    eq(M.removeContinueIdentityPre(file, 'session-new-1'), true, 'remove 首次 true')
    eq(M.removeContinueIdentityPre(file, 'session-new-1'), false, 'remove 二次 false（幂等）')
    eq(M.lookupContinueIdentityPre(file, 'session-new-1'), null, 'remove 后 lookup 为空')
  }

  console.log('\n[2] TTL 边界（10 分钟）与过期清除')
  {
    const now = Date.now()
    writeRaw({ version: 1, bySession: { 'session-fresh': { projectTag: 'pkg-a', at: now - 1000 } } })
    eq(M.lookupContinueIdentityPre(file, 'session-fresh', now) !== null, true, 'TTL 内命中')
    writeRaw({ version: 1, bySession: { 'session-stale': { projectTag: 'pkg-a', at: now - M.CONTINUE_IDENTITY_TTL_MS - 1 } } })
    eq(M.lookupContinueIdentityPre(file, 'session-stale', now), null, 'TTL 外 ⇒ null')
    const after = JSON.parse(readFileSync(file, 'utf8'))
    eq(after.bySession['session-stale'] === undefined, true, '过期项在 lookup 时被从盘上清除')
    // 负控：把 TTL 判据写死成「永远命中」的变异必须被边界用例识破
    writeRaw({ version: 1, bySession: { 'session-edge': { projectTag: 'pkg-a', at: now - M.CONTINUE_IDENTITY_TTL_MS + 1 } } })
    eq(M.lookupContinueIdentityPre(file, 'session-edge', now) !== null, true, 'TTL 边界内仍命中（差 1ms）')
    // 负控：若实现把 TTL 判据写成 >= 反向（永远过期），边界用例必须红 —— 由上面两条互补断言共同保证。
  }

  console.log('\n[3] cleanup 只清过期、不误杀新鲜项')
  {
    const now = Date.now()
    writeRaw({ version: 1, bySession: {
      'a-expired': { projectTag: 'x', at: now - M.CONTINUE_IDENTITY_TTL_MS - 5 },
      'b-expired': { projectTag: 'y', at: now - M.CONTINUE_IDENTITY_TTL_MS - 6 },
      'c-fresh': { projectTag: 'z', at: now - 5 },
    } })
    eq(M.cleanupContinueIdentityPre(file, now), 2, 'cleanup 返回 2')
    const after = JSON.parse(readFileSync(file, 'utf8'))
    eq(Object.keys(after.bySession).join(','), 'c-fresh', '只剩新鲜项')
  }

  console.log('\n[4] 损坏/缺失文件一律 fail-soft')
  {
    writeRaw('{not json')
    eq(Object.keys(M.loadContinueIdentityPre(file).bySession).length, 0, '损坏 JSON ⇒ 空表')
    eq(M.lookupContinueIdentityPre(file, 'x'), null, '损坏文件 lookup ⇒ null（不抛）')
    writeRaw({ version: 2, bySession: {} })
    eq(Object.keys(M.loadContinueIdentityPre(file).bySession).length, 0, '非法 version ⇒ 空表')
    unlinkSync(file)
    eq(M.cleanupContinueIdentityPre(file), 0, '文件缺失 cleanup ⇒ 0（不抛）')
    eq(M.lookupContinueIdentityPre(file, 'x'), null, '文件缺失 lookup ⇒ null')
  }

  console.log('\n[5] 宿主接线：pending 必须先于 prompt、读侧唯一回填、三路清理')
  {
    const iPending = IX.indexOf('this.rememberContinueIdentity(newId')
    const iPrompt = IX.indexOf('await sc.prompt({ sessionId: newId')
    ok(iPending > 0 && iPrompt > iPending, 'pending 写入在 sc.prompt 之前（时点缺口的核心）')
    eq(IX.split('this.rememberContinueIdentity(newId').length - 1, 1, 'pending 写入恰 1 处')
    eq(IX.split('this.pendingIdentityForSession(').length - 1, 1, '读侧回填调用恰 1 处')
    eq(IX.split('pendingIdentityForSession(sid) {').length - 1, 1, '回填方法定义恰 1 处（读侧唯一入口）')
    ok(IX.includes('if (pendingSuccessor && !deliveryAttempted) this.forgetContinueIdentity(pendingSuccessor)'), 'prompt 前失败 ⇒ 清 pending')
    ok(IX.includes('if (projectWritten) {'), 'rt 写成功分支存在')
    ok(IX.indexOf('this.forgetContinueIdentity(newId)', IX.indexOf('if (projectWritten) {')) > 0, 'rt 写成功后清 pending')
    // whoiamIdentityFor 体内的回填调用（限定方法体切片，防「别处同名」假绿）
    const s = IX.indexOf('whoiamIdentityFor(agent)')
    const e = IX.indexOf('一次性提示：某目录高频写入且无 whoiam.md')
    const body = IX.slice(s, e)
    ok(body.includes('this.pendingIdentityForSession('), 'whoiamIdentityFor 体内真调用回填（切片限定）')
  }

  console.log('\n[6] 负控：接线判据在变异副本上必须变红（判据非恒真）')
  {
    const detectOrder = (s) => { const a = s.indexOf('this.rememberContinueIdentity(newId'), b = s.indexOf('await sc.prompt({ sessionId: newId'); return a > 0 && b > a }
    ok(detectOrder(IX), '原文件：顺序判据绿')
    ok(!detectOrder(IX.replace('this.rememberContinueIdentity(newId, srcProjectTag, oldSid, d.contSeq)', '/* removed */')), '变异：删掉 pending 写入 ⇒ 顺序判据红')
    const moved = IX.replace('this.rememberContinueIdentity(newId, srcProjectTag, oldSid, d.contSeq)', '/* moved */').replace('await sc.prompt({ sessionId: newId', 'await sc.prompt({ sessionId: newId })\n        this.rememberContinueIdentity(newId, srcProjectTag, oldSid, d.contSeq)\n        await sc.prompt({ sessionId: newId')
    ok(!detectOrder(moved), '变异：把写入挪到 prompt 之后 ⇒ 顺序判据红')
    const detectBackfill = (s) => { const a = s.indexOf('whoiamIdentityFor(agent)'), b = s.indexOf('一次性提示：某目录高频写入且无 whoiam.md'); return a >= 0 && b > a && s.slice(a, b).includes('this.pendingIdentityForSession(') }
    ok(detectBackfill(IX), '原文件：回填判据绿')
    ok(!detectBackfill(IX.replace('this.pendingIdentityForSession(sidPend)', '/* gone */')), '变异：删掉读侧回填 ⇒ 判据红')
  }
} finally {
  try { rmSync(dir, { recursive: true, force: true }) } catch (_) {}
}

console.log('\n[continue-identity-pending] PASS ' + pass + ' / FAIL ' + fail)
if (fail) process.exit(1)
