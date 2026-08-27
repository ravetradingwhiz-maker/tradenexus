import type { ReactNode } from 'react';
import { Activity, Lock, Play, Square, TriangleAlert } from 'lucide-react';
import type { RiskLevel, useNexusBot } from '@/hooks/useNexusBot';
import { BOT_MARKETS } from '@/constants/markets';
import { signed, winRate } from '@/utils/format';
import { NumberField, Segmented } from '@/components/Field';

type Engine = ReturnType<typeof useNexusBot>;

const RISKS: { id: RiskLevel; label: string; desc: string }[] = [
    { id: 'low', label: 'Low', desc: 'Selective' },
    { id: 'medium', label: 'Medium', desc: 'Balanced' },
    { id: 'high', label: 'High', desc: 'Aggressive' },
];

export interface BotShellProps {
    /** Anchor id — deep links scroll to this. */
    id: string;
    name: string;
    tagline: string;
    /** Small badges rendered next to the name (tier, contract families, …). */
    badges?: ReactNode;
    /** The strategy picker for this bot. */
    strategySlot: ReactNode;
    /** Bot-specific extras: bulk size, martingale switch. */
    extraSlot?: ReactNode;
    /** Rendered instead of the Run button when the bot can't be started. */
    lockedSlot?: ReactNode;
    /**
     * Paywall. When set, the whole control surface is dimmed behind a single
     * unlock call-to-action: the settings stay visible so the buyer can see
     * exactly what they are paying for, but nothing is operable.
     */
    lockOverlay?: { priceLine: string; cta: string; onClick: () => void };
    footnote?: ReactNode;

    engine: Engine;
    currency: string;

    symbol: string;
    onSymbol: (v: string) => void;
    risk: RiskLevel;
    onRisk: (v: RiskLevel) => void;
    stake: number;
    onStake: (v: number) => void;
    profitTarget: number;
    onProfitTarget: (v: number) => void;
    maxLoss: number;
    onMaxLoss: (v: number) => void;
}

/**
 * Shared chrome for every AI Bot: strategy, market, risk, money management and
 * the run control — one column, top to bottom.
 *
 * Everything on screen is either something you set before running or something
 * you need while it runs. The session numbers appear only once there IS a
 * session, so an idle bot shows nothing but its settings.
 */
