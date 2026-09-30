import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const source = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const classic = source.replace(/    \/\/ ITER5-GENERATED:BEGIN[\s\S]*?    \/\/ ITER5-GENERATED:END\n/, '')
  .replace("+ DAM_SKIN_V4_CSS + '\\n' + ITER5_CSS + '\\n/* dam-skin:end (v4) */'", "+ DAM_SKIN_V4_CSS + '\\n/* dam-skin:end (v4) */'")
  .replace('h(Iter5Page, { nonce: nonce, onExit:', 'h(DamSkinV4Page, { nonce: nonce, onExit:')
  .replace("try { ensureStyle(); if (damSkinActive() === 'v4') damSkinEnsureCss() } catch", 'try { ensureStyle() } catch')
  .replace('function DialogHost() {\n      var tourDeep = useDeepTheme()\n      var tickPair = useTick()', 'function DialogHost() {\n      var tickPair = useTick()')
  .replace("tourStep === 0 ? h(SkinHero, { slot: 'hero.welcome', deep: tourDeep })", "tourStep === 0 ? h(SkinHero, { slot: 'hero.welcome', deep: useDeepTheme() })")
// ★2026-09-30：本快照基线演进（PR #150/#155 合并到 v3.2.5 之后）——生成块**之外**的 client.js
//   现包含 3.2.5 的合法修复（接续身份钉死 clickedSid、StatsTab/Iter5Stats 解包 data.stats、
//   时间戳标题等），故快照哈希随之变化；守卫语义不变：
//   生成块之外的任何**非意外**改动仍会被本锁抓住。
assert.equal(createHash('sha256').update(classic).digest('hex'), '64aaba6a0d4736e542d21f1b4801f0efe367d3ad52e2944d94f1f65ed516f616', 'Reviewed native-reference entry baseline stays unchanged outside generated skin (nine-step navigation and contextual panel)')
console.log('PASS reviewed shared-entry source baseline preserved')

const css = readFileSync(new URL('../../skins/iter5/skin.css', import.meta.url), 'utf8')
for (const line of css.split('\n')) {
  const consumers = line.replace(/--i5-[\w-]+:[^;}]+/g, '')
  assert(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(consumers), 'Colors must use named tokens: ' + line)
}
assert(!source.includes('BData.'), 'No demo data shipped')
const embeddedCss=JSON.parse(source.match(/var ITER5_CSS = (.+)\n/)[1])
const sharedTokens=embeddedCss.match(/\[data-iter5\],\[data-dam-theme\]\{([^}]+)\}/)[1]
assert(sharedTokens.split(';').filter(Boolean).every(declaration=>declaration.startsWith('--')),'Overlay token sharing must not include page flex/height/position styles')
console.log('PASS scoped token colors and no demo data')

