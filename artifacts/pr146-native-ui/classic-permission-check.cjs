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

 await root.getByRole('button',{name:'返回经典皮肤',exact:true}).click()
 const classic=page.locator('[data-dam-page]');await classic.waitFor()
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await capture('classic-'+width,classic)}
 check('classic retains navigation',await classic.locator('[data-dam-page-nav] button').count()>8)
 await classic.getByRole('button',{name:'开发版',exact:true}).click();await root.waitFor()
 check('native switch restores workbench',await root.count()===1)
 await page.setViewportSize({width:1440,height:900})
 await root.getByRole('button',{name:'专注查看',exact:true}).click()
 await root.locator('[data-i5-nav=library]').click();await root.locator('.i5-file-list').waitFor()
 let deny=true
 await page.route('**/api/dsh-auto-memory/file?*',route=>deny?route.fulfill({status:403,json:{error:'forbidden: 隔离验收的访问拒绝状态'}}):route.continue())
 await root.locator('.i5-file').nth(1).click();const denied=root.locator('[data-denied=true]');await denied.waitFor()
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await capture('fixture-permission-'+width,denied)}
 check('denial does not display cached file content',await root.locator('.i5-source-card .i5-document').count()===0)
 deny=false;await denied.getByRole('button',{name:'重试',exact:true}).click();await root.locator('.i5-source-card .i5-document').waitFor();check('permission retry uses actual response',await denied.count()===0)
 check('no runtime errors',errors.length===0)
 fs.writeFileSync(path.join(__dirname,'classic-permission-check.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}))
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1})
