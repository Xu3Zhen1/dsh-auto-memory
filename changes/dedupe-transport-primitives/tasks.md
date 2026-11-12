# 任务清单：传输层 7 个纯函数收口

## 阶段 1：准备与取证

- [ ] T1 确认 `DRY-C1` 基线 44 块，其中两文件对 19 块 + `notrim ↔ http` 3 块
- [ ] T2 确认两文件**当前不互相引用**（http 只 import node:http/https；transport 只 import node:crypto 与 notrim）
      ⇒ 推翻「TDZ 循环」这一旧阻断理由
- [ ] T3 确认第三个零依赖模块的依赖图无环：`transport → X ← http`
- [ ] T4 行为基线：从基 `8a9cad48` 抽取 http 侧 7 函数 + 2 依赖，建 49 用例对拍语料

## 阶段 2：核心实现

- [ ] T5 新建 `lib/team-transport-primitives.js`（7 个纯函数，import notrim 取 toText/safeGet）
- [ ] T6 `lib/team-transport.js`：删 7 个本地实现，改为具名导入
- [ ] T7 `lib/team-transport-http.js`：删 9 个本地实现，改为从两个叶子模块导入

## 阶段 3：判据改写（改强不改弱）

- [ ] T8 `tests/smoke/smoke-test-team-transport-http.mjs`：I4/I4b 改为不变量判（I4-0..8）
- [ ] T9 负控 1：http 引入 `node:fs` ⇒ `I4-2` 真红
- [ ] T10 负控 2：链上模块偷偷写盘（含**别名导入**）⇒ `I4-4`/`I4-4b` 真红
- [ ] T11 负控 3：http 依赖 `lib/team-transport.js` ⇒ `I4-5` 真红
- [ ] T12 补漏自证：第一版 I4-4 被 `writeFileSync as __wf` 完全逃逸（套件全绿）⇒ 补 I4-4b 后真红

## 阶段 4：验证

- [ ] T13 行为对拍：49 用例 0 差异
- [ ] T14 `sdd-guard --only DRY-C1,KISS-C1`：44 → 22，KISS 不变
- [ ] T15 全量回归（分母 460），失败集不新增

## 完成判据

- [ ] 所有复选框勾选
- [ ] 显式报告：I4 判据二次改写的判断依据、三条负控的鉴别力自证、
      以及**一个被负控逼出的判据缺口**（别名导入可绕过名字匹配）