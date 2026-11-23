# 能力规格 · 设置与数据（settings-storage）

> 适用版本：0.2.1（反向成文） · 主要代码：`src/data/settings.ts`、`src/ui/customizer.ts`

## 概述

全部用户偏好的单一入口：schema 驱动的设置存储（校验、持久化、监听）、设置面板控件体系、配置备份（导出/导入）、本机数据清空，以及**持久化失败的诚实反馈**。

## 需求

### 校验与持久化

- **FR-SS-01** 系统应以 `GLOBAL_SETTINGS` schema（37 键基线）定义全部用户设置；每个键必须带中文 label 与 kind（slider/toggle/select/color/text）。
- **FR-SS-02** 系统应在读取时逐键校验：slider 必须为有限数并钳制到 `[min, max]` 且对齐 step；toggle 必须为布尔；select 必须在 options 白名单；color 必须匹配 `^#[0-9a-f]{6}$`；text 必须为字符串。**任何校验失败回默认值，不抛错**。
- **FR-SS-03** 如果 localStorage 中设置数据损坏（解析失败/原型污染/类型不符），系统应安全回退默认值并继续运行（有专项测试注入损坏数据）。
- **FR-SS-04** 系统应过滤 `__proto__` 等危险键与三种合法类型之外的值，不信任任何读取结果。
- **FR-SS-05** 设置写入即时持久化（无显式保存按钮）。

### 持久化失败的诚实反馈

- **FR-SS-06** 如果写入 localStorage 失败（如 QuotaExceeded），系统应立即把状态标注为「仅本次有效」，在设置面板显示「无法保存 · 当前设置仅本次有效」状态条与「重试保存」按钮（有专项测试断言）。
- **FR-SS-07** 系统不得在任何失败路径上谎称已保存；重试成功后状态条应消失。

### 控件体系

- **FR-SS-08** 设置面板的控件应由 schema 统一生成（`group()`/`control()`），同一 `data-setting` 键不得重复出现（有测试断言）。
- **FR-SS-09** 系统应根据设置间依赖禁用/隐藏无关控件（诚实状态）：manual 模式下禁用城市控件、视觉关闭时隐藏强度/闪电、wetClock 仅写实 + 视觉 + 非 window 主题、玻璃仅 window 主题可见等（`syncControls()` 为唯一实现点）。
- **FR-SS-10** 设置说明与分组标题应与实际控件精确对应（「秒的显示」等字样只出现在显示页，有测试断言）。

### 备份（导出/导入）

- **FR-SS-11** 当用户导出配置时，系统应生成 `{ app, version, exportedAt, settings }` JSON，文件名 `末时钟配置-YYYY-MM-DD.json`。
- **FR-SS-12** 当用户导入配置时，系统应校验：应用标识、格式版本、`settings` 为对象、文件体积 ≤ 1MB、逐键 schema 合法性；任何不满足应提示「无法导入：文件格式或版本不受支持」且**不改动任何现有设置**。
- **FR-SS-13** 导出标识 `app` 当前为 `'horloge-finale'`（兼容历史备份），迁移规则由 Morrow 提案管理；在其落地前导入必须继续接受该标识。

### 清空

- **FR-SS-14** 当用户执行「清空本机数据」时，系统应要求二次确认（5 秒确认窗口），执行后删除全部注册存储键与 IndexedDB 库，应用回到全新状态。
- **FR-SS-15** 清空操作应提供明确的取消路径，单次误触不得触发删除。

### 反馈通道

- **FR-SS-16** 系统应以 toast（`notify()`）承载一次性操作反馈（导入成功/失败、图片删除、常亮不支持等），不打断主界面。

## 设计约束与不变量

- 存储键 `desktop.v2.settings`；快照 `snapshot()` 支持按键过滤（主题 profile 用）。
- 构造时一次性迁移钩子：`experience.version !== 5` 强制 `weather.visual = true`（0.2.0 升级路径），新迁移必须采用同款「版本号 + 单向」模式。
- UI 不直接调用 localStorage，一律经 `SettingsStore`。
- 废弃键政策：`content.seconds` 仅作迁移输入保留；`appearance.exposure` 无消费方待清理——新增消费方之前必须先修订本规格。

## 验收与测试映射

| 需求 | 用例 |
| --- | --- |
| FR-SS-02/03 | `desktop.spec` 损坏设置安全回退默认 |
| FR-SS-06/07 | `release.spec` 存储写入失败可见（注入 QuotaExceededError） |
| FR-SS-08/09/10 | `settings-glass.spec` 无重复 data-setting、分组标题精确匹配 |
| FR-SS-11/12 | 导出/导入实现锚点（customizer.ts），随 `desktop.spec` 重置用例覆盖回退路径 |

## 未决事项

- `appearance.exposure`（曝光）注册但全仓库无读取方——清理需先移除 schema 条目并决定旧值是否迁移，属独立小提案。
