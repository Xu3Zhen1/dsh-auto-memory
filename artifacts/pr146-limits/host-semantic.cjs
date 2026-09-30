const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{open}=require('../pr146-full-ui/host-session.cjs')
;(async()=>{
 const {browser,page,nav,home}=await open(),checks=[],results={}
 try{
  await nav('settings')
  results.detect=await page.evaluate(async()=>await(await fetch('/api/dsh-auto-memory/semantic-deep-detect')).json())
  assert(results.detect.ready);assert(results.detect.deep.foundDirs.some(p=>p.startsWith(home)));checks.push('Real host discovers peer in configured DSH_HOME')
  await page.getByRole('button',{name:/检测/}).first().click();await page.waitForTimeout(300);await page.screenshot({path:path.join(__dirname,'semantic-host-ready.png')});checks.push('Real host settings refreshed after installation')
  results.continueState=await page.evaluate(async()=>await(await fetch('/api/dsh-auto-memory/auto-continue-state')).json());assert.equal(results.continueState.armed,null);checks.push('Idle real host does not invent pending continuation')
  const rejected=await page.evaluate(async()=>{const r=await fetch('/api/dsh-auto-memory/auto-continue-decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'agree',edgeAt:1})});return {status:r.status,body:await r.json()}});results.staleContinue=rejected;assert(rejected.status>=400);checks.push('Real host rejects continuation without a pending edge')
 }finally{fs.writeFileSync(path.join(__dirname,'host-semantic-results.json'),JSON.stringify({checks,results},null,2));await browser.close()}
 console.log('PASS '+checks.length+' host installation/continuation checks')
})().catch(e=>{console.error(e.message.replace(/token=\S+/g,'token=[redacted]'));process.exitCode=1})
