import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'lib/client.js')
let client = readFileSync(file, 'utf8')
const newline = client.includes('\r\n') ? '\r\n' : '\n'
client = client.replace(/\r\n/g, '\n')
const begin = '    // ITER5-GENERATED:BEGIN'
const end = '    // ITER5-GENERATED:END'
if (client.includes(begin)) client = client.slice(0, client.indexOf(begin)) + client.slice(client.indexOf(end) + end.length + 1)
function replaceOnce(text, old, value) {
  if (text.split(old).length !== 2) throw new Error('Expected exactly one settings seam: ' + old.slice(0, 90))
  return text.replace(old, value)
}
let settings = client.slice(client.indexOf('    function SettingsPage() {'), client.indexOf('    // ───────────────────────── 插件挂载'))
settings = replaceOnce(settings, 'function SettingsPage()', 'function Iter5Settings(props)')
settings = replaceOnce(settings, '      var tickPair = useTick()', `      var tickPair = useTick()
      var i5Group = useState(props && props.intent && ['engine', 'memory', 'appearance', 'behavior'].indexOf(props.intent.group) >= 0 ? props.intent.group : 'engine')
      var i5Base = useRef(null)
      var i5Draft = useRef({})
      var i5Groups = useRef({})
      var i5Alive = useRef(true)
      var i5Identity = iter5Identity()
      var i5DraftKey = i5Identity + '|' + (props && props.draftScope || 'workbench')
      var i5GroupsDef = { engine: ['engine'], memory: ['window', 'capacity', 'skills'], appearance: ['store', 'look', 'skin'], behavior: ['handoff', 'auto', 'team', 'about'] }
      useEffect(function () {
        i5Alive.current = true
        function before(e) { if (!Object.keys(i5Draft.current).length) return; e.preventDefault(); e.returnValue = '' }
        window.addEventListener('beforeunload', before)
        return function () { i5Alive.current = false; window.removeEventListener('beforeunload', before) }
      }, [])
      function i5Ok() { return i5Alive.current && i5Identity === iter5Identity() }
      function i5Record(key, value) {
        if (JSON.stringify(value) === JSON.stringify((i5Base.current || {})[key])) { delete i5Draft.current[key]; delete i5Groups.current[key] }
        else { i5Draft.current[key] = value; i5Groups.current[key] = i5Group[0] }
        setDirty(Object.keys(i5Draft.current).length > 0)
        if (Object.keys(i5Draft.current).length) iter5SettingsDrafts[i5DraftKey] = { patch: Object.assign({}, i5Draft.current), groups: Object.assign({}, i5Groups.current), base: Object.assign({}, i5Base.current) }
        else delete iter5SettingsDrafts[i5DraftKey]
      }
      function i5Cancel() { delete iter5SettingsDrafts[i5DraftKey]; i5Draft.current = {}; i5Groups.current = {}; setCfg(Object.assign({}, i5Base.current)); setDirty(false); setErr(''); setMsg('') }`)
settings = replaceOnce(settings, '          setCfg(d.config)', `          if (!i5Ok()) return
          i5Base.current = configOf(d)
          var recovered = iter5SettingsDrafts[i5DraftKey]
          if (recovered) {
            i5Draft.current = Object.assign({}, recovered.patch); i5Groups.current = Object.assign({}, recovered.groups)
            setCfg(Object.assign({}, configOf(d), recovered.patch)); setDirty(true)
            setMsg(L('已恢复此会话未保存的修改，请核对后保存或取消。', 'Unsaved edits for this session were restored. Review before saving or discarding.'))
            var conflict = Object.keys(recovered.patch).some(function (key) { return JSON.stringify(configOf(d)[key]) !== JSON.stringify(recovered.base[key]) })
            if (conflict) setErr(L('部分设置已在其他入口变更；恢复的草稿尚未覆盖服务器，请核对。', 'Some settings changed elsewhere. Restored edits have not overwritten the server; review them.'))
          } else setCfg(configOf(d))`)
settings = replaceOnce(settings,
  'function set(key, value) { setCfg(function (prev) { var next = Object.assign({}, prev); next[key] = value; return next }); setDirty(true) }',
  `function set(key, value) {
        if (busy) return
        if (key === 'associativeMemoryEnabled' && value === false && cfg.associativeMemoryEnabled && !window.confirm(L('关闭自动记忆引擎并保存后，将清零全部观察数据。记忆正文保留。确定关闭？', 'Saving with the engine disabled clears all observation data. Memory files are preserved. Disable?'))) return
        i5Record(key, value)
        setCfg(function (prev) { var next = Object.assign({}, prev); next[key] = value; return next })
      }`)
