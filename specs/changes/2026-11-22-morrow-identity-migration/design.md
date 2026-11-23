# 设计 · morrow-identity-migration（B 阶段）

> 前置：proposal.md 决策待办已获确认。

## 1. 架构影响

| 模块 | 改动 | 理由 |
| --- | --- | --- |
| `src/data/settings.ts` | 新增一次性迁移钩子（复用 `experience.version` 模式，5 → 6） | 全局迁移协调点：设置迁移 + 通知其余服务执行各自迁移 |
| `src/data/settings.ts` | `STORAGE_KEY` 改为 `morrow.v1.settings`，构造函数先读新键、未命中读旧键 `desktop.v2.settings` 并回写 | FR-MIG-01/02 |
| `src/data/themes.ts` | profile 键改 `morrow.theme-profiles.v1`，读旧写新删旧；IndexedDB 新库 `morrow-images`，打开旧库逐主题复制 Blob 后删除 | 同上 |
| `src/data/pomodoro.ts` | 快照键 `morrow.v1.pomodoro`、历史键 `morrow.focus-history.v1`，同样读旧写新 | 同上 |
| `src/data/weather.ts` | 缓存键 `morrow.weather.v1`（顺带从 v4 重启版本计数）+ 位置键 `morrow.weather-location.v1` | 缓存类数据，迁移失败可接受直接失效（不读旧） |
| `src/ui/customizer.ts` | 导出 `app: 'morrow'`；导入白名单 `['horloge-finale', 'morrow']`；清空数据删除新旧两套键 + 两个 IndexedDB 库 | FR-MIG-03/07 |
| `src/ui/focus.ts` | 通知 tag `morrow-focus` | FR-MIG-06 |
| `public/sw.js` | 缓存名 `morrow-shell-v1`，预缓存含 `/morrow-mark.svg`；activate 白名单仅留新名（旧 `horloge-shell-v1` 自动清理） | FR-MWA-04/05 |
| `public/manifest.webmanifest`、`src/desktop.css` | 图标引用改 `/morrow-mark.svg`（文件同时改名） | FR-MIG-05 |
| `docs/项目规范.md` §5.2 | 存储注册表更新为新键 + 迁移状态 | NFR-MIG-01 |

## 2. 数据与迁移

统一模式（每个键独立实现，禁止全局「一把梭」）：

```
构造/首次访问：
  new = read(新键)
  if (new === null) {
    old = read(旧键)
    if (old !== null) { write(新键, old); remove(旧键); }
  }
```

- **设置迁移钩子**沿用 0.2.0 的 `experience.version` 单向版本钩子（settings.ts 已有先例），版本 5 → 6，构造时执行一次。
- **IndexedDB**：新库 `morrow-images`（结构同旧库），异步逐主题 `get → put` 复制，全部成功后 `deleteDatabase('horloge-images')`；复制中途失败保留旧库，下次重试（幂等）。
- **天气缓存**：直接弃旧不迁移（30 分钟 TTL，无迁移价值），但位置键（用户最近城市）必须迁移。
- **回滚安全**：迁移只删旧键不防回滚版本——本产品无降级发布路径，接受。

## 3. 预算与降级

无渲染预算影响。迁移全部同步代码（IndexedDB 异步但无用户可感知延迟）；单次迁移总耗时预算 < 50ms（数据量极小，图片复制除外，异步不阻塞首帧）。

## 4. 关键实现决策

1. **读旧写新删旧**而非「双读长期并存」——避免 N 个版本后仍要兼容两套键（AGENTS.md R4：改键 = 写迁移，本提案即其范本）。
2. **导出导入白名单**而非转换——旧备份文件原样可导入，用户资产不受发布节奏绑架（FR-SS-13 修订为白名单语义）。
3. **缓存名带品牌不带版本语义变化**——`morrow-shell-v1` 沿用 `-v1` 后缀表达结构版本，activate 白名单机制天然清理旧名（sw.js 既有行为）。
4. **迁移不捆绑功能发布**——单独 0.2.2，回归来源清晰。

## 5. 风险

| 风险 | 缓解 |
| --- | --- |
| 用户在迁移瞬间关闭页面 → 数据只在新旧键之一 | 迁移顺序「先写新后删旧」，任意中断都保留至少一份完整数据 |
| 旧 IndexedDB 复制中途失败 → 图片可能双库存活 | 幂等重试；清空数据入口兜底删除两库（FR-MIG-07） |
| 遗漏某处硬编码旧名 | 全仓库 grep `horloge` 收口（遗留模块除外，已冻结）；测试断言旧键读取为 null |
