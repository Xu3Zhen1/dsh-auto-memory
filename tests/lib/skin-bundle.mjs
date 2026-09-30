/**
 * skin-bundle.mjs — 皮肤生成区与经典档的**边界定义**（单一真源，测试共用）。
 *
 * 背景（2026-09-28 集成社区作者 iter5 皮肤）：
 *   `lib/client.js` 里有一段由 `tools/build-iter5-skin.mjs` 生成的受控区间
 *   （`// ITER5-GENERATED:BEGIN` … `// ITER5-GENERATED:END`）。生成器会把若干经典组件
 *   **派生**一份新皮肤版本放进该区间（`SettingsPage`→`Iter5Settings`、`StorageTab`→`Iter5Storage`、
 *   `MemoryHubTab`→`Iter5Skills`），并额外注入 `skins/iter5/` 的全部源码。
 *
 * 为什么测试需要它：
 *   一批守卫断言的是**经典档契约**（例如「`section(team)` 全仓恰 1 次」「检测面板容器全仓唯一」
 *   「设置页占位默认 24000」）。集成 iter5 后这些字符串在生成区里又出现了一份（派生版本），
 *   于是「全仓计数」翻倍 ⇒ 假红。**这不是功能坏了**，而是旧守卫没意识到新架构。
 *
 * 判据（不是「放宽断言」，而是「把断言限定到它真正该守的作用域」）：
 *   经典档契约只对**非生成区**成立；生成区是第三方皮肤源码，属于皮肤自己的验收范围
 *   （由 `tests/smoke/smoke-test-iter5-skin.mjs` 覆盖，它带「剥离生成区后与基线逐字节一致」的守恒断言）。
 *
 * 用法：
 *   import { stripGeneratedSkin, GENERATED_BEGIN, GENERATED_END } from '../lib/skin-bundle.mjs'
 *   const SRC = stripGeneratedSkin(readFileSync('lib/client.js', 'utf8'))
 *
 * 注意：**不要**用它去替代「经典档零改动」的验证——那条由 iter5 自己的摘要守恒断言负责，
 *   它比对的是「剥离生成区后的完整内容」，比逐条计数强得多。
 */

export const GENERATED_BEGIN = '    // ITER5-GENERATED:BEGIN'
export const GENERATED_END = '    // ITER5-GENERATED:END'

/** 生成区及其前后换行的剥离正则（CRLF/LF 都吃；区间缺失时原样返回）。 */
const REGION_RE = /[ \t]*\/\/ ITER5-GENERATED:BEGIN[\s\S]*?\/\/ ITER5-GENERATED:END\r?\n?/

/**
 * 去掉 `lib/client.js` 的 iter5 生成区，返回**经典档**源码。
 * 作用域：只服务「断言经典档契约」的守卫；皮肤自身的验收不要用它。
 * @param {string} source client.js 全文
 * @returns {string} 剥离生成区后的源码（无生成区时原样返回）
 */
export function stripGeneratedSkin(source) {
  const text = String(source || '')
  if (!text.includes(GENERATED_BEGIN)) return text
  return text.replace(REGION_RE, '')
}
