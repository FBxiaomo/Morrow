import type { SettingsStore } from '../data/settings';
import { pomodoro, type PomodoroEvent } from '../data/pomodoro';
import { icon } from './icons';

/** A complete, keyboard-accessible focus loop: intent → timer → feedback. */
export class FocusDialog {
  readonly dialog = document.createElement('dialog');
  private previousFocus: HTMLElement | null = null;
  private minutes = 25;
  private notify: (text: string) => void;

  constructor(private store: SettingsStore, notify: (text: string) => void) {
    this.notify = notify;
    this.minutes = store.get<number>('focus.work');
    this.dialog.className = 'focus-dialog';
    this.dialog.setAttribute('aria-labelledby', 'focus-title');
    this.dialog.innerHTML = `
      <header class="focus-header">
        <div><span class="focus-overline">A MOMENT, WITH INTENT</span><h1 id="focus-title">给此刻一个方向</h1></div>
        <button class="icon-button focus-close" aria-label="关闭专注面板">${icon('close')}</button>
      </header>
      <section class="focus-setup">
        <label class="focus-task-field"><span>这一段，想完成什么？</span><input type="text" maxlength="80" placeholder="例如：读完这一章，或写完初稿" aria-label="专注任务"></label>
        <div class="focus-duration"><span>选择时长</span><div class="duration-options" role="group" aria-label="专注时长">
          <button data-minutes="15">15 <small>分钟</small></button><button data-minutes="25">25 <small>分钟</small></button><button data-minutes="45">45 <small>分钟</small></button>
        </div></div>
        <div class="focus-today"><span>今日已专注</span><strong class="today-count">0 段</strong><span class="today-minutes">0 分钟</span></div>
        <button class="focus-notification" role="switch" aria-checked="false">${icon('bell')}<span>到时系统通知</span><i></i></button>
        <button class="focus-start">${icon('play')}<span>开始这段专注</span><kbd>空格</kbd></button>
        <p class="focus-boundary">计时保存在本机。浏览器关闭后无法发送系统通知。</p>
      </section>
      <section class="focus-running" hidden>
        <div class="focus-orbit" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="orbit-track" cx="60" cy="60" r="52"/><circle class="orbit-value" cx="60" cy="60" r="52"/></svg><div class="orbit-content"><span class="focus-phase">专注中</span><strong class="focus-remaining">25:00</strong><span class="focus-cycle">第 1 段</span></div></div>
        <p class="running-task">专注于当下</p>
        <div class="focus-controls"><button class="focus-stop">${icon('stop')}<span>结束</span></button><button class="focus-pause">${icon('pause')}<span>暂停</span></button></div>
        <p class="focus-return-note" hidden>你离开了一段时间。已为你暂停，确认后再继续。</p>
      </section>
      <section class="focus-review" hidden>
        <span class="review-mark">${icon('check')}</span><p class="review-overline">SESSION COMPLETE</p><h2>这一段，值得记下。</h2><p class="review-copy"></p>
        <button class="focus-start review-again">${icon('plus')}<span>再开始一段</span></button>
      </section>`;
    document.body.append(this.dialog);

    this.dialog.querySelector('.focus-close')!.addEventListener('click', () => this.close());
    this.dialog.querySelector('.focus-start')!.addEventListener('click', () => this.start());
    this.dialog.querySelector('.focus-pause')!.addEventListener('click', () => { pomodoro.toggle(); });
    this.dialog.querySelector('.focus-stop')!.addEventListener('click', () => this.stop());
    this.dialog.querySelector('.review-again')!.addEventListener('click', () => this.showSetup());
    this.dialog.querySelector('.focus-notification')!.addEventListener('click', () => void this.toggleNotifications());
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-minutes]').forEach(button => button.addEventListener('click', () => {
      this.minutes = Number(button.dataset.minutes);
      this.store.set('focus.work', this.minutes);
      this.syncDurations();
    }));
    this.dialog.addEventListener('click', event => {
      if (event.target !== this.dialog) return;
      const r = this.dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.close();
    });
    this.dialog.addEventListener('close', () => {
      document.body.classList.remove('focus-open');
      this.previousFocus?.focus();
    });
    pomodoro.onChange(event => this.changed(event));
    this.showSetup();
  }

  get isOpen(): boolean { return this.dialog.open; }

  open() {
    if (pomodoro.isActive()) this.showRunning();
    else if (this.dialog.querySelector<HTMLElement>('.focus-review')!.hidden) this.showSetup();
    if (!this.dialog.open) {
      this.previousFocus = document.activeElement as HTMLElement;
      this.dialog.showModal();
      document.body.classList.add('focus-open');
    }
    this.tick();
  }

  close() { if (this.dialog.open) this.dialog.close(); }

  toggle() {
    if (!pomodoro.isActive()) this.open();
    else pomodoro.toggle();
  }

  tick() {
    if (!pomodoro.isActive()) return;
    const snapshot = pomodoro.snapshot();
    this.el('.focus-remaining').textContent = pomodoro.remainingLabel();
    this.el('.focus-phase').textContent = pomodoro.isPaused() ? '已暂停' : snapshot.phase === 'work' ? '专注中' : snapshot.phase === 'short' ? '短休一下' : '长休一下';
    this.el('.focus-cycle').textContent = snapshot.phase === 'work' ? `第 ${snapshot.cycle + 1} 段` : '让注意力回到自己';
    this.el('.running-task').textContent = snapshot.task || (snapshot.phase === 'work' ? '专注于当下' : '放松一下，暂时不必完成什么');
    const circumference = 2 * Math.PI * 52;
    this.dialog.querySelector<SVGCircleElement>('.orbit-value')!.style.strokeDashoffset = String(circumference * (1 - pomodoro.progress()));
    const pause = this.dialog.querySelector<HTMLButtonElement>('.focus-pause')!;
    pause.innerHTML = `${icon(pomodoro.isPaused() ? 'play' : 'pause')}<span>${pomodoro.isPaused() ? '继续' : '暂停'}</span>`;
    pause.setAttribute('aria-label', pomodoro.isPaused() ? '继续专注' : '暂停专注');
  }

  private start() {
    const input = this.dialog.querySelector<HTMLInputElement>('.focus-task-field input')!;
    this.store.set('focus.work', this.minutes);
    pomodoro.start(input.value);
    this.showRunning();
  }

  private stop() {
    const previous = pomodoro.stop();
    if (!previous) return;
    const minutes = Math.max(1, Math.round((Date.now() - previous.startedAt) / 60_000));
    this.el('.review-copy').textContent = `${previous.task || '无标题专注'} · ${minutes} 分钟。今天又留下了一段完整的时间。`;
    this.showReview();
    this.refreshToday();
  }

  private changed(event: PomodoroEvent) {
    if (pomodoro.isActive()) this.showRunning();
    if (event === 'return') {
      this.el('.focus-return-note').hidden = false;
      this.notify('离开期间的阶段已停止补算，确认后再继续');
    } else this.el('.focus-return-note').hidden = true;
    if (event === 'phase') {
      const snapshot = pomodoro.snapshot();
      const text = snapshot.phase === 'work' ? '休息结束，可以开始下一段专注' : '这一段专注完成，休息一下吧';
      this.notify(text);
      if (this.store.get<boolean>('focus.notifications') && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('末时钟', { body: text, tag: 'horloge-focus' });
      }
      this.refreshToday();
    }
    this.tick();
  }

  private showSetup() {
    this.el('.focus-setup').hidden = false;
    this.el('.focus-running').hidden = true;
    this.el('.focus-review').hidden = true;
    this.el('#focus-title').textContent = '给此刻一个方向';
    this.minutes = this.store.get<number>('focus.work');
    this.syncDurations();
    this.refreshToday();
    this.syncNotification();
  }

  private showRunning() {
    this.el('.focus-setup').hidden = true;
    this.el('.focus-review').hidden = true;
    this.el('.focus-running').hidden = false;
    this.el('#focus-title').textContent = '此刻，只做这一件事';
  }

  private showReview() {
    this.el('.focus-setup').hidden = true;
    this.el('.focus-running').hidden = true;
    this.el('.focus-review').hidden = false;
    this.el('#focus-title').textContent = '完成，比完美更重要';
  }

  private syncDurations() {
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-minutes]').forEach(button => {
      const selected = Number(button.dataset.minutes) === this.minutes;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  private refreshToday() {
    const today = pomodoro.today();
    this.el('.today-count').textContent = `${today.count} 段`;
    this.el('.today-minutes').textContent = `${today.minutes} 分钟`;
  }

  private async toggleNotifications() {
    if (!('Notification' in window)) {
      this.notify('此浏览器不支持系统通知，到时仍会在页面内提醒');
      return;
    }
    if (this.store.get<boolean>('focus.notifications')) {
      this.store.set('focus.notifications', false);
    } else {
      const permission = await Notification.requestPermission();
      this.store.set('focus.notifications', permission === 'granted');
      this.notify(permission === 'granted' ? '到时将发送系统通知' : '未开启系统通知，页面内提醒仍然有效');
    }
    this.syncNotification();
  }

  private syncNotification() {
    const button = this.dialog.querySelector<HTMLButtonElement>('.focus-notification')!;
    const enabled = this.store.get<boolean>('focus.notifications') && 'Notification' in window && Notification.permission === 'granted';
    button.setAttribute('aria-checked', String(enabled));
    button.classList.toggle('on', enabled);
  }

  private el<T extends HTMLElement = HTMLElement>(selector: string): T { return this.dialog.querySelector<T>(selector)!; }
}
