import { lunarInfo, lunarText } from '../data/lunar';
import { weatherText, type WeatherInfo } from '../data/weather';
import type { SettingsStore } from '../data/settings';
import { pomodoro } from '../data/pomodoro';

/**
 * 编辑排版层（v3）：杂志式版面。
 * running head（日期·农历·节气 / 城市天气）+ 大号衬线时间 + 秒线 + 右栏（世界时钟竖排列表 / 番茄钟）+ footer。
 * 全部真实 DOM 文本，粒子只做背景氛围。
 */

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** 月份副题：月序 + 时令短语 */
const MONTH_CN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const SEASON = ['岁寒', '春浅', '春深', '清和', '仲夏', '暑盛', '盛夏', '秋来', '秋深', '暮秋', '初冬', '岁暮'];

const CITY_TZ: Record<string, string> = {
  东京: 'Asia/Tokyo', 大阪: 'Asia/Tokyo', 伦敦: 'Europe/London', 纽约: 'America/New_York',
  巴黎: 'Europe/Paris', 柏林: 'Europe/Berlin', 悉尼: 'Australia/Sydney', 迪拜: 'Asia/Dubai',
  新加坡: 'Asia/Singapore', 香港: 'Asia/Hong_Kong', 台北: 'Asia/Taipei', 上海: 'Asia/Shanghai',
  北京: 'Asia/Shanghai', 首尔: 'Asia/Seoul', 莫斯科: 'Europe/Moscow', 洛杉矶: 'America/Los_Angeles',
  旧金山: 'America/Los_Angeles', 芝加哥: 'America/Chicago', 多伦多: 'America/Toronto',
  圣保罗: 'America/Sao_Paulo', 孟买: 'Asia/Kolkata', 曼谷: 'Asia/Bangkok',
};

const HINTS = 'S · 设置　1-3 · 氛围　T · 制式　F · 全屏　空格 · 番茄（双击结束）　M · 律动';

export class EditorialLayout {
  readonly root: HTMLElement;
  private headLeft: HTMLElement;
  private headRight: HTMLElement;
  private timeEl: HTMLElement;
  private secWrap: HTMLElement;
  private secFill: HTMLElement;
  private subEl: HTMLElement;
  /** 分钟跳变回调（main 用来触发极轻绽放） */
  onMinute: (() => void) | null = null;
  private lastTime: string | null = null;
  private lastSyncSlot = 0;
  private worldEl: HTMLElement;
  private focusEl: HTMLElement;
  private store: SettingsStore;
  private weather: WeatherInfo | null = null;

  constructor(store: SettingsStore) {
    this.store = store;
    this.root = document.createElement('div');
    this.root.className = 'ed';

    // running head
    const headRule = document.createElement('div');
    headRule.className = 'ed-rule';
    const headRow = document.createElement('div');
    headRow.className = 'ed-head-row';
    this.headLeft = document.createElement('div');
    this.headRight = document.createElement('div');
    headRow.append(this.headLeft, this.headRight);

    // 主体：时间块（左） + 右栏
    const body = document.createElement('div');
    body.className = 'ed-body';
    const main = document.createElement('div');
    main.className = 'ed-main';
    this.timeEl = document.createElement('div');
    this.timeEl.className = 'ed-time';
    const secWrap = document.createElement('div');
    secWrap.className = 'ed-sec';
    this.secWrap = secWrap;
    this.secFill = document.createElement('i');
    secWrap.appendChild(this.secFill);
    this.subEl = document.createElement('div');
    this.subEl.className = 'ed-sub';
    main.append(this.timeEl, secWrap, this.subEl);

    const side = document.createElement('div');
    side.className = 'ed-side';
    this.worldEl = document.createElement('div');
    this.worldEl.className = 'ed-world';
    this.focusEl = document.createElement('div');
    this.focusEl.className = 'ed-focus';
    side.append(this.worldEl, this.focusEl);
    body.append(main, side);

    // footer
    const footRule = document.createElement('div');
    footRule.className = 'ed-rule';
    const footRow = document.createElement('div');
    footRow.className = 'ed-foot-row';
    const hints = document.createElement('div');
    hints.textContent = HINTS;
    const sign = document.createElement('div');
    sign.className = 'ed-sign';
    sign.textContent = '末时钟 · Horloge v3';
    footRow.append(hints, sign);

    this.root.append(headRule, headRow, body, footRule, footRow);
    document.body.appendChild(this.root);
    this.refresh();
  }

  /** 天气更新时由 WeatherService 回调 */
  setWeather(info: WeatherInfo | null) {
    this.weather = info;
    this.refresh();
  }

