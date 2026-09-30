#!/usr/bin/env node
/**
 * smoke-test-plugin-icon.mjs —— 插件图标与本地化元数据契约锁（2026-09-29）。
 *
 * 背景：宿主新增了插件元数据机制（`@deepseek-ai/dsh-app-boot` 的 `readPluginMeta` / `iconOf` /
 * `dictionariesOf`），插件只要在 package.json 声明 `icon` 就出现在设置页插件行上。用户看到
 * 其他插件有图标、本插件没有，遂补上。**契约是宿主定的，本套件逐条复刻宿主的判据**，
 * 保证将来重构不会静默打破（宿主那边判据不符是**抛错**，会导致整条元数据读不到、图标消失）。
 *
 * 宿主判据（逐条实读源码得到，本套件按同样顺序复刻）：
 *  1. `icon` 必须是**相对路径** —— 绝对路径 / Windows 绝对路径 / 带 scheme（含 `data:`）⇒ 抛错
 *  2. 扩展名必须在白名单：.svg/.png/.jpg/.jpeg/.webp（按 extname 小写匹配）
 *  3. 目标文件必须**留在 package.json 所在目录内**（realpath 校验，防 `..` 逃逸）
 *  4. 必须是常规文件且 **≤ 256 KiB**（MAX_ICON_BYTES = 256*1024）
 *  5. 交付形态 = 宿主读成 `data:<mediaType>;base64,…` 塞进 `<img src>`（本套件验 base64 可还原）
 *  6. `locale/<lang>.json` 文件名必须是语言 id；`meta.title` / `meta.description` 为字符串
 *
 * 另锁两条**发布面**判据（否则图标进了仓库但进不了 npm 包，等于没做）：
 *  7. package.json 的 `files` 必须包含 icon.svg 与 locale（npm 只打包白名单）
 *  8. `exports` 必须放行 `./locale/*.json`（本包声明了 exports ⇒ 未放行的子路径无法被解析）
 */
