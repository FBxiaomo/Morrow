# 设计 · uapis-key-fallback

> 前置：proposal.md 已确认（用户指令）。

## 1. 架构影响

| 模块 | 改动 | 理由 |
| --- | --- | --- |
| `src/data/weather.ts` | 双源获取层 | `WeatherService` 构造注入 `{ apiKey?: () => string }`；`Location` 扩坐标；恢复 `mapWmo`/Open-Meteo 分支/`reverseGeocode`；keyed 分支附 Bearer 头 |
| `src/data/settings.ts` | 新键 `weather.apiKey`（text） | R3 schema 注册，UI 自动生成 |
| `src/ui/customizer.ts` | 定位双路径 + Key 输入组 + 署名 | locate 按 Key 分支（uapis IP / GPS+BDC）；城市与定位区追加「uapis 接入」组 |
| `src/main.ts` | 构造接线 | `new WeatherService({ apiKey: () => store.get('weather.apiKey') })` |
| `tests/desktop.spec.ts` | 天气用例双模式矩阵 | keyed 组断言 Bearer 头；keyless 组断言 Open-Meteo 唯一请求源 |

## 2. 数据与迁移

- `horloge.weather-location.v2` 结构扩为 `{name, adcode?, latitude?, longitude?}`——对既有 v2 值（无坐标）向后兼容（字段可选）；v1 迁移恢复保留坐标。
- `weather.apiKey` 属 `desktop.v2.settings` 扁平设置（注册表 §5.1 键数 38→39）；随配置导出/导入（用户自备凭据）。
- 缓存 `horloge.weather.v5` 结构不变（location 内含可选坐标）。

## 3. 预算与降级

- 网络：每次刷新仍一次 GET（keyed uapis ≈1–3KB / keyless Open-Meteo 同前），12s 超时，TTL 30 分钟。
- 降级链：keyed uapis 失败 → 上次天气 + 状态标注（404 专文案）；keyless Open-Meteo 失败 → 同左；keyless 且位置无坐标 → 「该位置缺少坐标，请重新搜索城市」。
- 定位降级：keyed IP 失败 → 「IP 定位失败，请手动搜索城市」；keyless GPS/反查失败 → 「当前位置」占位（0.2.1 原行为）。

## 4. 关键实现决策

1. **双源分支收在 `refresh()` 单点**（keyed ? fetchUapis : fetchOpenMeteo），`WeatherInfo` 对外形状统一，渲染层零感知——避免两套缓存/竞态逻辑。
2. **WMO 档强度取分类基准**——Open-Meteo 无强度语义码（`weather_code` 是现象分类），不为回退档虚构推导表；keyed 档保留 uapis 图标强度语义（deriveIntensity）。
3. **Key 经构造注入 provider 而非 WeatherService 直读 store**——保持 data 层对 settings 的解耦（结构化参数 `{ get(key) }` 同 effectiveIntensity 模式）。
4. **搜索候选坐标恢复必填过滤**（`Number.isFinite(lat/lon)`）——keyless 模式的接入前提；keyed 模式忽略坐标只取名称。
5. **红线精确化**：禁止的仍是「发布者密钥进客户端产物」；「用户自备凭据经设置面板存本机」予以放行（AGENTS.md R12 与能力规格同步修订）。

## 5. 风险

| 风险 | 缓解 |
| --- | --- |
| 用户 Key 泄露面（localStorage / 导出备份 / 聊天记录） | Key 不进仓库与构建产物；导出文件含 Key 提示用户妥善保管；uapis 控制台可删旧 Key 重建（Q21）+ Key 级限速（Q41） |
| keyed↔keyless 切换时缓存语义混串 | 两源共用 revision/TTL/stale 机制；切换 Key 前后位置结构兼容（name/adcode/坐标共存） |
| Open-Meteo 分支恢复引入回归 | 恢复 0.2.1 原映射/定位用例（从 git 历史取行为基线），全量回归把关 |
| 双源文案混淆（用户不知道当前走的哪个） | 设置页 Key 组描述明示「留空即用免 Key 的 Open-Meteo」；署名双源并列 |
