# AGENTS.md · Morrow 代理协作规范

> 本文件是 AI 编程代理（OpenCode / Claude Code / Codex 等）在本仓库工作的 **harness 入口文档**。
> 任何代理会话开始前先通读本文件；细节按需查阅 `docs/项目规范.md` 与 `specs/` 目录。
> 项目：**末时钟**（英文名 **Morrow**，前称 Horloge）· 当前基线 **0.2.1**。

---

## 1. 项目是什么

一个**低干扰的天气氛围与专注时钟**：浏览器全屏应用，四种独立场景主题（天幕 / 数字工作室 / 窗边 / 静谧编辑），真实或自选天气驱动背景氛围，附完整的专注计时闭环。所有数据保存在本机（localStorage / IndexedDB），**无支付、无账户、无云同步**。技术栈：TypeScript(strict) + Vite + 原生 Canvas2D/WebGL + Playwright。

## 2. 常用命令

| 命令 | 作用 | 说明 |
| --- | --- | --- |
| `npm run dev` | 开发服务器 | `http://127.0.0.1:5190/`，DEV 专属 `/__local-fonts` 字体中间件可用 |
| `npm run build` | 类型检查 + 生产构建 | `tsc && vite build`，**tsc 失败即构建失败**，含遗留模块 |
| `npm test` | Playwright 回归（46 项） | Edge 通道、`127.0.0.1:5192`、workers=1、时区固定 Asia/Shanghai |
| `npm run preview` | 生产构建预览 | 验证 PWA 离线缓存行为时使用 |

## 3. 架构速览

```
src/
  main.ts            装配根：CSS 导入、服务实例化、回调接线、三定时器、快捷键、PWA 注册
  data/              纯逻辑层（无 DOM）：settings / themes / weather / pomodoro
                     / cities / lunar / audio / snow / scenery
  ui/                DOM 层：dashboard(主桌面) / customizer(设置面板)
                     / focus(专注弹窗) / shell(键盘与闲置) / font-picker / icons
  atmosphere/        渲染层：landscape(唯一主绘制循环) / photographic(摄影板+室内光)
                     / real-weather(写实粒子+数字互动) / glyph-surface(字形碰撞面)
                     / window-glass(WebGL 玻璃雨) / volumetric(体积云)
public/sw.js         PWA：核心界面离线缓存，不拦截跨源（天气走网络）
```

- **状态广播**靠各服务自己的监听器集合（`store.onChange` / `weather.onChange` / `pomodoro.onChange` / `store.onPersistenceChange`），没有全局事件总线；唯一的自定义 DOM 事件是 `clock-layoutchange`（时钟几何变化 → 字形蒙版重建）。
- **渲染/CSS 状态通道**是 `body.dataset`：`theme / position / motion / weather / phase / customizer / customFont / weatherQuality / windowGlass / cloudRenderer`。
- **测试探针**：`window.desktop = { store, themes, weather, landscape, dashboard, customizer, focusDialog, pomodoro, audio }`（`src/main.ts` 末行），全部 Playwright 用例经由此对象驱动真实服务。
- ⚠️ **遗留目录**：`src/core | src/scenes | src/layers | src/styles | src/audio/audio.ts | src/ui/panel.ts | src/ui/editorial.ts | src/atmosphere/index.ts | src/style.css` 是 v3 粒子引擎残留，**不参与运行但必须通过 tsc 编译**。不要在遗留目录上开发新功能；归档/删除决策见 `docs/项目规范.md` §11。

## 4. 硬性规则（每条变更都必须遵守）