settings = replaceOnce(settings, 'function setMany(patch) { setCfg(function (prev) { return Object.assign({}, prev, patch) }); setDirty(true) }', 'function setMany(patch) { if (busy) return; Object.keys(patch).forEach(function (k) { i5Record(k, patch[k]) }); setCfg(function (prev) { return Object.assign({}, prev, patch) }) }')
const saveStart = settings.indexOf('      function save() {')
const fieldStart = settings.indexOf('      function field(')
settings = settings.slice(0, saveStart) + `      function save() {
        if (busy || !Object.keys(i5Draft.current).length) return
        setBusy(true); setMsg(''); setErr('')
        var patch = Object.assign({}, i5Draft.current)
        saveConfigPatch(patch, {
          onSaved: function (d) {
            if (!i5Ok()) return
            i5Base.current = configOf(d)
            delete iter5SettingsDrafts[i5DraftKey]
            i5Draft.current = {}; i5Groups.current = {}
            setCfg(configOf(d)); setDirty(false); setBusy(false); setMsg(t('saved'))
            if (configOf(d).locale) applyLocalePref(configOf(d).locale)
            refreshSem(setSem)
          },
          onError: function (e) { if (i5Ok()) { setErr(e.message); setBusy(false) } }
        })
      }
` + settings.slice(fieldStart)
settings = replaceOnce(settings, "      function field(label, control, hint) {\n        return", `      function field(label, control, hint) {
        var plain = iter5SettingCopy(label)
        var shownLabel = plain ? plain.label : label
        if (control && (control.type === 'input' || control.type === 'select' || control.type === 'textarea')) control = React.cloneElement(control, { 'aria-label': shownLabel, disabled: busy || control.props.disabled, role: control.type === 'input' && control.props.type === 'checkbox' ? 'switch' : undefined })
        return`)
settings = replaceOnce(settings, "return h('div', { 'data-dam-settings-row': '' },", "return h('div', { 'data-dam-settings-row': '', 'data-i5-field': label },")
settings = replaceOnce(settings,
  "h('div', { 'data-dam-slot': 'list', 'data-dam-row': '' }, h('label', null, label), control),\n          hint ? h('div', { 'data-dam-slot': 'hint', 'data-dam-hint': '' }, hint) : null)",
  `h('div', { 'data-dam-slot': 'list', 'data-dam-row': '', className: 'i5-setting-field', 'data-wide': String(!!control && (control.type !== 'input' && control.type !== 'select' || control.props.type === 'text')) },
            h('div', { className: 'i5-setting-copy' }, h('label', null, shownLabel), plain ? h('div', { 'data-dam-hint': '' }, plain.summary) : hint ? (function () {
              if (typeof hint !== 'string') return h('div', { 'data-dam-slot': 'hint', 'data-dam-hint': '' }, hint)
              var cut = hint.indexOf('。'), tail = cut + 1
              if (cut < 0) { cut = hint.indexOf('. '); tail = cut + 2 }
              if (cut < 8 || cut >= hint.length - 2) return h('div', { 'data-dam-slot': 'hint', 'data-dam-hint': '' }, hint)
              var lead = hint.slice(0, tail)
              return h('div', { 'data-dam-slot': 'hint', 'data-dam-hint': '' }, h('span', { className: 'i5-hint-lead' }, lead), h('details', { className: 'i5-hint-more' }, h('summary', null, L('详细说明', 'Details')), h('span', null, hint.slice(tail))))
            })() : null),
            h('div', { className: 'i5-setting-control' }, control)))`)