// Execute the shipped factory with a small hook harness. No network, real memory,
// browser globals, or production exports are modified by this test.
let states = [], effects = [], cursor = 0, exposed, accept = true, confirmCount = 0
let requests = [], failSave = false
let config = { semanticEngineMode: 'auto', associativeMemoryEnabled: true, memoryAnchorEnabled: false, jsDecideCooldownRounds: 1, injectEnabled: true, locale: 'zh', externalSources: {} }
const React = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
  cloneElement: (node, props) => ({ ...node, props: { ...node.props, ...props } }),
  useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
  useRef(initial) { const [ref] = React.useState(() => ({ current: initial })); return ref },
  useReducer(fn, initial) { const [state, set] = React.useState(initial); return [state, action => set(old => fn(old, action))] },
  useEffect(fn, deps) { const i = cursor++; const old = states[i]; if (!old || deps.some((d, n) => !Object.is(d, old[n]))) { states[i] = deps; effects.push(fn) } },
}
const localStorage = { getItem: () => null, setItem() {}, removeItem() {}, length: 0 }
const document = { documentElement: { getAttribute: () => '', style: { setProperty() {} }, classList: { contains: () => false } }, querySelector: () => null, getElementById: () => null }
const window = { localStorage, addEventListener() {}, removeEventListener() {}, confirm() { confirmCount++; return accept }, __ModuleLoader__: { load(def) { exposed = def.factory(name => { if (name === 'react') return React; throw Error('Test module unavailable: ' + name) }) } } }
const context = vm.createContext({ window, document, localStorage, console: { log() {}, warn() {}, info() {}, error() {} }, navigator: { language: 'zh-CN' }, URL, URLSearchParams, requestAnimationFrame: fn=>fn(), setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, fetch: () => { throw Error('Unexpected raw fetch') } })
vm.runInContext(source.replace('    return module.exports', `    exports._i5test = { Iter5Notice: Iter5Notice, Iter5Summary: Iter5Summary, Iter5AutoContinue: Iter5AutoContinue, Iter5Storage: Iter5Storage, Iter5Migration: Iter5Migration, Iter5DeleteConfirmation: Iter5DeleteConfirmation, iter5WorkspaceLayout: iter5WorkspaceLayout, iter5MapLabel: iter5MapLabel, Iter5WorkspaceGraph: Iter5WorkspaceGraph, iter5SkillContent: iter5SkillContent, Iter5SkillBrowser: Iter5SkillBrowser, iter5SearchEntries: iter5SearchEntries, Iter5Note: Iter5Note, Iter5Search: Iter5Search, useIter5Data: useIter5Data, Iter5Home: Iter5Home, Iter5Settings: Iter5Settings, Iter5Tabs: Iter5Tabs, iter5MemoryRows: iter5MemoryRows, iter5MemorySnapshot: iter5MemorySnapshot, iter5LedgerTitle: iter5LedgerTitle, DialogHost: DialogHost, setDialog: function (d) { dialogState = d }, t: t,
      transport: function (get, post) { apiGet = get; apiPost = post }, identity: function (value) { iter5Identity = function () { return value } } }
    return module.exports`), context, { filename: fileURLToPath(new URL('../../lib/client.js', import.meta.url)) })
