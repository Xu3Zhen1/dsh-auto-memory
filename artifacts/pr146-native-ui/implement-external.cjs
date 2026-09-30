const fs=require('node:fs'),file='skins/iter5/views.js'
let s=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')
const start=s.indexOf("      return h('div',{className:'i5-external-view'},"),end=s.indexOf('    var iter5NoteDrafts',start)
if(start<0||end<0)throw Error('External view boundary missing')
s=s.slice(0,start)+`      return h('div',{className:'i5-external-view'},
        h('div',{className:'i5-info-callout'},h(Iter5Icon,{name:'handoff'}),h('div',null,h('h2',null,L('接入外部来源','Connect external sources')),h('p',null,L('查看已发现的工具记忆，按用户级或项目级接入。','Review discovered tool memories and import them to user or project memory.'))),h('button',{onClick:response.retry,disabled:busy[0]},L('重新扫描','Rescan'))),
        response.error?h(Iter5Error,{error:response.error,retry:response.retry}):null,
        message[0]?h('p',{className:'i5-success',role:'status'},message[0]):null,error[0]?h(Iter5Error,{error:error[0]}):null,
        response.loading?h(Loading):sources.length?h('div',{className:'i5-external-columns'},
          h('section',{className:'i5-card i5-external-index','aria-label':L('外部来源列表','External source list')},h('h2',null,L('我的来源','My sources'),' (',sources.length,')'),
            sources.map(function(s){return h('div',{className:'i5-external-source',key:s.id,'data-selected':String(id===s.id)},
              h('button',{className:'i5-external-select','aria-current':id===s.id?'true':undefined,onClick:function(){selected[1](s.id);search[1]('')}},h(Iter5Icon,{name:s.kind==='sessions'?'timeline':'folder'}),h('div',null,h('strong',null,s.name),h('small',null,s.tool),h('span',{className:'i5-tag'},s.importedUser||s.importedNotes?L('已接入','Imported'):L('已发现','Discovered')))),
              h('button',{className:'i5-source-toggle',role:'switch','aria-label':L('启用来源：','Enable source: ')+s.name,'aria-checked':s.enabled!==false,disabled:busy[0],onClick:function(){toggle(s)}},h('i')))}),
            h('button',{className:'i5-primary-soft',disabled:busy[0]||!sources.length,onClick:function(){act(async function(){var rows=sources.filter(function(s){return s.kind!=='sessions'&&s.enabled!==false});for(var i=0;i<rows.length;i++){var r=await apiPost(API.externalImport,{source:rows[i].id,target:'project'});if(r&&(r.ok===false||r.error))throw Error(r.error||r.reason)}return{result:L('已接入来源数：','Imported sources: ')+rows.length}})}},L('接入全部可用来源','Import all available'))),
          source?h(Iter5Card,{className:'i5-external-detail'},h('div',{className:'i5-section-heading'},h('h2',null,h(Iter5Icon,{name:'folder'}),source.name),h('span',{className:'i5-tag'},L('只读来源','Read-only source'))),
            h('div',{className:'i5-source-meta'},h('span',null,source.tool||''),h('span',null,source.kind==='sessions'?String(source.fileCount===undefined?'—':source.fileCount)+L(' 个会话文件',' session files'):L('记忆文件','Memory file'))),
            h('div',{className:'i5-external-content'},detail.error?h(Iter5Error,{error:detail.error,retry:detail.retry}):detail.loading?h(Loading):h(Iter5Document,{text:detail.data&&detail.data.content||L('该来源没有可展示的内容。','No displayable content in this source.')})),
            h('div',{className:'i5-info-callout'},h(Iter5Icon,{name:'check'}),h('p',null,L('接入会复制记忆片段；移除只处理已导入的片段，不删除原始来源文件。','Import copies memory passages. Removal affects imported passages, never original source files.'))),
            h('div',{className:'i5-handoff-actions'},source.kind!=='sessions'?h(React.Fragment,null,h('button',{className:'i5-primary-soft',disabled:busy[0],onClick:function(){source.importedUser?removeOne('user'):importOne('user')}},source.importedUser?L('移除用户级接入','Remove user import'):L('接入用户级记忆','Import to user memory')),h('button',{className:'i5-primary',disabled:busy[0],onClick:function(){source.importedNotes?removeOne('project'):importOne('project')}},source.importedNotes?L('移除项目接入','Remove project import'):L('接入项目笔记','Import to project notes'))):null,h('button',{disabled:busy[0],onClick:findSource},L('在记忆中查找','Find in memory'))),search[0]?h('div',{className:'i5-info-callout'},h(Iter5Document,{text:search[0]})):null):null)
          :h(Iter5Empty,{title:L('尚未发现外部记忆','No external memory discovered'),text:L('安装或使用支持的工具后，重新扫描即可查看可用来源。','Rescan after using a supported tool to discover its memory.')}))
    }
`+s.slice(end)
fs.writeFileSync(file,s)
