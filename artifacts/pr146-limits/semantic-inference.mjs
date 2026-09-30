import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const home=path.join(process.env.TEMP,'dsh-iter5-qa-20260928')
process.env.DSH_HOME=home
const {createJsSemanticEnginePre,E5_SMALL_Q8_MANIFEST_PRE_V1}=await import('../../lib/semantic-js.js')
const modelRoot=path.join(home,'models/js-semantic'),peer=path.join(home,'profiles/semantic-qa/node_modules/@huggingface/transformers')
const checks=[],files=[]
for(const item of E5_SMALL_Q8_MANIFEST_PRE_V1.files){const data=fs.readFileSync(path.join(modelRoot,item.rel)),sha=createHash('sha256').update(data).digest('hex');assert.equal(data.length,item.bytes);assert.equal(sha,item.sha256);files.push({file:item.rel,bytes:data.length,sha256:sha})}
checks.push('All five downloaded files match manifest length and SHA256')
const engine=createJsSemanticEnginePre({pluginDir:path.resolve('lib')})
engine.addPeerDirCandidates([peer])
const vectors=await engine.embedPassages(['请保留用户偏好与项目笔记。','A quiet blue memory workspace.'])
for(const v of vectors){assert.equal(v.length,384);const norm=Math.sqrt([...v].reduce((n,x)=>n+x*x,0));assert(norm>.99&&norm<1.01)}
checks.push('Actual offline E5 CPU inference yields two normalized 384-dimensional embeddings')
assert(vectors[0].some((x,i)=>Math.abs(x-vectors[1][i])>.01));checks.push('Distinct texts produce distinct real embeddings')
fs.writeFileSync(new URL('semantic-results.json',import.meta.url),JSON.stringify({checks,files,status:engine.status()},null,2))
console.log('PASS',checks)
