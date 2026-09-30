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
 await page.waitForTimeout(1200)
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
 for(const id of ['home','handoff','calendar','skills','recall','mindmap','storage','team','stats']){
 if(id==='team'||id==='stats')await root.locator('.i5-sidebar-foot').getByRole('button',{name:id==='team'?'团队':'统计',exact:true}).click();else await root.locator('[data-i5-nav='+id+']').click()
 await page.waitForTimeout(500)
 check(id+' has no render boundary error',await page.locator('[data-dam-skin-v4-err]').count()===0)
 check(id+' main fits horizontally',await root.locator('.i5-main').evaluate(el=>el.scrollWidth<=el.clientWidth+1))
 if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,'operations-'+id+'.png')})
 if(id==='handoff')check('one continuation action in top banner',await root.locator('.i5-native-handoff-banner button').count()===1)
 if(id==='calendar')check('calendar statistics moved below calendar',await root.getByText('日程统计',{exact:true}).count()===1)
 if(id==='skills')check('native skill browser is mounted',await root.locator('.i5-native-skill-columns').count()===1)
 if(id==='storage')check('real sources rendered in maintenance table',await root.locator('.i5-storage-table tbody tr').count()>0)
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250)
 check(id+' narrow main fits',await root.locator('.i5-main').evaluate(el=>el.scrollWidth<=el.clientWidth+1))
 if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,'operations-'+id+'-narrow.png')})
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(250)
 }
 await root.locator('[data-i5-nav=handoff]').click()
 for(const tab of ['白板','外部来源']){await root.getByRole('tab',{name:tab,exact:true}).click();await page.waitForTimeout(400);check(tab+' visible',await root.locator('[role=tabpanel]').isVisible());if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,'operations-'+tab+'.png')})}
 check('no runtime errors',errors.length===0)
 fs.writeFileSync(path.join(__dirname,'operations-check.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}))
 }catch(e){console.log('Visible dialogs:',(await page.locator('[role=dialog]').allTextContents()).map(t=>t.slice(0,200)));throw e}finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1})
