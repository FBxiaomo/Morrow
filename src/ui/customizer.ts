import { GLOBAL_SETTINGS, type SettingsStore, type SettingSchema, type SettingValue } from '../data/settings';
import { THEMES, ThemeManager, backgroundImage } from '../data/themes';
import type { WeatherService } from '../data/weather';
import { pomodoro } from '../data/pomodoro';
import { parseCities, resolveCity } from '../data/cities';
import { icon } from './icons';
import { FontPicker } from './font-picker';

export class Customizer {
    readonly dialog = document.createElement('dialog');
    private section = 'themes';
    private previousFocus: HTMLElement | null = null;
    private searchRevision = 0;
    private message: HTMLElement;
    private fontPicker: FontPicker;
    private toastTimer = 0;

    constructor(private store: SettingsStore, private themes: ThemeManager, private weather: WeatherService, private onImage: () => Promise<void>) {
        this.fontPicker = new FontPicker(store);
        this.dialog.className = 'customizer';
        this.dialog.setAttribute('aria-labelledby', 'customizer-title');
        this.dialog.innerHTML = `<header class="customizer-header"><div><span class="small-label">MAKE TIME YOUR OWN</span><h1 id="customizer-title">你的空间，不必相同。</h1></div><button class="icon-button close-customizer" aria-label="关闭设置">${icon('close')}</button></header><nav class="customizer-tabs" aria-label="设置分类"><button data-tab="themes">主题</button><button data-tab="appearance">外观</button><button data-tab="weather">天气</button><button data-tab="content">显示</button><button data-tab="general">通用</button></nav><div class="customizer-content"></div><footer class="customizer-footer"><div class="save-status"><span class="save-note"></span><button class="storage-retry" hidden>重试保存</button></div><button class="primary done">完成 ${icon('arrow')}</button></footer>`;
        document.body.append(this.dialog);
        this.message = document.createElement('div');
        this.message.className = 'toast';
        this.message.setAttribute('role', 'status');
        document.body.append(this.message);
        this.dialog.querySelector('.close-customizer')!.addEventListener('click', () => this.close());
        this.dialog.querySelector('.done')!.addEventListener('click', () => this.close());
        this.dialog.querySelector('.storage-retry')!.addEventListener('click', () => {
            const ok = this.store.retrySave();
            this.updateSaveStatus();
            this.notify(ok ? '设置已保存到这台设备' : '仍无法写入，请导出配置备份');
        });
        this.dialog.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => btn.addEventListener('click', () => { this.section = btn.dataset.tab!; this.render(); }));
        this.dialog.addEventListener('click', e => {
            if (e.target === this.dialog) {
                const r = this.dialog.getBoundingClientRect();
                if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.close();
            }
        });
        this.dialog.addEventListener('close', () => { document.body.classList.remove('customizing'); this.previousFocus?.focus(); });
        store.onChange(() => this.syncControls());
        store.onPersistenceChange(() => this.updateSaveStatus());
        weather.onChange(() => this.updateWeatherStatus());
        this.updateSaveStatus();
        this.render();
    }

    get isOpen() { return this.dialog.open; }
    open(section = 'appearance') {
        this.section = section;
        this.render();
        if (!this.dialog.open) {
            this.previousFocus = document.activeElement as HTMLElement;
            this.dialog.showModal();
            document.body.classList.add('customizing');
        }
    }
    close() { if (this.dialog.open) this.dialog.close(); }
    toggle() { if (this.isOpen) this.close(); else this.open(); }

    notify(text: string) {
        this.message.textContent = text;
        this.message.classList.add('visible');
        const note = this.dialog.querySelector<HTMLElement>('.save-note')!;
        note.textContent = text;
        note.setAttribute('role', 'status');
        window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => { this.message.classList.remove('visible'); this.updateSaveStatus(); }, 3500);
    }

    private updateSaveStatus() {
        const ok = this.store.isPersistent();
        const note = this.dialog.querySelector<HTMLElement>('.save-note');
        const retry = this.dialog.querySelector<HTMLButtonElement>('.storage-retry');
        if (note) note.textContent = ok ? '设置保存在这台设备' : '无法保存 · 当前设置仅本次有效';
        if (retry) retry.hidden = ok;
        this.dialog.classList.toggle('storage-error', !ok);
    }

    private render() {
        this.searchRevision++;
        this.dialog.dataset.section = this.section;
        this.dialog.style.setProperty('--active-tab', String(['themes', 'appearance', 'weather', 'content', 'general'].indexOf(this.section)));
        document.body.dataset.customizer = this.section;
        this.dialog.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => { btn.classList.toggle('selected', btn.dataset.tab === this.section); btn.setAttribute('aria-current', btn.dataset.tab === this.section ? 'page' : 'false'); });
        const body = this.dialog.querySelector<HTMLElement>('.customizer-content')!;
        body.replaceChildren();
        body.scrollTop = 0;
        if (this.section === 'themes') this.renderThemes(body);
        else if (this.section === 'appearance') this.renderAppearance(body);
        else if (this.section === 'weather') this.renderWeather(body);
        else if (this.section === 'content') this.renderContent(body);
        else this.renderGeneral(body);
        this.syncControls();
    }

    private renderThemes(body: HTMLElement) {
        const intro = document.createElement('p');
        intro.className = 'section-intro';
        intro.textContent = '四种气质，同一个此刻。每个主题都会记住你的个人搭配。';
        body.append(intro);
        const grid = document.createElement('div');
        grid.className = 'theme-grid';
        const now = new Date();
        const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
        const date = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', weekday: 'long' }).format(now).toUpperCase();
        for (const [index, theme] of THEMES.entries()) {
            const btn = document.createElement('button');
            btn.className = 'theme-card';
            btn.dataset.themeId = theme.id;
            btn.setAttribute('aria-label', `切换到${theme.name}`);
            btn.innerHTML = `<div class="theme-preview preview-${theme.id}"><i class="preview-orb"></i><i class="preview-ridge"></i><span class="preview-time">${theme.id === 'studio' ? time.replace(':', ' ') : time}</span><span class="preview-date">${date}</span></div><div class="theme-card-caption"><span><small>0${index + 1} / ${theme.en}</small><strong>${theme.name}</strong><em>${theme.description}</em></span><span class="theme-check">${icon('check')}</span></div>`;
            btn.addEventListener('click', () => { this.themes.switch(theme.id); this.syncControls(); });
            grid.append(btn);
        }
        body.append(grid);
    }

    private renderAppearance(body: HTMLElement) {
        const intro = document.createElement('p');
        intro.className = 'section-intro';
        intro.textContent = '字体、排版、背景与动态，按模块逐项搭配。';
        body.append(intro);
        const typography = this.group(body, '字体与字形', ['appearance.font'], '选择字体风格，或读取本机已安装的字体。');
        typography.append(this.fontPicker.root);
        this.group(body, '排版与配色', ['appearance.size', 'appearance.color', 'appearance.position'], '调整时间的大小、颜色和摆放位置。');
        const background = this.group(body, '背景画面', ['background.type', 'background.color'], '主题风景、纯色、渐变或你自己的照片。');
        const fileRow = document.createElement('div');
        fileRow.className = 'upload-row';
        fileRow.innerHTML = '<span>本地背景图片<small>仅保存在此设备 · 支持 JPG / PNG / WebP / AVIF</small></span><label class="secondary upload-label">选择图片<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden></label>';
        fileRow.querySelector('input')!.addEventListener('change', e => void this.upload((e.target as HTMLInputElement).files?.[0]));
        background.append(fileRow);
        const deleteImage = document.createElement('button');
        deleteImage.className = 'text-button delete-background';
        deleteImage.innerHTML = `${icon('trash')} 删除当前主题的自选图片`;
        deleteImage.addEventListener('click', () => void this.deleteBackground());
        background.append(deleteImage);
        this.group(body, '画面氛围', ['background.dim', 'background.blur'], '调节明暗和景深，让时间更容易阅读。');
        this.group(body, '动态与安静', ['appearance.motion', 'appearance.quiet'], '选择动态强度，或让常驻画面在夜间更暗。');
        const reset = document.createElement('button');
        reset.className = 'reset-button';
        reset.textContent = '恢复当前主题的默认搭配';
        reset.addEventListener('click', () => { this.themes.reset(); this.syncControls(); this.notify('已恢复当前主题默认搭配'); });
        body.append(reset);
    }

    private renderWeather(body: HTMLElement) {
        const intro = document.createElement('p');
        intro.className = 'section-intro';
        intro.textContent = '晴雨、云雾与昼夜，让时间有了天气。';
        body.append(intro);
        this.group(body, '天气来源', ['weather.mode', 'weather.show'], '连接城市实况，或选择想看的天气氛围。');
        const qualityNote = document.createElement('p');
        qualityNote.className = 'section-intro quality-note';
        const location = document.createElement('section');
        location.className = 'settings-group location-settings';
        location.innerHTML = `<h2>城市与定位</h2><p class="module-description">搜索城市或使用当前位置，获取实际天气。</p><form class="city-search"><input name="city" autocomplete="off" placeholder="城市名，如 杭州 / London" aria-label="搜索天气城市"><button class="secondary" type="submit">搜索</button></form><div class="city-results" aria-live="polite"></div><div class="location-actions"><button class="text-button locate">${icon('pin')} 使用当前位置</button><button class="text-button refresh-weather">刷新天气</button></div><p class="weather-status" role="status"></p><small class="weather-attribution">天气数据 <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · 位置名称 <a href="https://www.bigdatacloud.com/" target="_blank" rel="noreferrer">BigDataCloud</a> · 定位仅在点击后请求</small>`;
        location.querySelector('form')!.addEventListener('submit', e => { e.preventDefault(); void this.search((location.querySelector('input') as HTMLInputElement).value); });
        location.querySelector('.locate')!.addEventListener('click', () => this.locate());
        location.querySelector('.refresh-weather')!.addEventListener('click', () => void this.weather.refresh(true));
        body.append(location);
        this.group(body, this.store.get('theme') === 'studio' ? '室内采光' : '天空氛围', ['weather.manual', 'weather.daytime'], '自选天气时可自由搭配晴雨与昼夜。');
        this.group(body, '效果与性能', ['weather.quality', 'weather.visual', 'weather.intensity'], '在视觉细节和常驻开销之间选择。');
        const interaction = this.group(body, '雨雪互动', ['weather.wetClock', 'weather.glass', 'weather.lightning']);
        interaction.append(qualityNote);
        this.group(body, '声音实验', ['audio.enabled'], '麦克风律动为实验功能；音频只在本机处理，不上传录音。');
        this.updateWeatherStatus();
    }

    private renderContent(body: HTMLElement) {
        this.group(body, '时间与秒数', ['content.format', 'content.secondsStyle'], '选择时间制式与秒数的呈现方式。');
        this.group(body, '日期与月相', ['content.date', 'content.lunar', 'content.moon']);
        const world = this.group(body, '世界时钟', ['content.world', 'content.cities'], '城市用逗号分隔；也可填写 IANA 时区，例如 Asia/Shanghai。');
        const validation = document.createElement('p');
        validation.className = 'city-validation';
        validation.setAttribute('role', 'status');
        world.append(validation);
        const citiesInput = world.querySelector<HTMLInputElement>('[data-setting="content.cities"]');
        if (citiesInput) {
            citiesInput.placeholder = '东京,伦敦,纽约 或 Asia/Shanghai';
            citiesInput.addEventListener('input', () => this.validateCities(validation, citiesInput.value));
            citiesInput.addEventListener('change', () => this.validateCities(validation, citiesInput.value));
        }
        this.validateCities(validation, this.store.get<string>('content.cities'));
        const focus = this.group(body, '专注计时', ['focus.work', 'focus.short', 'focus.long'], '分别设置专注、短休和长休时长。主入口可编辑任务并查看完成记录。');
        const stop = document.createElement('button');
        stop.className = 'reset-button';
        stop.textContent = '结束本次专注';
        stop.disabled = !pomodoro.isActive();
        stop.addEventListener('click', () => { pomodoro.stop(); this.notify('本次专注已结束'); });
        focus.append(stop);
        const note = document.createElement('p');
        note.className = 'section-intro shortcuts-note';
        note.textContent = '快捷键：S 设置 · F 全屏 · H 纯净显示 · T 切换制式 · 空格 开始/暂停 · 1–4 切换主题。';
        body.append(note);
    }

    /** Explains which entries cannot resolve, before the user leaves the field. */
    private validateCities(target: HTMLElement, raw: string) {
        const cities = parseCities(raw);
        if (!cities.length) {
            target.className = 'city-validation';
            target.textContent = '尚未添加城市，时钟不会显示世界时钟。';
            return;
        }
        const resolved = cities.map(resolveCity);
        const bad = resolved.filter(item => !item.ok);
        if (!bad.length) {
            target.className = 'city-validation ok';
            target.textContent = `${resolved.map(item => item.label).join(' · ')} 已识别，将按时区显示。`;
            return;
        }
        target.className = 'city-validation error';
        target.textContent = `${bad.map(item => `「${item.label}」${item.reason}`).join('；')}。可改用内置城市或 IANA 时区。`;
    }

    private renderGeneral(body: HTMLElement) {
        const intro = document.createElement('p');
        intro.className = 'section-intro';
        intro.textContent = '为常驻使用而设计。时间、设置与图片都留在你的设备上。';
        body.append(intro);
        this.group(body, '常驻体验', ['general.wake'], '需要浏览器支持，并保持页面前台可见；系统节能策略仍可能覆盖此设置。');
        const data = document.createElement('section');
        data.className = 'settings-group data-settings';
        data.innerHTML = `<h2>备份与隐私</h2><p class="module-description">导出带版本号的 JSON 配置，不包含背景图片、精确位置或麦克风数据。</p><div class="data-actions"><button class="secondary export-settings">${icon('download')} 导出配置</button><label class="secondary import-label">${icon('upload')} 导入配置<input class="import-settings" type="file" accept="application/json,.json" hidden></label></div><button class="text-button clear-data">${icon('trash')} 清空本机数据</button><p class="clear-note">清空需要再次点击确认，且无法撤销。</p>`;
        data.querySelector('.export-settings')!.addEventListener('click', () => this.exportSettings());
        data.querySelector('input')!.addEventListener('change', event => void this.importSettings((event.target as HTMLInputElement).files?.[0]));
        data.querySelector('.clear-data')!.addEventListener('click', event => this.clearData(event.currentTarget as HTMLButtonElement));
        body.append(data);
        const about = document.createElement('section');
        about.className = 'settings-group about-settings';
        about.innerHTML = '<h2>末时钟</h2><p class="module-description">版本 0.2.1 · 天气氛围与专注时钟<br>核心界面支持离线重新打开；实时天气仍需要网络。字体不可用时自动使用清晰的系统回退。</p>';
        body.append(about);
    }

    private group(parent: HTMLElement, title: string, keys: string[], description?: string) {
        const group = document.createElement('section');
        group.className = 'settings-group';
        const heading = document.createElement('h2');
        heading.textContent = title;
        group.append(heading);
        if (description) {
            const note = document.createElement('p');
            note.className = 'module-description'; note.textContent = description; group.append(note);
        }
        for (const key of keys) {
            const schema = GLOBAL_SETTINGS.find(s => s.key === key);
            if (schema) group.append(this.control(schema));
        }
        parent.append(group);
        return group;
    }

    private control(schema: SettingSchema) {
        const row = document.createElement('label');
        row.className = 'setting-row';
        const name = document.createElement('span');
        name.textContent = schema.label;
        row.append(name);
        let input: HTMLInputElement | HTMLSelectElement | HTMLButtonElement;
        if (schema.kind === 'select') {
            const select = document.createElement('select');
            for (const opt of schema.options) {
                const el = document.createElement('option');
                el.value = opt.value;
                el.textContent = opt.label;
                select.append(el);
            }
            input = select;
            select.addEventListener('change', () => {
                if (schema.key === 'appearance.font') this.store.set('appearance.fontCustom', '');
                this.store.set(schema.key, select.value);
            });
        } else if (schema.kind === 'toggle') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'switch';
            btn.setAttribute('role', 'switch');
            btn.addEventListener('click', () => this.store.set(schema.key, !this.store.get<boolean>(schema.key)));
            input = btn;
        } else {
            const field = document.createElement('input');
            field.type = schema.kind === 'slider' ? 'range' : schema.kind === 'color' ? 'color' : 'text';
            if (schema.kind === 'slider') {
                field.min = String(schema.min);
                field.max = String(schema.max);
                field.step = String(schema.step);
                const out = document.createElement('output');
                out.dataset.output = schema.key;
                row.append(out);
            }
            if (schema.key === 'content.cities') field.placeholder = '东京,伦敦,纽约 或 IANA 时区';
            field.addEventListener(schema.kind === 'text' ? 'change' : 'input', () => this.store.set(schema.key, schema.kind === 'slider' ? Number(field.value) : field.value));
            input = field;
        }
        input.dataset.setting = schema.key;
        input.setAttribute('aria-label', schema.label);
        row.append(input);
        return row;
    }

    private syncControls() {
        this.dialog.querySelectorAll<HTMLElement>('[data-setting]').forEach(el => {
            const key = el.dataset.setting!, value = this.store.get(key);
            if (el instanceof HTMLButtonElement) {
                el.classList.toggle('on', value === true);
                el.setAttribute('aria-checked', String(value === true));
            } else (el as HTMLInputElement).value = String(value);
            const disabled = key === 'weather.manual' && this.store.get('weather.mode') !== 'manual'
                || ['weather.intensity', 'weather.lightning'].includes(key) && !this.store.get('weather.visual')
                || key === 'weather.wetClock' && (this.store.get('weather.quality') !== 'realistic' || !this.store.get('weather.visual') || this.store.get('theme') === 'window')
                || key === 'weather.glass' && (!this.store.get('weather.visual') || this.store.get('theme') !== 'window');
            (el as HTMLInputElement).disabled = disabled;
            if (key === 'weather.glass') (el.closest('.setting-row') as HTMLElement).hidden = this.store.get('theme') !== 'window';
            el.closest('.setting-row')?.classList.toggle('disabled', disabled);
        });
        const qualityNote = this.dialog.querySelector('.quality-note');
        if (qualityNote) qualityNote.textContent = this.store.get('theme') === 'studio' ? '雨雪粒子与其他主题同源，写实档会打湿数字、溅起水花；墙面原有的斜向光区随天气变冷变暗，雪天保留雪斑、云影与室内雷光。' : this.store.get('theme') === 'window'
            ? '窗边的雨水落在外侧玻璃上，室内时钟保持清晰。写实增加体积云、水滴折射与流动水痕；轻量保留简单雨滴。'
            : '轻量适合日常常驻；写实增加体积云与昼夜光照、景深雨雪、数字上的水珠与溅射，开销更高。';
        this.dialog.querySelectorAll<HTMLOutputElement>('[data-output]').forEach(el => el.value = String(this.store.get(el.dataset.output!)));
        this.dialog.querySelectorAll<HTMLElement>('[data-theme-id]').forEach(el => { const selected = el.dataset.themeId === this.themes.id; el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected)); });
        const deleteButton = this.dialog.querySelector<HTMLButtonElement>('.delete-background');
        if (deleteButton) deleteButton.hidden = this.store.get('background.type') !== 'image';
    }

    private updateWeatherStatus() {
        const status = this.dialog.querySelector('.weather-status');
        if (status) status.textContent = (this.weather.current()?.city ? this.weather.current()!.city + ' · ' : '') + this.weather.status;
    }

    private async search(query: string) {
        const revision = ++this.searchRevision;
        const results = this.dialog.querySelector<HTMLElement>('.city-results');
        if (!results) return;
        results.textContent = query.trim().length < 2 ? '请输入至少两个字符' : '正在搜索…';
        if (query.trim().length < 2) return;
        try {
            const hits = await this.weather.search(query);
            if (revision !== this.searchRevision) return;
            results.replaceChildren();
            if (!hits.length) results.textContent = '未找到城市，试试完整名称或英文名。';
            for (const hit of hits) {
                const btn = document.createElement('button');
                btn.className = 'city-result';
                btn.textContent = [hit.name, hit.admin1, hit.country].filter(Boolean).join(' · ');
                btn.addEventListener('click', () => { this.searchRevision++; results.replaceChildren(); this.store.set('weather.city', hit.name); this.store.set('weather.mode', 'live'); void this.weather.selectLocation(hit); });
                results.append(btn);
            }
        } catch {
            if (revision === this.searchRevision) results.textContent = '搜索连接失败，请检查网络后重试。';
        }
    }

    private locate() {
        if (!navigator.geolocation) { this.notify('此浏览器不支持定位，请手动搜索城市'); return; }
        this.notify('正在请求位置…');
        const revision = ++this.searchRevision;
        navigator.geolocation.getCurrentPosition(position => {
            void this.located(revision, position.coords.latitude, position.coords.longitude);
        }, () => this.notify('无法获取位置，可以手动搜索城市'), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    }

    /** Applies located coordinates after resolving their place name; a newer choice wins. */
    private async located(revision: number, latitude: number, longitude: number) {
        this.notify('正在识别位置…');
        let name = '当前位置';
        try {
            name = await this.weather.reverseGeocode(latitude, longitude);
        } catch { /* The honest placeholder keeps the weather usable. */ }
        if (revision !== this.searchRevision)
            return;
        this.store.set('weather.city', name);
        this.store.set('weather.mode', 'live');
        void this.weather.selectLocation({ name, latitude, longitude });
    }

    private async upload(file?: File) {
        if (!file) return;
        if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) { this.notify('请选择 JPG、PNG、WebP 或 AVIF 图片'); return; }
        if (file.size > 20 * 1024 * 1024) { this.notify('请选择小于 20 MB 的图片'); return; }
        const theme = this.themes.id;
        try {
            const bitmap = await createImageBitmap(file);
            const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('decode')), 'image/webp', .9));
            await backgroundImage('put', theme, blob);
            if (theme === this.themes.id) {
                this.store.set('background.type', 'image');
                await this.onImage();
            }
            this.notify('背景图片已保存在本机');
        } catch { this.notify('图片无法读取或保存，请换一张图片重试'); }
    }

    private async deleteBackground() {
        try {
            await backgroundImage('delete', this.themes.id);
            this.store.set('background.type', 'scene');
            await this.onImage();
            this.notify('自选背景已删除，已恢复主题风景');
        } catch { this.notify('暂时无法删除背景，请重试'); }
    }

    private exportSettings() {
        const payload = { app: 'horloge-finale', version: 1, exportedAt: new Date().toISOString(), settings: this.store.snapshot() };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `末时钟配置-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.notify('配置已导出，不包含图片与位置数据');
    }

    private async importSettings(file?: File) {
        if (!file) return;
        if (file.size > 1024 * 1024) { this.notify('配置文件过大，请选择有效的末时钟备份'); return; }
        try {
            const parsed = JSON.parse(await file.text()) as { app?: string; version?: number; settings?: Record<string, SettingValue> };
            if (parsed.app !== 'horloge-finale' || parsed.version !== 1 || !parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) throw new Error('invalid');
            let count = 0;
            for (const [key, value] of Object.entries(parsed.settings)) {
                if (!this.store.schema(key) || !['number', 'boolean', 'string'].includes(typeof value)) continue;
                this.store.set(key, value);
                count++;
            }
            if (!count) throw new Error('empty');
            this.notify(`已导入 ${count} 项设置，并逐项校验`);
        } catch { this.notify('无法导入：文件格式或版本不受支持'); }
    }

    private clearData(button: HTMLButtonElement) {
        if (button.dataset.confirm !== 'true') {
            button.dataset.confirm = 'true';
            button.textContent = '再次点击，确认清空全部本机数据';
            window.setTimeout(() => { if (button.isConnected) { button.dataset.confirm = 'false'; button.innerHTML = `${icon('trash')} 清空本机数据`; } }, 5000);
            return;
        }
        localStorage.clear();
        indexedDB.deleteDatabase('horloge-images');
        location.reload();
    }
}
