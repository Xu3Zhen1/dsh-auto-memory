const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module')
const {chromium}=createRequire(path.resolve('docs/ui-redesign-2026-09-25/design-demos/package.json'))('playwright')
const out=__dirname, checks=[], measurements=[], errors=[]
const check=(name,value)=>{assert(value,name);checks.push(name)}
;(async()=>{
 const browser=await chromium.launch({executablePath:path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe'),headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss())
 // Preserve real status; block execution of costly automatic download when visiting its tour step.
 await page.route('**/semantic-download',r=>r.abort())
 async function shot(name){await page.waitForTimeout(350);await page.screenshot({path:path.join(out,name+'.png')})}
 async function settings(){await page.locator('button[aria-label="设置"]').click();await page.getByRole('button',{name:'自动记忆 (pre)',exact:true}).click()}
 try{
  const url=fs.readFileSync(path.join(process.env.TEMP,'iter5-refine-host.log'),'utf8').match(/http:\/\/127\.0\.0\.1:19388\/\?token=\S+/)[0]
  await page.goto(url)
  if(await page.getByRole('button',{name:'继续',exact:true}).count())await page.getByRole('button',{name:'继续',exact:true}).click()
  await page.waitForTimeout(500)
  if(await page.getByRole('button',{name:'稍后配置',exact:true}).count())await page.getByRole('button',{name:'稍后配置',exact:true}).click()
  const config=await page.evaluate(async()=> (await(await fetch('/api/dsh-auto-memory/config')).json()).config)
  check('Isolated memory root',config.memoryRoot.includes('dsh-iter5-qa-20260928'))
  check('Workbench not opened before independent settings',await page.locator('[data-iter5]').count()===0)
  await settings()
  const host=page.locator('[data-i5-embedded]')
  await host.locator('[data-dam-settings-row]').first().waitFor()
  check('Host settings uses shared form without sidebar',await host.locator('.i5-sidebar').count()===0)
  await shot('after-host-settings-light')
  for(const name of ['记忆','外观与目录','行为与维护','引擎']){await host.getByRole('tab',{name,exact:true}).click();await shot('after-host-group-'+name)}
  await host.getByRole('tab',{name:'外观与目录',exact:true}).click()
  await host.getByRole('button',{name:/重看引导/}).click()
  const tour=page.locator('[data-dam-tour]')
  await tour.waitFor()
  check('Welcome independent of workbench CSS',await page.locator('#dam-skin-v4-style').count()===0)
  const steps=await tour.locator('[data-dam-tour-dot]').count()
  for(let i=0;i<steps;i++){
   await tour.locator('[data-dam-tour-dot]').nth(i).click()
   await shot('after-tour-light-'+(i+1))
   const metric=await tour.evaluate(el=>({width:el.clientWidth,overflow:el.scrollWidth>el.clientWidth+1,title:el.querySelector('[data-dam-tour-title]').textContent,buttons:el.querySelector('[data-dam-tour-foot]').getBoundingClientRect().bottom,viewport:innerHeight}))
   measurements.push({step:i+1,...metric});check('Tour step '+(i+1)+' fits horizontally',!metric.overflow)
  }
  await page.keyboard.press('Escape');check('Welcome Esc closes',await tour.count()===0)
  await page.getByRole('button',{name:'通用设置',exact:true}).click();await page.getByRole('button',{name:'深色',exact:true}).click();await page.getByRole('button',{name:'自动记忆 (pre)',exact:true}).click()
  await shot('after-host-settings-dark')
  check('Host settings follows real host dark theme',await page.locator('[data-dam-theme=settings]').getAttribute('data-deep')==='true')
  await host.getByRole('tab',{name:'外观与目录',exact:true}).click();await host.getByRole('button',{name:/重看引导/}).click();await shot('after-welcome-dark')
  await page.setViewportSize({width:390,height:844})
  for(let i=0;i<steps;i++){await tour.locator('[data-dam-tour-dot]').nth(i).click();await shot('after-tour-narrow-'+(i+1));check('Narrow tour '+(i+1)+' fits',await tour.evaluate(el=>el.scrollWidth<=el.clientWidth+1))}
  await page.keyboard.press('Escape');await shot('after-host-settings-narrow')
  await page.setViewportSize({width:1440,height:900})
  await page.getByRole('button',{name:'通用设置',exact:true}).click();await page.getByRole('button',{name:'浅色',exact:true}).click()
  await page.getByRole('button',{name:'关闭',exact:true}).click();if(await page.locator('[data-dam-status-dialog]').count())await page.locator('[data-dam-status-dialog]').getByRole('button',{name:'知道了',exact:true}).click()
  await page.getByRole('button',{name:'记忆',exact:true}).click();const panel=page.locator('[data-dam-panel]');await panel.waitFor();await shot('after-panel-light')
  check('Panel starts with quick overview',await panel.getByRole('button',{name:'展开全部分区'}).count()===1)
  const b=await panel.boundingBox(),head=await panel.locator('header').boundingBox();await page.mouse.move(head.x+75,head.y+20);await page.mouse.down();await page.mouse.move(head.x+120,head.y-30,{steps:8});await page.mouse.up();const a=await panel.boundingBox();check('Panel drag retained',Math.abs(a.x-b.x)>10||Math.abs(a.y-b.y)>10)
  await panel.getByRole('button',{name:'展开全部分区'}).click();await shot('after-panel-expanded')
  await panel.locator('header button').last().click();await page.waitForTimeout(400);await page.getByRole('button',{name:'记忆',exact:true}).click();await panel.waitFor();check('Panel reopens',await panel.isVisible())
  await panel.locator('header button').last().click();await page.waitForTimeout(400)
  if(!await page.getByRole('treeitem',{name:/^UI 集成隔离验收/}).first().isVisible())await page.getByText('Iter5 隔离验收',{exact:true}).first().click()
  await page.getByRole('treeitem',{name:/^UI 集成隔离验收/}).first().click();await page.getByRole('tab',{name:'记忆',exact:true}).click();await page.getByRole('button',{name:'开发版',exact:true}).click();await page.locator('[data-iter5] h1').waitFor()
  for(const id of ['home','library','handoff','calendar','skills','recall','mindmap','storage','settings','team','stats']){if(['team','stats'].includes(id))await page.locator('.i5-sidebar-foot').getByRole('button',{name:id==='team'?'团队':'统计',exact:true}).click({position:{x:14,y:14}});else await page.locator('[data-i5-nav='+id+']').click();await shot('after-page-'+id)}
  await settings();await host.locator('[data-dam-settings-row]').first().waitFor()
  const duplicates=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id^=i5-settings]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i)})
  check('Coexisting settings have unique IDs',duplicates.length===0)
  await shot('after-settings-coexist')
  check('No React/runtime exceptions',errors.length===0)
 }catch(e){await shot('verification-failure');throw e}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,measurements,errors},null,2));await browser.close()}
 console.log('PASS '+checks.length+' host checks')
})().catch(e=>{console.error(e.message.replace(/token=\S+/g,'token=[redacted]'));process.exitCode=1})