const test = exposed._i5test
// Execute the host theme reader against both current DSH and older host markers.
const themeReader = vm.runInContext('(' + source.slice(source.indexOf('    function readHostDeep()'), source.indexOf('    function useDeepTheme()')) + ')', context)
assert.equal(themeReader(), false)
document.body = { hasAttribute: name => name === 'data-ds-dark-theme' }
assert.equal(themeReader(), true, 'Current host body theme marker is recognized')
document.body = { hasAttribute: () => false }
document.documentElement.style.colorScheme = 'dark'
assert.equal(themeReader(), true, 'Current host color-scheme is recognized')
document.documentElement.style.colorScheme = 'light'
assert.equal(themeReader(), false, 'Switching back to light clears dark theme')
assert(!embeddedCss.includes('body:has([data-iter5])'), 'Independent roots never depend on a workbench being mounted')
assert(!embeddedCss.includes('html:has(#dam-skin-v4-style)'), 'Shared overlays do not depend on opt-in stylesheet lifetime')
console.log('PASS actual host theme markers and standalone entry styles')
test.transport(async url => {
  if (url.includes('/config')) return { config: { ...config } }
  if (url.includes('/semantic-status')) return { loaded: true, ready: false, resolvedTier: 'c1', download: { phase: 'idle' } }
  if (url.includes('/update-check')) return { current: '3.2.1' }
  return {}
}, async (url, patch) => {
  requests.push({ url, patch: JSON.parse(JSON.stringify(patch)) })
  if (failSave) throw Error('injected save failure')
  config = { ...config, ...patch }
  return { config: { ...config } }
})
function render() { cursor = 0; const tree = test.Iter5Settings(); const pending = effects; effects = []; pending.forEach(fn => fn()); return tree }
async function settle() { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)); return render() }
function nodes(tree, predicate, out = []) { if (!tree || typeof tree !== 'object') return out; if (Array.isArray(tree)) tree.forEach(x => nodes(x, predicate, out)); else { if (predicate(tree)) out.push(tree); nodes(tree.props?.children, predicate, out) } return out }
function field(tree, key) { const label = test.t(key); const row = nodes(tree, n => n.props?.['data-i5-field'] === label)[0]; const found = nodes(row, n => n.type === 'input'); assert(found.length, 'Input exists: ' + label); return found[0] }
function button(tree, label) { const found = nodes(tree, n => n.type === 'button' && n.props.children.flat(Infinity).includes(label)); assert(found.length, 'Button exists: ' + label); return found[0] }
render(); let tree = await settle()
assert.equal(field(tree, 'fNoteCap').props.value, 24000)
assert.equal(field(tree, 'fUserCap').props.value, 24000)
console.log('PASS generated settings preserve both upstream capacity defaults')
const engineSections = nodes(tree, n => n.props?.className === 'i5-engine-grid')[0]
const engineAdvanced = nodes(engineSections, n => n.type === 'details' && n.props.className === 'i5-settings-advanced')[0]
assert.equal(nodes(engineAdvanced, n => n.props?.['data-i5-field'] === test.t('fEmitMode')).length, 0, 'Actual delivery mode must not be hidden in advanced settings')
assert.equal(nodes(engineAdvanced, n => n.props?.['data-i5-field'] === test.t('fJsCooldown')).length, 1, 'Tuning remains available in advanced settings')
assert.equal(field(tree, 'fAssocEngine').props['aria-label'], '主动查找相关记忆', 'Accessible name matches plain-language visible label')
const memorySection = nodes(tree, n => n.type === 'section' && n.props.id?.endsWith('-section-capacity'))[0]
assert.equal(nodes(memorySection, n => n.props?.['data-i5-field'] === test.t('fAutoConsolidate')).length, 1, 'Automatic recording stays reachable after regrouping')
assert.equal(nodes(memorySection, n => n.type === 'details' && n.props.className === 'i5-settings-advanced').length, 1)
console.log('PASS beginner settings expose recall delivery and preserve advanced controls')
const appearance=nodes(tree,n=>n.type==='section'&&n.props.id&&n.props.id.endsWith('-section-look'))[0]
assert(button(appearance,test.t('tourReplay')),'Manual welcome entry stays in appearance group')
console.log('PASS welcome replay is reachable under appearance settings')
field(tree, 'fJsCooldown').props.onChange({ target: { value: '7' } })
tree = render()
assert.equal(tree.props['data-i5-dirty'], 'true')
const radio = nodes(tree, n => n.type === 'input' && n.props.type === 'radio' && n.props.value === 'lexical')[0]
radio.props.onChange({ target: { value: 'lexical' } }); tree = await settle()
assert.deepEqual(requests.at(-1).patch, { semanticEngineMode: 'lexical' })
assert.equal(field(tree, 'fJsCooldown').props.value, 7, 'Immediate engine change retains other drafts')
config.injectEnabled = false // Simulate another surface updating an unrelated key.
button(tree, '保存更改').props.onClick(); tree = await settle()
assert.deepEqual(requests.at(-1).patch, { jsDecideCooldownRounds: 7 })
assert.equal(config.injectEnabled, false, 'Unrelated concurrent changes survive save')
assert.equal(tree.props['data-i5-dirty'], 'false')
console.log('PASS immediate engine, draft retention, patch-only save, concurrent unrelated config')

field(tree, 'fJsCooldown').props.onChange({ target: { value: '9' } }); tree = render()
failSave = true
button(tree, '保存更改').props.onClick(); tree = await settle()
assert.equal(tree.props['data-i5-dirty'], 'true')
assert.equal(field(tree, 'fJsCooldown').props.value, 9)
assert(nodes(tree, n => n.props?.['data-dam-error'] === '').some(n => n.props.children.includes('injected save failure')))
button(tree, '取消修改').props.onClick(); tree = render()
assert.equal(field(tree, 'fJsCooldown').props.value, 7)
assert.equal(tree.props['data-i5-dirty'], 'false')
console.log('PASS failed save preserves draft and exposes error; cancel restores last saved config')

