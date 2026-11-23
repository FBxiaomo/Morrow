/** Keyboard shortcuts and quiet, input-aware toolbar visibility. */
export interface ShellHandlers {
  onSettings: () => void;
  onEscape: () => void;
  onFullscreen: () => void;
  onFormatToggle: () => void;
  onPomodoroToggle: () => void;
  onMusicToggle: () => void;
  onPureToggle: () => void;
  onStyleSwitch: (index: number) => void;
  isBusy?: () => boolean;
  /** True briefly after Escape dismissed a panel, so a stray Space is ignored. */
  isDismissed?: () => boolean;
}

export class Shell {
  private idleTimer = 0;
  private handlers: ShellHandlers;

  constructor(handlers: ShellHandlers) {
    this.handlers = handlers;
    window.addEventListener('keydown', this.wake);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointermove', this.wake);
    window.addEventListener('pointerdown', this.wake);
    document.addEventListener('focusin', this.wake);
    this.wake();
  }

  private onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (e.key === 'Escape') {
      this.handlers.onEscape();
      return;
    }
    if (typing) return;
    if (target?.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.key) {
      case 's': case 'S': this.handlers.onSettings(); break;
      case 'f': case 'F': this.handlers.onFullscreen(); break;
      case 't': case 'T': this.handlers.onFormatToggle(); break;
      case 'm': case 'M': this.handlers.onMusicToggle(); break;
      case 'h': case 'H': this.handlers.onPureToggle(); break;
      case ' ':
        // After Escape closes a panel the very next Space often arrives as a stray repeat.
        if (!this.handlers.isBusy?.() && this.handlers.isDismissed?.()) break;
        e.preventDefault();
        this.handlers.onPomodoroToggle();
        break;
      default:
        if (/^[1-9]$/.test(e.key)) this.handlers.onStyleSwitch(parseInt(e.key, 10) - 1);
    }
  };

  private wake = () => {
    document.body.classList.remove('idle');
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      const focusedControl = document.activeElement instanceof HTMLElement && document.activeElement.matches('button, input, select, textarea, a');
      if (this.handlers.isBusy?.() || focusedControl || matchMedia('(pointer: coarse)').matches) {
        if (this.handlers.isBusy?.() || focusedControl) this.wake();
        return;
      }
      document.body.classList.add('idle');
    }, 3600);
  };
}