const modeStart = settings.indexOf('      function onEngineModeChange(e) {')
const modeEnd = settings.indexOf('      var sectionLabels =', modeStart)
settings = settings.slice(0, modeStart) + `      function onEngineModeChange(e) {
        var v = e.target.value
        if (busy) return
        setBusy(true); setErr(''); setMsg('')
        saveConfigPatch({ semanticEngineMode: v }, {
          onSaved: function (d) {
            if (!i5Ok()) return
            i5Base.current = configOf(d)
            setCfg(Object.assign({}, configOf(d), i5Draft.current)); setBusy(false)
            setMsg(L('检索模式已即时生效', 'Retrieval mode saved immediately'))
            refreshSem(function (s) {
              if (!i5Ok()) return
              setSem(s)
              setGuide(v === 'js' && !s.ready ? 'js' : v === 'python' && !s.pythonInt8Present ? 'python' : '')
            })
          }, onError: function (e) { if (i5Ok()) { setErr(e.message); setBusy(false) } }
        })
      }
` + settings.slice(modeEnd)
settings = replaceOnce(settings,
  "function section(key, title, content) { return h('section', { id: 'dam-settings-' + key, 'data-dam-settings-group': '' }, h('h3', null, title), content) }",
  `var i5WelcomeControl = null
      function section(key, title, content) {
        if (key === 'window' && content[0] && content[0].props['data-i5-field'] === t('fPromptSections')) {
          var promptEntry = React.cloneElement(content[0], { 'data-i5-advanced-entry': 'true' })
          content = content.slice(2).concat([promptEntry, content[1]])
        }
        if (key === 'auto') content = content.filter(function (node) { if (node && node.props && node.props['data-i5-field'] === t('fWelcomeTour')) { i5WelcomeControl = node; return false } return true })
        if (key === 'look' && i5WelcomeControl) content = [i5WelcomeControl].concat(content)
        var hidden = i5GroupsDef[i5Group[0]].indexOf(key) < 0
        if (key === 'engine') {
          var mode = [], primary = [], advanced = [], support = []
          content.forEach(function (node) {
            if (!node) return
            var label = node.props && node.props['data-i5-field']
            if (label === t('semMode')) mode.push(node)
            else if (label === t('fAssocEngine') || label === t('fEmitMode')) primary.push(node)
            else if (label) advanced.push(node)
            else support.push(node)
          })
          return h('div', { id: 'dam-settings-' + key, className: 'i5-engine-grid', hidden: hidden },
            h(Iter5Card, { title: L('让 AI 想起相关的事', 'Recall relevant memories'), icon: 'pulse', hue: 'green' }, primary),
            h(Iter5Card, { className: 'i5-mode-card', title: L('如何查找记忆', 'How to find memories'), icon: 'search', hue: 'blue' }, mode),
            h('details', { className: 'i5-settings-advanced i5-setup-card', open: !!guide || detOpen }, h('summary', null, L('安装与检查查找工具', 'Install and check search tools')), support),
            h('details', { className: 'i5-settings-advanced' }, h('summary', null, L('进阶：回忆频率、准确度与索引维护', 'Advanced: recall frequency, matching and index maintenance')), advanced))
        }
        var titles = { window: L('把已有记忆交给 AI', 'Give AI existing memories'), capacity: L('记录对话与保留内容', 'Record conversations and keep content'), skills: L('从经历中积累可复用流程', 'Build reusable workflows'), handoff: L('长对话换窗口后继续', 'Continue long tasks in a new session'), auto: L('免打扰与定时整理', 'Quiet mode and scheduled upkeep'), store: L('记忆文件保存在哪里', 'Where memory files are stored'), look: L('显示与操作习惯', 'Display and interaction'), team: L('与团队共享记忆', 'Share memory with a team'), skin: L('自定义插画素材', 'Custom illustration assets') }
        title = titles[key] || title
        var common = { window: ['fInject', 'fBudget', 'fDays'], capacity: ['fAutoConsolidate', 'fConsolidate', 'fConsolidateMax'], skills: ['fMemoryHub', 'fProcInject', 'fProcRisk'], handoff: ['fHandoff', 'fAutoContinue'], auto: ['fAutoPopup', 'fUnattended', 'fUnattendedAuto', 'fAutoSum', 'fConsSchedule', 'fConsScheduleTime', 'fConsScheduleDays', 'fMaintSchedule', 'fMaintScheduleTime'], store: ['fMemoryRoot', 'fUserDir', 'fProjectDir'], look: ['fWelcomeTour', 'fLocale', 'fFontSize', 'fPanelPos'] }
        if (common[key]) {
          var basic = [], extra = [], extrasStarted = false
          content.forEach(function (node) {
            if (!node) return
            var label = node.props && node.props['data-i5-field']
            if (label) extrasStarted = !common[key].some(function (k) { return t(k) === label })
            ;(extrasStarted ? extra : basic).push(node)
          })
          if (key === 'capacity') basic.sort(function (a, b) { return common[key].map(t).indexOf(a.props['data-i5-field']) - common[key].map(t).indexOf(b.props['data-i5-field']) })
          content = basic.concat(extra.length ? [h('details', { className: 'i5-settings-advanced' }, h('summary', null, L('进阶选项：', 'Advanced: ') + title), extra)] : [])
        }
        var icons = { window: 'library', capacity: 'storage', skills: 'skills', handoff: 'handoff', auto: 'timeline', store: 'folder', look: 'settings', team: 'mindmap', skin: 'spark', about: 'note' }
        var subs = {}
        return h('section', { id: 'dam-settings-' + key, 'data-dam-settings-group': '', hidden: hidden }, h('h3', { className: 'i5-card-title' }, h('span', { className: 'i5-badge', 'data-hue': key === 'skills' ? 'green' : key === 'handoff' ? 'cyan' : key === 'auto' ? 'orange' : 'blue' }, h(Iter5Icon, { name: icons[key] || 'settings' })), h('span', { className: 'i5-card-title-txt' }, title, subs[key] ? h('span', { className: 'i5-card-sub' }, subs[key]) : null)), content)
      }`)
