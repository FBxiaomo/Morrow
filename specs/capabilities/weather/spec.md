# 能力规格 · 天气（weather）

> 适用版本：0.3.0（含 2026-11-24-uapis-weather-source 与 2026-11-24-uapis-key-fallback 增量） · 主要代码：`src/data/weather.ts`、`src/ui/customizer.ts`（天气页）

## 概述

天气来源分「真实天气」与「自选天气」（七分类 × 四时段手动设定）。真实天气为**双源**：用户在设置页自备 `weather.apiKey`（uapis.cn，仅存本机）时直连 uapis 实况（Bearer 头，浏览器跨域实测可用；无 Key 的跨域浏览器调用会被服务端防爬层拒绝，2026-11-24 探针验证）；未填 Key 时回退免 Key 的 Open-Meteo（0.2.1 原始数据面）。城市搜索候选始终来自 Open-Meteo geocoding（带坐标）。天气状态驱动氛围渲染（见 atmosphere 规格）与顶栏信息，实况还提供推导的天气强度。**商用红线**：发布者密钥不得硬编码进客户端；服务端网关化仍是商用化的独立变更提案。

## 需求

### 城市与搜索

- **FR-WX-01** 当用户在设置页输入城市名时，系统应调用 Open-Meteo geocoding（中文、最多 6 个候选、10s 超时）并展示候选列表（候选必含有限坐标），输入即时触发且带竞态守卫。
- **FR-UW-15** 当选定搜索候选时，系统应保留其名称与坐标接入：keyed 档以候选名查 uapis（FR-UW-01，可回写 adcode 锚点）；keyless 档以候选坐标查 Open-Meteo（FR-UW-14）。
- **FR-WX-03** 当城市搜索无结果时，系统应显示「未找到城市，试试完整名称或英文名。」。
- **FR-WX-04** 当城市选定/切换时，系统应清空旧城市缓存并发起新的天气获取。

### 定位

- **FR-UW-06** 当用户点击「使用当前位置」且已配置 Key 时，系统应无参调用 uapis（仅点击后发起），成功后以返回的区县/城市显示名与 `adcode` 持久化位置；含 `adcode` 的位置后续刷新按区划码查询。失败显示「IP 定位失败，请手动搜索城市」。
- **FR-WX-02** 当用户点击「使用当前位置」且未配置 Key 时，系统应回退浏览器定位（仅在点击后请求权限），以坐标接入并持久化最近位置。
- **FR-WX-02a** 当免 Key 定位返回坐标后，系统应先经 BigDataCloud（`api-bdc.io` 免密钥客户端端点，10s 超时，city → locality → principalSubdivision 优先级）解析中文地名再接入；解析失败回退显示「当前位置」且不阻塞天气获取。

### 实况获取与缓存（keyed uapis 档）

- **FR-UW-13** 当 `weather.apiKey` 非空时，系统应对全部 uapis 请求附加 `Authorization: Bearer <Key>` 头，以 `GET https://uapis.cn/api/v1/misc/weather?extended=true&forecast=true` 获取实况：位置含 `adcode` 时优先按区划码，否则按城市名，12s 超时，带 revision 竞态守卫。
- **FR-UW-02** 当收到 uapis 响应时，系统应映射 `WeatherInfo`：`temp←temperature`、`label←weather` 文本、`category←weather_icon` 七分类、`city←district`（国内无区县时 `city`）、`humidity←humidity`；扩展字段按需可选消费（`feelsLike←feels_like`、`windText←风向+风力`）。
- **FR-UW-03** 当响应含 `forecast[0].sunrise/sunset`（HH:MM）与 `report_time` 时，系统应换算当日日出日落 epoch（时区偏移取 `report_time` 内嵌偏移；国内朴素格式按 `+08:00`），并以 `report_time` 是否落于其间判定 `isDay`；换算失败两字段缺省，渲染回退小时推断。
- **FR-UW-04** 系统应始终按高德系 `weather_icon` 映射七分类：`100/150`→晴；`101-103`、`151-153`→多云；`104`→阴；`302/303/304`→雷雨；其余 `300-313`→雨；`400-499`→雪；`500-508`→雾；未知回退多云。
- **FR-UW-07** 如果 uapis 返回 404（`LOCATION_NOT_FOUND`），系统应显示「未找到城市，请重选或使用 IP 定位」，不缓存失败结果。
- **FR-UW-08a** 当 uapis 回包携带非空 `adcode` 且位置无 adcode 时，系统应回写锚点并持久化，后续刷新按区划码精确查询。

