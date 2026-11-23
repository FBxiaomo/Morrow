# 能力规格 · 离线与常亮（offline-pwa）

> 适用版本：0.2.1（反向成文） · 主要代码：`public/sw.js`、`public/manifest.webmanifest`、`src/main.ts`（注册与 WakeLock）

## 概述

生产版本作为 PWA 提供「核心界面可离线重新打开」能力：Service Worker 只缓存同源核心资产，不拦截跨源请求（实时天气仍需网络）。屏幕常亮经 Wake Lock API 提供，不支持时诚实关闭。

## 需求

### Service Worker

- **FR-PWA-01** 系统应仅在**生产构建**（`import.meta.env.PROD`）注册 Service Worker，注册地址为 `import.meta.env.BASE_URL + 'sw.js'`（DEV 为 `/sw.js`；生产构建 `base: './'`，随部署子路径解析）；注册失败应静默（在线功能不受影响），DEV 不注册。
- **FR-PWA-02** Service Worker 安装时应预缓存核心资产：`./`、`./index.html`、`./manifest.webmanifest`、品牌图标，全部以 **SW 脚本位置为基准的相对路径**解析（部署于 `https://fbxiaomo.github.io/Morrow/` 时缓存键自动落在 `/Morrow/` 作用域内），并 `skipWaiting`。
- **FR-PWA-03** Service Worker 应**不拦截任何非 GET 请求与跨源请求**——Open-Meteo 天气请求直达网络，离线时由天气能力的 stale 机制接管（见 weather 规格 FR-WX-10/11）。
- **FR-PWA-04** 导航请求应 network-first：成功后回写缓存，失败时以缓存兜底——生产 JS/CSS（哈希文件名）在首次访问后被运行时缓存，实现「核心界面可离线重新打开」。
- **FR-PWA-05** 其余同源 GET 应 cache-first，命中失败回退网络并在成功时回填缓存。
- **FR-PWA-06** 新版本激活时应清理旧版本缓存（按缓存名白名单删除）。
- **FR-PWA-07** 离线重新打开时，实时天气显示为「上次天气」并明示非实时；时钟、主题、专注、设置全部本机可用。

### 应用清单

- **FR-PWA-08** manifest 应声明独立窗口（standalone）、中文名「末时钟 · 天气氛围与专注时钟」、`zh-CN`、深色主题色与 SVG 图标。

### 屏幕常亮

- **FR-PWA-09** 当用户开启「保持屏幕常亮」（`general.wake`）时，系统应请求 Wake Lock 并在页面重新可见时自动恢复持有。
- **FR-PWA-10** 如果浏览器不支持 Wake Lock 或请求失败，系统应把设置项回写为关闭并以 toast 说明，**不维持「看似开启」的状态**。
- **FR-PWA-11** 当用户关闭设置项时，系统应立即释放 Wake Lock。

## 设计约束与不变量

- 缓存名 `horloge-shell-v1`、图标 `./horloge-mark.svg`：两者更名受 Morrow 提案约束（缓存名更名 = 一次性缓存重建，需在提案中显式接受）。
- Service Worker 保持零第三方依赖、25 行级的最小实现；任何缓存策略改动必须同步修订本规格。
- **资源引用一律相对路径**（`vite base: './'`，含 manifest 与 SW 内部引用）：同一构建在根路径、`/Morrow/` 子路径与本地 `npm run preview` 下均可用。部署渠道为 GitHub Pages（push `main` → GitHub Actions 自动构建发布，`configure-pages` 负责站点开通）。
- **离线边界是产品契约**：只承诺「核心界面重新打开」，不承诺天气实时性、不承诺安装后无网络的新用户引导。

## 验收与测试映射

| 需求 | 用例 |
| --- | --- |
| FR-PWA-07 | `desktop.spec` 离线刷新保留旧天气 + stale |
| FR-PWA-01–06 | `npm run preview` 人工验收路径（当前测试矩阵仅 dev server，见项目规范 §12 已知局限） |

## 未决事项

- 缺少生产构建（dist/preview）冒烟测试用例——审查 P1 项，扩矩阵时补 `preview` 通道用例。
