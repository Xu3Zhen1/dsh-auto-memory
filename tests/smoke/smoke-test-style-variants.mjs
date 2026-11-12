import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
const src=readFileSync(new URL('../../skins/iter5/style-choice.js',import.meta.url),'utf8')
const stored=new Map(),events=new Map()
let denied=false
function boot(){const c=vm.createContext({Set,localStorage:{getItem:k=>{if(denied)throw Error('denied');return stored.get(k)},setItem:(k,v)=>{if(denied)throw Error('denied');stored.set(k,v)}},window:{addEventListener:(k,fn)=>{if(!events.has(k))events.set(k,new Set());events.get(k).add(fn)},removeEventListener:(k,fn)=>events.get(k)?.delete(fn)},useState:fn=>[typeof fn==='function'?fn():fn,()=>{}],useEffect:()=>{},useDeepTheme:()=>true});vm.runInContext(src,c);return c}
let c=boot()
assert.equal(c.iter5ReadStyle(),'legacy');assert.equal(c.iter5ReadMode(),'system')
for(const style of ['legacy','instrument','editorial','water']){c.iter5SetStyle(style);assert.equal(c.iter5ReadStyle(),style);assert.equal(boot().iter5ReadStyle(),style)}
c.iter5SetMode('light');assert.equal(c.useIter5Theme(),false);assert.equal(c.iter5ReadStyle(),'water')
c.iter5SetMode('dark');assert.equal(c.useIter5Theme(),true)
c.iter5SetMode('system');assert.equal(c.useIter5Theme(),true)
c.iter5SetStyle('bad');c.iter5SetMode('bad');assert.equal(c.iter5ReadStyle(),'legacy');assert.equal(c.iter5ReadMode(),'system')
stored.set(c.ITER5_STYLE_KEY,'unknown');stored.set(c.ITER5_MODE_KEY,'unknown');c=boot();assert.equal(c.iter5ReadStyle(),'legacy');assert.equal(c.iter5ReadMode(),'system')
denied=true;c=boot();assert.equal(c.iter5ReadStyle(),'legacy');c.iter5SetStyle('editorial');c.iter5SetMode('dark');assert.equal(c.iter5ReadStyle(),'editorial');assert.equal(c.iter5ReadMode(),'dark');denied=false
let seen=[];c.iter5StyleListeners.add(v=>seen.push(v));c.iter5SetStyle('water',false);assert.deepEqual(seen,['water'])
let cleanups=[];c.useEffect=fn=>cleanups.push(fn());c.useIter5Style();c.useIter5Mode()
for(const fn of events.get('storage'))fn({key:c.ITER5_STYLE_KEY,newValue:'editorial'})
assert.equal(c.iter5ReadStyle(),'editorial')
for(const fn of events.get('storage'))fn({key:c.ITER5_MODE_KEY,newValue:'light'})
assert.equal(c.iter5ReadMode(),'light')
cleanups.forEach(fn=>fn());assert.equal(events.get('storage').size,0)
console.log('PASS three skins, independent light/dark/system, persistence, invalid values, denied storage, cross-surface notification and subscription cleanup')

// Upgrade from upstream's theme preference without overriding an explicit new selection.
stored.delete(c.ITER5_MODE_KEY);stored.set('dam-skin-theme','dark');c=boot();assert.equal(c.iter5ReadMode(),'dark');assert.equal(stored.get(c.ITER5_MODE_KEY),'dark')
c.iter5SetMode('light');assert.equal(boot().iter5ReadMode(),'light')
stored.delete(c.ITER5_MODE_KEY);stored.set('dam-skin-theme','auto');assert.equal(boot().iter5ReadMode(),'system')
// ★2026-11-12 补漏（由 ACCEPT-E2 变异计分板逼出）：legacy 判定用的是 `!= null` 而非 truthy。
//   空串是唯一的可区分输入 —— 空串非 null ⇒ 必须走 legacy 分支 ⇒ 归一化为 'system'，
//  **不能**因为它是 falsy 就落进 else 去采纳 saved 的 'dark'。
//   原套件无此用例，导致「!= null → truthy」这个变异存活（真实覆盖缺口，非等价变异）。
stored.delete(c.ITER5_MODE_KEY);stored.set('dam-skin-theme','');stored.set('dam-skin-theme','');stored.set(c.ITER5_MODE_KEY,'dark');c=boot()
assert.equal(c.iter5ReadMode(),'system','legacy 空串仍算非空（!= null）⇒ 归一化 system，不得采纳 saved 的 dark')
assert.equal(stored.get(c.ITER5_MODE_KEY),'system','legacy 空串分支必须镜像写回 system')
// 对照：legacy 键**不存在**时才采纳 saved
stored.clear();stored.set(c.ITER5_MODE_KEY,'dark');assert.equal(boot().iter5ReadMode(),'dark','legacy 缺失时采纳 saved')
console.log('PASS legacy-empty-string is non-null (not truthy) and mirrors system')
console.log('PASS upstream theme preference migration and explicit override precedence')
