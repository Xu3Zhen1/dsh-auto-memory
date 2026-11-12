
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tier0usage-'))
const realHome = process.env.HOME
const realUP = process.env.USERPROFILE
process.env.HOME = tmp
process.env.USERPROFILE = tmp

const m = await import('file:///' + path.join(ROOT, 'lib', 'tier0-usage.js').replace(/\\/g, '/'))

let pass = 0, fail = 0
const t = (n, c, x) => { if (c) { pass++; console.log('  ok - ' + n) } else { fail++; console.log('  FAIL - ' + n + (x === undefined ? '' : '  <<< ' + String(x).slice(0, 200))) } }
const usageFile = path.join(tmp, '.dsh', 'memory', 'tier0-usage.json')
const db = () => JSON.parse(fs.readFileSync(usageFile, 'utf8'))

console.log('[1] 键生成')
t('mem_ 锚点 => id: 键', m.tier0KeyPre({ id: 'mem_' + 'a'.repeat(32) }) === 'id:mem_' + 'a'.repeat(32))
t('无锚点 => layer|标题', m.tier0KeyPre({ layer: 'project', title: 'X' }) === 'project|x')
t('空白折叠成单空格', m.tier0KeyPre({ layer: 'log', title: '  A   B  ' }) === 'log|a b')
t('无 title 退 oneLine', m.tier0KeyPre({ layer: 'log', oneLine: 'OnlyLine' }) === 'log|onlyline')
t('全空 => untitled', m.tier0KeyPre({ layer: 'log' }) === 'log|untitled')

console.log('[2] markSeen 写盘与累加')
m.tier0MarkSeenPre([{ layer: 'project', title: 'Alpha Beta' }])
t('文件已创建', fs.existsSync(usageFile))
t('seen=1', db()['project|alpha beta'].seen === 1)
m.tier0MarkSeenPre([{ layer: 'project', title: 'Alpha Beta' }])
t('再次曝光 seen=2（累加非覆盖）', db()['project|alpha beta'].seen === 2)
t('last 是数字时间戳', typeof db()['project|alpha beta'].last === 'number' && db()['project|alpha beta'].last > 0)

console.log('[3] 轮换位')
// ★构造「排除逻辑失效就会被抓到」的场景：让已上桌条目 seen 也最少（0），
//   且其键在字典序上小于其它 seen=0 候选 ⇒ 若不排除，排序会选它。
//   （第一版把已上桌条目先 markSeen 两次，seen=2 排在 0 之后 ⇒ 排除失效也选不到，
//    四变异负控实测 exit=0 抓到该缺口。）
fs.rmSync(usageFile, { force: true })
m.tier0MarkSeenPre([{ layer: 'log', title: 'Seen Once Long Title' }])
const catalog = {
  items: [{ layer: 'project', title: 'Alpha Beta' }],
  candidatesAll: [
    { layer: 'project', title: 'Alpha Beta' },
    { layer: 'log', title: 'Seen Once Long Title' },
    { layer: 'user', title: 'Never Seen Long Title' },
  ],
}
t('★场景自证：不排除时排序第一名应为已上桌条目', (() => {
  const d = db()
  const all = catalog.candidatesAll.map((it) => ({ k: m.tier0KeyPre(it), seen: (d[m.tier0KeyPre(it)] || {}).seen || 0 }))
  const sorted = all.slice().sort((a, b) => (a.seen - b.seen) || String(a.k).localeCompare(String(b.k)))
  return sorted[0].k === 'project|alpha beta'
})(), '若此条为 false，说明场景不具鉴别力')

const rot = m.tier0RotationLinesPre(catalog, 1)
t('返回 1 条', rot.length === 1)
t('★选中 seen=0 的长尾条目而非已上桌条目', rot[0].startsWith('Never Seen Long Title'), rot[0])
t('★已上桌条目被排除（排除失效则此处选中 Alpha Beta 必红）', !rot.some((x) => x.includes('Alpha Beta')))
t('★轮换选中也计曝光（否则永远霸占）', db()['user|never seen long title'].seen === 1)

console.log('[4] markUsed：口径保守 + 有鉴别力')
const LT = 'Current Status And Progress'
m.tier0MarkSeenPre([{ layer: 'project', title: LT }])
const used = () => (db()['project|' + LT.toLowerCase()] || {}).used || 0
m.tier0MarkUsedPre({ query: 'st' })
t('短 query（<4 字符）不计', used() === 0)
m.tier0MarkUsedPre({ query: 'Current Status And' })
t('★命中计数 used=1', used() === 1)
const b4 = used()
m.tier0MarkUsedPre({ query: '完全无关的另一段较长文本内容' })
t('★无关 query 不误计（反向断言）', used() === b4, used())
m.tier0MarkUsedPre({ query: 'Current Status And' })
t('重复命中累加 used=2', used() === 2)
const mid = 'mem_' + 'c'.repeat(32)
m.tier0MarkUsedPre({ expand: mid })
t('expand 精确通道 used=1', db()['id:' + mid].used === 1)
m.tier0MarkUsedPre({ query: 'Current Status And' })
t('id 键不被文本通道污染', db()['id:' + mid].used === 1)

console.log('[5] 容错（旁路统计不得影响注入）')
fs.writeFileSync(usageFile, '{bad json')
let threw = false
try { m.tier0MarkSeenPre([{ layer: 'log', title: 'X' }]) } catch (e) { threw = true }
t('★损坏文件不抛', !threw)
threw = false
try { m.tier0MarkSeenPre([]); m.tier0MarkUsedPre({}); m.tier0RotationLinesPre(null, 2) } catch (e) { threw = true }
t('空/非法输入不抛', !threw)
t('rot(null) 返回空数组', JSON.stringify(m.tier0RotationLinesPre(null, 2)) === '[]')

console.log('[6] 接线（源码层，防「模块写好但没接」）')
const TI = fs.readFileSync(path.join(ROOT, 'lib', 'tier-layer-inject.js'), 'utf8')
t('★markSeen 已接进注入路径', TI.includes('tier0MarkSeenPre(catalog.items)'))
t('★轮换位已接进注入文本', TI.includes('tier0RotationLinesPre(catalog, 2)'))
t('★轮换行真的 push 进 headParts', TI.includes('headParts.push(TIER_MARK_PRE_V1.rotate'))
t('rotate 标记已定义', TI.includes("rotate: '[轮换]'"))
const CAT = fs.readFileSync(path.join(ROOT, 'lib', 'tier0-catalog.js'), 'utf8')
t('★catalog 产出 candidatesAll', CAT.includes('candidatesAll: candidates.map(toPublicItemPre)'))

process.env.HOME = realHome
process.env.USERPROFILE = realUP
try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}

console.log('')
console.log('[tier0-usage] PASS ' + pass + ' / FAIL ' + fail)
process.exit(fail ? 1 : 0)
