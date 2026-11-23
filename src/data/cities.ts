/** City names and IANA zones shared by the clock display and the settings validation. */
export const CITY_ZONES: Record<string, string> = {
    东京: 'Asia/Tokyo', 大阪: 'Asia/Tokyo', 京都: 'Asia/Tokyo', 札幌: 'Asia/Tokyo',
    首尔: 'Asia/Seoul', 釜山: 'Asia/Seoul',
    北京: 'Asia/Shanghai', 上海: 'Asia/Shanghai', 广州: 'Asia/Shanghai', 深圳: 'Asia/Shanghai', 杭州: 'Asia/Shanghai', 成都: 'Asia/Shanghai', 香港: 'Asia/Hong_Kong', 台北: 'Asia/Taipei', 澳门: 'Asia/Macau',
    新加坡: 'Asia/Singapore', 曼谷: 'Asia/Bangkok', 吉隆坡: 'Asia/Kuala_Lumpur', 雅加达: 'Asia/Jakarta', 马尼拉: 'Asia/Manila', 河内: 'Asia/Ho_Chi_Minh', 胡志明市: 'Asia/Ho_Chi_Minh',
    孟买: 'Asia/Kolkata', 新德里: 'Asia/Kolkata', 班加罗尔: 'Asia/Kolkata', 德里: 'Asia/Kolkata',
    迪拜: 'Asia/Dubai', 阿布扎比: 'Asia/Dubai', 特拉维夫: 'Asia/Jerusalem', 伊斯坦布尔: 'Europe/Istanbul',
    莫斯科: 'Europe/Moscow', 圣彼得堡: 'Europe/Moscow',
    伦敦: 'Europe/London', 巴黎: 'Europe/Paris', 柏林: 'Europe/Berlin', 慕尼黑: 'Europe/Berlin', 法兰克福: 'Europe/Berlin', 罗马: 'Europe/Rome', 米兰: 'Europe/Rome', 马德里: 'Europe/Madrid', 巴塞罗那: 'Europe/Madrid',
    阿姆斯特丹: 'Europe/Amsterdam', 布鲁塞尔: 'Europe/Brussels', 苏黎世: 'Europe/Zurich', 维也纳: 'Europe/Vienna', 斯德哥尔摩: 'Europe/Stockholm', 哥本哈根: 'Europe/Copenhagen', 奥斯陆: 'Europe/Oslo', 赫尔辛基: 'Europe/Helsinki', 华沙: 'Europe/Warsaw', 布拉格: 'Europe/Prague', 雅典: 'Europe/Athens', 里斯本: 'Europe/Lisbon', 都柏林: 'Europe/Dublin',
    纽约: 'America/New_York', 波士顿: 'America/New_York', 华盛顿: 'America/New_York', 亚特兰大: 'America/New_York', 迈阿密: 'America/New_York', 多伦多: 'America/Toronto', 蒙特利尔: 'America/Toronto',
    芝加哥: 'America/Chicago', 休斯敦: 'America/Chicago', 达拉斯: 'America/Chicago',
    丹佛: 'America/Denver', 凤凰城: 'America/Phoenix',
    洛杉矶: 'America/Los_Angeles', 旧金山: 'America/Los_Angeles', 西雅图: 'America/Los_Angeles', 圣迭戈: 'America/Los_Angeles', 温哥华: 'America/Vancouver',
    墨西哥城: 'America/Mexico_City', 圣保罗: 'America/Sao_Paulo', 里约热内卢: 'America/Sao_Paulo', 布宜诺斯艾利斯: 'America/Argentina/Buenos_Aires', 利马: 'America/Lima', 圣地亚哥: 'America/Santiago', 波哥大: 'America/Bogota',
    悉尼: 'Australia/Sydney', 墨尔本: 'Australia/Melbourne', 布里斯班: 'Australia/Brisbane', 珀斯: 'Australia/Perth', 奥克兰: 'Pacific/Auckland', 惠灵顿: 'Pacific/Auckland',
    开罗: 'Africa/Cairo', 开普敦: 'Africa/Johannesburg', 约翰内斯堡: 'Africa/Johannesburg', 内罗毕: 'Africa/Nairobi', 拉各斯: 'Africa/Lagos',
};

