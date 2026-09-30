const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {open,metrics,out}=require('./host-session.cjs')
;(async()=>{
 const {browser,page,nav,errors}=await open(),checks=[],measurements=[]
 const check=(name,value)=>{checks.push({name,passed:!!value});console.log(value?'PASS':'FAIL',name)}
 const app=page.locator('[data-iter5]').first()
 try{
  await page.getByRole('button',{name:'专注查看',exact:true}).click()
  for(const [width,height] of [[1440,900],[1366,768],[390,844]]){
   await page.setViewportSize({width,height})
   for(const id of width===1366?['home','library']:['home','library','handoff','calendar','skills','recall','mindmap','storage','settings']){
    await nav(id)
    check(id+' '+width+' renders without horizontal overflow',await page.locator('.i5-main').evaluate(e=>e.scrollWidth<=e.clientWidth+1))
    await page.screenshot({path:path.join(out,'after-'+id+'-'+width+'.png')})
    if(id==='library')measurements.push(await metrics(page))
   }
  }
  for(const m of measurements.filter(m=>m.width>1000)){
   check(m.width+' ordinary rows within 64–72px',m.rowHeights.every(h=>h>=64&&h<=72))
   check(m.width+' wider detail than list',m.detailWidth>m.listWidth*1.5)
   check(m.width+' document font >=14px',parseFloat(m.documentFont)>=14)
   check(m.width+' source visible inside host',m.originVisible)
  }
  await page.setViewportSize({width:1440,height:900});await nav('library')
  const rows=app.locator('.i5-file-list .i5-file'),query=app.getByRole('searchbox',{name:'筛选记忆文件',exact:true})
  await query.fill('does-not-exist');await page.waitForTimeout(120)
  check('No matches clears previous source and has distinct message',await rows.count()===0 && await app.locator('.i5-source-origin').count()===0 && (await app.innerText()).includes('没有符合条件'))
  await query.fill('');await app.getByLabel('记忆范围',{exact:true}).selectOption('user');await page.waitForTimeout(150)
  check('Scope filter and selected detail agree',await rows.count()===1 && (await app.locator('.i5-source-heading').innerText()).includes('用户偏好'))
  await app.getByLabel('记忆范围',{exact:true}).selectOption('all')
  await rows.nth(1).click();await page.waitForTimeout(250)
  check('Full source path remains selectable',await app.locator('.i5-source-origin small').evaluate(e=>getComputedStyle(e).userSelect==='text'&&e.textContent.includes('MEMORY.md')))
  const prior=(await app.locator('.i5-document').innerText())
  let release
  const blocked=new Promise(r=>release=r)
  await page.route('**/api/dsh-auto-memory/file?*',async route=>{await blocked;await route.continue()})
  await rows.nth(2).click();await page.waitForTimeout(120)
  check('Pending selection never displays previous document',!((await app.locator('.i5-source-card').innerText()).includes(prior)))
  const received=page.waitForResponse(r=>r.url().includes('/api/dsh-auto-memory/file?'))
  release();await received;await page.waitForTimeout(120);await page.unroute('**/api/dsh-auto-memory/file?*')
  await page.route('**/api/dsh-auto-memory/file?*',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'isolated reading failure'})}))
  await rows.nth(3).click();await page.waitForTimeout(250)
  check('Read error has retry and no old document',await app.locator('.i5-source-card .i5-error button').count()===1 && await app.locator('.i5-source-card .i5-document').count()===0)
  await page.unroute('**/api/dsh-auto-memory/file?*');await app.locator('.i5-source-card .i5-error button').click();await page.waitForTimeout(250)
  check('Read retry recovers',await app.locator('.i5-source-card .i5-document').count()===1)
  await app.getByRole('tab',{name:'浏览',exact:true}).focus();await page.keyboard.press('ArrowRight')
  check('Memory tabs retain arrow navigation',await app.getByRole('tab',{name:'日志',exact:true}).getAttribute('aria-selected')==='true')
  await app.getByRole('tab',{name:'浏览',exact:true}).click();await page.waitForTimeout(200)
  for(const scale of [1.25,1.5]){
   await app.evaluate((e,n)=>e.style.setProperty('--dam-user-scale',n),String(scale));await page.waitForTimeout(150)
   check(scale+' user font scale keeps layout readable',await page.locator('.i5-main').evaluate(e=>e.scrollWidth<=e.clientWidth+1))
   check(scale+' scales document text',parseFloat(await app.locator('.i5-document').evaluate(e=>getComputedStyle(e).fontSize))>=14*scale)
  }
  await page.screenshot({path:path.join(out,'after-library-large-type.png')});await app.evaluate(e=>e.style.removeProperty('--dam-user-scale'))
  await page.evaluate(()=>document.documentElement.setAttribute('data-dsh-theme','dark'));await page.waitForTimeout(200)
  for(const id of ['home','library','settings']){await nav(id);await page.screenshot({path:path.join(out,'after-'+id+'-dark.png')})}
  check('Dark tokens follow host theme',await app.getAttribute('data-deep')==='true')
  await page.evaluate(()=>document.documentElement.removeAttribute('data-dsh-theme'))
  await page.emulateMedia({reducedMotion:'reduce'});check('Reduced motion disables card animation',await app.locator('.i5-card').first().evaluate(e=>getComputedStyle(e).animationName==='none'))
  await nav('library');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200)
  await rows.nth(2).click();await page.waitForTimeout(200)
  check('Mobile selection scrolls and focuses detail',await app.locator('.i5-source-heading h2').evaluate(e=>e===document.activeElement&&e.getBoundingClientRect().top<innerHeight))
  await page.screenshot({path:path.join(out,'after-library-mobile-detail.png')})
  check('Mobile toolbar touch targets >=44px',await app.locator('.i5-toolbar select').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=44)))
  await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'退出专注查看',exact:true}).click()
  await app.evaluate(e=>{e.style.width='700px';e.style.maxWidth='700px';e.style.flex='0 0 700px'})
  await page.waitForTimeout(200)
  check('Wide display narrow host uses drawer',await app.getAttribute('data-narrow')==='true' && await page.getByRole('button',{name:'打开导航',exact:true}).isVisible())
  await page.getByRole('button',{name:'打开导航',exact:true}).click();check('Drawer receives keyboard focus',await page.getByRole('button',{name:'关闭导航',exact:true}).evaluate(e=>e===document.activeElement))
  await page.keyboard.press('Escape');check('Escape restores menu focus',await page.getByRole('button',{name:'打开导航',exact:true}).evaluate(e=>e===document.activeElement))
  await page.screenshot({path:path.join(out,'after-library-narrow-host.png')})
  check('Narrow host layout no overflow',await page.locator('.i5-main').evaluate(e=>e.scrollWidth<=e.clientWidth+1))
  check('No uncaught errors',errors.length===0);if(checks.some(c=>!c.passed))process.exitCode=1
 }finally{
  fs.writeFileSync(path.join(out,'host-results.json'),JSON.stringify({checks,measurements,errors},null,2))
  await page.screenshot({path:path.join(out,'last-state.png')}).catch(()=>{})
  await browser.close()
 }
})().catch(e=>{console.error(e);process.exitCode=1})