| # | 规则 |
| --- | --- |
| R1 | **文档先行**：行为级改动先改规格（`specs/capabilities/*/spec.md`），再改代码。规格与实现不符时，以修规格为第一动作。 |
| R2 | **TypeScript strict**：全仓库（含遗留模块）必须通过 `tsc`；不放宽 `tsconfig.json`。 |
| R3 | **新增设置键必须注册进 `GLOBAL_SETTINGS`**（`src/data/settings.ts`），带 `section.name` 键名、中文 label、正确 kind；UI 一律经 schema 生成控件，不手写散控件。 |
| R4 | **新增持久化键必须登记存储注册表**（`docs/项目规范.md` §5），带 `.vN` 版本后缀与迁移说明。**永不直接重命名既有键**——改键 = 写迁移（见 `specs/changes/2026-11-22-morrow-identity-migration/`）。 |
| R5 | **异步必带竞态防护**：所有跨帧/网络异步（天气、图片、音频、城市搜索）使用现有 `revision` 计数守卫模式：发起前自增，回包时校验，不匹配即丢弃。 |
| R6 | **WebGL 必须可回退**：新 WebGL 特性必须实现「创建/编译失败 → Canvas 回退 → context lost 重建/释放」全链路（参考 `window-glass.ts`），并由 `data-*` 通道暴露当前渲染器供测试断言。 |
| R7 | **渲染预算**：默认帧预算 33ms、写实 16ms、轻量 66ms；DPR ≤ 1.5；帧缓冲 ≤ 1.8M px（lite 1.0）；`document.hidden` 停画；`prefers-reduced-motion` 全局短路。新渲染特性必须给出预算数字并写进规格。 |
| R8 | **中文与 zh-CN**：UI 文案与日期格式一律中文 / `zh-CN`，无 i18n 框架，不要引入。 |
| R9 | **可读性下限**：界面文字 ≥ 11px（有测试断言），触控目标 ≥ 40px；对比度目标 WCAG AA。 |
| R10 | **不留 TODO/FIXME 注释**：未完成事项写进 `specs/changes/` 提案或能力规格的「未决事项」，不留在代码里。 |
| R11 | **版本三处同步**：`package.json` version、README 标题区版本记载、设置面板「关于」文案，发布时必须一致（当前统一为 0.2.1）。 |
| R12 | **天气数据直连 Open-Meteo 公共接口**：商用前禁止在客户端引入 API key、禁止改动直连方式；网关化是独立变更提案。 |
| R13 | **资源生命周期**：渲染器必须 `dispose()` 并用 `WEBGL_lose_context` 显式释放；设置项关闭时即时释放（参考 `syncWindowGlass`）。 |

## 5. 测试须知

- 46 项回归在 `tests/`（7 个 spec）：驱动方式一律 `window.desktop.*`，**不走截图金盒**；视觉冻结用截图 SHA-256 指纹断言。
- Open-Meteo 两个域名在测试中一律 `route.abort()` 或固定 mock，**绝不真联网**。
- 时钟相关用例用 `page.clock.setFixedTime(...)` 固定时间；`timezoneId: 'Asia/Shanghai'`。
- 行为级改动必须补对应用例并全量跑过 `npm test` 后才算完成；验收截图（如需要）输出到 `artifacts/<主题>-<日期>/`。
- 已知局限：仅 Edge + dev server 通道，无生产冒烟、无跨浏览器矩阵（记录于 `docs/项目规范.md` §12，勿擅自扩大配置范围）。

## 6. 变更流程（SDD）

任何行为级改动走规范驱动开发流程，**目录与模板见 `specs/README.md`**：

```
提案（proposal.md）→ 需求（design/requirements，EARS 句式）
→ 设计（design.md，给出预算与回退）→ 任务（tasks.md，可验证小步）
→ 实现（遵守本文件 R1–R13）→ 验证（Playwright + 截图）
→ 归档（把增量合并进 specs/capabilities/*/spec.md）
```

- 规格三层：`specs/steering/`（长期稳定事实）、`specs/capabilities/`（当前行为真相，按能力域拆分）、`specs/changes/`（进行中的变更提案）。
- 历史设计决策（v1–v6 演进）在 `docs/`，只读不改；**当前真相以 `specs/capabilities/` 为准**。

## 7. 文档地图

| 位置 | 内容 |
| --- | --- |
| `AGENTS.md` | 本文件：代理 harness 入口 |
| `docs/项目规范.md` | 项目规范：命名、分层、存储注册表、CSS、测试、发布 |
| `specs/README.md` | SDD 方法论与本仓库的落地目录结构 |
| `specs/steering/` | 产品定位、架构事实 |
| `specs/capabilities/<域>/spec.md` | 八个能力域的正式规格（需求 + 验收 + 约束） |
| `specs/changes/` | 变更提案模板与进行中的提案 |
| `docs/v2设计.md` … `docs/v6窗边玻璃雨.md` | 历史演进决策，只读 |
| `docs/2026-11-13-产品与商业成熟度审查.md` | 商业成熟度审查（P0/P1/P2 问题分级） |
| `artifacts/` | 开发期验收制品（截图、探针脚本），可归档，不是产品代码 |