const BotShell = ({
    id,
    name,
    tagline,
    badges,
    strategySlot,
    extraSlot,
    lockedSlot,
    lockOverlay,
    footnote,
    engine,
    currency,
    symbol,
    onSymbol,
    risk,
    onRisk,
    stake,
    onStake,
    profitTarget,
    onProfitTarget,
    maxLoss,
    onMaxLoss,
}: BotShellProps) => {
    const { ticksReady, stats, isRunning, status, nextStake } = engine;

    const inputsValid = stake > 0 && profitTarget > 0 && maxLoss > 0;
    const showStatus = status.kind !== 'idle';
    const stakeStepped = Math.abs(nextStake - stake) > 0.001;
    const hasSession = isRunning || stats.trades > 0;

    return (
        <section id={id} className='scroll-mt-24'>
            {/* A bot card wears a green frame so it reads as its own machine on a
                page of otherwise neutral panels — and brightens while it runs. */}
            <div
                className={`card flex flex-col gap-5 border-2 transition-colors ${
                    isRunning ? 'border-gain' : 'border-gain/40'
                }`}
            >
                {/* ── Header ──────────────────────────────────────────────── */}
                <header className='flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4'>
                    <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                            <h2 className='wordmark text-xl text-fg'>{name}</h2>
                            {badges}
                        </div>
                        <p className='mt-1 text-sm text-mist-400'>{tagline}</p>
                    </div>
                    {isRunning && (
                        <span className='flex items-center gap-2 rounded-full border border-gain px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gain'>
                            <span className='relative flex h-2 w-2'>
                                <span className='absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-gain' />
                                <span className='relative inline-flex h-2 w-2 rounded-full bg-gain' />
                            </span>
                            Live
                        </span>
                    )}
                </header>

                <div className='relative'>
                    {lockOverlay && (
                        <div className='absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 px-4 text-center'>
                            <span className='flex h-14 w-14 items-center justify-center rounded-2xl border border-line-strong bg-ink-900/80 text-fg backdrop-blur'>
                                <Lock size={22} />
                            </span>
                            <p className='label !tracking-[0.18em] text-mist-300'>{lockOverlay.priceLine}</p>
                            <button type='button' onClick={lockOverlay.onClick} className='btn-solid px-7 py-3'>
                                <Lock size={15} /> {lockOverlay.cta}
                            </button>
                        </div>
                    )}

                    <div
                        className={`flex flex-col gap-5 ${
                            lockOverlay ? 'pointer-events-none select-none opacity-25 blur-[2px]' : ''
                        }`}
                        aria-hidden={lockOverlay ? true : undefined}
                    >
                        {/* ── Strategy ────────────────────────────────────── */}
                        <div>
                            <div className='mb-2 label'>Strategy</div>
                            {strategySlot}
                        </div>

                        {/* ── Market + risk ───────────────────────────────── */}
                        <div className='grid gap-4 sm:grid-cols-2'>
                            <label className='flex flex-col gap-1.5'>
                                <span className='label'>Market</span>
                                <select
                                    value={symbol}
                                    disabled={isRunning}
                                    onChange={e => onSymbol(e.target.value)}
                                    className='field'
                                >
                                    {BOT_MARKETS.map(m => (
                                        <option key={m.symbol} value={m.symbol} className='bg-ink-700'>
                                            {m.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <div className='flex flex-col gap-1.5'>
                                <span className='label'>Risk level</span>
                                <Segmented options={RISKS} value={risk} onChange={onRisk} disabled={isRunning} />
                            </div>
                        </div>

                        {extraSlot}

                        {/* ── Money management ────────────────────────────── */}
                        <div className='grid gap-4 sm:grid-cols-3'>
                            <NumberField
                                label='Stake / contract'
                                value={stake}
                                onChange={onStake}
                                suffix={currency}
                                disabled={isRunning}
                                hint={stakeStepped ? `Next round: ${nextStake.toFixed(2)}` : undefined}
                            />
                            <NumberField
                                label='Profit target'
                                value={profitTarget}
                                onChange={onProfitTarget}
                                suffix={currency}
                                disabled={isRunning}
                            />
                            <NumberField
                                label='Max loss'
                                value={maxLoss}
                                onChange={onMaxLoss}
                                suffix={currency}
                                disabled={isRunning}
                            />
                        </div>

                        {/* ── Session numbers — only once there is a session ─ */}
                        {hasSession && (
                            <div className='flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-ink-700 px-4 py-3'>
                                <Stat
                                    label='Net P/L'
                                    value={`${signed(stats.netProfit)} ${currency}`}
                                    pnl={stats.netProfit}
                                />
                                <Stat label='Rounds' value={String(stats.trades)} />
                                <Stat label='Win rate' value={`${winRate(stats.wins, stats.trades).toFixed(0)}%`} />
                                <Stat label='Contracts' value={String(stats.contracts)} />
                            </div>
                        )}

                        {/* ── Run control ─────────────────────────────────── */}
                        <div className='flex flex-col gap-2'>
                            {isRunning ? (
                                <button
                                    type='button'
                                    onClick={engine.stop}
                                    className='btn-outline w-full !border-loss py-3.5 text-base !text-loss'
                                >
                                    <Square size={17} /> Stop {name}
                                </button>
                            ) : lockedSlot ? (
                                lockedSlot
                            ) : (
                                <button
                                    type='button'
                                    onClick={engine.start}
                                    disabled={!inputsValid || !ticksReady}
                                    className='btn-solid w-full py-3.5 text-base'
                                >
                                    {!ticksReady ? (
                                        <>
                                            <Activity size={17} className='animate-pulse' /> Loading market…
                                        </>
                                    ) : (
                                        <>
                                            <Play size={17} /> Run {name}
                                        </>
                                    )}
                                </button>
                            )}

                            {!lockedSlot && !inputsValid && (
                                <p className='flex items-center justify-center gap-1.5 text-center text-[11px] text-mist-400'>
                                    <TriangleAlert size={12} /> Stake, profit target and max loss must all be above 0.
                                </p>
                            )}
                            {showStatus && (
                                <p
                                    className={`text-center text-xs font-medium ${
                                        status.kind === 'error' ? 'text-loss' : 'text-mist-300'
                                    }`}
                                >
                                    {status.text}
                                </p>
                            )}
                            {footnote && <div className='text-center text-[11px] text-mist-500'>{footnote}</div>}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

/** `pnl` colours the value green/red; leave it undefined for a neutral stat. */
const Stat = ({ label, value, pnl }: { label: string; value: string; pnl?: number }) => (
    <div className='flex items-baseline gap-2'>
        <span className='label'>{label}</span>
        <span
            className={`font-mono text-sm font-extrabold ${
                pnl === undefined ? 'text-fg' : pnl >= 0 ? 'text-gain' : 'text-loss'
            }`}
        >
            {value}
        </span>
    </div>
);

export default BotShell;
