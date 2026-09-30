import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const source=fs.readFileSync(new URL('../../lib/index.js',import.meta.url),'utf8')
const start=source.indexOf('engine.semanticDeepDetect = async () => {')
const end=source.indexOf('\n    }',start)+6
assert(start>=0&&end>start,'Semantic deep detector source found')
const scanned=[]
const home=path.resolve('isolated-host-root')
const peer=path.join(home,'profiles','web','node_modules','@huggingface','transformers')
const engine={_peerExtraDirs:[],semanticAssetProbe:async()=>({ready:false,assetPresent:true}),resolveSemanticTier:async()=> 'c1',_jsSemantic:{addPeerDirCandidates(dirs){assert.deepEqual([...dirs],[peer])}}}
const ctx=vm.createContext({engine,path,resolveDshHomePre:()=>home,pluginDir:path.resolve('lib'),deepScanPeerTransformers:roots=>{scanned.push(...roots);return [peer]},pluginRootDir:()=>path.resolve('.'),console})
// Execute the shipped method, not a rewritten copy. Optional Python probe may
// fail in this VM; its existing try/catch leaves the JS root assertions intact.
vm.runInContext(source.slice(start,end),ctx)
await engine.semanticDeepDetect()
assert(scanned.includes(path.join(home,'profiles')),'Deep detection searches configured DSH_HOME')
assert.deepEqual([...engine._peerExtraDirs],[peer],'Detected profile peer is integrated into runtime')
console.log('PASS actual deep detector honors isolated/custom DSH_HOME and integrates its peer')
