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
 await root.locator('[data-i5-nav=handoff]').click();await root.getByRole('tab',{name:'白板',exact:true}).click()
 const board=root.locator('.i5-board-reference');await board.waitFor();await board.locator('.i5-handoff-document .i5-document').waitFor()
 check('PLAN and actual material list visible',await board.locator('.i5-ledger-row').count()>1)
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(250);check(width+' board no horizontal overflow',await board.evaluate(n=>n.scrollWidth<=n.clientWidth+1));if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,'handoff-board-'+width+'.png')})}
 await page.setViewportSize({width:1440,height:900});await root.getByRole('tab',{name:'外部来源',exact:true}).click()
 const external=root.locator('.i5-external-view');await external.locator('.i5-external-select').first().waitFor()
 check('only two dedicated external fixtures discovered',await external.locator('.i5-external-select').count()===2)
 await external.getByText('此文件是专用于 UI 验收的合成样本，不含真实用户资料。',{exact:true}).waitFor()
 check('actual isolated file content rendered',await external.locator('.i5-external-content').innerText().then(t=>t.includes('合成样本')))
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await root.locator(".i5-main").evaluate(n=>{n.scrollTop=0});await page.waitForTimeout(250);check(width+' external no horizontal overflow',await external.evaluate(n=>n.scrollWidth<=n.clientWidth+1));if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,'external-isolated-'+width+'.png')})}
 await external.locator('.i5-external-select').nth(1).click();await external.getByText('隔离验收：工具画像',{exact:true}).waitFor();check('source selection changes actual file detail',await external.locator('.i5-external-content').innerText().then(t=>t.includes('工具画像')&&!t.includes('协作习惯')))
 check('existing import actions preserved',await external.getByRole('button',{name:'接入项目笔记',exact:true}).count()===1)
check('no runtime errors',errors.length===0)
 fs.writeFileSync(path.join(__dirname,'handoff-sources-check.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors}))
 }catch(e){console.log('Visible dialogs:',(await page.locator('[role=dialog]').allTextContents()).map(t=>t.slice(0,200)));throw e}finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1})