settings = replaceOnce(settings, "      return h('div', { 'data-dam-settings': '' },", `      return h('div', { 'data-dam-settings': '', 'data-i5-dirty': dirty ? 'true' : 'false' },
        h(Iter5Tabs, { id: 'i5-settings', label: L('设置分组', 'Settings groups'), value: i5Group[0], onChange: i5Group[1], items: [['engine', L('引擎', 'Engine')], ['memory', L('记忆', 'Memory')], ['appearance', L('外观与目录', 'Appearance & paths')], ['behavior', L('行为与维护', 'Behavior & maintenance')]].map(function (r) { return [r[0], r[1], Object.keys(i5Groups.current).some(function (k) { return i5Groups.current[k] === r[0] })] }) }),`)
settings = replaceOnce(settings, "h('div', { 'data-dam-settings-content': '' },", "h('div', { 'data-dam-settings-content': '', role: 'tabpanel', id: 'i5-settings-panel', 'aria-labelledby': 'i5-settings-tab-' + i5Group[0] }, iter5SettingsIntro(i5Group[0]),")
const radioOld = `h('select', { 'data-dam-select': '', style: { flex: 1 }, value: cfg.semanticEngineMode || 'auto', onChange: onEngineModeChange },
              h('option', { value: 'auto' }, t('semAuto')),
              h('option', { value: 'lexical' }, t('semLexOnly')),
              h('option', { value: 'js' }, t('semJs')),
              h('option', { value: 'python' }, t('semPy')))`
settings = replaceOnce(settings, radioOld, `h('div', { className: 'i5-engine-radios', role: 'radiogroup', 'aria-label': L('检索模式（即时生效）', 'Retrieval mode (immediate)') },
              [['auto', t('semAuto')], ['lexical', t('semLexOnly')], ['js', t('semJs')], ['python', t('semPy')]].map(function (r) { return h('label', { className: 'i5-engine-choice', key: r[0] }, h('input', { type: 'radio', name: 'i5-engine', value: r[0], checked: (cfg.semanticEngineMode || 'auto') === r[0], disabled: busy, onChange: onEngineModeChange }), h('span', null, r[1])) }))`)
// The wizard's shortcut uses the same immediate save path, never a separate draft write.
const shortcut = "setGuide(''); var n2 = Object.assign({}, cfg); n2.semanticEngineMode = guide; if (guide === 'js') { n2.activationSource = 'js'; n2.contextSinkMode = 'null' } else if (guide === 'python') { n2.activationSource = 'python'; n2.contextSinkMode = 'python' } setCfg(n2); setDirty(true)"
settings = replaceOnce(settings, shortcut, "onEngineModeChange({ target: { value: guide } })")
settings = replaceOnce(settings, "h('div', { 'data-dam-savebar': '' },", "h('div', { 'data-dam-savebar': '', role: 'status' },\n          h('button', { onClick: i5Cancel, disabled: busy || !dirty }, L('取消修改', 'Discard changes')),")
settings = replaceOnce(settings, 'onClick: save, disabled: busy', 'onClick: save, disabled: busy || !dirty')
// Save actions are a sibling of the scrolling content, never an overlay on a field.
const savebarStart = settings.indexOf("        h('div', { 'data-dam-savebar':")
const savebarEnd = settings.indexOf('        // 调试中心(折叠)', savebarStart)
if (savebarStart < 0 || savebarEnd < 0) throw Error('Settings savebar boundary not found')
const savebar = settings.slice(savebarStart, savebarEnd).trimEnd().replace(/,$/, '')
settings = settings.slice(0, savebarStart) + settings.slice(savebarEnd)
settings = replaceOnce(settings, "err ? h('div', { 'data-dam-error': '' }, err) : null))", "err ? h('div', { 'data-dam-error': '' }, err) : null),\n" + savebar + ')')
settings = replaceOnce(settings, "L('有未保存的更改', 'Unsaved changes')", "String(new Set(Object.keys(i5Groups.current).map(function (k) { return i5Groups.current[k] })).size) + L(' 个分区有未保存修改', ' sections with unsaved changes')")
settings = replaceOnce(settings, "apiPost(API.semanticEmit, { mode: m }).then(function () { refreshSem(setSem) }).catch(function () {})", "apiPost(API.semanticEmit, { mode: m }).then(function () { if (i5Ok()) refreshSem(setSem) }).catch(function (e) { if (i5Ok()) setErr(e.message) })")
settings = settings.replace("'tauHi 0.45 · tauLo 0.35 · deltaExp 0.03 · deltaPro 0.05'", "L('阈值由宿主校准策略管理；当前接口未提供有效数值', 'Thresholds are managed by the host policy; current values are unavailable')")
settings = replaceOnce(settings, "try { openDialog({ kind: 'welcomeTour' }) } catch (eTour) {}", "try { openManualWelcomeTourPre() } catch (eTour) {}")
// Avoid global selector collisions with the classic settings surface.
settings = replaceOnce(settings, "return h('div', { style: panelStyle }, kids)", `return h(Iter5Dialog, { title: L('子代理模型与思考强度', 'Subagent model and reasoning'), onClose: function () { setMdlOpen(false) } },
          h('div', { 'data-native-model-picker': '' }, kids.slice(1)),
          h('p', { className: 'i5-muted' }, L('选择会保留在设置草稿中，保存更改后生效。', 'Selections stay in the settings draft until you save changes.')))`)
