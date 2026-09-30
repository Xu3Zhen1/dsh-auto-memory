// Real DSH rendering. Dynamic message/continuation states below are injected API fixtures.
// No production bundle patch, private debug hook, model request, or continuation execution.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module')
const {chromium}=createRequire('C:/Users/李云龙/dsh-auto-memory/docs/ui-redesign-2026-09-25/design-demos/package.json')('playwright')
;(async()=>{
 const browser=await chromium.launch({executablePath:path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe'),headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),checks=[],errors=[],evidence=[]
 const check=(name,ok)=>{assert(ok,name);checks.push(name)}
 const capture=async(name,el)=>{await el.waitFor();await page.waitForTimeout(250);check(name+' fits and is unobscured',await el.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+24);return n.contains(hit)&&n.scrollWidth<=n.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1}));if(process.env.NATIVE_CAPTURE==='1')await page.screenshot({path:path.join(__dirname,name+'.png')});evidence.push(name)}
 let autoPhase='idle',away=true,stateCalls=0,sendSummary=true,actions=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss())
 await page.route('**/api/dsh-auto-memory/config',async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch(),body=await response.json();body.config={...body.config,autoContinueEnabled:true,autoPopupEnabled:true,welcomeTourEnabled:false};await route.fulfill({response,json:body})})
 await page.route('**/api/dsh-auto-memory/state*',async route=>{const response=await route.fetch(),body=await response.json();stateCalls++;await route.fulfill({response,json:{...body,away,autoPopupEnabled:true,pendingSummary:sendSummary?{date:'qa-fixture',time:'UI 状态验收',summary:'以下内容为隔离宿主的状态验收夹具，用于检查真实总结组件的长文本和列表排版。',works:[{title:'界面验收记录',points:['检查桌面和窄屏的内容换行。','保留宿主返回的工作条目与要点。']},{title:'后续检查',points:['对比最终截图与参考图。']}]}:null}})})
 await page.route('**/api/dsh-auto-memory/notices',route=>route.fulfill({json:{notices:[{id:'native-notice-fixture',title:'隔离验收通知',message:'这是一条状态验收夹具，用于检查通知内容、关闭操作与窄屏布局。没有发送模型请求。',level:'urgent'}]}}))
 await page.route('**/api/dsh-auto-memory/auto-continue-state*',route=>route.fulfill({json:autoPhase==='confirm'?{armed:{ratio:.82,tokens:82000,window:100000,wall:110000,ring:.7,edgeAt:1,expiresAt:Date.now()+300000}}:autoPhase==='progress'?{executing:true}:autoPhase==='done'?{lastOk:{at:Date.now(),model:'状态验收夹具'}}:{}}))
 await page.route('**/api/dsh-auto-memory/auto-continue-*',async route=>{if(route.request().method()==='GET')return route.fallback();actions.push(route.request().postDataJSON());autoPhase='idle';await route.fulfill({json:{ok:true}})})
 try{
 const url=fs.readFileSync(path.join(process.env.TEMP,'native-ui-host.log'),'utf8').match(/http:\/\/127\.0\.0\.1:19388\/\?token=\S+/)?.[0];assert(url)
 await page.goto(url);await page.waitForTimeout(1800)
 if(await page.getByRole('button',{name:'继续',exact:true}).count())await page.getByRole('button',{name:'继续',exact:true}).click()
 await page.waitForTimeout(500);if(await page.getByRole('button',{name:'稍后配置',exact:true}).count())await page.getByRole('button',{name:'稍后配置',exact:true}).click()
 const notice=page.locator('[data-native-dialog=notice]');await capture('fixture-notice-1440',notice);await page.setViewportSize({width:390,height:900});await capture('fixture-notice-390',notice);await notice.getByRole('button',{name:'知道了',exact:true}).click();check('notice acknowledgement closes',await notice.count()===0)
 await page.setViewportSize({width:1440,height:1000});await page.locator('button[aria-label="设置"]').click();await page.getByRole('button',{name:'自动记忆 (pre)',exact:true}).click()
 const host=page.locator('[data-i5-embedded]');await host.getByRole('tab',{name:'外观与目录',exact:true}).click();await host.getByRole('button',{name:'查看更新日志',exact:true}).click()
 const update=page.getByRole('dialog',{name:'版本与更新说明',exact:true});await capture('update-live-1440',update);await page.setViewportSize({width:390,height:900});await capture('update-live-390',update);await page.keyboard.press('Escape');await update.waitFor({state:'detached'});check('update Escape closes',await update.count()===0)
 // Real manual replay -> existing memory-hub status, never create a duplicate hub.
 await page.setViewportSize({width:1440,height:1000});if(await host.getAttribute('data-expanded')==='true')await host.getByRole('button',{name:'返回宿主设置',exact:true}).click()
 await host.getByRole('button',{name:/重看引导/}).click();const tour=page.locator('[data-native-tour]');await tour.waitFor();await tour.locator('[data-native-tour-nav] button').last().click();await tour.getByRole('button',{name:'开始使用',exact:true}).click()
 const hub=page.locator('[data-dam-wb-card]');await capture('workbench-init-live',hub);check('existing hub is not offered duplicate creation',await hub.getByRole('button',{name:'同意并建立',exact:true}).count()===0);await hub.getByRole('button',{name:'好，开始使用',exact:true}).click()
 await update.waitFor({timeout:10000});await page.keyboard.press('Escape');await update.waitFor({state:'detached'})
 away=false;console.log('Waiting for actual 30-second return-state poll')
 const summary=page.getByRole('dialog',{name:/阶段|总结/});await summary.waitFor({timeout:45000});await capture('fixture-summary-1440',summary);await page.setViewportSize({width:390,height:900});await capture('fixture-summary-390',summary);await page.keyboard.press('Escape')
 sendSummary=false;away=true;await page.waitForTimeout(31000);away=false
 console.log('Waiting for return greeting poll')
 const greeting=page.locator('[data-native-dialog=welcomeBack]');await greeting.waitFor({timeout:45000});await capture('fixture-greeting-390',greeting);await greeting.getByRole('button',{name:'知道了',exact:true}).click()
 autoPhase='confirm';const auto=page.locator('[data-native-continuation=confirm]');await auto.waitFor({timeout:10000});await page.setViewportSize({width:1440,height:1000});await capture('fixture-continue-confirm-1440',auto);await page.setViewportSize({width:390,height:900});await capture('fixture-continue-confirm-390',auto)
 await auto.locator('footer button').first().click();await auto.waitFor({state:'detached'});check('reject is transmitted to intercepted fixture route',actions.length===1)
 autoPhase='progress';const progress=page.locator('[data-native-continuation=progress]');await progress.waitFor({timeout:10000});await capture('fixture-continue-progress-390',progress);check('no fabricated percentage',await progress.getByRole('progressbar').getAttribute('aria-valuenow')===null)
 check('no runtime errors',errors.length===0)
 fs.writeFileSync(path.join(__dirname,'messages-check.json'),JSON.stringify({checks,evidence,errors,limitations:['Notice, summary, return greeting and continuation API states are explicit isolated UI fixtures.','Update text and memory-hub existing status are real host responses.','No continuation, paid model or new hub creation was executed.']},null,2));console.log(JSON.stringify({passed:checks.length,errors}))
 }catch(e){console.log('Visible dialogs:',(await page.locator('[role=dialog]').allTextContents()).map(t=>t.slice(0,180)));throw e}finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1})
