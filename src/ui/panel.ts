import type { SettingsStore, SettingSchema } from '../data/settings';

/**
 * 设置面板：表单由 SettingSchema 生成。
 * 分组：外观 / 内容 / 样式（当前样式自带 schema）/ 关于。
 */
export class Panel {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private store: SettingsStore;
  private styleSelect: HTMLSelectElement;
  private meterFill: HTMLElement;
  private styleGroup: HTMLElement;
  private onStyleChange: (id: string) => void;

  constructor(
    store: SettingsStore,
    opts: {
      styles: { id: string; title: string }[];
      onStyleChange: (id: string) => void;
    },
  ) {
    this.store = store;
    this.onStyleChange = opts.onStyleChange;

    this.root = document.createElement('aside');
    this.root.className = 'panel';
    this.body = document.createElement('div');
    this.body.className = 'panel-body';
    this.root.appendChild(this.body);

    // 样式组（含一键切换下拉）
    const styleGroup = document.createElement('div');
    styleGroup.className = 'panel-group';
    styleGroup.innerHTML = '<div class="panel-title">样式</div>';
    const row = document.createElement('label');
    row.className = 'row';
    row.innerHTML = '<span>当前样式</span>';
    this.styleSelect = document.createElement('select');
    for (const s of opts.styles) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.title;
      this.styleSelect.appendChild(opt);
    }
    this.styleSelect.addEventListener('change', () => this.onStyleChange(this.styleSelect.value));
    row.appendChild(this.styleSelect);
    styleGroup.appendChild(row);
    this.styleGroup = styleGroup;

    // 全局组：外观 / 内容 / 专注 / 律动
    const appearance = this.buildGroup('外观', ['appearance.']);
    const content = this.buildGroup('内容', ['content.']);
    const focusGroup = this.buildGroup('专注', ['focus.']);
    const musicGroup = this.buildGroup('律动', ['audio.']);
    this.meterFill = document.createElement('i');
    const meter = document.createElement('div');
    meter.className = 'level-meter';
    meter.appendChild(this.meterFill);
    musicGroup.appendChild(meter);
    const weatherGroup = this.buildGroup('天气', ['weather.']);

    // 关于
    const about = document.createElement('div');
    about.className = 'panel-group panel-about';
    about.innerHTML = '<div class="panel-title">关于</div><div class="about-text">末时钟 · Horloge v3<br />设置保存在本机</div>';

    this.body.append(styleGroup, appearance, content, focusGroup, musicGroup, weatherGroup, about);
    document.body.appendChild(this.root);
  }

  /** 当前样式变化时刷新样式组设置 */
  setStyle(def: { id: string; title: string; settings: SettingSchema[] }) {
    this.styleSelect.value = def.id;
    // 移除旧的样式设置（保留样式下拉行）
    for (const el of Array.from(this.styleGroup.querySelectorAll('.style-setting'))) el.remove();
    for (const schema of def.settings) {
      const row = this.buildRow(schema);
      row.classList.add('style-setting');
      this.styleGroup.appendChild(row);
    }
  }

  /** 电平表：0–1 */
  setLevel(v: number) {
    this.meterFill.style.width = Math.round(Math.min(1, Math.max(0, v)) * 100) + '%';
  }

  open() {
    this.root.classList.add('open');
  }

  close() {
    this.root.classList.remove('open');
  }

  toggle() {
    this.root.classList.toggle('open');
  }

  get isOpen() {
    return this.root.classList.contains('open');
  }

  private buildGroup(title: string, keyPrefixes: string[]): HTMLElement {
    const group = document.createElement('div');
    group.className = 'panel-group';
    const head = document.createElement('div');
    head.className = 'panel-title';
    head.textContent = title;
    group.appendChild(head);
    for (const schema of this.store.allSchemas()) {
      if (keyPrefixes.some((p) => schema.key.startsWith(p))) {
        group.appendChild(this.buildRow(schema));
      }
    }
    return group;
  }

  private buildRow(schema: SettingSchema): HTMLElement {
    const row = document.createElement('label');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = schema.label;
    row.appendChild(name);

    if (schema.kind === 'slider') {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(schema.min);
      input.max = String(schema.max);
      input.step = String(schema.step);
      input.value = String(this.store.get<number>(schema.key));
      input.addEventListener('input', () => this.store.set(schema.key, parseFloat(input.value)));
      row.appendChild(input);
    } else if (schema.kind === 'toggle') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toggle';
      const render = () => {
        const on = this.store.get<boolean>(schema.key);
        btn.textContent = on ? '开' : '关';
        btn.classList.toggle('on', on);
      };
      render();
      btn.addEventListener('click', () => {
        this.store.set(schema.key, !this.store.get<boolean>(schema.key));
        render();
      });
      row.appendChild(btn);
    } else if (schema.kind === 'select') {
      const sel = document.createElement('select');
      for (const opt of schema.options) {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        sel.appendChild(el);
      }
      sel.value = this.store.get<string>(schema.key);
      sel.addEventListener('change', () => this.store.set(schema.key, sel.value));
      row.appendChild(sel);
    } else if (schema.kind === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'text-input';
      input.value = this.store.get<string>(schema.key);
      input.placeholder = '如：杭州';
      input.addEventListener('change', () => this.store.set(schema.key, input.value));
      row.appendChild(input);
    } else if (schema.kind === 'color') {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = this.store.get<string>(schema.key);
      input.addEventListener('input', () => this.store.set(schema.key, input.value));
      row.appendChild(input);
    }
    return row;
  }
}
