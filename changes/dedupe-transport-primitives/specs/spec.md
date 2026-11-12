# 传输层纯函数 规范

### Requirement: 系统必须让两个传输后端共用同一组纯函数实现

#### Scenario: 判据下降
- **GIVEN** 仓库处于本变更应用后的状态
- **WHEN** 运行 `sdd-guard check --only DRY-C1 --code lib`
- **THEN** `team-transport.js ↔ team-transport-http.js` 的重复块消失

#### Scenario: 键语义三后端一致
- **GIVEN** 相同的 `prefix` 与 `key`
- **WHEN** 分别经 S3Backend / MemoryBackend / HttpBackend 存取
- **THEN** 三者使用的存储键逐字节相同

---

### Requirement: 系统必须保持键语义函数的返回值不变

#### Scenario: trimSlashes 去首尾斜杠
- **GIVEN** 输入 `'//a/b//'`
- **WHEN** 调用 `trimSlashes`
- **THEN** 返回 `'a/b'`

#### Scenario: trimSlashes 对空值
- **GIVEN** 输入 `null`
- **WHEN** 调用 `trimSlashes`
- **THEN** 返回 `''`

#### Scenario: withPrefix 正常拼前缀
- **GIVEN** `prefix = 'team'`、`key = '/a/'`
- **WHEN** 调用 `withPrefix`
- **THEN** 返回 `'team/a'`

#### Scenario: withPrefix 前缀为空
- **GIVEN** `prefix = ''`、`key = 'a'`
- **WHEN** 调用 `withPrefix`
- **THEN** 返回 `'a'`（不产生前导斜杠）

#### Scenario: withPrefix 键为空
- **GIVEN** `prefix = 'team'`、`key = ''`
- **WHEN** 调用 `withPrefix`
- **THEN** 返回 `'team'`（不产生尾随斜杠）

#### Scenario: withoutPrefix 是 withPrefix 的逆
- **GIVEN** `prefix = 'team'`、`stored = 'team/a'`
- **WHEN** 调用 `withoutPrefix`
- **THEN** 返回 `'a'`

#### Scenario: withoutPrefix 不误剥非本前缀
- **GIVEN** `prefix = 'team'`、`stored = 'other/a'`
- **WHEN** 调用 `withoutPrefix`
- **THEN** 返回 `'other/a'`（原样，不剥）

---

### Requirement: 系统必须保持值归一化与全序比较的行为

#### Scenario: toBuffer 对四种入参
- **GIVEN** 入参为 `Buffer` / `Uint8Array` / 字符串 / 数字
- **WHEN** 调用 `toBuffer`
- **THEN** 分别返回原 Buffer、等值 Buffer、utf8 Buffer、数字的 utf8 Buffer

#### Scenario: compareKeys 是全序（非 locale）
- **GIVEN** 任意两个键
- **WHEN** 调用 `compareKeys`
- **THEN** 相同返回 `0`；按码元序小于返回 `-1`；大于返回 `1`
- **AND** 不依赖 `localeCompare`（跨机收敛要求全序）

---

### Requirement: 系统必须保持 HTTP 后端的依赖红线（I4 递归版）

#### Scenario: 零第三方依赖
- **GIVEN** `lib/team-transport-http.js`
- **WHEN** 解析其全部 import
- **THEN** 无裸包名（第三方），且 `node:` 仅 `node:http` / `node:https`

#### Scenario: 本地依赖链零 IO
- **GIVEN** `lib/team-transport-http.js` 的全部本地 import
- **WHEN** 递归遍历整条依赖链
- **THEN** 链上任何模块均无写/删调用，且**均不 import 具备 IO/网络能力的内置**
   （防 `import { writeFileSync as __wf }` 这类别名逃逸）

#### Scenario: 无反向依赖（TDZ 真不变量）
- **GIVEN** 同一条依赖链
- **WHEN** 检查链上模块名
- **THEN** 链上**不含** `lib/team-transport.js`（禁止 `http → transport` 方向）

> ⚠️ 本片第二次改写 I4 判据（首次是 S10b）。原实现是「import 面恰好 2 条且整串相等」，
> 改为按不变量判并**递归验证依赖链**。改强不改弱：新增「链上模块偷偷写盘」与
> 「反向依赖」两条原判据根本抓不到的能力（已用变异自证）。
> 同时如实记录：第一版 I4-4 只按函数名匹配，被 `writeFileSync as __wf` 别名完全逃逸
> ——已补 I4-4b 按**模块来源**判。