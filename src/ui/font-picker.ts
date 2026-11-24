import type { SettingsStore } from '../data/settings';
import { GLOBAL_SETTINGS, FONT_STACKS } from '../data/settings';
interface LocalFont { family: string; fullName?: string }

export class FontPicker {
  readonly root = document.createElement('section');
  private fonts: {family:string; search:string}[] = [];
  private limit = 50;
  private search: HTMLInputElement;
  private status: HTMLElement;
  private results: HTMLElement;
  private load: HTMLButtonElement;
  constructor(private store: SettingsStore) {
    this.root.className = 'font-picker settings-group';
    this.root.innerHTML = `<div class="font-grid" role="group" aria-label="字体风格"></div><div class="font-local"><button type="button" class="secondary font-read">读取系统字体</button><p class="font-read-status" role="status">点击读取并允许浏览器访问，把已安装的字体加进下方网格。</p><input class="font-search" type="search" aria-label="搜索系统字体" placeholder="搜索字体名称，中英文均可" hidden><div class="font-results" role="group" aria-label="本机字体列表" hidden></div></div><p class="font-current"></p>`;
    this.search = this.root.querySelector('.font-search')!;
    this.status = this.root.querySelector('.font-read-status')!;
    this.results = this.root.querySelector('.font-results')!;
    this.load = this.root.querySelector('.font-read')!;
    this.load.addEventListener('click', () => void this.read());
    this.search.addEventListener('input', () => { this.limit = 50; this.render(); });
    const schema = GLOBAL_SETTINGS.find(s => s.key === 'appearance.font');
    const options = schema && schema.kind === 'select' ? schema.options : [];
    const grid = this.root.querySelector<HTMLElement>('.font-grid')!;
    for (const option of options) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'font-card';
      card.dataset.font = option.value;
      card.setAttribute('aria-label', `字体风格 ${option.label}`);
      const sample = document.createElement('strong');
      sample.textContent = '12:48';
      sample.style.fontFamily = FONT_STACKS[option.value] || FONT_STACKS.sans;
      const name = document.createElement('span');
      name.textContent = option.label;
      card.append(sample, name);
      card.addEventListener('click', () => {
        this.store.set('appearance.fontCustom', '');
        this.store.set('appearance.font', option.value);
      });
      grid.append(card);
    }
    this.store.onChange(key => { if (key === 'appearance.font' || key === 'appearance.fontCustom') this.sync(); });
    if (!import.meta.env.DEV && !('queryLocalFonts' in window)) this.status.textContent = '当前浏览器不支持读取系统字体。可用桌面版 Chrome / Edge 打开。';
    this.sync();
  }
  private async read() {
    const api = window as unknown as {queryLocalFonts?:()=>Promise<LocalFont[]>};
    this.load.disabled = true;
    this.status.textContent = '正在读取，请在浏览器提示中允许访问本机字体…';
    try {
      let faces: LocalFont[] | undefined;
      if(import.meta.env.DEV) {
        try {
          const response = await fetch('/__local-fonts');
          if(response.ok && response.headers.get('content-type')?.includes('application/json')) {
            const data: unknown = await response.json();
            if(Array.isArray(data) && data.every(f=>f && typeof f.family === 'string')) faces = data;
          }
        } catch { /* Browser enumeration remains available when the local host is unavailable. */ }
      }
      if(!faces) {
        if(!api.queryLocalFonts) {this.status.textContent = '当前浏览器不支持读取，请用桌面版 Chrome / Edge 打开本页。';return;}
        faces = await api.queryLocalFonts();
      }
      const families = new Map<string,string[]>();
      for(const font of faces) {
        if(!font.family) continue;
        const names = families.get(font.family) || [];
        names.push(font.fullName || font.family); families.set(font.family,names);
      }
      this.fonts = Array.from(families,([family,names])=>({family,search:[family,...names].join(' ').toLocaleLowerCase()})).sort((a,b)=>a.family.localeCompare(b.family,'zh-CN'));
      this.status.textContent = this.fonts.length ? `已读取 ${this.fonts.length} 个字体家族。可搜索中英文名称，点击预览应用。` : '浏览器未返回可用字体。请检查网站的本机字体权限。';
      this.search.hidden = !this.fonts.length;
      this.results.hidden = !this.fonts.length;
      this.limit = 50; this.render();
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      this.status.textContent = denied ? '未获得本机字体访问权限。请在地址栏的网站设置中允许“本机字体”，然后重新读取。' : '读取失败，请重试。';
    } finally {this.load.disabled = false;this.load.textContent = '重新读取系统字体';}
  }
  private render() {
    const query = this.search.value.trim().toLocaleLowerCase();
    const filtered = this.fonts.filter(font=>font.search.includes(query));
    this.results.replaceChildren();
    for(const font of filtered.slice(0,this.limit)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'font-option'; button.dataset.family = font.family;
      button.setAttribute('aria-label',`选择字体 ${font.family}`);
      const sample = document.createElement('strong');
      sample.textContent = '12:48 此刻';
      sample.style.fontFamily = `${JSON.stringify(font.family)}, sans-serif`;
      const name = document.createElement('span');
      name.textContent = font.family;
      button.append(sample,name);
      button.addEventListener('click',()=>this.store.set('appearance.fontCustom',font.family));
      this.results.append(button);
    }
    if(filtered.length > this.limit) {
      const more = document.createElement('button');more.type = 'button';more.className = 'text-button font-more';
      more.textContent = `显示更多（还有 ${filtered.length-this.limit} 个）`;
      more.addEventListener('click',()=>{this.limit += 50;this.render();});this.results.append(more);
    } else if(this.fonts.length && !filtered.length) this.results.textContent = '没有匹配的字体，试试字体的英文名称。';
    this.sync();
  }
  private sync() {
    const font = this.store.get<string>('appearance.font');
    const custom = this.store.get<string>('appearance.fontCustom').trim();
    this.root.querySelectorAll<HTMLButtonElement>('.font-card').forEach(card=>card.setAttribute('aria-pressed', String(!custom && card.dataset.font === font)));
    this.root.querySelectorAll<HTMLButtonElement>('.font-option').forEach(button=>button.setAttribute('aria-pressed', String(button.dataset.family === custom)));
    const active = GLOBAL_SETTINGS.find(s => s.key === 'appearance.font');
    const label = active && active.kind === 'select' ? active.options.find(o => o.value === font)?.label : font;
    this.root.querySelector('.font-current')!.textContent = custom ? `当前本机字体：${custom}` : `当前字体：${label}`;
  }
}
