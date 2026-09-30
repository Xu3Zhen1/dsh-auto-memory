const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{createRequire}=require('module');const {chromium}=createRequire(path.resolve('docs/ui-redesign-2026-09-25/design-demos/package.json'))('playwright')
;(async()=>{
 const browser=await chromium.launch({executablePath:path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe'),headless:true}),page=await browser.newPage(),home=path.join(process.env.TEMP,'dsh-iter5-qa-20260928'),checks=[],results={};const startUrl=fs.readFileSync(path.join(process.env.TEMP,'iter5-refine-host.log'),'utf8').match(/http:\/\/127\.0\.0\.1:19388\/\?token=\S+/)[0];await page.goto(startUrl);if(await page.getByRole('button',{name:'继续',exact:true}).count())await page.getByRole('button',{name:'继续',exact:true}).click()
 const config=await page.evaluate(async()=> (await(await fetch('/api/dsh-auto-memory/config')).json()).config)
 const patch=body=>page.evaluate(async body=>await(await fetch('/api/dsh-auto-memory/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json(),body)
 try{
  await patch({welcomeTourEnabled:true})
  const fresh=await browser.newPage({viewport:{width:390,height:844}})
  const url=fs.readFileSync(path.join(process.env.TEMP,'iter5-refine-host.log'),'utf8').match(/http:\/\/127\.0\.0\.1:19388\/\?token=\S+/)[0]
  await fresh.goto(url);if(await fresh.getByRole('button',{name:'继续',exact:true}).count())await fresh.getByRole('button',{name:'继续',exact:true}).click();await fresh.waitForTimeout(400);if(!await fresh.locator('[data-dam-tour]').count()&&await fresh.getByRole('button',{name:'稍后配置',exact:true}).count())await fresh.getByRole('button',{name:'稍后配置',exact:true}).click()
  await fresh.waitForTimeout(1500);const tour=fresh.locator('[data-dam-tour]');await tour.waitFor({timeout:20000});checks.push('Fresh browser automatically opens welcome');await fresh.screenshot({path:path.join(__dirname,'first-run-welcome.png')})
  await tour.locator('[data-dam-tour-dot]').nth(2).click();const toggle=tour.getByRole('switch').nth(1);const previous=await toggle.getAttribute('aria-checked');await toggle.click();await fresh.waitForTimeout(350)
  const changed=await fresh.evaluate(async()=> (await(await fetch('/api/dsh-auto-memory/config')).json()).config)
  assert.equal(changed.injectEnabled,previous!=='true');checks.push('Welcome switch persisted through actual config API')
  await toggle.click();await fresh.waitForTimeout(250);assert.equal((await fresh.evaluate(async()=> (await(await fetch('/api/dsh-auto-memory/config')).json()).config)).injectEnabled,config.injectEnabled);checks.push('Welcome switch restored')
  await tour.locator('[data-dam-tour-dot]').last().click();await tour.locator('[data-dam-tour-btn][data-primary=true]').click();await fresh.waitForTimeout(800);assert.equal(await fresh.locator('[data-dam-tour-visual]').count(),0);checks.push('Welcome completion exits tour')
  const setup=fresh.locator('[data-dam-wb-setup]');if(await setup.count()){
   const buttons=await setup.getByRole('button').allTextContents();results.setupButtons=buttons
   const create=setup.getByRole('button',{name:/同意并建立|Agree.*create/});if(await create.count()){await create.click();await fresh.waitForTimeout(2000)}
  }
  results.workbench=await fresh.evaluate(async()=>await(await fetch('/api/dsh-auto-memory/workbench',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json())
  await fresh.screenshot({path:path.join(__dirname,'first-run-completed.png')})
  console.log('Workbench ready:',results.workbench.ready)
  if(results.workbench.ready)checks.push('Real host workbench initialized')
  await fresh.close()
 }finally{await patch({welcomeTourEnabled:false,injectEnabled:config.injectEnabled,associativeMemoryEnabled:false});fs.writeFileSync(path.join(__dirname,'first-run-results.json'),JSON.stringify({checks,results},null,2));await browser.close()}
 console.log('PASS '+checks.length+' first run checks')
})().catch(e=>{console.error(e.message.replace(/token=\S+/g,'token=[redacted]'));process.exitCode=1})
