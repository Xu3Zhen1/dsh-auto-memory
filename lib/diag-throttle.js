/**
 * diag-throttle —— 诊断上报的**节流判据单一实现处**。
 *
 * ★2026-11-12（切片 `changes/dedupe-diag-throttle`）：本模块是纯提取，**零行为变更**。
 *   提取前 `lib/evidence-store.js` 与 `lib/shadow-host.js` 各自私有实现了同一套
 *   模块级节流表 + `shouldReportDiag(key)`（规范化后逐字节相同），`DRY-C1` 报 4 处重复块。
 *
 * 语义（两侧原注释一致，此处为唯一权威表述）：
 *   · **首条立即透出**，窗口内同一 key 的重复上报被压掉；
 *   · 表放**模块级**而非实例级/闭包级 ⇒ 同进程多实例共享同一张表，不会各自持一份而双写；
 *   · **计时失败 fail-open**：`Date.now()` 抛错时返回 true（放行）而不是压掉。
 *
 * 为什么 fail-open（这条最容易被"优化"错）：
 *   节流是**可观测性**设施，不是业务门禁。计时异常时若压制诊断，等于在最需要留痕的时刻
 *   静默失声 —— 与本仓「任何缺失必须留痕，不许静默回落」的纪律正相反。宁可刷屏，不可漏报。
 *
 * ⚠️ key 命名契约：调用方必须以**子系统前缀**命名 key（现为 `evidence:*` / `shadow:*`）。
 *   共享一张表是**有意**的（两处原注释都写着"语义同 index.js 的 diagThrottled"），
 *   前缀保证不同子系统互不压制。新增子系统时沿用前缀，不要另建一张表。
 *
 * ⚠️ 与 `lib/index.js` 的 `diagThrottled` **同语义但未合并**：`index.js` 被 r26 哈希锁钉住，
 *   并入需重钉锁，会把纯提取与锁值变更混进同一 diff。该收口留给独立切片。
 */

/** 节流窗口（毫秒）：5 分钟。首条立即透出，窗口内重复压掉。 */
const DIAG_THROTTLE_MS = 300000

/** 模块级表：key → 上次放行时刻（epoch ms）。多实例共享。 */
const _lastReportAt = new Map()

/**
 * 判断某条诊断本次是否应当上报。
 *
 * @param {string} key 诊断键（须带子系统前缀，如 `shadow:no-paths`）
 * @returns {boolean} true = 应当上报（并已登记本次时刻）；false = 窗口内重复，压掉
 */
export function shouldReportDiag(key) {
  try {
    const now = Date.now()
    if (now - (Number(_lastReportAt.get(key)) || 0) < DIAG_THROTTLE_MS) return false
    _lastReportAt.set(key, now)
  } catch (_) { /* 计时失败不阻断上报：fail-open 见头注 */ }
  return true
}
