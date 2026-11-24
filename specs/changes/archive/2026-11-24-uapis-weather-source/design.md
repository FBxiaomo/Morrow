# 设计 · uapis-weather-source

> 前置：proposal.md 待确认。本文档回答「怎么改」：架构影响、数据、降级、预算。

## 1. 架构影响

| 模块 | 改动 | 理由 |
| --- | --- | --- |
| `src/data/weather.ts` | 重写获取层 | 数据源切换：`Location` 瘦身为 `{name, adcode?}`；请求构造（adcode 优先）、高德码映射、时区换算、`search()` 保留 geocoding、`reverseGeocode()` 删除、新增 `locateByIp()` |
| `src/ui/customizer.ts` | `locate()/located()` 重写 | GPS + BDC 反查 → 单次无参 uapis 调用；署名与模块描述文案更新 |
| `src/ui/dashboard.ts` | 风速行改风力文本 | `wind`（km/h 数字）无源，改 `windText`（风向 + 级数） |
| `src/main.ts` | `setCity` 路径不变，仅随类型瘦身 | 启动回填 `weather.city` 时不再 geocode，直接按名称接入 |
| `tests/*` | mock 域名清单 + 天气用例改写 | NFR-UW-02；用例映射见 proposal §5 |

不新增模块；渲染层（landscape / real-weather / photographic）零改动——它们消费的 `category / isDay / sunrise / sunset` 语义不变。

## 2. 数据与迁移

存储注册表（`docs/项目规范.md` §5）登记：

| 键 | 结构 | 迁移口径 |
| --- | --- | --- |
| `horloge.weather.v5`（新） | `{location: {name, adcode?}, info, fetchedAt}`，TTL 30 分钟 | 旧 `v4` 作废：读入即清理，不迁移内容（旧码为 WMO 语义，且 TTL 本就 30 分钟） |
| `horloge.weather-location.v2`（新） | `{name, adcode?}` | 旧 `v1`（坐标结构）尽力迁移：保留 `name` 作为 `city` 查询名，坐标丢弃；幂等（迁移成功即删 v1） |

`weather.city` 设置键语义不变（显示名）；历史值「当前位置」的存量防御（`!== '当前位置'`）保留。响应回包后若含非空 `adcode` 且位置无 adcode，回写进 location（国内城市刷新从此精确锚定，见 §4 决策 4）。

## 3. 预算与降级

- 网络预算：一次 GET，`extended=true&forecast=true`，响应约 1–3 KB，12s 超时；TTL 30 分钟、无重试轰炸策略维持（规格明示）。
- 渲染预算：无新渲染特性，R7 预算数字全部不变。
- 降级链（逐级）：`adcode 查询 → city 查询`（位置无 adcode 时天然降级）→ 任一失败显示上次天气 + 状态标注 → 首次失败且无缓存显示失败状态；`forecast/sunrise` 解析失败 → `sunrise/sunset/isDay` 缺省 → landscape 既有小时推断回退。
- `report_time` 双格式：ISO 带偏移（国际）直接解析；`YYYY-MM-DD HH:MM:SS`（国内）补 `+08:00` 解析（R5：解析失败回退 `Date.now()`）。

## 4. 关键实现决策

1. **`isDay` 由 `report_time` 对比日出日落判定，不用 weather_icon 夜间码**——实测国际源不产夜间码（东京凌晨 02:30 返回 `101` 白天码），而 `report_time` 与 `sunrise/sunset` 同为城市当地时间，对比即得城市真实昼夜（沿用 Open-Meteo `is_day` 的语义）。
2. **`wind/cloudCover/precipitation` 移除、`windText` 取代**——实测 `cloud/precipitation` 字段国内响应不返回（扩展模块不稳定），`wind_power` 是级数文本非 km/h 数字；这三项在本仓库渲染层零消费（仅 dashboard 一处显示风速），保留「永不填充的可选字段」等于死数据。
3. **category 映射表用高德段位区间而非枚举**（1xx/3xx/4xx/5xx 分段 + 302/303/304 雷雨特判 + 未知回退多云）——与既有 `mapCode` 的 WMO 区间风格一致，对源端新增码天然兜底。
4. **adcode 锚点回写**——uapis 文档明示 `adcode` 优先级最高；IP 定位与国内城市首次按名称查询成功后回写 adcode，后续刷新精确锚定（含区县级），并消除国内重名风险。国际城市无 adcode，持续按 `city` 名称查询。
5. **竞态守卫维持 `revision` 模式**（R5）：`selectLocation / setCity / locateByIp / refresh` 全部自增校验，searchRevision 继续守护「晚到定位不覆盖新选择」。

### 强度自动调节（FR-UW-11/12，2026-11-24 用户追加）

- 推导纯函数 `deriveIntensity(icon, category, windPower)`：`weather_icon` 自带强度语义（305 小雨 35 … 312 特大暴雨 100；400 小雪 30 … 410 大到暴雪 85；500 薄雾 30 … 507 沙尘暴 80），未列码回退分类基准（clear 40 / cloudy 50 / overcast 55 / fog 50 / rain 55 / snow 55 / thunder 85）；`wind_power` 解析出等级均值（`"8-9"`→8.5、`"3级"`→3、`"微风"`→无修正）后按 `(级−3)×5` 修正，钳制 10–100 并对齐步进 5（与滑杆刻度一致，R3 schema：`weather.intensityAuto` toggle 默认关）。
- 解析函数 `effectiveIntensity(store, info)` 为唯一消费入口：live + 自动档 + 实况含推导值 → 用实况值，否则手动滑杆值；landscape 四处消费点与 `WeatherFrame.intensity`（新增必填字段，real-weather 消费）全部经此入口，杜绝五处散读漂移。
- UI 禁用链（`syncControls`）：自动开 → 强度滑杆禁用；manual 模式 → 自动开关禁用（诚实状态，无实况可推导）。

## 5. 风险

| 风险 | 缓解 |
| --- | --- |
| uapis.cn 免费公共接口无 SLA，可能宕机/限流/改字段 | NFR-UW-01 全字段可选 + finite 守卫；降级链显示上次天气；测试全 mock 不真联网 |
| 国际同名城市 uapis 端自行消歧（如双伦敦） | 提案 §6 已知限制明示；国内经 adcode 精确锚定不受影响 |
| `report_time`/`sunrise` 时区解析错误导致昼夜错位 | 双格式显式解析 + 失败回退小时推断；用例覆盖带偏移/无偏移两路 |
| uapis 响应体错误码与文档不符（实测 404 体为 `{"error":"LOCATION_NOT_FOUND"}` 而文档写 `{"code":...}`） | 按 HTTP 状态码分流（404/5xx/网络失败），不解析错误体 |
| 商用红线（P0）性质变化：uapis 同为免密钥直连 | 规格红线对象改写为 uapis，网关化要求不变，商用前仍须评估 |
