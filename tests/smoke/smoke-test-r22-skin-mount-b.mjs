/** R22 运行时验收（真调用 SkinBackdrop/SkinSyncIllust + 深浅色链路）。 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

/** 平台无关行尾守恒：存在 CRLF 时不得有裸 LF；全 LF 合法（CI/Linux 检出态）。
 *  ★2026-09-28：原断言写作 cnt(NL)===cnt(CRNL)（即"必须全 CRLF"），在 Linux CI 上必红——
 *  索引里是 LF，本机 core.autocrlf=true 才检出 CRLF。守的语义不变：文件不得混合行尾。 */
const damNoMixedEol = (s) => {
  const crlf = (s.match(/\r\n/g) || []).length
  const lf = (s.match(/\n/g) || []).length
  if (crlf === 0) return true      // 全 LF：合法（CI 检出态）
  return crlf === lf               // 有 CRLF 则不得再有裸 LF
}
const damPath = (rel) => fileURLToPath(new URL('../../' + rel, import.meta.url))
const SRC = readFileSync(damPath('lib/client.js'), 'utf8');
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m) } };
const eq = (a, b, m) => ok(Object.is(a, b), m + ' [got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b) + ']');
const cnt = (s, x) => s.split(x).length - 1;
const MEND = '    // ===================== S2-skin:end =====================';
const MBEG = '    // ===================== S2-skin:begin =====================';
const iS = SRC.indexOf(MBEG), iE = SRC.indexOf(MEND);
eq(cnt(SRC, MEND), 1, 'A1 ★段结束标记恰 1 处（R21 遗留重复已修）');
const SEG = SRC.slice(iS, iE);
ok(SEG.length > 5000, 'A2 S2 段字节 (' + SEG.length + ')');
// ★段内必须含 R21 + R22 的全部新函数（这才是「段真的长大」的判据，不用裸阈值）
ok(['function SkinImg','function SkinSlot','function SkinEmpty','function SkinHero','function SkinBackdrop','function SkinSyncIllust','function useDeepTheme','function readHostDeep'].every((x) => SEG.includes(x)), 'A2b ★R21+R22 全部新函数都在 S2 段内');
eq(cnt(SRC, 'h(SkinBackdrop,'), 1, 'A3 ★bg.mindmap 真实挂载 = 1');
eq(cnt(SRC, 'h(SkinSyncIllust,'), 1, 'A4 ★illust.sync 真实挂载 = 1');
ok(SRC.includes("pointerEvents: 'none'"), 'A5 ★背景层可交互穿透');
ok(cnt(SRC, 'dam-bg-deep') >= 2, 'A6 ★深色底 token（53 卷可读性前提）');
eq((SRC.match(/(?<!function )MEMORY_TABS\(\)/g) || []).length, 2, 'A7 计数锁不变');
ok(damNoMixedEol(SRC), 'A8 纯 CRLF');
ok(!/\.png|\.webp/.test(SEG), 'A9 纪律一：S2 段零路径字面量');
// ★真执行 + 真调用
const h = function (type, props) { const rest = Array.prototype.slice.call(arguments, 2), kids = [];
  const push = (k) => { if (k === null || k === undefined || k === false) return; if (Array.isArray(k)) { k.forEach(push) } else kids.push(k) };
  rest.forEach(push); return { __el: true, type: type, props: props || {}, kids: kids }; };
let deepReturn = false;
const sb = { console: console, h: h, locale: 'zh', String: String, Date: Date,
  useState: (v) => [typeof v === 'function' ? v() : v, function () {}],
  useEffect: function () {}, API: { skinAsset: '/x' } };
sb.globalThis = sb;
const ctx = vm.createContext(sb);
vm.runInContext(SEG + ';globalThis.__R = { SkinBackdrop: SkinBackdrop, SkinSyncIllust: SkinSyncIllust, readHostDeep: readHostDeep, useDeepTheme: useDeepTheme };', ctx, { filename: 'client.js#S2' });
const R2 = sb.__R;
ok(!!R2, 'B1 S2 段在 vm 中真执行成功（含 R22 新段）');
const bd = R2.SkinBackdrop({ slot: 'bg.mindmap' });
eq(bd.props['data-dam-skin-backdrop'], 'bg.mindmap', 'B2 ★SkinBackdrop 真返回锚点');
ok(bd.props.style && bd.props.style.pointerEvents === 'none', 'B3 ★背景层 style 真含 pointerEvents none');
eq(bd.props.style.position, 'absolute', 'B4 背景层绝对定位');
eq(bd.props['data-dam-skin-deep'], 'light', 'B5 ★无 DOM 环境 ⇒ fail-safe 回浅色');
eq(R2.readHostDeep(), false, 'B6 ★readHostDeep 无 document ⇒ false（安全默认）');
const si = R2.SkinSyncIllust({});
eq(si.props['data-dam-skin-illust'], 'illust.sync', 'B7 ★SkinSyncIllust 真返回锚点');
eq(si.props['data-dam-skin-deep'], 'light', 'B8 ★同步插画同样 fail-safe 浅色');
// ★负路径：模拟暗色主题
sb.document = { documentElement: { getAttribute: (k) => (k === 'data-dsh-theme' ? 'dark' : null), classList: { contains: () => false } } };
eq(R2.readHostDeep(), true, 'C1 ★负路径对照：暗色标记 ⇒ true');
const bd2 = R2.SkinBackdrop({ slot: 'bg.mindmap' });
eq(bd2.props['data-dam-skin-deep'], 'dark', 'C2 ★★暗色下背景层取深色（53 卷可读性）');
sb.document = { documentElement: { getAttribute: () => { throw new Error('boom') }, classList: null } };
eq(R2.readHostDeep(), false, 'C3 ★★负路径：读主题抛错 ⇒ fail-safe false（不崩）');
console.log('lib/client.js ' + Buffer.byteLength(SRC, 'utf8') + 'B / CRLF ' + (SRC.match(/\r\n/g) || []).length + ' / sha16 ' + createHash('sha256').update(SRC).digest('hex').slice(0, 16).toUpperCase());
console.log('PASS ' + pass + ' / FAIL ' + fail);
fails.forEach((f) => console.log('  FAIL: ' + f));
process.exit(fail === 0 ? 0 : 1);