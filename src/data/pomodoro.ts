/** Timestamp-driven focus state with task intent, explicit controls and local review. */
export type PomodoroPhase = 'work' | 'short' | 'long';
export type PomodoroEvent = 'start' | 'pause' | 'resume' | 'stop' | 'phase' | 'return';

export interface PomodoroSnapshot {
  active: boolean;
  phase: PomodoroPhase;
  startedAt: number;
  pausedAt: number | null;
  cycle: number;
  task: string;
}

export interface FocusRecord {
  endedAt: number;
  minutes: number;
  task: string;
}

const STORAGE_KEY = 'desktop.v2.pomodoro';
const HISTORY_KEY = 'horloge.focus-history.v1';
const MAX_CATCHUP = 500;

export class PomodoroService {
  private state: PomodoroSnapshot;
  private listeners = new Set<(event: PomodoroEvent) => void>();
  durations = { work: 25, short: 5, long: 15 };

  constructor() { this.state = this.load(); }

  snapshot(): PomodoroSnapshot { return { ...this.state }; }
  isActive(): boolean { return this.state.active; }
  isPaused(): boolean { return this.state.active && this.state.pausedAt !== null; }
  task(): string { return this.state.task; }
  durationMs(phase: PomodoroPhase = this.state.phase): number { return this.durations[phase] * 60_000; }

  elapsedMs(): number {
    if (!this.state.active) return 0;
    const now = this.state.pausedAt ?? Date.now();
    return Math.max(0, now - this.state.startedAt);
  }

  progress(): number {
    if (!this.state.active) return 0;
    return Math.min(1, this.elapsedMs() / this.durationMs());
  }

  remainingMs(): number { return Math.max(0, this.durationMs() - this.elapsedMs()); }

  label(): string {
    const names: Record<PomodoroPhase, string> = { work: '专注', short: '短休', long: '长休' };
    const remain = Math.ceil(this.remainingMs() / 1000);
    const mm = String(Math.floor(remain / 60)).padStart(2, '0');
    const ss = String(remain % 60).padStart(2, '0');
    return `${names[this.state.phase]} ${mm}:${ss}`;
  }

  remainingLabel(): string { return this.label().replace(/^[^ ]+ /, ''); }

  start(task = '') {
    if (this.state.active) return;
    this.state = { active: true, phase: 'work', startedAt: Date.now(), pausedAt: null, cycle: 0, task: task.trim().slice(0, 80) };
    this.save();
    this.fire('start');
  }

  toggle(task = '') {
    const now = Date.now();
    if (!this.state.active) {
      this.start(task);
      return;
    }
    if (this.state.pausedAt === null) {
      this.state.pausedAt = now;
      this.save();
      this.fire('pause');
    } else {
      this.state.startedAt += now - this.state.pausedAt;
      this.state.pausedAt = null;
      this.save();
      this.fire('resume');
    }
  }

  /** End the session and return the previous state for completion feedback. */
  stop(): PomodoroSnapshot | null {
    if (!this.state.active) return null;
    const previous = this.snapshot();
    if (previous.phase === 'work' && previous.pausedAt === null) this.record(previous, this.elapsedMs());
    this.state = { active: false, phase: 'work', startedAt: 0, pausedAt: null, cycle: 0, task: '' };
    this.save();
    this.fire('stop');
    return previous;
  }

  onChange(cb: (event: PomodoroEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  tick() { this.normalize(); }

  history(): FocusRecord[] {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value.filter(item => item && typeof item.endedAt === 'number' && typeof item.minutes === 'number').slice(0, 100) : [];
    } catch { return []; }
  }

  today() {
    const day = new Date().toDateString();
    const records = this.history().filter(item => new Date(item.endedAt).toDateString() === day);
    return { count: records.length, minutes: records.reduce((sum, item) => sum + item.minutes, 0) };
  }

  private normalize() {
    if (!this.state.active || this.state.pausedAt !== null) return;
    let changed = false;
    let event: PomodoroEvent = 'phase';
    let guard = 0;
    while (guard++ < MAX_CATCHUP) {
      const now = Date.now();
      const elapsed = now - this.state.startedAt;
      if (elapsed < this.durationMs()) break;
      const nextDuration = this.durationMs(this.state.phase === 'work' ? (this.state.cycle === 3 ? 'long' : 'short') : 'work');
      const longAbsence = elapsed >= this.durationMs() + nextDuration;
      this.state.startedAt += this.durationMs();
      this.advance(!longAbsence);
      changed = true;
      if (longAbsence) {
        // Do not invent a chain of completed sessions after a long absence.
        this.state.startedAt = now;
        this.state.pausedAt = now;
        event = 'return';
        break;
      }
    }
    if (changed) this.save();
    if (changed) this.fire(event);
  }

  private advance(record: boolean) {
    if (this.state.phase === 'work') {
      if (record) this.record(this.snapshot(), this.durationMs());
      const cycle = this.state.cycle + 1;
      this.state.cycle = cycle % 4;
      this.state.phase = cycle % 4 === 0 ? 'long' : 'short';
    } else {
      this.state.phase = 'work';
    }
  }

  private record(snapshot: PomodoroSnapshot, elapsed: number) {
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return;
    const next = [{ endedAt: Date.now(), minutes, task: snapshot.task || '无标题专注' }, ...this.history()].slice(0, 100);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* The active timer remains usable. */ }
  }

  private load(): PomodoroSnapshot {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<PomodoroSnapshot>;
        if (s && typeof s.active === 'boolean' && typeof s.startedAt === 'number') {
          return {
            active: s.active,
            phase: s.phase === 'short' || s.phase === 'long' ? s.phase : 'work',
            startedAt: s.startedAt,
            pausedAt: typeof s.pausedAt === 'number' ? s.pausedAt : null,
            cycle: Math.min(3, Math.max(0, (s.cycle ?? 0) | 0)),
            task: typeof s.task === 'string' ? s.task.slice(0, 80) : '',
          };
        }
      }
    } catch { /* Damaged storage falls back to idle. */ }
    return { active: false, phase: 'work', startedAt: 0, pausedAt: null, cycle: 0, task: '' };
  }

  private save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch { /* Session state remains usable. */ }
  }

  private fire(event: PomodoroEvent) { for (const cb of this.listeners) cb(event); }
}

export const pomodoro = new PomodoroService();
