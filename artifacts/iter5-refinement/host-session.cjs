// Local QA harness: isolated DSH profile only, no personal browser session.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { chromium } = createRequire(path.resolve('docs/ui-redesign-2026-09-25/design-demos/package.json'))('playwright')
const out = __dirname
async function open() {
  const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe'), headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('dialog', d => d.dismiss())
  const url = fs.readFileSync(path.join(process.env.TEMP, 'iter5-refine-host.log'), 'utf8').match(/http:\/\/127\.0\.0\.1:19388\/\?token=\S+/)?.[0]
  assert(url, 'Start the isolated QA host first')
  await page.goto(url)
  if (await page.getByRole('button', { name: '继续', exact: true }).count()) await page.getByRole('button', { name: '继续', exact: true }).click()
  await page.waitForTimeout(500)
  if (await page.getByRole('button', { name: '稍后配置', exact: true }).count()) await page.getByRole('button', { name: '稍后配置', exact: true }).click()
  const config = await page.evaluate(async () => (await (await fetch('/api/dsh-auto-memory/config')).json()).config)
  const home = path.join(process.env.TEMP, 'dsh-iter5-qa-20260928')
  for (const value of [config.memoryRoot, config.userMemoryDir]) assert(path.resolve(value).startsWith(home + path.sep), 'Must use isolated memory roots')
  if (!await page.getByRole('treeitem', { name: /^UI 集成隔离验收/ }).first().isVisible()) await page.getByText('Iter5 隔离验收', { exact: true }).first().click()
  await page.getByRole('treeitem', { name: /^UI 集成隔离验收/ }).first().click()
  await page.getByRole('tab', { name: '记忆', exact: true }).click()
  await page.getByRole('button', { name: '开发版', exact: true }).click()
  await page.locator('[data-iter5] h1').waitFor()
  async function nav(id) {
    await page.waitForTimeout(150) // Let the host/container ResizeObserver settle after resizing.
    if (!await page.locator('[data-i5-nav="'+id+'"]').isVisible()) await page.getByRole('button', { name: '打开导航', exact: true }).click()
    await page.locator('[data-i5-nav="'+id+'"]').click()
    await page.waitForTimeout(400)
    assert.equal(await page.locator('[data-dam-skin-v4-err]').count(), 0)
  }
  return { browser, page, nav, errors, home }
}
async function metrics(page) {
  return page.locator('.i5-main').evaluate(main => {
    const rect = e => e && e.getBoundingClientRect()
    const rows = [...main.querySelectorAll('.i5-file-list .i5-file')], box = rect(main), detail = main.querySelector('.i5-source-card'), doc = main.querySelector('.i5-document'), list = main.querySelector('.i5-file-list'), origin = main.querySelector('.i5-source-origin')
    return { width: innerWidth, height: innerHeight, mainWidth: main.clientWidth, rowHeights: rows.map(r => rect(r).height), fullyVisibleRows: rows.filter(r => rect(r).top >= box.top && rect(r).bottom <= box.bottom).length, listWidth: rect(list)?.width, detailWidth: rect(detail)?.width, documentFont: doc && getComputedStyle(doc).fontSize, originVisible: !!origin && rect(origin).bottom <= box.bottom, overflow: main.scrollWidth > main.clientWidth + 1 }
  })
}
module.exports = { open, metrics, out }
if (require.main === module) (async () => {
  const { browser, page, nav } = await open()
  try {
    const preview = await browser.newPage()
    await preview.goto(require('node:url').pathToFileURL(path.join(process.env.TEMP, 'pr146-ui-review-input/pr146-ui-review/preview.html')).href)
    await preview.locator('#mode-before').click(); await preview.locator('#mode-after').click()
    await preview.locator('#query').fill('不存在'); assert.equal(await preview.locator('.i5-file').count(), 0)
    await preview.locator('#refresh').click(); await preview.locator('.i5-file').first().click()
    assert.equal(await preview.locator('#detail-title').innerText(), '用户偏好')
    await preview.locator('#theme').click(); assert.equal(await preview.locator('#app').getAttribute('data-deep'), 'true')
    await preview.close()
    await page.getByRole('button', { name: '专注查看', exact: true }).click()
    const results = []
    for (const [width, height] of [[1440,900],[1366,768],[390,844]]) {
      await page.setViewportSize({ width, height })
      for (const id of ['home','library']) {
        await nav(id)
        await page.screenshot({ path: path.join(out, 'before-'+id+'-'+width+'.png') })
        if (id === 'library') results.push(await metrics(page))
      }
    }
    fs.writeFileSync(path.join(out, 'before-metrics.json'), JSON.stringify(results,null,2))
    console.log('Preview interactions inspected; real-host baseline captured', results)
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
