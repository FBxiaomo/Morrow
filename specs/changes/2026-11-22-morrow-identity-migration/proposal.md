# 变更提案 · morrow-identity-migration（Horloge → Morrow 标识迁移）

> 状态：**部分实施**（A 阶段已完成于 2026-11-22；B 阶段待确认）
> 提出日期：2026-11-22 · 影响能力域：`settings-storage`、`themes-personalization`、`offline-pwa`、`focus-timer`

## 1. 为什么改

2026-11-22 起，项目英文名统一为 **Morrow**（中文名「末时钟」不变）。显示层的旧名已全部更替（README 标题、package.json name/version、设置面板「关于」、两处代码头注释，见 `docs/项目规范.md` §2.1）。

但仍有**承载用户数据与兼容性契约**的标识沿用旧名：5 个 `horloge.*` 存储键、IndexedDB 库名、配置导出 `app: 'horloge-finale'`、PWA 缓存名 `horloge-shell-v1`、图标文件 `horloge-mark.svg`、通知 tag `horloge-focus`。它们与新命名体系不一致，且导出标识直接决定备份文件的品牌归属。

## 2. 改什么

分两阶段：

- **A 阶段（已完成，2026-11-22）**：显示层更名——README 标题、package.json（`name: morrow`、`version: 0.2.1`）、「关于」版本口径、`window-glass.ts` / `volumetric.ts` 头注释、新文档体系。**不触碰任何存储键与导出标识。**
- **B 阶段（本提案主体，待确认后实施）**：数据层标识迁移——localStorage 键、IndexedDB 库名、导出 `app` 标识、PWA 缓存名、图标文件名、通知 tag，全部迁往 `morrow` 系命名，**保证既有用户数据零丢失、旧配置备份仍可导入**。

**影响的既有需求**：FR-SS-13（导出标识）、FR-PWA-02/06（缓存名与图标）、FR-TH（profile 键）——B 阶段实施时逐条修订对应能力规格。

## 3. 不改什么（边界）

- 中文产品名「末时钟」与全部 UI 中文文案**不改**。
- 遗留 v3 模块内部文案（`panel.ts` / `editorial.ts` 的 `Horloge v3` 字样）**不改**——遗留代码冻结（项目规范 §11）。
- 不做一次性「清库重来」：不通过让用户数据失效来完成改名。
- 不把迁移与其他功能变更捆绑在同一个发布里。

## 4. 需求（B 阶段，EARS）

- **FR-MIG-01** 当用户从旧标识版本（Horloge 系键）升级到本变更后的版本时，系统应自动把全部既有数据（设置、主题 profile、专注快照与历史、天气缓存、自选背景图片）迁移到新标识，**用户感知为零**。
- **FR-MIG-02** 迁移应一次性、单向、幂等：读旧键 → 写新键 → 删除旧键；重复执行无害；迁移失败时保留旧数据并回退到读旧键模式，不抛错。
- **FR-MIG-03** 当导出配置时，系统应使用 `app: 'morrow'`；当导入配置时，系统应同时接受 `'horloge-finale'` 与 `'morrow'` 两种标识（旧备份永久可导入）。
- **FR-MIG-04** 当新版 Service Worker 激活时，系统应清理旧缓存 `horloge-shell-v1`；现有用户离线缓存允许一次性重建。
- **FR-MIG-05** 系统应把品牌图标更名为 `morrow-mark.svg`，并同步 `manifest.webmanifest` 与 `desktop.css` mask 引用；预缓存清单随之更新。
- **FR-MIG-06** 系统通知 tag 应统一为 `morrow-focus`。
- **FR-MIG-07** 「清空本机数据」应同时清理新旧两套标识的残留（防御旧版本回滚用户）。
- **NFR-MIG-01** 系统应始终在 `docs/项目规范.md` §5.2 存储注册表登记迁移后的新键与迁移状态。

## 5. 验收方式

| 需求 | 验证手段 |
| --- | --- |
| FR-MIG-01/02 | 新增 Playwright 用例：预置旧键数据 → 升级路径 → 断言数据存活 + 旧键删除；再次刷新断言幂等 |
| FR-MIG-03 | 新增用例：旧 `horloge-finale` 备份可导入，新 `morrow` 备份可导入 |
| FR-MIG-04 | `npm run preview` 人工验收 + sw.js activate 白名单审查 |
| FR-MIG-05 | manifest 图标加载断言 |
| FR-MIG-07 | 既有清空用例扩展（desktop.spec） |

## 6. 决策待办（需要人拍板）

- [ ] **B 阶段是否实施**：`horloge.*` localStorage 键仅是内部标识，用户不可见。收益是命名一致性；成本是一次迁移代码 + 测试。倾向：实施（导出标识与图标属品牌资产，必须迁；存储键顺路统一）。← 代理只列问题，不代勾选。
- [ ] **实施时机**：随 0.3.0 第一个功能发布，还是单独小版本（0.2.2）先行？倾向：单独先行，避免与功能变更混淆回归来源。
- [ ] **图标文件名**：改为 `morrow-mark.svg` 需同步两处引用（manifest、desktop.css mask）；是否保留 `horloge-mark.svg` 原文件做 404 兜底？倾向：直接改名，PWA 缓存会自动重建。
