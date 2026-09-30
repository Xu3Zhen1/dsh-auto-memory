const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{open}=require('../pr146-full-ui/host-session.cjs')
;(async()=>{
 const {browser,page,nav,errors}=await open(),checks=[]
 try{
  await nav('settings');await page.getByRole('tab',{name:'外观与目录',exact:true}).click()
  await page.route('**/api/dsh-auto-memory/config',r=>r.request().method()==='GET'?r.fulfill({status:503,contentType:'application/json',body:'{"error":"isolated read failure"}'}):r.continue())
  await page.getByRole('button',{name:/重看引导/}).click();const tour=page.locator('[data-dam-tour]');await tour.waitFor();await tour.locator('[data-dam-tour-dot]').nth(2).click()
  await tour.getByRole('button',{name:'重试读取设置',exact:true}).waitFor();assert(await tour.getByRole('switch').nth(1).isDisabled());checks.push('Failed config read disables welcome writes and offers retry')
  await page.unroute('**/api/dsh-auto-memory/config');await tour.getByRole('button',{name:'重试读取设置',exact:true}).click()
  const toggle=tour.getByRole('switch').nth(1);await toggle.waitFor();const original=await toggle.getAttribute('aria-checked')
  await page.route('**/api/dsh-auto-memory/config',r=>r.request().method()==='POST'?r.fulfill({status:500,contentType:'application/json',body:'{"error":"isolated write failure"}'}):r.continue())
  await toggle.click();await tour.getByRole('alert').waitFor();assert.equal(await toggle.getAttribute('aria-checked'),original);checks.push('Failed welcome save reverts switch and displays error')
  await page.screenshot({path:path.join(__dirname,'welcome-save-failure.png')})
  await page.unroute('**/api/dsh-auto-memory/config');await toggle.click();await page.waitForTimeout(300);assert.notEqual(await toggle.getAttribute('aria-checked'),original);checks.push('Welcome save retry succeeds')
  await toggle.click();await page.waitForTimeout(300);assert.equal(await toggle.getAttribute('aria-checked'),original);checks.push('Original welcome switch restored')
  assert.equal(errors.length,0)
 }finally{await page.unroute('**/api/dsh-auto-memory/config');fs.writeFileSync(path.join(__dirname,'tour-failure-results.json'),JSON.stringify({checks,errors},null,2));await browser.close()}
 console.log('PASS '+checks.length+' welcome failure checks')
})().catch(e=>{console.error(e.message.replace(/token=\S+/g,'token=[redacted]'));process.exitCode=1})
