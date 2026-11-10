// smoke-test-continue-identity-pending.mjs —— D1 待续身份桥（模块行为 + 宿主接线 + 负控）
//
// 对应草案 §2（FORK-CONTINUATION-IDENTITY-TITLE-DRAFT）：接续建会话后新会话 agent 在 prompt 之后才出现，
// 首回合注入早于 rt.projectTag 写入 ⇒ 首屏身份会回落工作区根。D1 用 pending 表 + 读侧懒回填修这个时点缺口。
// 纪律：模块断言配真负控（变异必须被检出），接线断言配「变异副本必须判红」。
import { mkdtempSync, rmSync, readFileSync, writeFileSync, unlinkSync, utimesSync, mkdirSync } from 'node:fs'
import crypto from 'node:crypto'
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


  console.log('\n[7] ★归属偏移复现：接续完成后项目归属的可达性（现状 = 有一处静默丢失）')
  {
    const CS = await import('../../lib/continuation-state.js')
    const sub = path.join(dir, 'offset')
    mkdirSync(sub, { recursive: true })
    const cfile = path.join(sub, 'auto-continue.json')
    const SRC2 = 'src-offset-aaa'
    const NEW2 = 'session-offset-bbb'

    // ① 源会话**有** tag ⇒ 是否落进 done 记录
    let token = await CS.reserveContinuedSource(cfile, SRC2)
    await CS.finishContinuedSource(cfile, SRC2, NEW2, token, { projectTag: 'dsh-auto-memory' })
    const withTag = CS.continuedSourceState(cfile, SRC2)
    ok(withTag && withTag.projectTag === 'dsh-auto-memory', '[7] 有 tag ⇒ done 记录落盘 projectTag')
    ok(withTag && withTag.to === NEW2, '[7] done 记录带 to（新会话 id）⇒ **理论上可反查**')

    // ② 现状：done 记录**不被**身份层读取（唯一运行期通道是 pending 表，10min TTL）
    const pendFile = M.continueIdentityFilePre(sub)
    // finishContinuedSource 不负责写 pending 表 —— 断言它确实没写
    let pendExists = true
    try { readFileSync(pendFile, 'utf8') } catch (_) { pendExists = false }
    ok(pendExists === false, '[7] ★finishContinuedSource 不写 pending 表（运行期唯一通道不在此产生）')
    // 而 done 记录里明明有 {to, projectTag} ⇒ 存在一条**已落盘但无人读**的恢复路径
    ok(!!(withTag && withTag.to && withTag.projectTag), '[7] ★done 记录已含恢复所需全部信息（to + projectTag），当前无消费点')

    // ③ ★B 步修复 2 后：源会话**无** tag ⇒ 记录必须留痕 projectTagMissing（此前是完全无痕）
    rmSync(sub, { recursive: true, force: true }); mkdirSync(sub, { recursive: true })
    token = await CS.reserveContinuedSource(cfile, SRC2)
    await CS.finishContinuedSource(cfile, SRC2, NEW2, token, {})
    const noTag = CS.continuedSourceState(cfile, SRC2)
    const hasTag = !!(noTag && Object.prototype.hasOwnProperty.call(noTag, 'projectTag'))
    const hasGapMark = !!(noTag && Object.prototype.hasOwnProperty.call(noTag, 'projectTagMissing'))
    ok(hasTag === false, '[7] 无 tag ⇒ 记录不得出现 projectTag（防伪造归属） [hasTag=' + hasTag + ']')
    ok(hasGapMark === true,
      '[7] ★无 tag ⇒ 记录必须留痕 projectTagMissing（B 步修复 2：可事后诊断） [hasGapMark=' + hasGapMark + ']')

    // ④ TTL 过期后 pending 查不到 ⇒ 上层必然回落工作区根
    rmSync(sub, { recursive: true, force: true }); mkdirSync(sub, { recursive: true })
    // ⚠ 时间基准必须以「当下」为锚，不能用写死的过去时刻：
    //   `putContinueIdentityPre` → `saveContinueIdentityPre` → `pruneContinueIdentityPre(state, Date.now())`
    //   ⇒ 若 `at` 是过去的固定值（如 1794300000000），落盘时就被**按 now 剪掉**了，
    //     随后 lookup 必然 null ⇒ 本条断言会随「当前真实时间」漂移（本仓已实测：同一份代码 47/0 与 46/1 都出现过）。
    //   修法：base = Date.now()，只把「查询时刻」推后到边界外，被测语义（TTL 判定）不变。
    const base4 = Date.now()
    M.putContinueIdentityPre(pendFile, { sessionId: NEW2, projectTag: 'dsh-auto-memory', sourceSessionId: SRC2, contSeq: 1, at: base4 })
    ok((M.lookupContinueIdentityPre(pendFile, NEW2, base4 + 1000) || {}).projectTag === 'dsh-auto-memory', '[7] TTL 内可查')
    ok(M.lookupContinueIdentityPre(pendFile, NEW2, base4 + 11 * 60 * 1000) === null, '[7] ★TTL 外查不到 ⇒ 身份将回落工作区根（偏移成因）')
  }

  console.log('\n[8] ★B 步修复 1：从 done 记录反查 projectTag（跨 TTL/重启的唯一恢复路径）')
  {
    const CS2 = await import('../../lib/continuation-state.js')
    const CI2 = M
    const sub8 = path.join(dir, 'recover')
    mkdirSync(sub8, { recursive: true })
    const cfile8 = path.join(sub8, 'auto-continue.json')
    const uniq = String(Date.now()) + '-' + String(pass + fail)

    // 链：src(有tag) -> mid(无tag) -> new(无tag)  ⇒ new 必须能回溯 2 跳拿到 tag
    let t8 = await CS2.reserveContinuedSource(cfile8, 'src-r-' + uniq)
    await CS2.finishContinuedSource(cfile8, 'src-r-' + uniq, 'session-mid-r-' + uniq, t8, { projectTag: 'dsh-auto-memory' })
    t8 = await CS2.reserveContinuedSource(cfile8, 'session-mid-r-' + uniq)
    await CS2.finishContinuedSource(cfile8, 'session-mid-r-' + uniq, 'session-new-r-' + uniq, t8, {})

    const direct = CI2.recoverProjectTagForSessionPre(cfile8, 'session-mid-r-' + uniq)
    ok(direct && direct.projectTag === 'dsh-auto-memory', '[8] 直接命中（记录自带 tag）', direct)
    const hop2 = CI2.recoverProjectTagForSessionPre(cfile8, 'session-new-r-' + uniq)
    ok(hop2 && hop2.projectTag === 'dsh-auto-memory' && hop2.hops === 2,
      '[8] ★连续接续沿 from 回溯 2 跳命中', hop2)
    ok(CI2.recoverProjectTagForSessionPre(cfile8, 'session-nobody') === null, '[8] 未知 sid ⇒ null（防串线）')
    ok(CI2.recoverProjectTagForSessionPre(path.join(sub8, 'no-such-dir', 'x.json'), 'session-new-r-' + uniq) === null,
      '[8] 目录不存在 ⇒ null 且不抛（fail-soft）')

    // 接线判据：index.js 必须在 pending 未命中时走这条恢复路径
    const IX2 = readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8')
    ok(/import \{[^}]*recoverProjectTagForSessionPre/.test(IX2), '[8] index.js 已 import 反查函数')
    const seg = IX2.slice(IX2.indexOf('pendingIdentityForSession(sidPend)'), IX2.indexOf('return resolveWhoiamIdentityPre'))
    ok(seg.includes('recoverProjectTagForSessionPre'), '[8] ★pending 未命中分支里调用了反查（接线到位）')
    ok(seg.includes('} else {'), '[8] 反查位于 else 分支（pending 命中时不跑，省 IO）')
    // 顺序/短路：反查必须在 pending 之后（否则 pending 的 TTL 语义被绕过）
    ok(seg.indexOf('pendingIdentityForSession(sidPend)') < seg.indexOf('recoverProjectTagForSessionPre'),
      '[8] ★优先级：pending 先于 done 记录反查（切片内相对位置）')

    // ★2026-11-10 真机验证抓到的缺陷：同一 `to` 可能有多条记录（重试/重复接续）。
    //   旧实现 `byTarget.set(rec.to, rec)` 在 picked 按 mtime 从新到旧排序后，会让**更旧**的覆盖**更新**的；
    //   若较新那条带 tag、较旧那条无 tag ⇒ 命中 null，归属静默丢失。判据：必须取**最新**那条。
    {
      const sub9 = path.join(dir, 'dup-to')
      mkdirSync(sub9, { recursive: true })
      const cf9 = path.join(sub9, 'auto-continue.json')
      const dd9 = path.join(sub9, 'auto-continue-done.d')
      mkdirSync(dd9, { recursive: true })
      const sha9 = (s) => crypto.createHash('sha256').update(s).digest('hex')
      const T9 = 'session-dup-target-9'
      // A：带 tag（较新）；B：无 tag（较旧）
      const pA = path.join(dd9, sha9('srcA9') + '.json')
      const pB = path.join(dd9, sha9('srcB9') + '.json')
      writeFileSync(pA, JSON.stringify({ from: 'srcA9', to: T9, projectTag: 'proj-newest', at: 1794300000000 }))
      writeFileSync(pB, JSON.stringify({ from: 'srcB9', to: T9, projectTagMissing: true, at: 1794300000001 }))
      const nowSec = Date.now() / 1000
      utimesSync(pA, nowSec, nowSec)
      utimesSync(pB, nowSec - 100, nowSec - 100)
      const dup = CI2.recoverProjectTagForSessionPre(cf9, T9)
      ok(dup && dup.projectTag === 'proj-newest',
        '[8] ★同一 to 多条记录 ⇒ 必须取最新那条（旧实现会被更旧的无 tag 记录覆盖成 null）', dup)
    }
  }

console.log('\n[continue-identity-pending] PASS ' + pass + ' / FAIL ' + fail)
if (fail) process.exit(1)