// Host-driven unmount must not erase pending edits. Recovery remains in memory,
// not localStorage, and must not write a stale patch without explicit save.
field(tree, 'fJsCooldown').props.onChange({ target: { value: '11' } }); tree = render()
const postsBeforeRemount = requests.length
states = []; effects = []; cursor = 0
tree = render(); tree = await settle()
assert.equal(field(tree, 'fJsCooldown').props.value, 11)
assert.equal(tree.props['data-i5-dirty'], 'true')
assert.equal(requests.length, postsBeforeRemount, 'Recovery cannot auto-save')
button(tree, '取消修改').props.onClick(); tree = render()
states = []; effects = []; cursor = 0
tree = render(); tree = await settle()
assert.equal(field(tree, 'fJsCooldown').props.value, 7)
assert.equal(tree.props['data-i5-dirty'], 'false', 'Discard removes recovery draft')
console.log('PASS host remount restores unsaved edits without browser persistence or automatic writes')

accept = false
field(tree, 'fAssocEngine').props.onChange({ target: { checked: false } }); tree = render()
assert.equal(field(tree, 'fAssocEngine').props.checked, true)
accept = true
field(tree, 'fAssocEngine').props.onChange({ target: { checked: false } }); tree = render()
assert.equal(field(tree, 'fAssocEngine').props.checked, false)
assert.equal(confirmCount, 2)
assert.equal(config.associativeMemoryEnabled, true, 'Confirmation creates a draft; saving performs the write')
console.log('PASS engine-disable confirmation and cancellation')

const built = test.iter5MemoryRows({ userSize: 10, logs: [{ name: '2026-09-28.md', date: '2026-09-28', size: 20 }], reflections: [] }, { userFile: 'fixture/MEMORY.md' })
assert.equal(built.length, 2)
assert.equal(built[0].scope, 'user')
assert.equal(built[1].path, '2026-09-28.md')
console.log('PASS memory-file rows preserve source scope and file route paths')
const boundRows=test.iter5MemoryRows({projectDir:'C:/isolated/project-a',logs:[{name:'2026-09-28.md',date:'2026-09-28',size:20}],reflections:[]},{})
assert.equal(boundRows[0].path,'C:/isolated/project-a/2026-09-28.md','File reads bind to the returned absolute project root')
assert.equal(test.iter5LedgerTitle('handoff-20260928-090000.md'),'2026-09-28 09:00')
let reads=[]
test.transport(async url=>{reads.push(url);return url.endsWith('/state')?{notesPath:'C:/isolated/project-a/MEMORY.md'}:{projectDir:'C:/isolated/project-b',logs:[],reflections:[]}},async()=>{})
await assert.rejects(test.iter5MemorySnapshot(),/工作区数据正在切换/)
assert(reads[0].endsWith('/state')&&reads[1].endsWith('/list'),'State is read before workspace-global list')
console.log('PASS handoff naming and cross-workspace read mismatch rejection')
states=[];effects=[];cursor=0
window['dsh-auto-memory.wizStatus']={loaded:true,ready:false,download:{phase:'idle'}}
test.setDialog(null);test.DialogHost();const hiddenHooks=cursor
cursor=0;test.setDialog({kind:'welcomeTour',manual:true});const tour=test.DialogHost()
assert(tour,'Welcome tour renders')
const nativeNav=nodes(tour,n=>n.props?.['data-native-tour-nav']==='')[0]
assert(nativeNav,'Welcome provides the approved native step navigation')
assert.equal(nodes(nativeNav,n=>n.type==='button').length,9,'All actual welcome steps remain reachable')
assert.equal(nodes(nativeNav,n=>n.props?.['aria-current']==='step').length,1,'Exactly one step is current')
const welcomeToggles=window['dsh-auto-memory.TOUR_STEPS'].flatMap(step=>step.toggles||[])
assert(welcomeToggles.some(t=>t.key==='workbenchEnabled'))
assert(!welcomeToggles.some(t=>t.key==='workbenchRoot'),'Directory setting cannot be written as a boolean')
assert.equal(cursor,hiddenHooks,'Hidden-to-visible welcome transition must not add hooks')
cursor=0;test.setDialog(null);test.DialogHost()
assert.equal(cursor,hiddenHooks,'Closing the welcome tour must not remove hooks')
console.log('PASS real DialogHost hook count stable when opening and closing welcome tour')

