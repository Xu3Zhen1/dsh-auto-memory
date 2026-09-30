const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{open}=require('./host-session.cjs')
;(async()=>{
 const {browser,page,nav,errors}=await open(),checks=[]
 const shot=async name=>{await page.waitForTimeout(350);await page.screenshot({path:path.join(__dirname,name+'.png')})}
 try{
  await page.getByRole('tab',{name:'白板看板',exact:true}).click();await shot('after-whiteboard')
  checks.push('Real registered whiteboard opened')
  await page.getByRole('tab',{name:'记忆',exact:true}).click()
  await page.getByRole('button',{name:'记忆',exact:true}).click();const panel=page.locator('[data-dam-panel]');await panel.waitFor();await page.waitForTimeout(450)
  const handle=await panel.locator('[data-dam-resize]').boundingBox(),before=await panel.boundingBox()
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+100,handle.y+handle.height/2-70,{steps:8});await page.mouse.up();await page.waitForTimeout(150);const after=await panel.boundingBox();assert(Math.abs(after.width-before.width)>50);checks.push('Panel resizes via real handle')
  await panel.getByRole('button',{name:'打开完整工作台'}).click();await page.waitForTimeout(400);assert.equal(await panel.count(),0);checks.push('Panel opens registered full workbench and closes')
  await page.locator('button[aria-label="设置"]').click();await page.getByRole('button',{name:'通用设置',exact:true}).click();await page.getByRole('button',{name:'深色',exact:true}).click();await page.getByRole('button',{name:'关闭',exact:true}).click()
  await page.getByRole('button',{name:'记忆',exact:true}).click();await panel.waitFor();await shot('after-panel-dark');assert.equal(await page.locator('[data-dam-theme=panel]').getAttribute('data-deep'),'true');checks.push('Panel follows actual dark host')
  await page.setViewportSize({width:390,height:844});await shot('after-panel-narrow');assert(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1));checks.push('Narrow panel fits content')
  await page.setViewportSize({width:1440,height:900});await panel.locator('header button').last().click();await page.waitForTimeout(400)
  await nav('settings');await page.getByRole('button',{name:'专注查看',exact:true}).click();await page.getByRole('tab',{name:'外观与目录',exact:true}).click()
  await page.route('**/semantic-download',r=>r.abort());await page.getByRole('button',{name:/重看引导/}).click();const tour=page.locator('[data-dam-tour]');await tour.waitFor()
  await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.press('Tab');assert(await tour.evaluate(e=>e.contains(document.activeElement)));checks.push('Tour keyboard focus remains inside')
  await page.keyboard.press('Shift+Tab');assert(await tour.evaluate(e=>e.contains(document.activeElement)));checks.push('Tour reverse Tab remains inside')
  assert.equal(await tour.evaluate(e=>getComputedStyle(e).animationName),'none');checks.push('Independent overlay respects reduced motion')
  for(const scale of [1.25,1.5]){await tour.evaluate((e,v)=>e.closest('[data-dam-theme]').style.setProperty('--dam-user-scale',v),String(scale));await shot('after-welcome-scale-'+scale);assert(await tour.evaluate(e=>e.scrollWidth<=e.clientWidth+1));checks.push('Welcome inherited user scale '+scale)}
  await page.keyboard.press('Escape');assert.equal(await tour.count(),0);checks.push('Tour closes with keyboard after scaling')
  assert.equal(errors.length,0)
 }finally{fs.writeFileSync(path.join(__dirname,'extra-results.json'),JSON.stringify({checks,errors},null,2));await browser.close()}
 console.log('PASS '+checks.length+' extra checks')
})().catch(e=>{console.error(e.message.replace(/token=\S+/g,'token=[redacted]'));process.exitCode=1})
