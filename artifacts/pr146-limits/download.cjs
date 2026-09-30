const fs=require('fs'),path=require('path'),{open}=require('../pr146-full-ui/host-session.cjs')
;(async()=>{
 const {browser,page,nav,home}=await open(),events=[]
 try{
  await nav('settings');await page.waitForTimeout(300)
  console.log('Download UI actions:',(await page.locator('[data-iter5] button').allTextContents()).filter(s=>/下载|安装|检测|取消/.test(s)))
  const status=()=>page.evaluate(async()=>await(await fetch('/api/dsh-auto-memory/semantic-status')).json())
  const before=await status();console.log('Before:',JSON.stringify({ready:before.ready,download:before.download,modelsRoot:before.modelsRoot}))
  const start=await page.evaluate(async()=>await(await fetch('/api/dsh-auto-memory/semantic-download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',mirror:'auto'})})).json())
  events.push({action:'start',result:start});console.log('Real isolated host download start:',JSON.stringify(start))
  let last='',final
  const deadline=Date.now()+6*60*1000
  while(Date.now()<deadline){const st=await status(),d=st.download||{};final=st;const key=d.phase+':'+d.file;if(key!==last){console.log('Phase:',d.phase,d.file||'',d.error||'');events.push({phase:d.phase,file:d.file,error:d.error});last=key}if(['done','error','cancelled'].includes(d.phase))break;await page.waitForTimeout(2000)}
  if(!['done','error','cancelled'].includes(final.download?.phase)){await page.evaluate(()=>fetch('/api/dsh-auto-memory/semantic-download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel'})}));events.push({timeout:true})}
  await page.screenshot({path:path.join(__dirname,'download-result.png')})
  fs.writeFileSync(path.join(__dirname,'download-results.json'),JSON.stringify({home,events,final},null,2));console.log('Final',JSON.stringify({ready:final.ready,download:final.download}))
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message.replace(/token=\S+/g,'token=[redacted]'));process.exitCode=1})