states=[];effects=[];cursor=0
const firstLoad=()=>Promise.resolve({content:'File A'})
test.useIter5Data(firstLoad,['a'])
effects.splice(0).forEach(fn=>fn())
await new Promise(resolve=>setTimeout(resolve,0))
cursor=0
assert.equal(test.useIter5Data(firstLoad,['a']).data.content,'File A')
cursor=0
const switched=test.useIter5Data(()=>Promise.resolve({content:'File B'}),['b'])
assert.equal(switched.data,null,'Changing a file masks the previous result before effects run')
assert.equal(switched.loading,true)
effects.splice(0).forEach(fn=>fn())
await new Promise(resolve=>setTimeout(resolve,0))
cursor=0
assert.equal(test.useIter5Data(()=>Promise.resolve(null),['b']).data.content,'File B')
console.log('PASS file transitions cannot display stale content under a new title')

states=[];effects=[];cursor=0
const home=test.Iter5Home({nonce:0,onNav(){}})
assert.equal(nodes(home,n=>n.props?.className==='i5-daily-card').length,1,'Home retains its real calendar section')
assert.equal(nodes(home,n=>n.props?.className==='i5-native-recent').length,1,'Home retains recent records')
console.log('PASS refined home retains recent records and calendar entry points')

states=[];effects=[];cursor=0
test.identity('session-a|workspace-a')
let resolveOld
test.useIter5Data(()=>new Promise(resolve=>{resolveOld=resolve}),[])
effects.splice(0).forEach(fn=>fn())
await Promise.resolve()
test.identity('session-b|workspace-b');cursor=0
assert.equal(test.useIter5Data(()=>Promise.resolve('workspace-b'),[]).data,null)
effects.splice(0).forEach(fn=>fn())
await new Promise(resolve=>setTimeout(resolve,0))
resolveOld('workspace-a');await new Promise(resolve=>setTimeout(resolve,0));cursor=0
assert.equal(test.useIter5Data(()=>Promise.resolve(null),[]).data,'workspace-b','Late prior-workspace data must not replace the active scope')
console.log('PASS late results cannot cross session/workspace identity')


