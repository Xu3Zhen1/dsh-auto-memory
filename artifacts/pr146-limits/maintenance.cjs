const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{createHash}=require('crypto'),{open}=require('../pr146-full-ui/host-session.cjs')
;(async()=>{
 const {browser,page,nav,home}=await open(),checks=[],results={}
 let original,notes,config
 const post=(name,body)=>page.evaluate(async({name,body})=>{const r=await fetch('/api/dsh-auto-memory/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}},{name,body})
 const get=name=>page.evaluate(async name=>await(await fetch('/api/dsh-auto-memory/'+name)).json(),name)
 const check=(name,ok)=>{assert(ok,name);checks.push(name)}
 try{
  config=(await get('config')).config;await post('config',{memoryAnchorEnabled:true})
  const state=await get('state?ws='+encodeURIComponent(path.join(home,'workspace')));notes=state.userFile;assert(path.resolve(notes).startsWith(home+path.sep));original=fs.readFileSync(notes)
  const id='mem_'+createHash('sha256').update('pr146-isolated-maintenance').digest('hex').slice(0,32)
  fs.appendFileSync(notes,'\n\n<!-- memory:'+id+' -->\n## PR146 isolated maintenance\n临时验收记录，验证后删除。\n')
  const scan=await get('storage-manage');results.scan={ok:scan.ok,indexEnabled:scan.indexEnabled,counts:scan.counts,error:scan.error,sources:scan.sources?.map(s=>({file:s.file,status:s.status}))};console.log('Scan:',JSON.stringify(results.scan))
  const repair=await post('storage-manage',{action:'repair',items:[{file:notes}]});results.repair=repair;check('Real host repairs isolated source',repair.body.ok===true&&repair.body.repaired>=1)
  check('Repair preserves original bytes',fs.readFileSync(notes,'utf8').includes(id))
  await nav('storage');await page.screenshot({path:path.join(__dirname,'storage-repaired.png')})
  const reject=await post('storage-manage',{action:'delete',filePath:path.join(home,'outside-corpus.md'),memoryId:id});check('Out of corpus deletion rejected',reject.status===403)
  const conflict=await post('storage-manage',{action:'delete',filePath:notes,memoryId:id,expectedDigest:'deliberate-stale-digest'});results.conflict=conflict;check('Stale deletion digest rejected',conflict.body.ok===false)
  const del=await post('storage-manage',{action:'delete',filePath:notes,memoryId:id});results.delete=del;check('Real isolated memory deletion completes',del.body.ok===true);check('Deleted anchor absent on disk',!fs.readFileSync(notes,'utf8').includes(id))
  const exp=await post('migrate-export',{ws:path.join(home,'workspace'),outPath:path.join(home,'pr146-migration.zip')});results.export=exp;console.log('Export:',JSON.stringify(exp));check('Real migration export',exp.body.ok===true)
  const pack=exp.body.packPath||exp.body.path||exp.body.outPath
  const targetWs=path.join(home,'migration-target');fs.mkdirSync(targetWs,{recursive:true})
  const inspect=await post('migrate-inspect',{packPath:pack,targetWs});results.inspect=inspect;check('Real migration preview',inspect.body.ok===true)
  const imp=await post('migrate-import',{packPath:pack,targetWs,onConflict:'keep'});results.import=imp;check('Real isolated migration import',imp.body.ok===true)
 }finally{
  if(original&&notes){fs.writeFileSync(notes,original);await post('storage-manage',{action:'repair',items:[{file:notes}]}).catch(()=>{})}
  if(config)await post('config',{memoryAnchorEnabled:config.memoryAnchorEnabled}).catch(()=>{})
  fs.writeFileSync(path.join(__dirname,'maintenance-results.json'),JSON.stringify({checks,results},null,2));await browser.close()
 }
 console.log('PASS '+checks.length+' maintenance checks')
})().catch(e=>{console.error(e.message.replace(/token=\S+/g,'token=[redacted]'));process.exitCode=1})
