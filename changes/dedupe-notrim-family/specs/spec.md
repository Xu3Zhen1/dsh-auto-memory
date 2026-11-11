# notrim 家族安全访问原语 规范

### Requirement: 系统必须让 notrim 版 toText 保留前后空白

#### Scenario: 带空白的字符串
- **GIVEN** 输入是字符串 `'  x  '`
- **WHEN** 调用 `toText('  x  ')`
- **THEN** 返回 `'  x  '`

#### Scenario: 纯空白字符串
- **GIVEN** 输入是字符串 `'  '`
- **WHEN** 调用 `toText('  ')`
- **THEN** 返回 `'  '`（不是空串）

#### Scenario: 非字符串路径也不裁剪
- **GIVEN** 输入是一个 `toString()` 返回 `'  x  '` 的对象
- **WHEN** 调用 `toText(obj)`
- **THEN** 返回 `'  x  '`

> 最后这条是**负控实测逼出来的缺口**：字符串走提前返回，只测字符串时
> "给 `String(value)` 加 `.trim()`"是等价变异、永远不红。必须覆盖 `String()` 分支。

---

### Requirement: 系统必须让 notrim 版 safeGet 只挡 null/undefined

#### Scenario: 空串 holder 的继承属性可读
- **GIVEN** holder 是空串 `''`
- **WHEN** 调用 `safeGet('', 'length')`
- **THEN** 返回 `0`

#### Scenario: falsy holder 的原型方法可读
- **GIVEN** holder 是 `false`
- **WHEN** 调用 `safeGet(false, 'toString')`
- **THEN** 返回一个函数（不是 `undefined`）

#### Scenario: null holder
- **GIVEN** holder 是 `null`
- **WHEN** 调用 `safeGet(null, 'a')`
- **THEN** 返回 `undefined`

---

### Requirement: 系统必须保持两套原语的语义差异（防合并）

#### Scenario: 两份 toText 对空白输入结论相反
- **GIVEN** 输入是 `'  x  '`
- **WHEN** 分别调用 notrim 版与 trim 版 `toText`
- **THEN** 两者返回值不相等

#### Scenario: 两份 safeGet 对 falsy holder 结论不同
- **GIVEN** holder 是空串 `''`、key 是 `'length'`
- **WHEN** 分别调用 notrim 版与 truthiness 版 `safeGet`
- **THEN** 两者返回值不相等

#### Scenario: 两版在应当一致的输入上必须一致
- **GIVEN** holder 是 `{ a: 1 }`、key 是 `'a'`
- **WHEN** 分别调用两版 `safeGet`
- **THEN** 两者都返回 `1`（防止"为了不同而不同"）

---

### Requirement: 系统必须不再有跨文件的 notrim 原语重复实现

#### Scenario: 判据下降
- **GIVEN** 仓库处于本变更应用后的状态
- **WHEN** 运行 `sdd-guard check --only DRY-C1 --code lib`
- **THEN** 三个文件之间的 6 处重复块消失
