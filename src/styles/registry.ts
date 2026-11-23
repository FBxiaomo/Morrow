import type { Scene } from '../scenes/types';
import type { SettingSchema } from '../data/settings';

/**
 * 样式 = 可一键切换的视觉方案（星尘 / 轨道 / 声波 / 番茄……）。
 * 每个样式自带设置 schema，面板据此生成控件。
 */
export interface StyleDef extends Scene {
  readonly settings: SettingSchema[];
}

export type StyleFactory = () => StyleDef;

export class StyleRegistry {
  private entries: { id: string; title: string; create: StyleFactory }[] = [];

  register(id: string, title: string, create: StyleFactory) {
    this.entries.push({ id, title, create });
  }

  list(): { id: string; title: string }[] {
    return this.entries.map((e) => ({ id: e.id, title: e.title }));
  }

  create(id: string): StyleDef | null {
    const hit = this.entries.find((e) => e.id === id);
    return hit ? hit.create() : null;
  }

  /** 面板 1-9 数字键按注册顺序切换 */
  index(id: string): number {
    return this.entries.findIndex((e) => e.id === id);
  }
}
