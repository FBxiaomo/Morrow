# SDD 规范驱动开发 · Morrow 落地手册

> SDD（Spec-Driven Development，规范驱动开发）：**先写规格，再写代码；规格是人与 AI 代理共同的事实源**。
> 本目录是末时钟 Morrow 的 SDD 文档体系。基线 0.2.1 · 2026-11-22 建立（对已实现功能反向成文）。

---

## 1. 为什么用 SDD

本项目由 AI 编程代理深度参与开发（历史演进 v1→v6 的每一步都由设计文档驱动，见 `docs/`）。SDD 把这一实践正式化：

- 代理会「补全」你没说清的部分——规格堵住自由发挥；
- 代理没有跨会话记忆——规格提供稳定上下文；
- 代理产出量大——验收标准让「对照清单检查」代替「逐行审」。

## 2. 目录结构

```
specs/
  README.md                        本文件：方法论 + 流程
  steering/                        长期稳定事实（低频改动）
    product.md                     产品定位、用户、非目标、商业红线
    architecture.md                架构与技术事实、模块图、数据流、存储
  capabilities/                    能力域规格 = 当前行为的「真相」
    time-display/spec.md           时间与信息呈现（制式/秒/日期/农历/世界时钟）
    themes-personalization/spec.md 四主题与个性化（profile/背景/字体/外观）
    weather/spec.md                天气（获取/缓存/竞态/手动/状态文案）
    atmosphere-rendering/spec.md  氛围渲染（主循环/写实粒子/体积云/窗玻璃/预算）
    focus-timer/spec.md           专注计时（状态机/离开处理/历史/通知）
    settings-storage/spec.md       设置与数据（schema/持久化失败/导入导出/清空）
    offline-pwa/spec.md            离线与常亮（sw/manifest/wakeLock）
    interaction-shell/spec.md      交互层（快捷键/工具条/纯净显示/闲置/触屏）
  changes/                         变更提案（进行中的工作）
    _template/                     proposal / design / tasks 三件套模板
    2026-11-22-morrow-identity-migration/   示例提案：Horloge→Morrow 标识迁移
```

**三层语义**：`steering`（这个项目是什么）→ `capabilities`（系统当前如何行为）→ `changes`（下一步要改什么）。历史决策（`docs/vN*.md`）不参与此三层，只读。

## 3. 变更生命周期

```
① 提案     specs/changes/<slug>/proposal.md    为什么改、改什么、不改什么
② 需求     以 EARS 句式写进 proposal.md 的需求区（每条带 FR/NFR 编号）
③ 设计     specs/changes/<slug>/design.md      架构影响、预算、降级链、迁移
④ 任务     specs/changes/<slug>/tasks.md       可独立验证的小步，逐条映射需求编号
⑤ 实现     遵守 AGENTS.md R1–R13，每任务先测试后代码（RED→GREEN）
⑥ 验证     npm run build + npm test 全绿；验收截图入 artifacts/
⑦ 归档     把变更增量合并进 specs/capabilities/<域>/spec.md，
           更新「适用版本」，然后提案目录移入 changes/archive/<日期>-<slug>/
```

**门禁**（人类是唯一的门禁守卫者）：
- 需求未确认 → 不写设计；设计未确认 → 不拆任务；任务未确认 → 不动代码。
- 代理**不得**替用户勾选确认；规格里没有的「顺手改进」一律先补提案。
- 实现中发现规格错误：**停下来，先修规格**，经确认后再继续。

## 4. 写作规范

- **语言**：中文；代码引用、键名、命令保持原文。
- **需求句式（EARS）**：
  - 正常系：`当〈触发条件〉时，系统应〈可观察的响应〉`；
  - 异常系：`如果〈异常条件〉，则系统应〈降级行为〉`；
  - 约束系：`系统应始终〈持续成立的不变量〉`。
  - 每条需求带稳定编号（如 `FR-FOCUS-03`），编号只增不改，作废标 `[已废弃]` 不删除。
- **验收标准**：每条行为需求必须能映射到测试用例（现有 40 项之一，或新增用例）；写不出测试的验收标准视为还没想清楚。
- **能力规格结构**（`capabilities/<域>/spec.md`）：概述 → 需求（EARS）→ 设计约束与不变量 → 验收与测试映射 → 未决事项。
- **规格只描述行为，不描述实现细节**：函数与行号引用仅作为「当前实现锚点」附注，重构不自动失效规格。

## 5. 与 AI 代理的配合约定

- 代理会话从 `AGENTS.md` 进入；`AGENTS.md` §6 指向本文件。
- 常用指令（自然语言即可）：
  - 「阅读 specs/capabilities/<域>/spec.md，评估这个改动影响哪些需求」
  - 「按 specs/changes/_template 新建提案 <slug>」
  - 「执行提案 <slug> 的任务 T3，先写失败测试」
  - 「提案 <slug> 已验证通过，归档并把增量合并进能力规格」
- 代理改动行为的 PR/提交，说明中必须列出受影响的需求编号（如 `实现 FR-FOCUS-03、FR-FOCUS-04`）。

## 6. 规格维护纪律

- 规格与代码**同时**演进（spec-anchored 模式）：行为改了不改规格 = 未完成。
- 「适用版本」字段：每次归档同步更新。
- 新能力域：先在 `steering/architecture.md` 模块图登记，再建 `capabilities/<域>/spec.md`。
- 需求变更历史不保留在能力规格里（那会迅速腐烂），演进记录看 `changes/archive/` 与 `docs/vN*.md`。