settings = replaceOnce(settings, "key: '__default__', 'data-dam-slot'", "key: '__default__', 'aria-pressed': !cfg.subagentModel, 'data-dam-slot'")
settings = replaceOnce(settings, "key: p.id + '/' + m.id, 'data-dam-slot'", "key: p.id + '/' + m.id, 'aria-pressed': cfg.subagentModel === m.id && cfg.subagentProvider === p.id, 'data-dam-slot'")
settings = replaceOnce(settings, "key: 'eff-' + row[0] + '-' + (o[0] || 'def'), 'data-dam-slot'", "key: 'eff-' + row[0] + '-' + (o[0] || 'def'), 'aria-pressed': cur === o[0], 'data-dam-slot'")
settings = replaceOnce(settings, "key: '__manual__', 'data-dam-slot'", "key: '__manual__', 'aria-label': L('手动输入模型', 'Manual model ID'), 'data-dam-slot'")
settings = replaceOnce(settings, "browseOpen ? h('div', { style:", "browseOpen ? h(Iter5Dialog, { title: L('选择记忆目录', 'Choose memory directory'), onClose: function () { setBrowseOpen(false) } }, h('div', { 'data-native-path-browser': '', style:")
settings = replaceOnce(settings, "onClick: function () { setBrowseOpen(false) } }, t('close'))))\n            : null", "onClick: function () { setBrowseOpen(false) } }, t('close')))))\n            : null")
settings = replaceOnce(settings, "}, '📁 ' + d.name)", "}, h(Iter5Icon, { name: 'folder' }), d.name)")
settings = replaceOnce(settings, "return h('div', { style: { border: '1px solid color-mix(in srgb, var(--dam-accent, #2456c4) 40%, transparent)'", "return h('div', { 'data-native-engine-guide': guide, style: { border: '1px solid color-mix(in srgb, var(--dam-accent, #2456c4) 40%, transparent)'")
settings = settings.replaceAll("id: 'dam-settings-'", "id: 'i5-settings-section-'")
// Host settings stay native; workbench appearance controls belong in their named group.
settings = replaceOnce(settings, "h('div', { 'data-dam-settings-content': '',", "props && props.draftScope === 'host' && i5Group[0] === 'appearance' ? h('div', { className: 'i5-workbench-appearance' }, h('strong', null, L3('工作台外观', 'Workbench appearance', 'ワークベンチの外観')), h(Iter5StylePicker), h(Iter5ModePicker)) : null, h('div', { 'data-dam-settings-content': '',")
// Instance-local tabs/sections avoid collisions when host and workbench settings coexist.
settings = settings.replace('var i5Group = useState', "var i5SettingsId = useRef('i5-settings-' + (++iter5SettingsSequence)).current\n      var i5Group = useState")
settings = settings.replaceAll("'i5-settings'", 'i5SettingsId').replaceAll("'i5-settings-panel'", "i5SettingsId + '-panel'").replaceAll("'i5-settings-tab-'", "i5SettingsId + '-tab-'").replaceAll("'i5-settings-section-'", "i5SettingsId + '-section-'")
let storage = client.slice(client.indexOf('    function StorageTab(props) {'), client.indexOf('    function NotesTab() {'))
storage = replaceOnce(storage, 'function StorageTab(props)', 'function Iter5Storage(props)')
storage = storage.replaceAll(".then(function (r) { return r.json() })", ".then(function (r) { return r.json().then(function (j) { if (!r.ok || (j && j.error)) throw Error(j && (j.error || j.reason) || 'Request failed'); return j }) })")
storage = replaceOnce(storage, "      var delPair = useState('')", "      var deleteRequest = useState(null)\n      var delPair = useState('')")
storage = replaceOnce(storage, "      function act(action, payload, onDone) {\n        setMsg('')", `      function act(action, payload, onDone, confirmed) {
        if (action === 'delete' && !confirmed) { deleteRequest[1]({ payload: payload, onDone: onDone }); return }
        if (action === 'repair' && !window.confirm(L('确认仅重建以下文件的索引副本（正文不变）？', 'Rebuild index copies for these files? Source text is unchanged.') + '\\n' + (payload.items || []).map(function (s) { return s.file || s.sourceRef }).join('\\n'))) return
        setMsg('')`)