### 实况获取与缓存（keyless Open-Meteo 回退档）

- **FR-UW-14** 当 `weather.apiKey` 为空时，系统应回退 Open-Meteo 坐标直连（`api.open-meteo.com/v1/forecast`，12s 超时，参数同 0.2.1）：WMO 码按七分类映射（未知回退多云），`windText` 为风速 km/h 文本，`isDay/sunrise/sunset` 取自接口；uapis 域名零请求。如果位置无有限坐标，则显示「该位置缺少坐标，请重新搜索城市」。

### 通用状态与迁移

- **FR-WX-06** 系统应在以下时机尝试刷新：30 分钟周期、`online` 事件、页面重新可见、设置页手动「刷新天气」按钮。
- **FR-WX-07** 如果缓存仍在有效期内，系统应直接使用缓存不发起网络请求（手动刷新除外）。
- **FR-WX-09** 竞态安全（有专项测试）：旧城市响应晚到即丢弃；晚到的定位结果不覆盖较新的城市选择；失败不把旧数据错配到其他城市。
- **FR-WX-10** 如果刷新失败（网络不可用或超时），系统应继续显示上次天气并标注「连接暂不可用 · 显示上次天气」；成功标注「天气已更新」，进行中标注「正在更新天气…」。
- **FR-WX-11** 如果应用离线启动，系统应读取缓存天气并明示其非实时性，不阻塞时钟使用。
- **FR-UW-09** 当启动检测到旧 `horloge.weather-location.v1`（坐标结构）时，系统应迁移为 v2（保留 `name` 与有限坐标）；旧 `horloge.weather.v4` 缓存应作废清理；迁移幂等，失败不阻塞时钟。

### 自选天气

- **FR-WX-12** 当 `weather.mode` 为 `manual`（自选天气）时，系统应使用 `weather.manual` 七分类与 `weather.daytime`（跟随昼夜/白昼/日落/夜晚）驱动氛围，不发起网络请求。
- **FR-WX-13** 当 `weather.mode` 为 `manual` 时，系统应禁用城市搜索、定位与刷新控件（诚实状态，不呈现无效操作）。〔注：截至 0.3.0 该禁用链尚未实现，为已知规格漂移〕
- **FR-WX-14** 系统应提供 `weather.intensity`（10–100，默认 65）调节天气氛围强度；提供 `weather.lightning` 开关雷雨闪电效果。

### 强度自动调节

- **FR-UW-11** 当 `weather.intensityAuto`（强度自动调节，默认关）开启且 `weather.mode` 为 `live` 时，系统应以实况推导氛围强度并禁用手动强度滑杆：keyed 档按 uapis 图标强度语义 + 风力修正（`deriveIntensity`）；keyless 档按 WMO 分类基准（无强度语义码，不虚构推导）。
- **FR-UW-12** 当 `weather.mode` 为 `manual` 时，系统应禁用「强度自动调节」开关；当该开关关闭时，强度由手动滑杆决定。

### 显示与降级

- **FR-WX-15** 当 `weather.show` 关闭时，系统应隐藏顶栏天气信息；当 `weather.visual` 关闭时，系统应停用全部天气视觉效果（保留信息展示）。
- **FR-WX-16** 当 `weather.quality` 为 `light`（默认）时，系统应使用轻量渲染档（粒子效果关闭、DPR=1）；为 `realistic` 时启用写实档（见 atmosphere 规格）。
- **FR-WX-17** 设置页署名应并列双源：「天气数据 uapis.cn（填 Key）/ Open-Meteo（免 Key）· 位置名称 BigDataCloud（免 Key 定位）」。

