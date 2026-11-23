import { GLOBAL_SETTINGS, type SettingsStore, type SettingValue } from './settings';
export const THEMES = [
    { id: 'sky', name: '天幕', en: 'OPEN SKY', description: '把时间，交给天空。', font: 'light', color: '#ffffff', world: false },
    { id: 'studio', name: '数字工作室', en: 'DIGITAL STUDIO', description: '清晰的数字，自在的节奏。', font: 'sans', color: '#292c2a', world: true },
    { id: 'window', name: '窗边', en: 'BY THE WINDOW', description: '听一场雨，等一刻光。', font: 'serif', color: '#f6f0e8', world: false },
    { id: 'editorial', name: '静谧编辑', en: 'QUIET EDITION', description: '留白之间，时间有了形状。', font: 'serif', color: '#e9dfce', world: true },
] as const;
export type ThemeId = typeof THEMES[number]['id'];
const PERSONAL_KEYS = GLOBAL_SETTINGS.filter(s => s.key.startsWith('appearance.') || s.key.startsWith('background.') || s.key.startsWith('content.')).map(s => s.key);
const STORAGE = 'horloge.theme-profiles.v1';
export class ThemeManager {
    private profiles: Record<string, Record<string, SettingValue>> = {};
    private switching = false;
    id: ThemeId = 'sky';
    constructor(private store: SettingsStore) {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE) || '{}');
            if (raw && typeof raw === 'object' && !Array.isArray(raw))
                this.profiles = raw;
        }
        catch { /* Defaults remain available when storage is unavailable. */ }
        const saved = store.get<string>('theme');
        this.id = THEMES.some(t => t.id === saved) ? saved as ThemeId : 'sky';
        this.apply();
        store.onChange(key => {
            if (!this.switching && PERSONAL_KEYS.includes(key))
                this.save();
        });
    }
    switch(id: string) {
        if (!THEMES.some(t => t.id === id) || id === this.id)
            return;
        this.save();
        this.id = id as ThemeId;
        this.apply();
    }
    reset() {
        delete this.profiles[this.id];
        this.apply();
        this.save();
    }
    private apply() {
        this.switching = true;
        const theme = THEMES.find(t => t.id === this.id)!;
        const defaults: Record<string, SettingValue> = Object.fromEntries(GLOBAL_SETTINGS.filter(s => PERSONAL_KEYS.includes(s.key)).map(s => [s.key, s.default]));
        Object.assign(defaults, {
            'appearance.font': theme.font, 'appearance.color': theme.color,
            'content.world': theme.world, 'content.moon': false,
            'background.color': theme.id === 'studio' ? '#ecebe3' : '#273956',
            'background.dim': theme.id === 'editorial' ? 25 : 8,
        });
        const rawProfile = this.profiles[this.id];
        const profile = rawProfile && typeof rawProfile === 'object' && !Array.isArray(rawProfile) ? rawProfile : null;
        if (profile && !('content.secondsStyle' in profile)) {
            profile['content.secondsStyle'] = profile['content.seconds'] === true ? 'both' : 'bar';
        }
        for (const key of PERSONAL_KEYS)
            this.store.set(key, profile && key in profile ? profile[key] : defaults[key]);
        document.body.dataset.theme = this.id;
        this.store.set('theme', this.id);
        this.switching = false;
    }
    private save() {
        this.profiles[this.id] = this.store.snapshot(PERSONAL_KEYS);
        try {
            localStorage.setItem(STORAGE, JSON.stringify(this.profiles));
        }
        catch { /* Session settings still work. */ }
    }
}
/** Blob storage avoids filling localStorage with large image strings. */
export async function backgroundImage(action: 'get' | 'put' | 'delete', theme: string, file?: Blob): Promise<Blob | undefined> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('horloge-images', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('images');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('images', action === 'get' ? 'readonly' : 'readwrite');
            const table = tx.objectStore('images');
            const req = action === 'get' ? table.get(theme) : action === 'put' ? table.put(file, theme) : table.delete(theme);
            let result: Blob | undefined;
            req.onsuccess = () => { result = action === 'get' ? req.result as Blob | undefined : undefined; };
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }
    finally {
        db.close();
    }
}
