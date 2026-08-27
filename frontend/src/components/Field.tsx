import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Labelled numeric input with an optional unit suffix. */
export const NumberField = ({
    label,
    value,
    onChange,
    suffix,
    disabled,
    min = 0,
    step = 'any',
    hint,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    suffix?: string;
    disabled?: boolean;
    min?: number;
    step?: string;
    hint?: string;
}) => (
    <label className='flex flex-col gap-1.5'>
        <span className='label'>{label}</span>
        <div className='flex items-center rounded-xl border border-line bg-ink-700 px-3.5 transition-colors focus-within:border-line-strong'>
            <input
                type='number'
                inputMode='decimal'
                min={min}
                step={step}
                disabled={disabled}
                value={Number.isFinite(value) ? value : ''}
                onChange={e => onChange(parseFloat(e.target.value))}
                className='w-full bg-transparent py-2.5 text-sm font-semibold text-fg outline-none disabled:opacity-50'
            />
            {suffix && <span className='pl-2 text-xs font-medium text-mist-500'>{suffix}</span>}
        </div>
        {hint && <span className='text-[11px] leading-tight text-mist-500'>{hint}</span>}
    </label>
);

export interface SegmentedOption<T extends string> {
    id: T;
    label: string;
    icon?: LucideIcon;
    desc?: string;
}

/**
 * Radio group rendered as tiles. The selected tile inverts (solid `fg` fill),
 * which is the only "highlight" a monochrome system has — so it must be strong.
 */
export const Segmented = <T extends string>({
    options,
    value,
    onChange,
    disabled,
    columns = 3,
}: {
    options: SegmentedOption<T>[];
    value: T;
    onChange: (v: T) => void;
    disabled?: boolean;
    columns?: 2 | 3 | 4;
}) => (
    <div
        role='radiogroup'
        className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}
    >
        {options.map(opt => {
            const Icon = opt.icon;
            const active = opt.id === value;
            return (
                <button
                    key={opt.id}
                    type='button'
                    role='radio'
                    aria-checked={active}
                    disabled={disabled}
                    onClick={() => onChange(opt.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                        active
                            ? 'border-fg bg-fg text-on-fg'
                            : 'border-line bg-ink-700 text-mist-300 hover:border-line-strong hover:text-fg'
                    }`}
                >
                    {Icon && <Icon size={16} />}
                    <span className='text-xs font-bold leading-tight'>{opt.label}</span>
                    {opt.desc && (
                        <span className={`text-[10px] leading-tight ${active ? 'opacity-70' : 'text-mist-500'}`}>
                            {opt.desc}
                        </span>
                    )}
                </button>
            );
        })}
    </div>
);

/**
 * On/off switch.
 *
 * The knob is positioned with an explicit `left`, not a transform off its
 * static position — the latter left the handle sitting a pixel out of the
 * track. Green means on, red means off, and the state is also spelled out in
 * text, so the switch never depends on reading a colour or a knob position.
 */
export const Toggle = ({
    checked,
    onChange,
    label,
    hint,
    disabled,
    compact,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: ReactNode;
    hint?: string;
    disabled?: boolean;
    /** Switch only, no label row — for use inside a card that already has one. */
    compact?: boolean;
}) => {
    const track = (
        <span className="flex shrink-0 items-center gap-2">
            <span
                className={`text-[10px] font-bold uppercase tracking-[0.12em] ${checked ? 'text-gain' : 'text-loss'}`}
            >
                {checked ? 'On' : 'Off'}
            </span>
            <span className={`relative block h-6 w-11 rounded-full transition-colors ${checked ? 'bg-gain' : 'bg-loss'}`}>
                <span
                    className="absolute top-1/2 block h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200"
                    style={{ left: checked ? 23 : 3 }}
                />
            </span>
        </span>
    );

    if (compact) {
        return (
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={checked ? 'On' : 'Off'}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className="shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
            >
                {track}
            </button>
        );
    }

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`flex w-full items-center justify-between gap-4 rounded-xl border bg-ink-700 px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                checked ? 'border-gain/50 hover:border-gain' : 'border-loss/40 hover:border-loss'
            }`}
        >
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg">{label}</span>
                {hint && <span className="mt-0.5 block text-[11px] leading-tight text-mist-500">{hint}</span>}
            </span>
            {track}
        </button>
    );
};