const MODERN_CITY_NAME = /^[\p{L}\p{M}\s.'’\-]{2,32}$/u;

/** Common English spellings, so a search result can be pasted straight in. */
const EN_ALIASES: Record<string, string> = {
    tokyo: 'Asia/Tokyo', osaka: 'Asia/Tokyo', kyoto: 'Asia/Tokyo', sapporo: 'Asia/Tokyo',
    seoul: 'Asia/Seoul', busan: 'Asia/Seoul',
    beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai', guangzhou: 'Asia/Shanghai', shenzhen: 'Asia/Shanghai', hangzhou: 'Asia/Shanghai', chengdu: 'Asia/Shanghai',
    'hong kong': 'Asia/Hong_Kong', taipei: 'Asia/Taipei', macau: 'Asia/Macau', macao: 'Asia/Macau',
    singapore: 'Asia/Singapore', bangkok: 'Asia/Bangkok', 'kuala lumpur': 'Asia/Kuala_Lumpur', jakarta: 'Asia/Jakarta', manila: 'Asia/Manila', hanoi: 'Asia/Ho_Chi_Minh', 'ho chi minh city': 'Asia/Ho_Chi_Minh', saigon: 'Asia/Ho_Chi_Minh',
    mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', bangalore: 'Asia/Kolkata', bengaluru: 'Asia/Kolkata',
    dubai: 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai', 'tel aviv': 'Asia/Jerusalem', istanbul: 'Europe/Istanbul',
    moscow: 'Europe/Moscow', 'saint petersburg': 'Europe/Moscow', 'st petersburg': 'Europe/Moscow',
    london: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin', munich: 'Europe/Berlin', frankfurt: 'Europe/Berlin',
    rome: 'Europe/Rome', milan: 'Europe/Rome', madrid: 'Europe/Madrid', barcelona: 'Europe/Madrid',
    amsterdam: 'Europe/Amsterdam', brussels: 'Europe/Brussels', zurich: 'Europe/Zurich', vienna: 'Europe/Vienna',
    stockholm: 'Europe/Stockholm', copenhagen: 'Europe/Copenhagen', oslo: 'Europe/Oslo', helsinki: 'Europe/Helsinki',
    warsaw: 'Europe/Warsaw', prague: 'Europe/Prague', athens: 'Europe/Athens', lisbon: 'Europe/Lisbon', dublin: 'Europe/Dublin',
    'new york': 'America/New_York', boston: 'America/New_York', 'washington dc': 'America/New_York', washington: 'America/New_York',
    atlanta: 'America/New_York', miami: 'America/New_York', toronto: 'America/Toronto', montreal: 'America/Toronto',
    chicago: 'America/Chicago', houston: 'America/Chicago', dallas: 'America/Chicago',
    denver: 'America/Denver', phoenix: 'America/Phoenix',
    'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', seattle: 'America/Los_Angeles', 'san diego': 'America/Los_Angeles', vancouver: 'America/Vancouver',
    'mexico city': 'America/Mexico_City', 'sao paulo': 'America/Sao_Paulo', 'rio de janeiro': 'America/Sao_Paulo',
    'buenos aires': 'America/Argentina/Buenos_Aires', lima: 'America/Lima', santiago: 'America/Santiago', bogota: 'America/Bogota',
    sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', brisbane: 'Australia/Brisbane', perth: 'Australia/Perth',
    auckland: 'Pacific/Auckland', wellington: 'Pacific/Auckland',
    cairo: 'Africa/Cairo', 'cape town': 'Africa/Johannesburg', johannesburg: 'Africa/Johannesburg', nairobi: 'Africa/Nairobi', lagos: 'Africa/Lagos',
};

export type CityResolution =
    | { ok: true; label: string; zone: string }
    | { ok: false; label: string; reason: string };

/** Resolves a user-typed city into a time zone, explaining any failure. */
export function resolveCity(input: string): CityResolution {
    const label = input.trim();
    if (!label) return { ok: false, label, reason: '空条目' };
    const named = CITY_ZONES[label];
    if (named) return { ok: true, label, zone: named };
    const alias = EN_ALIASES[label.toLowerCase()];
    if (alias) return { ok: true, label, zone: alias };
    if (/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(label)) {
        try {
            new Intl.DateTimeFormat('zh-CN', { timeZone: label }).format(new Date());
            return { ok: true, label, zone: label };
        } catch {
            return { ok: false, label, reason: '时区名称不存在' };
        }
    }
    if (!MODERN_CITY_NAME.test(label)) return { ok: false, label, reason: '含有无效字符' };
    return { ok: false, label, reason: '城市未收录' };
}

export function parseCities(raw: string): string[] {
    return raw.split(/[,，、;；]/).map(part => part.trim()).filter(Boolean).slice(0, 5);
}

export function formatCityTime(now: Date, zone: string): string {
    return new Intl.DateTimeFormat('zh-CN', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}
