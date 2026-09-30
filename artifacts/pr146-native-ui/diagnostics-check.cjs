const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module')
const {chromium}=createRequire('C:/Users/李云龙/dsh-auto-memory/docs/ui-redesign-2026-09-25/design-demos/package.json')('playwright')
;(async()=>{
 const browser=await chromium.launch({executablePath:path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe'),headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),checks=[],errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 try{
 const url=fs.readFileSync(path.join(process.env.TEMP,'native-ui-host.log'),'utf8').match(/http:\/\/127\.0\.0\.1:19388\/\?token=\S+/)?.[0];assert(url)
 await page.goto(url)
 if(await page.getByRole('button',{name:'继续',exact:true}).count())await page.getByRole('button',{name:'继续',exact:true}).click()
 await page.waitForTimeout(1600)
 if(await page.getByRole('button',{name:'继续',exact:true}).count())await page.getByRole('button',{name:'继续',exact:true}).click()
 console.log('Initial overlays:',(await page.locator('[role=dialog]').allTextContents()).map(t=>t.slice(0,220)))
 if(await page.getByRole('button',{name:'稍后配置',exact:true}).count())await page.getByRole('button',{name:'稍后配置',exact:true}).click()
 if(await page.locator('[data-dam-tour]').count())await page.keyboard.press('Escape')
 await page.locator('button[aria-label="设置"]').click()
 await page.getByRole('button',{name:'通用设置',exact:true}).click();await page.getByRole('button',{name:'浅色',exact:true}).click()
 await page.getByRole('button',{name:'自动记忆 (pre)',exact:true}).click()
 const host=page.locator('[data-i5-embedded]')
 await host.getByRole('tab',{name:'行为与维护',exact:true}).click()
 await host.getByRole('button',{name:/调试中心/}).click()
 const diag=page.locator('[data-native-diagnostics]');await diag.waitFor()
 assert.equal(await diag.locator('section>h3').count(),5);checks.push('five real diagnostic sections')
 assert(await diag.locator('[data-native-diag-row]').count()>12);checks.push('actual host diagnostic fields')
 for(const width of [1440,390]){
 await page.setViewportSize({width,height:1000});await diag.scrollIntoViewIfNeeded();await page.waitForTimeout(300)
 assert(await diag.evaluate(el=>el.scrollWidth<=el.clientWidth+1));checks.push(width+' diagnostics no horizontal overflow')
 if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,'diagnostics-'+width+'.png')})
 }
 assert.equal(errors.length,0);checks.push('no runtime errors')
 fs.writeFileSync(path.join(__dirname,'diagnostics-check.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length}))
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1})