storage = replaceOnce(storage, "            setMsg(action + ': ' + reason)\n            if (onDone) onDone(j)", `            setMsg(action + ': ' + reason + (j && j.cascade ? ' · cascade: ' + JSON.stringify(j.cascade) : ''))
            if (j && j.ok !== false && onDone) onDone(j)`)
const sourcesStart = storage.indexOf("          (data.sources || []).map(function (s) {")
const sourcesEnd = storage.indexOf("          h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px' } },", sourcesStart)
if (sourcesStart < 0 || sourcesEnd < 0) throw Error('Storage source-list boundary not found')
storage = storage.slice(0, sourcesStart) + "          h(Iter5StorageSources, { data: data, act: act }),\n" + storage.slice(sourcesEnd)
const migrationStart = storage.indexOf('    var migOutPlaceholder = ')
const migrationEnd = storage.indexOf("    rows.push(h('div', { 'data-dam-slot': 'timeline', 'data-dam-flow': '' }, migRows))", migrationStart)
if (migrationStart < 0 || migrationEnd < 0) throw Error('Migration view boundary not found')
storage = storage.slice(0, migrationStart) + `    var migRows = h(Iter5Migration, {
      out: migOut, setOut: setMigOut, outPicking: migOutPicking,
      pickOut: function () { migPickInto(setMigOut, setMigOutPicking) }, onExport: function () { migExport() },
      pack: migPack, setPack: function (value) { setMigPack(value); setMigPlan(null); setMigResult(null) }, packPicking: migPackPicking,
      pickPack: function () { migPickInto(function (value) { setMigPack(value); setMigPlan(null); setMigResult(null) }, setMigPackPicking) },
      onPreview: function () { migPreview(migConflict) }, plan: migPlan, onCancelPreview: function () { setMigPlan(null) },
      conflict: migConflict, setConflict: function (value) { setMigConflict(value); migPreview(value) }, onApply: migApply,
      busy: migBusy, error: migErr, message: migNote, result: migResult
    })
` + storage.slice(migrationEnd)
storage = replaceOnce(storage, 'function migPreview() {', 'function migPreview(conflict) {')
storage = replaceOnce(storage, "apiPost(API.migrateInspect, { packPath: migPack, targetWs: currentWs() || undefined })", "apiPost(API.migrateInspect, { packPath: migPack, targetWs: currentWs() || undefined, onConflict: conflict || migConflict })")
storage = replaceOnce(storage, "return h('div', { 'data-dam-slot': 'timeline', 'data-dam-flow': '' }, rows)", `return h('div', { className: 'i5-storage-view i5-panel i5-instrument' }, h(Iter5Screws),
        deleteRequest[0] ? h(Iter5DeleteConfirmation, { payload: deleteRequest[0].payload, onClose: function () { deleteRequest[1](null) }, onConfirm: function () { var pending = deleteRequest[0]; deleteRequest[1](null); act('delete', pending.payload, pending.onDone, true) } }) : null,
        h('div', { className: 'i5-stats i5-stats-four' },
          h(Iter5Stat, { icon: 'storage', hue: 'blue', label: L('扫描来源', 'Scanned sources'), value: data.counts ? counts.total : null, hint: L('当前语料来源数', 'Current corpus sources') }),
          h(Iter5Stat, { icon: 'check', hue: 'green', label: L('索引一致', 'Consistent'), value: data.indexEnabled === false ? null : data.counts ? counts.ok : null, hint: data.indexEnabled === false ? L('索引尚未启用', 'Index disabled') : L('正文与索引校验一致', 'Source and index agree') }),
          h(Iter5Stat, { icon: 'pulse', hue: 'orange', label: L('等待修复', 'Needs repair'), value: data.indexEnabled === false ? null : data.counts ? counts.stale : null, hint: L('可以重建的索引副本', 'Rebuildable index copies') }),
          h(Iter5Stat, { icon: 'note', hue: 'purple', label: L('需人工检查', 'Needs inspection'), value: data.indexEnabled === false ? null : data.counts ? counts.unrepairable : null, hint: L('无法自动修复的来源', 'Sources needing manual review') })),
        h('div', { className: 'i5-maintenance-grid', 'data-dam-slot': 'timeline', 'data-dam-flow': '' }, rows.map(function (node, i) { return node && node.props && node.props.title === L('删除记忆(三联动)', 'Delete memory (cascading)') ? h('div', { key: i, className: 'i5-maintenance-danger' }, node) : node })))`)