  /** 设置变化 / 视口变化时刷新静态内容 */
  refresh() {
    const now = new Date();
    const info = lunarInfo(now);
    const fmt = this.store.get<string>('content.format');

    // running head 左：日期 · 农历 · 节气（两个开关分别管住日期与农历）
    const showDate = this.store.get<boolean>('content.date');
    const showLunar = this.store.get<boolean>('content.lunar');
    const datePart = showDate
      ? now.getFullYear() + '.' +
        String(now.getMonth() + 1).padStart(2, '0') + '.' +
        String(now.getDate()).padStart(2, '0') +
        ' ' + WEEK[now.getDay()]
      : '';
    const lunarPart = showLunar
      ? lunarText(info) + (info.term ? ' · ' + info.term : '')
      : '';
    this.headLeft.textContent = [datePart, lunarPart].filter(Boolean).join(' · ');

    // running head 右：城市 天气
    const showWeather = this.store.get<boolean>('weather.show') && this.weather;
    const city = this.store.get<string>('weather.city') || '本地';
    this.headRight.textContent = showWeather ? city + ' ' + weatherText(this.weather as WeatherInfo) : '';

    // 副题：月令（12 小时制补上午/下午）
    const period = now.getHours() < 12 ? '上午' : '下午';
    this.subEl.textContent = (fmt === '12' ? period + '　' : '') + MONTH_CN[now.getMonth()] + ' · ' + SEASON[now.getMonth()];

    // 右栏：世界时钟竖排列表
    this.renderWorld(now);
    this.syncSecWidth();
  }

  /** 每 200ms 调用：秒线、时间、世界时钟、番茄钟 */
  tick() {
    const now = new Date();
    const fmt = this.store.get<string>('content.format');

    // 大时间
    const h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    const timeText = fmt === '12'
      ? (h % 12 || 12) + ':' + m
      : String(h).padStart(2, '0') + ':' + m;
    if (this.timeEl.textContent !== timeText) {
      // 分钟跳变：一声极轻的绽放（首帧不触发）
      if (this.lastTime !== null) this.onMinute?.();
      this.lastTime = timeText;
      this.timeEl.textContent = timeText;
      this.syncSecWidth();
    }
    // 秒线宽度定期对齐时间块（字体晚加载 / 视口变化兜底）
    const slot = Math.floor(now.getTime() / 5000);
    if (slot !== this.lastSyncSlot) {
      this.lastSyncSlot = slot;
      this.syncSecWidth();
    }

    // 秒线：一分钟扫满；番茄钟活跃时变进度线
    const secFrac = (now.getSeconds() + now.getMilliseconds() / 1000) / 60;
    const progress = pomodoro.isActive() ? pomodoro.progress() : secFrac;
    this.secFill.style.width = (progress * 100).toFixed(2) + '%';

    // 番茄钟小字
    if (pomodoro.isActive()) {
      this.focusEl.style.display = '';
      this.focusEl.textContent = pomodoro.label();
    } else {
      this.focusEl.style.display = 'none';
    }

    // 世界时钟每约 20 秒重排（分钟粒度足够）
    if (now.getSeconds() % 20 === 0) this.renderWorld(now);
    else if (!this.worldEl.childElementCount) this.renderWorld(now);
  }

  /** 秒线宽度 = 时间块实际渲染宽度 */
  private syncSecWidth() {
    const w = Math.round(this.timeEl.getBoundingClientRect().width);
    if (w > 0) this.secWrap.style.width = w + 'px';
  }

  private renderWorld(now: Date) {
    const showWorld = this.store.get<boolean>('content.world');
    const citiesRaw = this.store.get<string>('content.cities') || '';
    const cities = citiesRaw.split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean);
    if (!showWorld || cities.length === 0) {
      this.worldEl.style.display = 'none';
      return;
    }
    this.worldEl.style.display = '';
    if (this.worldEl.childElementCount !== cities.length) {
      this.worldEl.textContent = '';
      for (const _ of cities) {
        const row = document.createElement('div');
        row.className = 'ed-world-row';
        row.innerHTML = '<span class="ed-city"></span><span class="ed-wtime"></span>';
        this.worldEl.appendChild(row);
      }
    }
    const rows = this.worldEl.children;
    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      const tz = CITY_TZ[city] || city;
      let hhmm = '';
      try {
        hhmm = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
      } catch {
        hhmm = '--:--';
      }
      const row = rows[i] as HTMLElement;
      (row.querySelector('.ed-city') as HTMLElement).textContent = city;
      (row.querySelector('.ed-wtime') as HTMLElement).textContent = hhmm;
    }
  }

  setVisible(visible: boolean) {
    this.root.style.opacity = visible ? '' : '0';
  }
}