// Execute panel draft and selectable search behavior through the shipped components.
function renderNative(component, props) { cursor=0;const tree=component(props);effects.splice(0).forEach(fn=>fn());return tree }
function resetNative() { states=[];effects=[];cursor=0 }
resetNative();test.identity('note-session-a|workspace-a')
let note=renderNative(test.Iter5Note,{persistDraft:'panel'})
nodes(note,n=>n.type==='textarea')[0].props.onChange({target:{value:'Keep this unsaved note'}})
resetNative();test.identity('note-session-b|workspace-b')
note=renderNative(test.Iter5Note,{persistDraft:'panel'})
assert.equal(nodes(note,n=>n.type==='textarea')[0].props.value,'','A different session never receives the panel draft')
resetNative();test.identity('note-session-a|workspace-a')
note=renderNative(test.Iter5Note,{persistDraft:'panel'})
assert.equal(nodes(note,n=>n.type==='textarea')[0].props.value,'Keep this unsaved note','Closing and remounting restores the same-session draft')
test.transport(async()=>({}),async()=>({ok:true}))
note.props.onSubmit({preventDefault(){}})
await new Promise(resolve=>setTimeout(resolve,0))
resetNative();note=renderNative(test.Iter5Note,{persistDraft:'panel'})
assert.equal(nodes(note,n=>n.type==='textarea')[0].props.value,'','A successful append clears the recovered draft')
console.log('PASS panel drafts survive remount, isolate identities and clear only after append')
resetNative()
test.transport(async()=>({}),async()=>({answer:'Host summary',hits:[{where:'log-a.md',line:'First source passage'},{where:'log-b.md',line:'Second source passage'}],keywords:['source']}))
let search=renderNative(test.Iter5Search,{nonce:0})
nodes(search,n=>n.type==='input')[0].props.onChange({target:{value:'source'}})
search=renderNative(test.Iter5Search,{nonce:0})
nodes(search,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}})
await new Promise(resolve=>setTimeout(resolve,0))
search=renderNative(test.Iter5Search,{nonce:0})
const results=nodes(search,n=>n.props?.className==='i5-search-result')
assert.equal(results.length,3,'The host summary and both source passages are independently selectable')
results[1].props.onClick()
search=renderNative(test.Iter5Search,{nonce:0})
assert.equal(nodes(search,n=>n.props?.className==='i5-search-result'&&n.props['aria-current']==='true').length,1)
assert.equal(nodes(search,n=>n.type==='h2'&&n.props.tabIndex===-1)[0].props.children[0],'log-b.md','Selecting a source updates the detail heading')
const lexical=test.iter5SearchEntries({result:'[记忆检索] 验收\n== 本地记忆文件命中 ==\n· log-a.md:\n  - exact source A\n· log-b.md:\n  - exact source B'},'recall')
assert.equal(lexical.length,3)
assert.equal(lexical[0].title,'log-a.md')
assert.equal(lexical[1].text,'- exact source B')
assert.equal(lexical[2].summary,true,'The complete host transcript remains available')
console.log('PASS search renders real source passages as selectable results')


resetNative()
const actionNode={key:'skill-1',props:{'data-dam-content':'',children:[{type:'button',props:{children:['Approve'],onClick(){}}}]}}
const skillRows=[{props:{title:'Skill group',children:[actionNode]}}]
assert.equal(test.iter5SkillContent(skillRows,'skill-1'),actionNode,'Original gated action node is reused without reimplementing its handlers')
let skillTree=renderNative(test.Iter5SkillBrowser,{active:[],pipeline:[{procedureId:'skill-1',title:'Reviewed process',stage:'candidate',steps:['Actual step'],successCriteria:['Actual criterion']}],rows:skillRows})
assert.equal(nodes(skillTree,n=>n.props?.className==='i5-native-skill-row').length,1)
assert.equal(nodes(skillTree,n=>n.type==='li')[0].props.children[0],'Actual step')
nodes(skillTree,n=>n.type==='input')[0].props.onChange({target:{value:'absent'}})
skillTree=renderNative(test.Iter5SkillBrowser,{active:[],pipeline:[{procedureId:'skill-1',title:'Reviewed process'}],rows:skillRows})
assert.equal(nodes(skillTree,n=>n.props?.className==='i5-native-skill-row').length,0)
console.log('PASS native skills preserve gated action content and title filtering')


for (const count of [1,2,5]) {
 const workspaces=Array.from({length:count},(_,i)=>({path:'ws-'+i,name:'Workspace '+i,graphTopics:Array.from({length:i===0?14:4},(_,n)=>({label:'Topic '+n}))}))
 const graph=test.iter5WorkspaceLayout(workspaces,{links:count>1?[{from:'ws-0',to:'ws-1',label:'shared'}]:[]})
 assert.equal(graph.nodes.filter(n=>n.kind==='workspace').length,count)
 assert.equal(graph.nodes.filter(n=>n.kind==='topic').length,14+4*(count-1),'Every actual topic is represented')
 for (const node of graph.nodes) assert(node.x-node.width/2>=0&&node.x+node.width/2<=graph.width&&node.y-node.height/2>=0&&node.y+node.height/2<=graph.height,'All graph node rectangles fit the viewBox')
 assert.equal(graph.edges.filter(e=>e.shared).length,count>1?1:0)
}
console.log('PASS native graph retains all topics and bounds every node inside its canvas')

