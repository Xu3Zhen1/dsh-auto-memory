const fs=require('node:fs'),file='lib/client.js'
let source=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')
function region(startMarker,endMarker,body,offset=0){const start=source.indexOf(startMarker,offset),end=source.indexOf(endMarker,start);if(start<0||end<0)throw Error(startMarker);source=source.slice(0,start)+body+source.slice(end)}
const dialogStart=source.indexOf('    function DialogHost() {')
region('        var noticeChildren = [',"      if (dialogState.kind === 'welcomeBack')",`        return h(Iter5Notice, { kind: 'notice', title: nTitle, message: nMsg, actions: [
          n.link ? h('a', { href: n.link, target: '_blank', rel: 'noreferrer' }, t('noticeOpen')) : null, noticeButton] })
      }
`,dialogStart)
region("      if (dialogState.kind === 'welcomeBack')", "      if (dialogState.kind === 'semSetup')",`      if (dialogState.kind === 'welcomeBack') {
        return h(Iter5Notice, { kind: 'welcomeBack', title: t('awayTitle'), message: t('awayMsg'), actions: [
          h('button', { 'data-dam-btn': '', onClick: closeDialog }, t('gotIt')),
          h('button', { 'data-dam-btn': '', 'data-primary': 'true', onClick: function () { closeDialog(); controller.open() } }, L('打开记忆', 'Open memory'))] })
      }
      if (dialogState.kind === 'summary') return h(Iter5Summary, { summary: dialogState.summary || {}, onClose: closeDialog })
`,dialogStart)
region('      var versions = dialogState.versions || []', '    // ───────────────────────── 设置页',`      var versions = dialogState.versions || []
      var lastV = versions.length ? versions[versions.length - 1].version : ''
      return h(Iter5Update, { versions: versions, version: dialogState.currentVersion || lastV, onClose: function () {
        try { var seenV = (dialogState && dialogState.currentVersion) || lastV; if (seenV) localStorage.setItem('dsh-auto-memory.seenVersion', seenV) } catch (eX) {}
        closeDialog()
      } })
    }

`,dialogStart)
const autoStart=source.indexOf('    function AutoContinueHost() {')
region("        var closeRow = h('div'", '      return null\n    }',`        return h(Iter5AutoContinue, { confirmation: acConfirm, countdown: acCd, status: acSt,
          executing: !!(acState && acState.executing), onDismiss: dismissAcSt, onAgree: onAgree, onReject: onReject })
      }
`,autoStart)
fs.writeFileSync(file,source.replace(/\n/g,'\r\n'))