## 设计约束与不变量

- 缓存键：`horloge.weather.v5`（`{location: {name, adcode?, latitude?, longitude?}, info, fetchedAt}`，TTL 30 分钟）+ `horloge.weather-location.v2`（最近位置）；旧 `v4`/`location.v1` 读入即清理（迁移口径见 `docs/项目规范.md` §5.2）。
- `weather.apiKey` 经 `GLOBAL_SETTINGS`（text）注册，存本机 `desktop.v2.settings`，随配置导出/导入；**任何发布者密钥不得进入仓库或构建产物**（AGENTS.md R12 精确化）。
- 双源分支收在 `refresh()` 单点（keyed ? uapis : Open-Meteo），`WeatherInfo` 对外形状统一，渲染层零感知；Key 经构造注入 provider，data 层不直读 settings。
- 竞态防护：`revision` 计数守卫贯穿 `selectLocation / setCity / locateByIp / refresh`；设置面板沿用 `searchRevision` 守护晚到定位。
- 响应解析对缺字段免疫：全部扩展字段可选 + `Number.isFinite`/`typeof` 守卫（实测国内 extended 无 `feels_like/cloud/precipitation`，国际无 `province/adcode`）。
- 强度消费唯一入口：`effectiveIntensity(store, info)`；landscape 四处消费点与 `WeatherFrame.intensity`（必填）均经此解析。
- ⚠️ **P0 红线**：`uapis.cn`（keyed 档）与两个 `open-meteo.com` 域名（keyless 档数据 + 搜索候选）均为免发布者密钥的直连（uapis 需用户自备 Key）；商用前必须整体网关化（独立变更提案，落地前禁止商业化发布）。三个域名在测试中一律 mock/abort。

## 验收与测试映射

| 需求 | 用例 |
| --- | --- |
| FR-UW-13/15 | `desktop.spec` keyed 城市搜索消歧：断言 `Authorization: Bearer` 头与 `city` 参数 |
| FR-UW-14/15 | `desktop.spec` keyless 默认回退：断言 Open-Meteo 坐标查询、uapis 零请求、reload 持久 |
| FR-UW-06 | `desktop.spec` keyed IP 定位接通区县并锚定 adcode；失败诚实状态；晚到 IP 定位被丢弃 |
| FR-WX-02/02a | `desktop.spec` keyless 定位：浏览器坐标 + BigDataCloud 中文地名再接通 |
| FR-UW-07 | `desktop.spec` 404 未找到城市且不复用缓存 |
| FR-UW-03 | `desktop.spec` 东京/杭州双格式 report_time 的昼夜与日出日落换算断言 |
| FR-UW-09 | `desktop.spec` 旧键迁移（名称与坐标保留、v4 清理、幂等） |
| FR-WX-09 | `desktop.spec` 天气请求竞态（挂起请求验证新旧覆盖与失败隔离） |
| FR-WX-10/11 | `desktop.spec` 离线刷新保留旧天气 + stale 标记 |
| FR-WX-12 | `desktop.spec` 自选天气七分类渲染 |
| FR-UW-11/12 | `desktop.spec` 自动强度（特大暴雨推导 100、开关粒子数联动、滑杆/开关禁用态） |
| FR-WX-15/16 | `desktop.spec` / `weather-v5.spec` 画质与视觉开关联动 |
| FR-WX-17 | `desktop.spec` 署名与三链接断言 |

## 未决事项

- uapis 商用网关化（P0）：密钥、限流、预算控制移至可信服务端——独立变更提案，落地前禁止商业化发布；uapis 访客额度（1500 积分/月/IP，天气 2 积分/次）与 Key 限额（Q19/Q41）在网关化评估时一并核算。
- 国际同名城市由 uapis 端自行消歧（如双伦敦）；国内经 adcode 锚定不受影响。已接受的已知限制。
- FR-WX-13 的定位/搜索控件禁用在 manual 模式下尚未实现（历史漂移），如要修复须先立变更提案。
- 天气无自动重试调度是当前产品决策；如未来要加，须先修订本规格 FR-WX-10。
