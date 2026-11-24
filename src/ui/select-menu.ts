import { icon } from './icons';

export interface SelectMenuOption {
    value: string;
    label: string;
}

interface SelectMenuConfig {
    label: string;
    options: readonly SelectMenuOption[];
    onChange: (value: string) => void;
}

let serial = 0;

/** A select control drawn by the panel itself, so its menu shares the row's button language. */
export class SelectMenu {
    readonly trigger = document.createElement('button');
    private static current: SelectMenu | null = null;
    private readonly valueLabel = document.createElement('span');
    private readonly popup = document.createElement('div');
    private readonly options: SelectMenuOption[];
    private readonly onChange: (value: string) => void;
    private readonly id: string;
    private value = '';
    private expanded = false;
    private activeIndex = -1;
    private detach: (() => void) | null = null;

    constructor(config: SelectMenuConfig) {
        this.options = [...config.options];
        this.onChange = config.onChange;
        this.id = `select-menu-${++serial}`;

        this.trigger.type = 'button';
        this.trigger.className = 'select-trigger';
        this.trigger.setAttribute('aria-haspopup', 'listbox');
        this.trigger.setAttribute('aria-expanded', 'false');
        this.trigger.setAttribute('aria-controls', this.id);
        this.valueLabel.className = 'select-value';
        this.trigger.append(this.valueLabel);
        this.trigger.addEventListener('click', () => { if (this.expanded) this.collapse(); else this.expand(); });
        this.trigger.addEventListener('keydown', event => this.onKeydown(event));

        this.popup.className = 'select-menu';
        this.popup.id = this.id;
        this.popup.setAttribute('role', 'listbox');
        this.popup.setAttribute('aria-label', `${config.label}选项`);
        this.popup.hidden = true;
        this.options.forEach((option, index) => {
            const item = document.createElement('div');
            item.className = 'select-option';
            item.id = `${this.id}-${index}`;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', 'false');
            item.dataset.value = option.value;
            const text = document.createElement('span');
            text.textContent = option.label;
            const check = document.createElement('i');
            check.className = 'select-check';
            check.innerHTML = icon('check');
            item.append(text, check);
            item.addEventListener('click', () => this.commit(option.value));
            this.popup.append(item);
        });
        document.body.append(this.popup);
    }

    sync(value: string) {
        this.value = value;
        const active = this.options.find(option => option.value === value) ?? this.options[0];
        this.valueLabel.textContent = active ? active.label : '';
        this.popup.querySelectorAll<HTMLElement>('.select-option').forEach(item => {
            item.setAttribute('aria-selected', String(item.dataset.value === value));
        });
        if (this.trigger.disabled) this.collapse();
    }

    close() { this.collapse(); }

    dispose() {
        this.collapse();
        this.popup.remove();
    }

    private expand() {
        if (this.trigger.disabled || this.expanded) return;
        if (SelectMenu.current) SelectMenu.current.collapse();
        SelectMenu.current = this;
        this.expanded = true;
        this.popup.hidden = false;
        this.place();
        this.trigger.setAttribute('aria-expanded', 'true');
        this.setActive(Math.max(0, this.options.findIndex(option => option.value === this.value)));

        const outside = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!target || this.popup.contains(target) || this.trigger.contains(target)) return;
            this.collapse();
        };
        const dismiss = () => this.collapse();
        document.addEventListener('pointerdown', outside, true);
        window.addEventListener('scroll', dismiss, true);
        window.addEventListener('resize', dismiss);
        this.detach = () => {
            document.removeEventListener('pointerdown', outside, true);
            window.removeEventListener('scroll', dismiss, true);
            window.removeEventListener('resize', dismiss);
        };
    }

    private collapse() {
        if (!this.expanded) return;
        this.expanded = false;
        if (SelectMenu.current === this) SelectMenu.current = null;
        this.popup.hidden = true;
        this.popup.querySelectorAll('.select-option.active').forEach(item => item.classList.remove('active'));
        this.trigger.setAttribute('aria-expanded', 'false');
        this.trigger.removeAttribute('aria-activedescendant');
        this.detach?.();
        this.detach = null;
    }

    private commit(value: string) {
        if (value !== this.value) this.onChange(value);
        this.collapse();
        this.trigger.focus();
    }

    private onKeydown(event: KeyboardEvent) {
        if (this.trigger.disabled) return;
        if (!this.expanded) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.expand();
                if (event.key === 'ArrowUp') this.setActive(this.options.length - 1);
            }
            return;
        }
        switch (event.key) {
            case 'ArrowDown': event.preventDefault(); this.setActive(this.activeIndex + 1); break;
            case 'ArrowUp': event.preventDefault(); this.setActive(this.activeIndex - 1); break;
            case 'Home': event.preventDefault(); this.setActive(0); break;
            case 'End': event.preventDefault(); this.setActive(this.options.length - 1); break;
            case 'Enter': case ' ':
                event.preventDefault();
                this.commit(this.options[this.activeIndex]?.value ?? this.value);
                break;
            case 'Escape':
                // The menu owns Escape while open, so the panel behind it stays put.
                event.preventDefault();
                event.stopPropagation();
                this.collapse();
                break;
            case 'Tab': this.collapse(); break;
        }
    }

    private setActive(index: number) {
        const count = this.options.length;
        if (!count) return;
        this.activeIndex = (index + count) % count;
        const items = this.popup.querySelectorAll<HTMLElement>('.select-option');
        items.forEach((item, i) => item.classList.toggle('active', i === this.activeIndex));
        const active = items[this.activeIndex];
        this.trigger.setAttribute('aria-activedescendant', active.id);
        active.scrollIntoView({ block: 'nearest' });
    }

    private place() {
        const rect = this.trigger.getBoundingClientRect();
        const width = Math.round(Math.min(Math.max(rect.width, this.measureWidth(), 168), window.innerWidth - 24));
        const height = this.popup.getBoundingClientRect().height;
        this.popup.style.width = `${width}px`;
        this.popup.style.left = `${Math.round(Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12))}px`;
        const below = rect.bottom + 6;
        this.popup.style.top = `${Math.round(below + height > window.innerHeight - 12 && rect.top - height - 6 >= 12 ? rect.top - height - 6 : below)}px`;
    }

    private measureWidth() {
        const canvas = document.createElement('canvas').getContext('2d');
        if (!canvas) return 0;
        canvas.font = getComputedStyle(this.trigger).font;
        return Math.max(...this.options.map(option => canvas.measureText(option.label).width)) + 68;
    }
}