// Replanning must follow the selected policy; changing packs invalidates the preview.
resetNative()
const storageCalls=[],migrationCalls=[]
context.fetch=async(url,opts)=>{if(opts?.body)storageCalls.push(JSON.parse(opts.body));return {ok:true,json:async()=>({ok:true,sources:[{file:'fixture/MEMORY.md',sourceRef:'notes:MEMORY.md',status:'ok'}],counts:{total:1,ok:1,stale:0,unrepairable:0}})}}
test.transport(async()=>({}),async(url,body)=>{migrationCalls.push({url,body});return {ok:true,plan:{onConflict:body.onConflict,additions:[],overwrites:[],stats:{willWrite:0}}}})
let storageTree=renderNative(test.Iter5Storage,{nonce:0})
await new Promise(resolve=>setTimeout(resolve,0))
storageTree=renderNative(test.Iter5Storage,{nonce:0})
const migrationProps=()=>nodes(storageTree,n=>n.type===test.Iter5Migration)[0].props
migrationProps().setPack('fixture/backup.dam-pack')
storageTree=renderNative(test.Iter5Storage,{nonce:0});migrationProps().onPreview()
await new Promise(resolve=>setTimeout(resolve,0));storageTree=renderNative(test.Iter5Storage,{nonce:0})
assert.equal(migrationCalls.at(-1).body.onConflict,'keep')
migrationProps().setConflict('overwrite')
await new Promise(resolve=>setTimeout(resolve,0));storageTree=renderNative(test.Iter5Storage,{nonce:0})
assert.equal(migrationCalls.at(-1).body.onConflict,'overwrite','Changing policy obtains a new host plan')
assert.equal(migrationProps().plan.onConflict,'overwrite')
migrationProps().setPack('fixture/another.dam-pack');storageTree=renderNative(test.Iter5Storage,{nonce:0})
assert.equal(migrationProps().plan,null,'A new pack cannot reuse the previous pack preview')
const selects=nodes(storageTree,n=>n.type==='select')
selects[0].props.onChange({target:{value:'fixture/MEMORY.md'}})
nodes(storageTree,n=>n.type==='input'&&String(n.props.placeholder).startsWith('mem_'))[0].props.onChange({target:{value:'memory-fixture'}})
storageTree=renderNative(test.Iter5Storage,{nonce:0});button(storageTree,'删除').props.onClick()
storageTree=renderNative(test.Iter5Storage,{nonce:0})
let confirmNode=nodes(storageTree,n=>n.type===test.Iter5DeleteConfirmation)[0]
assert.equal(confirmNode.props.payload.memoryId,'memory-fixture')
assert.equal(storageCalls.length,0,'Opening confirmation is read-only')
confirmNode.props.onClose();storageTree=renderNative(test.Iter5Storage,{nonce:0})
assert.equal(nodes(storageTree,n=>n.type===test.Iter5DeleteConfirmation).length,0)
assert.equal(storageCalls.length,0,'Canceling cannot delete')
button(storageTree,'删除').props.onClick();storageTree=renderNative(test.Iter5Storage,{nonce:0})
nodes(storageTree,n=>n.type===test.Iter5DeleteConfirmation)[0].props.onConfirm()
await new Promise(resolve=>setTimeout(resolve,0))
assert.equal(storageCalls.length,1)
assert.equal(storageCalls[0].memoryId,'memory-fixture')
console.log('PASS migration policy replans, pack changes invalidate preview, and deletion requires explicit confirmation')

resetNative();test.setDialog({kind:'notice',notice:{title:'Host notice',message:'Actual message'}})
const noticeElement=renderNative(test.DialogHost,{})
const notice=test.Iter5Notice(noticeElement.props)
assert.equal(notice.props['data-native-dialog'],'notice')
assert.equal(nodes(notice,n=>n.props?.['data-native-dialog']==='notice').length,1,'Sibling notices have an independently styleable native surface')
test.setDialog(null)

