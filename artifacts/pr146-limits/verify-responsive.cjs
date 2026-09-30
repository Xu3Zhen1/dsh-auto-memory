const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {open}=require('../pr146-full-ui/host-session.cjs')
;(async()=>{
 const {browser,page,errors}=await open(),checks=[],metrics=[]
 const check=(name,ok)=>{assert(ok,name);checks.push(name)}
 try{
  await page.locator('button[aria-label="设置"]').click();await page.getByRole('button',{name:'自动记忆 (pre)',exact:true}).click()
  const root=page.locator('[data-i5-embedded]');await root.getByRole('tab',{name:'记忆',exact:true}).click()
  const field=root.locator('input[type=number]:visible').first();const saved=await field.inputValue();await field.fill(String(Number(saved)+1))
  const id=await root.locator('[data-dam-settings]').getAttribute('data-i5-dirty')
  await root.getByRole('button',{name:'展开设置',exact:true}).click();check('Manual expansion keeps dirty form',await field.inputValue()===String(Number(saved)+1)&&id==='true')
  await page.keyboard.press('Escape');check('Escape returns with draft intact',await root.getAttribute('data-expanded')==='false'&&await field.inputValue()===String(Number(saved)+1))
  for(const width of [390,320,640]){
   await page.setViewportSize({width,height:844});await page.waitForTimeout(250)
   check('Narrow container automatically expands '+width,await root.getAttribute('data-expanded')==='true')
   const m=await root.evaluate(e=>({width:e.clientWidth,viewport:innerWidth,overflow:e.scrollWidth>e.clientWidth+1,content:e.querySelector('.i5-main').clientWidth}));metrics.push(m);check('Full width form '+width,m.content>=width-4&&!m.overflow)
   await page.screenshot({path:path.join(__dirname,'settings-'+width+'.png')})
  }
  check('Responsive transition retains field value',await field.inputValue()===String(Number(saved)+1))
  await root.getByRole('button',{name:'取消修改',exact:true}).click();check('Cancel after reparent restores value',await field.inputValue()===saved)
  await root.getByRole('button',{name:'返回宿主设置',exact:true}).focus();await page.keyboard.press('Shift+Tab');check('Expanded focus trap',await root.evaluate(e=>e.contains(document.activeElement)))
  await page.setViewportSize({width:1440,height:900});await page.keyboard.press('Escape');check('Desktop return is embedded',await root.getAttribute('data-expanded')==='false')
  await page.getByRole('button',{name:'通用设置',exact:true}).click();await page.getByRole('button',{name:'深色',exact:true}).click();await page.getByRole('button',{name:'自动记忆 (pre)',exact:true}).click();await root.getByRole('button',{name:'展开设置',exact:true}).click();await page.screenshot({path:path.join(__dirname,'settings-dark-expanded.png')});check('Expanded theme follows host',await root.evaluate(e=>e.closest('[data-dam-theme]').getAttribute('data-deep'))==='true')
  check('Single shared stylesheet',await page.locator('#dam-shared-ui-style').count()===1);check('No runtime errors',errors.length===0)
 }catch(e){await page.screenshot({path:path.join(__dirname,'responsive-failure.png')});throw e}finally{fs.writeFileSync(path.join(__dirname,'responsive-results.json'),JSON.stringify({checks,metrics,errors},null,2));await browser.close()}
 console.log('PASS '+checks.length+' responsive checks')
})().catch(e=>{console.error(e.message.replace(/token=\S+/g,'token=[redacted]'));process.exitCode=1})
