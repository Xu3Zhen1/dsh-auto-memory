const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module')
const {chromium}=createRequire('C:/Users/李云龙/dsh-auto-memory/docs/ui-redesign-2026-09-25/design-demos/package.json')('playwright')
;(async()=>{
 const browser=await chromium.launch({executablePath:path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe'),headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:900}}),checks=[],errors=[]
 const check=(name,ok)=>{assert(ok,name);checks.push(name)}
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss())
 try{
 const log=fs.readFileSync(path.join(process.env.TEMP,'native-ui-host.log'),'utf8')
 const url=log.match(/http:\/\/127\.0\.0\.1:19388\/\?token=\S+/)?.[0];assert(url,'isolated host URL')
 await page.goto(url)
 if(await page.getByRole('button',{name:'继续',exact:true}).count())await page.getByRole('button',{name:'继续',exact:true}).click()
 await page.waitForTimeout(1800)
 if(await page.getByRole('button',{name:'稍后配置',exact:true}).count())await page.getByRole('button',{name:'稍后配置',exact:true}).click()
 const config=await page.evaluate(async()=> (await(await fetch('/api/dsh-auto-memory/config')).json()).config)
 check('isolated memory roots',config.memoryRoot.includes('dsh-iter5-qa-20260928')&&config.userMemoryDir.includes('dsh-iter5-qa-20260928'))
 await page.waitForTimeout(800);if(await page.locator('[data-dam-tour]').count())await page.keyboard.press('Escape');console.log('Initial dialogs:',(await page.locator('[role=dialog]').allTextContents()).map(t=>t.slice(0,350)));await page.locator('button[aria-label="设置"]').click({timeout:5000});await page.getByRole('button',{name:'通用设置',exact:true}).click();await page.getByRole('button',{name:'浅色',exact:true}).click();await page.getByRole('button',{name:'自动记忆 (pre)',exact:true}).click()
 const host=page.locator('[data-i5-embedded]');await host.getByRole('tab',{name:'外观与目录',exact:true}).click({timeout:5000});await host.getByRole('button',{name:/重看引导/}).click()
 const tour=page.locator('[data-native-tour]');await tour.waitFor()
 check('nine native navigation steps',await tour.locator('[data-native-tour-nav] button').count()===9)
 const metrics=[]
 for(const width of [1440,390]){
 await page.setViewportSize({width,height:900})
 for(let i=0;i<9;i++){
 await tour.locator('[data-native-tour-nav] button').nth(i).click();await page.waitForTimeout(400)
 const m=await tour.evaluate(el=>({width:el.clientWidth,height:el.clientHeight,overflow:el.scrollWidth>el.clientWidth+1,footer:el.querySelector('[data-dam-tour-foot]').getBoundingClientRect().bottom,viewport:innerHeight,title:el.querySelector('[data-dam-tour-title]').textContent}))
 if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,'tour-'+width+'-'+(i+1)+'.png')});metrics.push({viewportWidth:width,step:i+1,...m});console.log(JSON.stringify(metrics[metrics.length-1]));check(width+' step '+(i+1)+' fits with reachable footer',!m.overflow&&m.footer<=m.viewport)
 }
 }
 await tour.locator('[data-native-tour-nav] button').first().click()
 check('welcome artwork loaded',await tour.locator('img').evaluate(el=>el.complete&&el.naturalWidth>0))
 await page.keyboard.press('Escape');check('Escape closes welcome',await tour.count()===0)
await host.getByRole('tab',{name:'记忆',exact:true}).click();await host.locator('[data-dam-settings-content]').evaluate(n=>n.scrollTop=0);check('390 expanded settings savebar remains in viewport',await host.locator('[data-dam-savebar]').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight));if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,'host-memory-390.png')})
await page.setViewportSize({width:1440,height:900})
if(await host.getAttribute('data-expanded')==='true')await host.getByRole('button',{name:'返回宿主设置',exact:true}).click()
for(const group of ['引擎','记忆','外观与目录','行为与维护']){await host.getByRole('tab',{name:group,exact:true}).click();await page.waitForTimeout(200);check(group+' content scrolls above savebar',await host.evaluate(n=>{const content=n.querySelector('[data-dam-settings-content]'),save=n.querySelector('[data-dam-savebar]');return content.getBoundingClientRect().bottom<=save.getBoundingClientRect().top+1&&save.getBoundingClientRect().bottom<=innerHeight-20}));check(group+' sections do not overlap',await host.evaluate(n=>{const a=[...n.querySelectorAll('[data-dam-settings-group]:not([hidden])')].filter(e=>e.offsetHeight>0).map(e=>e.getBoundingClientRect());return a.every((r,i)=>!i||r.top>=a[i-1].bottom-1)}));if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,'host-'+group+'.png')})}
await page.getByRole('button',{name:'关闭',exact:true}).click();await page.waitForTimeout(400)
await page.getByRole('button',{name:'记忆',exact:true}).click();const panel=page.locator('[data-dam-panel]');await panel.waitFor();await panel.locator('[data-native-quick-panel]').waitFor();await page.waitForTimeout(700)
check('native panel is mounted',await panel.locator('.i5-quick-actions').count()===1)
await panel.locator('.i5-quick-record,.i5-empty-state,.i5-error').first().waitFor();check('panel reads actual records or empty state',await panel.locator('.i5-quick-record,.i5-empty-state,.i5-error').count()>0)
if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,'panel-light.png')})
await panel.getByRole('button',{name:'展开分区',exact:true}).click();check('panel expands to existing tabs',await panel.locator('[data-dam-tab]').count()>0)
 await page.waitForTimeout(600);console.log('Expanded card style:',await panel.locator('[data-dam-card]').first().evaluate(n=>({opacity:getComputedStyle(n).opacity,color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor})))
if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,'panel-expanded.png')})
 fs.writeFileSync(path.join(__dirname,'host-check.json'),JSON.stringify({checks,metrics,errors},null,2))
 check('no runtime exceptions',errors.length===0)
 console.log(JSON.stringify({passed:checks.length,errors}))
 }catch(e){await page.screenshot({path:path.join(__dirname,'host-check-failure.png')});console.log('Runtime errors:',errors);console.log('Open overlays:',(await page.locator('[role=dialog],[role=presentation]').allTextContents()).map(t=>t.slice(0,350)));throw e}finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1})