const summary=test.Iter5Summary({summary:{summary:'Actual host summary',works:Array.from({length:8},(_,i)=>({title:'Work '+i,points:['Point '+i]}))},onClose(){}})
assert.equal(nodes(summary,n=>n.type==='li').length,8,'Summary retains every actual work item and its points')
const progress=test.Iter5AutoContinue({executing:true,status:'Host is continuing',onDismiss(){}})
assert.equal(nodes(progress,n=>n.props?.role==='progressbar').length,1)
assert.equal(nodes(progress,n=>n.props?.['aria-valuenow']!==undefined).length,0,'No fake percentage when host does not report step progress')
console.log('PASS summary retains all host work details and continuation uses indeterminate progress')

// Git may check out skin sources as CRLF on Windows and LF on Linux.
// Both must produce the same normalized bundle without doubled CR bytes.
const fixture=mkdtempSync(path.join(tmpdir(),'iter5-generator-'))
try {
  for(const dir of ['lib','tools','skins/iter5'])mkdirSync(path.join(fixture,dir),{recursive:true})
  writeFileSync(path.join(fixture,'tools/build-iter5-skin.mjs'),readFileSync(new URL('../../tools/build-iter5-skin.mjs',import.meta.url)))
  for(const newline of ['\n','\r\n']) {
    for(const name of ['settings-copy.js','style-choice.js','alternate-home.js','style-variants.css','ui.js','views.js','surfaces.js','native-panel.js','native-workbench.js','skin.css','native-tour.css','native-panel.css','native-settings.css','native-workbench.css','native-library.css','native-search.js','native-operations.css','native-skills.js','native-storage.js','native-team.js','native-map.js','native-messages.js','native-secondary.css']) {
      const text=readFileSync(new URL('../../skins/iter5/'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n')
      writeFileSync(path.join(fixture,'skins/iter5',name),text.replace(/\n/g,newline))
    }
    writeFileSync(path.join(fixture,'lib/client.js'),source.replace(/\n/g,newline))
    execFileSync(process.execPath,[path.join(fixture,'tools/build-iter5-skin.mjs')])
    execFileSync(process.execPath,[path.join(fixture,'tools/build-iter5-skin.mjs'),'--check'])
    const generated=readFileSync(path.join(fixture,'lib/client.js'),'utf8')
    assert(!generated.includes('\r\r'),'No doubled carriage returns')
    assert.equal(generated.replace(/\r\n/g,'\n'),source,'Line ending conversion does not alter bundle content')
  }
} finally {
  assert(path.dirname(fixture)===path.resolve(tmpdir())&&path.basename(fixture).startsWith('iter5-generator-'))
  rmSync(fixture,{recursive:true,force:true})
}
console.log('PASS generator is idempotent with LF and CRLF checkouts')

// Topic deduplication, readable labels and non-actionable topic semantics.
const uniqueGraph = test.iter5WorkspaceLayout([{path:'/fixture',name:'Fixture',items:['Topic',' Topic ', 'Other']}], {})
assert.equal(uniqueGraph.nodes.filter(n=>n.kind==='topic').length, 2)
assert.equal(Array.from(test.iter5MapLabel('Long workspace title with meaningful word boundaries')).length, 2)
assert(test.iter5MapLabel('Long workspace title with meaningful word boundaries')[1].endsWith('…'))
assert.deepEqual(Array.from(test.iter5MapLabel('Memory search')), ['Memory search'])
console.log('PASS instrument topic deduplication and word-boundary labels')

resetNative()
const topicTree=renderNative(test.Iter5WorkspaceGraph,{workspaces:[{path:'/fixture',name:'Fixture',items:['Topic']}],onSelect(){throw Error('Topic must not switch workspace')},scale:1})
const topicNode=nodes(topicTree,n=>n.props?.['data-native-map-node']==='topic')[0]
assert.equal(topicNode.props.onClick,undefined)
assert.equal(topicNode.props.tabIndex,undefined)
assert.equal(topicNode.props.role,'img')
console.log('PASS topic nodes expose content without a misleading workspace action')