let skills = client.slice(client.indexOf('    function MemoryHubTab(props) {'), client.indexOf('    function StorageTab(props) {'))
skills = replaceOnce(skills, 'function MemoryHubTab(props)', 'function Iter5Skills(props)')
skills = replaceOnce(skills, "      function hubAct(action, procedureId, v) {", `      function hubAct(action, procedureId, v) {
        var names = { promote: L('晋升技能', 'Promote skill'), approve: L('人工批准技能', 'Approve skill'), 'force-promote': L('强制晋升技能', 'Force promotion'), activate: L('激活技能', 'Activate skill'), deprecate: L('弃用技能', 'Deprecate skill') }
        if (names[action] && !window.confirm(names[action] + '？' + L('此操作将改变技能的可用状态。', 'This changes the skill availability.'))) return`)
skills = replaceOnce(skills, "h(SkinEmpty, { slot: 'empty.library', size: skinSlotSize('empty.library') }, t('hubSkillsEmpty'))", "h(Iter5Empty, { title: L('经验，会慢慢长成技能', 'Experience grows into skills'), text: t('hubSkillsEmpty') })")
skills = replaceOnce(skills, "return h('div', { 'data-dam-slot': 'timeline', 'data-dam-flow': '' }, rows)", `return h('div', { className: 'i5-skills-view i5-panel i5-instrument' }, h(Iter5Screws),
        h('div', { className: 'i5-stats i5-stats-four' },
          h(Iter5Stat, { icon: 'skills', hue: 'green', label: L('已生效技能', 'Active skills'), value: procs ? activeList.length : null, hint: L('可复用的工作方法', 'Reusable working methods') }),
          h(Iter5Stat, { icon: 'pulse', hue: 'orange', label: L('观察与审批', 'Under review'), value: procs ? pipeline.length : null, hint: L('等待积累或人工确认', 'Awaiting evidence or approval') }),
          h(Iter5Stat, { icon: 'library', hue: 'blue', label: L('事实记忆', 'Facts'), value: facts ? facts.size : null, hint: L('宿主提取的事实记录', 'Facts extracted by the host') }),
          h(Iter5Stat, { icon: 'timeline', hue: 'purple', label: L('经历记录', 'Episodes'), value: epis ? epis.size : null, hint: L('已有的执行与反馈经验', 'Recorded actions and outcomes') })),
        h(Iter5SkillBrowser, { active: activeList, pipeline: pipeline, rows: rows }))`)
let stats = client.slice(client.indexOf('function StatsTab() {'), client.indexOf('function WorkspaceTab() {'))
stats = replaceOnce(stats, 'function StatsTab()', 'function Iter5Stats()')
stats = replaceOnce(stats, "return h('div', null,\n    h(Card, { title: t('statsTitle') },", "return h('div', { className: 'i5-native-stats' },\n    h(Iter5StatsOverview, null,")
stats = replaceOnce(stats, "h('div', { style: { display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 4 } },", "h('div', { className: 'i5-native-stat-metrics' },")
stats = replaceOnce(stats, "return h(Card, { title: m.name },", "return h(Iter5Card, { title: m.name, icon: id === 'model' ? 'search' : id === 'inject' ? 'library' : 'recall', className: 'i5-native-stat-card', 'data-chan': id },")
stats = replaceOnce(stats, "      h('div', { style: { opacity: .72, fontSize: '12px', marginBottom: 2 } }, m.hint),", "      h('div', { className: 'i5-native-stat-hint' }, m.hint),")
// Zero-event channels used to repeat statsNoInject in all three cards; their own hint now carries the empty state.
stats = replaceOnce(stats, "        : h('div', { style: { opacity: .5, fontSize: '12px' } }, t('statsNoInject'))))", "        : ch.events ? h('div', { className: 'i5-native-stat-empty' }, t('statsNoInject')) : null))")
const readSkin = name => readFileSync(path.join(root, 'skins/iter5', name), 'utf8').replace(/\r\n/g, '\n')
const css = (readSkin('skin.css') + '\n' + readSkin('native-tour.css') + '\n' + readSkin('native-panel.css') + '\n' + readSkin('native-settings.css') + '\n' + readSkin('native-workbench.css') + '\n' + readSkin('native-library.css') + '\n' + readSkin('native-operations.css') + '\n' + readSkin('native-secondary.css') + '\n' + readSkin('style-variants.css')).trim()
  .replace('[data-iter5]{--i5-blue:', '[data-iter5],[data-dam-theme]{--i5-blue:')
  .replace('[data-iter5][data-deep=true]{--i5-blue:', '[data-iter5][data-deep=true],[data-dam-theme][data-deep=true],[data-dam-theme][data-deep=true] [data-iter5]{--i5-blue:')
