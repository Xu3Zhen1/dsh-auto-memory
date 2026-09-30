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
const host=page.locator('[data-i5-embedded]');await host.getByRole('tab',{name:'记忆',exact:true}).click();console.log(await host.evaluate(n=>[n,n.querySelector('.i5-main'),n.querySelector('[data-dam-settings]'),n.querySelector('[data-dam-settings-content]'),n.querySelector('[data-dam-savebar]')].map(e=>({attr:[...e.attributes].map(a=>a.name+'='+a.value).join(' '),rect:{top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height},style:{display:getComputedStyle(e).display,height:getComputedStyle(e).height,flex:getComputedStyle(e).flex,overflow:getComputedStyle(e).overflow}}))));}finally{await browser.close()}})().catch(e=>{console.error(e.message);process.exitCode=1})