import { readFileSync, statSync, realpathSync, existsSync, readdirSync } from 'node:fs'
import { dirname, resolve, relative, isAbsolute, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

let pass = 0, fail = 0
const failures = []
function ok(cond, name, got) {
  if (cond) { pass++ } else { fail++; failures.push(name + (got === undefined ? '' : ' | got=' + JSON.stringify(got))) }
}

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const pkgPath = resolve(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

// ── 复刻宿主 ICON_MEDIA_TYPES ──
const ICON_MEDIA_TYPES = new Map([
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
])
const MAX_ICON_BYTES = 256 * 1024

// ── ① icon 字段存在且为相对路径（宿主的三个否决项逐个复刻）──
const icon = pkg.icon
ok(typeof icon === 'string' && icon.length > 0, '①icon 字段存在且非空字符串', icon)
ok(!isAbsolute(icon) && !/^[A-Za-z]:[\\/]/.test(icon), '①icon 不是绝对路径/Windows 绝对路径', icon)
ok(!/^[A-Za-z][A-Za-z\d+.-]*:/u.test(icon), '①icon 不含 scheme（file:/data: 会被宿主拒）', icon)

// ── ② 扩展名白名单 ──
const mediaType = ICON_MEDIA_TYPES.get(extname(icon).toLowerCase())
ok(mediaType !== undefined, '②扩展名在白名单(SVG/PNG/JPEG/WebP)', extname(icon))

// ── ③ 文件在 package.json 目录内（realpath 校验）──
const pkgDir = realpathSync(dirname(pkgPath))
const iconFile = resolve(pkgDir, icon)
ok(existsSync(iconFile), '③icon 目标文件存在', icon)
const local = relative(pkgDir, realpathSync(iconFile))
ok(local !== '..' && !local.startsWith('..\\') && !local.startsWith('../') && !isAbsolute(local),
  '③icon 未逃出 manifest 目录（防 ".." 与符号链接逃逸）', local)

// ── ④ 常规文件 + 体积上限 ──
const st = statSync(iconFile)
ok(st.isFile(), '④icon 是常规文件')
ok(st.size <= MAX_ICON_BYTES && st.size > 0, '④icon 体积 ≤256KiB 且非空', st.size)
ok(st.size < 20 * 1024, '④体积留有余量(<20KiB，便于随包分发)', st.size)

// ── ⑤ 交付形态：base64 可还原 + SVG 结构完整 ──
const bytes = readFileSync(iconFile)
const b64 = bytes.toString('base64')
ok(Buffer.from(b64, 'base64').equals(bytes), '⑤base64 往返一致（宿主以 data URL 下发）')
const svgText = bytes.toString('utf8')
ok(svgText.trimStart().startsWith('<svg'), '⑤SVG 以 <svg 开头')
ok(svgText.trimEnd().endsWith('</svg>'), '⑤SVG 正常闭合')
ok(svgText.includes('xmlns="http://www.w3.org/2000/svg"'), '⑤含 xmlns（作为 img 源必需）')
ok(/viewBox="0 0 36 36"/.test(svgText), '⑤viewBox 为 36×36（与官方插件图标同规格）')
ok(!/<script|onload=|javascript:/i.test(svgText), '⑤SVG 无脚本/事件处理器（安全）')

// ── ⑥ locale 词典：文件名是语言 id + meta.title/description 为字符串 ──
const localeDir = resolve(pkgDir, 'locale')
ok(existsSync(localeDir), '⑥locale/ 目录存在')
const LANGUAGE_ID = /^[A-Za-z][A-Za-z\d-]*$/
let localeFiles = []
if (existsSync(localeDir)) {
  localeFiles = readdirSync(localeDir).filter((f) => f.endsWith('.json'))
  ok(localeFiles.length >= 2, '⑥至少 en + zh 两份词典', localeFiles.length)
  ok(localeFiles.includes('en.json'), '⑥含 en.json（宿主的词典加载入口）')
  ok(localeFiles.includes('zh.json'), '⑥含 zh.json（中文界面用）')
  for (const f of localeFiles) {
    const lang = basename(f, '.json')
    ok(LANGUAGE_ID.test(lang), '⑥词典文件名是语言 id: ' + f, lang)
    let parsed = null
    try { parsed = JSON.parse(readFileSync(resolve(localeDir, f), 'utf8')) } catch (_) { parsed = null }
    ok(parsed !== null, '⑥词典是合法 JSON: ' + f)
    const meta = parsed && parsed.meta
    ok(meta && typeof meta.title === 'string' && meta.title.length > 0, '⑥meta.title 非空字符串: ' + f)
    ok(meta && typeof meta.description === 'string' && meta.description.length > 0, '⑥meta.description 非空字符串: ' + f)
    // 描述长度：插件行按 `-webkit-line-clamp` 截断显示（超出显示省略号，不是报错）⇒
    //   这里只做**上限护栏**（防止误粘整篇 README 把插件行撑爆），不因内容完整而判红。
    //   用户裁定（2026-09-29）：中文摘要与英文完整摘要都由用户给定，原样收录。
    if (meta && typeof meta.description === 'string') {
      ok(meta.description.length <= 400, '⑥描述 ≤400 字符（超出会被宿主截断显示）: ' + f, meta.description.length)
    }
  }
}

// ── ⑦ 发布面：files 白名单（否则图标/词典进不了 npm 包）──
const files = Array.isArray(pkg.files) ? pkg.files : []
ok(files.some((f) => /icon\.svg$/i.test(f)), '⑦files 含 icon.svg（否则不随包发布）', files.filter((f) => /icon/.test(f)))
ok(files.some((f) => /^!?locale\/?$/.test(f)), '⑦files 含 locale', files.filter((f) => /locale/.test(f)))

// ── ⑧ exports 放行 locale 子路径 ──
const ex = pkg.exports || {}
ok(Object.keys(ex).some((k) => k.includes('locale')), '⑧exports 放行 ./locale/*.json', Object.keys(ex))

// ── ⑨ icon 与 package.json 同目录（宿主用 dirname(manifestPath) 做基准）──
ok(dirname(iconFile) === pkgDir, '⑨icon 与 package.json 同级（相对基准正确）')

console.log(`PASS ${pass} / FAIL ${fail}`)
if (fail) { console.log('FAILURES:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1) }
