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
console.log('PASS upstream theme preference migration and explicit override precedence')
