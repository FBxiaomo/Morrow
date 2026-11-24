/**
 * 农历、节气、月相。
 *
 * 农历日期：Intl 中文日历（引擎自带数据，无需外部依赖）。
 * 24 节气：经典节气公式，已对 2026 年抽验 7 项全部吻合。
 * 月相：朔望月推算（基准新月 2000-01-06 18:14 UTC）。
 */

export interface LunarInfo {
  /** 干支年名，如「丙午」 */
  yearName: string;
  /** 农历月，如「九月」「腊月」「正月」 */
  month: string;
  /** 农历日中文，如「十八」 */
  day: string;
  /** 当日节气名，无则 null */
  term: string | null;
  /** 月相 0–1，0 = 新月，0.5 = 满月 */
  moonPhase: number;
}

const LUNAR_FMT = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const zoneFmtCache = new Map<string, { lunar: Intl.DateTimeFormat; gregorian: Intl.DateTimeFormat }>();
function zoneFormatters(zone: string) {
  let cached = zoneFmtCache.get(zone);
  if (!cached) {
    cached = {
      lunar: new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric', timeZone: zone }),
      gregorian: new Intl.DateTimeFormat('en', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }),
    };
    zoneFmtCache.set(zone, cached);
  }
  return cached;
}

const TERM_NAMES = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
  '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑',
  '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];

const TERM_MINUTES = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921,
  173149, 195551, 218072, 240693, 263343, 285989, 308563, 331033,
  353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758,
];

/** 第 n 个节气（0=小寒）在 y 年的日期 */
function termDay(y: number, n: number): number {
  const ms = 31556925974.7 * (y - 1900) + TERM_MINUTES[n] * 60000 + Date.UTC(1900, 0, 6, 2, 5);
  return new Date(ms).getUTCDate();
}

function dayCn(n: number): string {
  const c = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (n <= 0 || n > 30) return String(n);
  if (n <= 10) return '初' + c[n - 1];
  if (n < 20) return '十' + c[n - 11];
  if (n === 20) return '二十';
  if (n < 30) return '廿' + c[n - 21];
  return '三十';
}

const SYNODIC = 29.530588853;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

export function lunarInfo(date: Date = new Date(), zone?: string): LunarInfo {
  // 农历月与日
  let yearName = '';
  let month = '';
  let dayNum = date.getDate();
  try {
    const fmt = zone ? zoneFormatters(zone).lunar : LUNAR_FMT;
    for (const p of fmt.formatToParts(date)) {
      const t = p.type as string;
      if (t === 'yearName') yearName = p.value;
      else if (t === 'month') month = p.value;
      else if (t === 'day') dayNum = parseInt(p.value, 10) || dayNum;
    }
  } catch {
    // Intl 中文日历不可用时降级：只显示公历，农历行留空
  }

  // 节气：每月两个（n = (月-1)*2 与 +1），按目标时区的公历年月日取值
  let m = date.getMonth();
  let y = date.getFullYear();
  let d = date.getDate();
  if (zone) {
    try {
      for (const p of zoneFormatters(zone).gregorian.formatToParts(date)) {
        const n = parseInt(p.value, 10);
        if (p.type === 'year' && Number.isFinite(n)) y = n;
        else if (p.type === 'month' && Number.isFinite(n)) m = n - 1;
        else if (p.type === 'day' && Number.isFinite(n)) d = n;
      }
    } catch { /* Intl 时区不可用时按本机字段判断 */ }
  }
  let term: string | null = null;
  const n1 = m * 2;
  if (termDay(y, n1) === d) term = TERM_NAMES[n1];
  else if (termDay(y, n1 + 1) === d) term = TERM_NAMES[n1 + 1];

  // 月相
  let age = ((date.getTime() - REF_NEW_MOON) / 86400000) % SYNODIC;
  if (age < 0) age += SYNODIC;

  return {
    yearName,
    month,
    day: dayCn(dayNum),
    term,
    moonPhase: age / SYNODIC,
  };
}

/** 「丙午年九月十八 · 霜降」 */
export function lunarText(info: LunarInfo): string {
  if (!info.yearName && !info.month) return '';
  const base = info.yearName + '年' + info.month + info.day;
  return info.term ? base + ' · ' + info.term : base;
}