const ui = readSkin('style-choice.js').trimEnd() + '\n' + readSkin('alternate-home.js').trimEnd() + '\n' + readSkin('ui.js').trimEnd() + '\n' + readSkin('views.js').trimEnd() + '\n' + readSkin('surfaces.js').trimEnd() + '\n' + readSkin('native-panel.js').trimEnd() + '\n' + readSkin('native-workbench.js').trimEnd() + '\n' + readSkin('native-search.js').trimEnd() + '\n' + readSkin('native-skills.js').trimEnd() + '\n' + readSkin('native-storage.js').trimEnd() + '\n' + readSkin('native-team.js').trimEnd() + '\n' + readSkin('native-map.js').trimEnd() + '\n' + readSkin('native-messages.js').trimEnd()
settings = settings.replace("L('引擎', 'Engine')", "L('查找与回忆', 'Find & recall')").replace("L('记忆', 'Memory')", "L('记录与使用', 'Record & use')").replace("L('行为与维护', 'Behavior & maintenance')", "L('接续与维护', 'Continue & maintain')")
settings = settings.replace("L('shadow 只记录', 'shadow (record only)')", "L('只观察，不交给 AI', 'Observe only; do not supply to AI')").replace("L('canary 显式回忆注入', 'canary (explicit recall)')", "L('明确要求回忆时提供', 'Supply on explicit recall requests')").replace("L('active 全部注入', 'active (all)')", "L('主动提供相关记忆', 'Proactively supply matching memories')")
settings = settings.replace("L('balanced 3×40', 'balanced 3×40')", "L('平衡：3 条 × 40 字符', 'Balanced: 3 × 40 characters')").replace("L('dense 6×20', 'dense 6×20')", "L('广泛：6 条 × 20 字符', 'Broad: 6 × 20 characters')").replace("L('custom 自定义', 'custom')", "L('自定义', 'Custom')")
settings = settings.replace("['lexical', t('semLexOnly')], ['js', t('semJs')], ['python', t('semPy')]", "['lexical', L('按关键词查找（无需下载模型）', 'Keywords (no model download)')], ['js', L('按意思查找（需本地模型）', 'Meaning (requires a local model)')], ['python', L('Python 搜索工具（需单独安装）', 'Python search tools (separate setup)')]")
const generated = begin + '\n    var ITER5_CSS = ' + JSON.stringify(css) + '\n' + ui + '\n' + readSkin('settings-copy.js') + '\n' + settings + storage + skills + stats + end + '\n'
const seam = '    // ===================== dam-skin:end (v4) ====================='
client = replaceOnce(client, seam, generated + seam)
// Only the opt-in skin mount and its stylesheet gain the new implementation.

client = client.replace("h(DamSkinV4Page, { nonce: nonce, onExit:", "h(Iter5Page, { nonce: nonce, onExit:")
client = client.replace('try { ensureStyle() } catch', "try { ensureStyle(); if (damSkinActive() === 'v4') damSkinEnsureCss() } catch")
// Upstream welcome branch called a hook after its early return, causing React #310
// on first replay. Keep the hook unconditional; all tour actions stay unchanged.
if (!/function DialogHost\(\) \{[\s\S]{0,1800}?var tourDeep = use(?:Iter5|Deep)Theme\(\)/.test(client)) client = client.replace('function DialogHost() {\n      var tickPair = useTick()', 'function DialogHost() {\n      var tourDeep = useDeepTheme()\n      var tickPair = useTick()')
client = client.replace("tourStep === 0 ? h(SkinHero, { slot: 'hero.welcome', deep: useDeepTheme() })", "tourStep === 0 ? h(SkinHero, { slot: 'hero.welcome', deep: tourDeep })")
// Welcome artwork must follow the same explicit light/dark preference as its portal.
client = client.replace('var tourDeep = useDeepTheme()', 'var tourDeep = useIter5Theme()')
const output = client.replace(/\n/g, newline)
if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8') !== output) throw new Error('Embedded iter5 skin is stale; run node tools/build-iter5-skin.mjs')
  console.log('iter5 bundle source is up to date')
} else {
  writeFileSync(file, output)
  console.log('Embedded iter5 skin (' + Buffer.byteLength(generated) + ' bytes)')
}
