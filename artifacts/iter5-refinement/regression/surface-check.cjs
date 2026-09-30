const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module')
const {chromium}=createRequire(path.resolve('docs/ui-redesign-2026-09-25/design-demos/package.json'))('playwright')
const out=path.resolve('artifacts/iter5-refinement/regression')
;(async()=>{
 const browser=await chromium.launch({executablePath:path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe'),headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss())
 page.on('console',m=>{if(m.type()==='error')console.log('Console error:',m.text().slice(0,1200))})
 try{
  const url=fs.readFileSync(path.join(process.env.TEMP,'iter5-refine-host.log'),'utf8').match(/http:\/\/127\.0\.0\.1:19388\/\?token=\S+/)[0]
  await page.goto(url)
  if(await page.getByRole('button',{name:'继续',exact:true}).count())await page.getByRole('button',{name:'继续',exact:true}).click()
  await page.waitForTimeout(400)
  if(await page.getByRole('button',{name:'稍后配置',exact:true}).count())await page.getByRole('button',{name:'稍后配置',exact:true}).click()
  if(!await page.getByRole('treeitem',{name:/^UI 集成隔离验收/}).first().isVisible())await page.getByText('Iter5 隔离验收',{exact:true}).first().click()
  await page.getByRole('treeitem',{name:/^UI 集成隔离验收/}).first().click()
  await page.getByRole('tab',{name:'记忆',exact:true}).click()
  await page.getByRole('button',{name:'开发版',exact:true}).click()
  await page.locator('[data-i5-nav=settings]').click()
  const root=page.locator('[data-iter5]')
  await root.getByRole('tab',{name:'外观与目录',exact:true}).click()
  console.log('Tour controls:',(await root.locator('button').allTextContents()).filter(s=>/引导|向导|Replay/.test(s)))
  console.log('Tour visibility:',await root.locator('button').filter({hasText:'▶ 重看引导'}).evaluate(el=>{let a=[];for(let n=el;n&&a.length<9;n=n.parentElement)a.push({tag:n.tagName,id:n.id,hidden:n.hidden,display:getComputedStyle(n).display});return a}))
  await root.getByRole('button',{name:/重看|重新.*引导|Replay/}).click()
  await page.waitForTimeout(500)
  console.log('After replay:',(await page.locator('body').innerText()).slice(-900))
  await page.locator('[data-dam-tour]').waitFor()
  for(let i=1;i<=3;i++){
   await page.screenshot({path:path.join(out,'live-tour-step-'+i+'.png')})
   checks.push('Real host welcome step '+i)
   if(i<3)await page.locator('[data-dam-tour-btn][data-primary=true]').click()
  }
  await page.locator('[data-dam-tour-close]').click()
  await page.getByRole('button',{name:'记忆',exact:true}).click()
  await page.locator('[data-dam-panel]').waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({path:path.join(out,'live-compact.png')})
  checks.push('Existing compact surface opens with new skin active')
  const panel=page.locator('[data-dam-panel]'),head=panel.locator('header')
  if(await head.count()){
   const before=await panel.boundingBox(),r=await head.boundingBox()
   await page.mouse.move(r.x+80,r.y+12);await page.mouse.down();await page.mouse.move(r.x+115,r.y-20,{steps:8});await page.mouse.up()
   const after=await panel.boundingBox();assert(Math.abs(after.x-before.x)>10||Math.abs(after.y-before.y)>10)
   checks.push('Compact panel drag geometry remains functional')
  }
  assert.equal(errors.length,0,errors.join('\n'))
  fs.writeFileSync(path.join(out,'surface-checks.json'),JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'))
 }catch(e){await page.screenshot({path:path.join(out,'surface-failure.png')}).catch(()=>{});throw e}finally{await browser.close()}
})().catch(e=>{console.error(e.message.replace(/token=\S+/g,'token=[redacted]'));process.exitCode=1})
