const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module')
const {chromium}=createRequire('C:/Users/李云龙/dsh-auto-memory/docs/ui-redesign-2026-09-25/design-demos/package.json')('playwright')
;(async()=>{
 const browser=await chromium.launch({executablePath:path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe'),headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:900}}),checks=[],errors=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss())
 const check=(name,ok)=>{assert(ok,name);checks.push(name)}
 try{
 const url=fs.readFileSync(path.join(process.env.TEMP,'native-ui-host.log'),'utf8').match(/http:\/\/127\.0\.0\.1:19388\/\?token=\S+/)?.[0];assert(url)
 await page.goto(url)
 if(await page.getByRole('button',{name:'继续',exact:true}).count())await page.getByRole('button',{name:'继续',exact:true}).click()
 await page.waitForTimeout(1800)
 if(await page.getByRole('button',{name:'稍后配置',exact:true}).count())await page.getByRole('button',{name:'稍后配置',exact:true}).click()
 if(await page.locator('[data-dam-tour]').count())await page.keyboard.press('Escape')
 const config=await page.evaluate(async()=> (await(await fetch('/api/dsh-auto-memory/config')).json()).config)
 check('isolated roots',config.memoryRoot.includes('dsh-iter5-qa-20260928')&&config.userMemoryDir.includes('dsh-iter5-qa-20260928'))
 await page.getByRole('treeitem',{name:'Iter5 隔离验收',exact:true}).click()
 await page.getByRole('treeitem',{name:/^UI 集成隔离验收/}).first().click()
 await page.getByRole('tab',{name:'记忆',exact:true}).click()
 if(await page.getByRole('button',{name:'开发版',exact:true}).isVisible())await page.getByRole('button',{name:'开发版',exact:true}).click()
 const root=page.locator('[data-native-workbench]');await root.waitFor()
 await root.getByRole('button',{name:'专注查看',exact:true}).click()
 check('native workbench mounts',await root.locator('.i5-window-bar').count()===1)
 const capture=async(name,el)=>{await el.waitFor();await el.scrollIntoViewIfNeeded();await page.waitForTimeout(250);check(name+' fits',await el.evaluate(n=>n.scrollWidth<=n.clientWidth+1));if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,name+'.png')})}
 let release
 const pending=new Promise(resolve=>release=resolve)
 await page.route('**/api/dsh-auto-memory/list',async route=>{await pending;await route.continue()})
 await root.locator('[data-i5-nav=library]').click();await capture('state-loading',root.locator('.i5-memory-loading'));check('loading announces busy state',await root.locator('.i5-memory-loading').getAttribute('aria-busy')==='true');release();await root.locator('.i5-file-list').waitFor();await page.unroute('**/api/dsh-auto-memory/list')
 const query=root.getByRole('searchbox',{name:'筛选记忆文件',exact:true});await query.fill('no-matching-native-ui-state-fixture')
 const empty=root.locator('.i5-empty-state');await empty.waitFor();await empty.locator('img').evaluate(img=>img.decode());check('new empty asset loaded',await empty.locator('img').evaluate(img=>img.naturalWidth===1448))
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await capture('state-empty-'+width,empty)}
 await query.fill('');await page.setViewportSize({width:1440,height:900})
 let fail=true
 await page.route('**/api/dsh-auto-memory/file?*',route=>fail?route.fulfill({status:503,json:{error:'隔离验收：读取暂时失败，请重试。'}}):route.continue())
 await root.locator('.i5-file').nth(1).click();const error=root.locator('.i5-source-card .i5-error');await error.waitFor()
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await capture('state-read-error-'+width,error)}
 fail=false;await error.getByRole('button',{name:'重试',exact:true}).click();await root.locator('.i5-source-card .i5-document').waitFor();check('retry recovers real source content',await error.count()===0);await page.unroute('**/api/dsh-auto-memory/file?*')
 await page.setViewportSize({width:1440,height:900});await root.getByRole('button',{name:'退出专注查看',exact:true}).click()
 await page.locator('button[aria-label="设置"]').click();await page.getByRole('button',{name:'通用设置',exact:true}).click();await page.getByRole('button',{name:'深色',exact:true}).click();await page.getByRole('button',{name:'自动记忆 (pre)',exact:true}).click()
 const host=page.locator('[data-i5-embedded]');await host.getByRole('tab',{name:'记忆',exact:true}).click();await capture('dark-host-memory',host);check('host settings reads actual dark theme',await host.locator('..').getAttribute('data-deep')==='true')
 await host.getByRole('tab',{name:'外观与目录',exact:true}).click();await host.getByRole('button',{name:/重看引导/}).click();const tour=page.locator('[data-native-tour]');await tour.locator('img').evaluate(img=>img.decode());check('dark asset URL requests deep variant',(await tour.locator('img').getAttribute('src')).includes('deep=1'));const expected=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../../lib/assets/skin/slots/hero.native-folio-dark-v1.png'))).digest('hex');const actual=await tour.locator('img').evaluate(async img=>{const bytes=await(await fetch(img.src)).arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')});check('host serves actual dark asset bytes',actual===expected);await capture('dark-welcome',tour);await page.keyboard.press('Escape');await tour.waitFor({state:'detached'})
 await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'记忆',exact:true}).click();const panel=page.locator('[data-dam-panel]');await panel.waitFor();await capture('dark-panel',panel)
 await page.setViewportSize({width:390,height:900});await capture('dark-panel-390',panel);await panel.locator('header button').last().click()
 await page.setViewportSize({width:1440,height:900});await page.locator('button[aria-label="设置"]').click();await page.getByRole('button',{name:'通用设置',exact:true}).click();await page.getByRole('button',{name:'浅色',exact:true}).click();checks.push('isolated host theme restored to light')

check('no runtime errors',errors.length===0)
 fs.writeFileSync(path.join(__dirname,'states-theme-check.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}))
 }catch(e){console.log('Visible dialogs:',(await page.locator('[role=dialog]').allTextContents()).map(t=>t.slice(0,200)));throw e}finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1})
