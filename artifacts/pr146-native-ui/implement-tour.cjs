const fs = require('node:fs')
const file = 'lib/client.js'
let s = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
function once(a,b) { if (s.split(a).length!==2) throw Error('Missing unique seam: '+a.slice(0,90)); s=s.replace(a,b) }
const start=s.indexOf('        // 每步只生成当前图形所需 DOM；')
const end=s.indexOf("          h('div', { 'data-dam-region': 'dialog', 'data-dam-tour':",start)
if(start<0||end<0)throw Error('Tour boundary missing')
s=s.slice(0,start)+`        var tourLabels = [L('欢迎使用', 'Welcome'), L('核心能力', 'Core features'), L('记忆快照', 'Snapshots'), L('日常体验', 'Daily use'), L('每日助理', 'Daily assistant'), L('外部记忆', 'External memory'), L('检索引擎', 'Retrieval'), L('唤起与固化', 'Recall & retain'), L('完成', 'Ready')]
        return h('div', { 'data-dam-tour-backdrop': '' },
`+s.slice(end)
once("'data-dam-tour': '', role: 'dialog'", "'data-dam-tour': '', 'data-native-tour': '', 'data-intro': String(tourStep === 0), role: 'dialog'")
once("            h('div', { 'data-dam-tour-glare': '' }),", `            h('header', { 'data-native-tour-bar': '' }, h(Iter5Icon, { name: 'library' }), h('strong', null, 'dsh-auto-memory')),
            h('nav', { 'data-native-tour-nav': '', 'aria-label': L('欢迎步骤', 'Welcome steps') },
              TOUR_STEPS.map(function (s, si) { return h('button', { key: si, 'aria-current': si === tourStep ? 'step' : undefined, onClick: function () { setTourStep(si) } }, h('span', null, String(si + 1).padStart(2, '0')), h('span', null, tourLabels[si] || s.title)) })),`)
once("            h('div', { 'data-dam-tour-visual': '', 'aria-hidden': true }, h(SkinHero, { slot: 'hero.welcome', deep: tourDeep })),", "            tourStep === 0 ? h('div', { 'data-dam-tour-visual': '', 'aria-hidden': true }, h(SkinHero, { slot: 'hero.welcome', deep: tourDeep })) : null,")
fs.writeFileSync(file,s.replace(/\n/g,'\r\n'))
const asset='lib/skin-assets.js'
let a=fs.readFileSync(asset,'utf8');a=a.replaceAll('hero.welcome-memory-v2.png','hero.native-folio-v1.png');fs.writeFileSync(asset,a)
const original='C:/Users/李云龙/dsh-auto-memory/artifacts/pr146-all-ui-references-20260929/catalog.json'
const refs=JSON.parse(fs.readFileSync(original,'utf8'))
fs.writeFileSync('artifacts/pr146-native-ui/coverage.json',JSON.stringify(refs.map(r=>({id:r.id,title:r.title,reference:r.file,group:r.group,source:r.source,implementation:'pending',hostEvidence:null})),null,2)+'\n')
