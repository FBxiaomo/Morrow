# 能力规格 · 四主题与个性化（themes-personalization）

> 适用版本：0.2.1（反向成文） · 主要代码：`src/data/themes.ts`、`src/ui/customizer.ts`、`src/ui/font-picker.ts`、`src/desktop.css`

## 概述

四个主题是四个独立空间：天幕（OPEN SKY）、数字工作室（DIGITAL STUDIO）、窗边（BY THE WINDOW）、静谧编辑（QUIET EDITION）。每个主题维护独立的个性化 profile（外观/背景/内容键），全局键跨主题共享。设置面板「主题」页以真实场景卡片预览并即时切换。

## 需求

### 主题与 profile 隔离

- **FR-TH-01** 系统应提供四个主题（`sky`/`studio`/`window`/`editorial`），每个主题有唯一 id、中英文名、中文描述与默认搭配（字体、字色、世界时钟开关）。
- **FR-TH-02** 当用户切换主题（点击卡片或数字键 `1`–`4`）时，系统应保存当前主题的个性化键（`appearance.*`、`background.*`、`content.*`），载入目标主题「默认值合并其 profile」的配置，并持久化 `theme` 键。
- **FR-TH-03** 系统应使全局键（`weather.city`、`focus.*`、`audio.enabled`、`general.wake`、`theme`）跨主题共享——切换主题不改变天气城市、专注时长与系统级选择。
- **FR-TH-04** 当用户在主题页执行「恢复默认搭配」时，系统应仅重置当前主题的个性化键为目标主题默认值，不影响其他主题与其他全局设置。
- **FR-TH-05** 系统应在刷新后保持上次主题与该主题的全部个性化配置（IndexedDB 自选图片同样按主题存活）。
- **FR-TH-06** 主题切换应伴随克制的转场动画（`prefers-reduced-motion` 时禁用）。

### 主题默认差异

- **FR-TH-07** 系统应按主题应用默认差异：studio 默认浅底色 `#ecebe3`（其余 `#273956`）；editorial 默认遮罩 25（其余 8）；studio 与 editorial 默认开启世界时钟（其余关闭）；月相默认关闭。
- **FR-TH-08** 系统应保留 `content.seconds` → `content.secondsStyle` 的 profile 迁移路径。

### 背景

- **FR-TH-09** 系统应支持四种背景：主题摄影风景（默认）、渐变、纯色、我的图片。
- **FR-TH-10** 当用户上传自选图片时，系统应在浏览器内校验体积（≤ 20MB）、缩放（长边 ≤ 2560）、转码（WebP，质量 0.9）后按主题存入 IndexedDB；失败应有明确文案。
- **FR-TH-11** 当用户删除当前主题的自选图片时，系统应立即从 IndexedDB 移除并回到上一档背景；其他主题的图片不受影响。

### 字体与外观

- **FR-TH-12** 系统应提供 8 组内置字体栈；当 `appearance.fontCustom` 非空时，系统应以其为时钟字体、字重固定 400、关闭衬线精调（`data-custom-font` 通道），且三种系统字体选择应真实改变平台渲染字体（有测试用平台字体验证）。
- **FR-TH-13** 系统应在本机字体选择中：DEV 走 `/__local-fonts` 中间件（仅 127.0.0.1），PROD 走 `queryLocalFonts`；不支持或权限被拒时，应给出手动输入的指引而不是失败静默。
- **FR-TH-14** 系统应提供外观调节：时钟大小（65–135）、文字颜色、时间位置（主题默认/居中/靠左/靠右）、动态效果（完整/轻量/静态）、夜间调暗开关。
- **FR-TH-15** 当 `appearance.quiet` 开启时，系统应整体调暗画面（安静模式）。

### 设置面板结构

- **FR-TH-16** 设置面板应分为主题/外观/天气/显示/通用五页，切换页时面板、导航与页脚的几何尺寸不发生变化（有测试断言），当前页以 `aria-current` 标示。
- **FR-TH-17** 设置面板应为不透明底色（不透明度 ≥ 0.9，有测试断言），背后的时钟数字不得透进设置文字。

## 设计约束与不变量

- profile 存储键 `horloge.theme-profiles.v1`（重命名受迁移提案约束，见 changes/morrow-identity-migration）。
- `ThemeManager.apply()` 目前逐键 `store.set`（已知架构债，切换期间多次持久化/刷新；事务式改造是候选提案——行为规格不受影响）。
- 主题预览卡片使用真实场景图 + 当前时间渲染。
- 主题英文装饰名与 overline（"MAKE TIME YOUR OWN" 等）为产品文案，修改需走变更提案。

## 验收与测试映射

| 需求 | 用例 |
| --- | --- |
| FR-TH-02/03/04/05/08 | `desktop.spec` 四主题独立持久化与 reset；重置后控件同步；背景上传按主题持久化 + reload 存活 |
| FR-TH-10/11 | `desktop.spec` 背景上传（IndexedDB 断言） |
| FR-TH-12/13 | `font-picker.spec` 内置字体加载、搜索分页、权限拒绝指引、CDP 授权真实枚举、系统字体实际生效 |
| FR-TH-16 | `settings-glass.spec` 五 tab 切换几何稳定、`aria-current`、无重复 data-setting 键 |
| FR-TH-17 | `polish.spec` 设置面板不透明度 ≥ 0.9 |

## 未决事项

- 无（该域已知问题均属工程实现债，登记于 architecture.md §7）。
