# 安全访问原语 规范

> 本片是**纯重构**：规格不是新功能，而是「改完之后必须仍然成立的不变量」。

### Requirement: 系统必须保持 toText 的返回值不变

#### Scenario: 普通字符串原样返回
- **GIVEN** 输入是字符串 `'abc'`
- **WHEN** 调用 `toText('abc')`
- **THEN** 返回 `'abc'`

#### Scenario: 前后空白不被裁剪
- **GIVEN** 输入是字符串 `'  x  '`
- **WHEN** 调用 `toText('  x  ')`
- **THEN** 返回 `'  x  '`（与 `team-transport.js` 的 trim 版区分）

#### Scenario: null 与 undefined 均得空串
- **GIVEN** 输入是 `null`
- **WHEN** 调用 `toText(null)`
- **THEN** 返回 `''`

#### Scenario: 数字被转为字符串
- **GIVEN** 输入是数字 `0`
- **WHEN** 调用 `toText(0)`
- **THEN** 返回 `'0'`（不是空串——`0` 是合法值）

#### Scenario: 布尔值被转为字符串
- **GIVEN** 输入是 `false`
- **WHEN** 调用 `toText(false)`
- **THEN** 返回 `'false'`

---

### Requirement: 系统必须保持 safeGet 在 getter 抛错时外抛不回

#### Scenario: getter 抛错时返回 undefined
- **GIVEN** holder 的属性 `a` 是一个抛 `Error` 的 getter
- **WHEN** 调用 `safeGet(holder, 'a')`
- **THEN** 返回 `undefined` 且不抛出

#### Scenario: holder 为 null 时返回 undefined
- **GIVEN** holder 是 `null`
- **WHEN** 调用 `safeGet(null, 'a')`
- **THEN** 返回 `undefined`

#### Scenario: 正常属性原样返回
- **GIVEN** holder 是 `{ a: 1 }`
- **WHEN** 调用 `safeGet({ a: 1 }, 'a')`
- **THEN** 返回 `1`

---

### Requirement: 系统必须保持 safeDiag 不放大诊断回调的异常

#### Scenario: 回调抛错时不影响主流程
- **GIVEN** 传入的 diag 是一个抛 `Error` 的函数
- **WHEN** 调用 `safeDiag(diag, 'msg')`
- **THEN** 不抛出异常

#### Scenario: 非函数诊断回调被静默忽略
- **GIVEN** 传入的 diag 是 `undefined`
- **WHEN** 调用 `safeDiag(undefined, 'msg')`
- **THEN** 不抛出异常

---

### Requirement: 系统必须保持 safeMessage 的降级链

#### Scenario: Error 实例取其 message
- **GIVEN** 输入是 `new Error('boom')`
- **WHEN** 调用 `safeMessage(error)`
- **THEN** 返回 `'boom'`

#### Scenario: 无 message 时回落为 unknown-error
- **GIVEN** 输入是 `{}`
- **WHEN** 调用 `safeMessage({})`
- **THEN** 返回 `'unknown-error'`

---

### Requirement: 系统必须不再有跨文件重复的安全原语实现

#### Scenario: 两个调用模块均从同一模块导入
- **GIVEN** 仓库处于本变更应用后的状态
- **WHEN** 运行 `sdd-guard check --only DRY-C1 --code lib`
- **THEN** 报告里不再出现 `team-auth.js ↔ team-identity.js` 这一文件对
