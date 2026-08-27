import { useState } from 'react';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';
import { sellContract } from '@/services/trade-api';
import { signed, shortTime } from '@/utils/format';

/**
 * Live open contracts plus the trades that have settled this session.
 *
 * Both bot and manual positions land here — the stream is account-wide — so
 * this is the one place that shows everything currently at risk.
 *
 * Collapsed by default: the bots are what you came for, and the header still
 * carries the two numbers that matter (how many are open, and how the session
 * is going), so nothing is hidden that you'd need to open the card to learn.
 */
const PositionsPanel = () => {
    const { openPositions, history, clearHistory } = usePortfolio();
    const [expanded, setExpanded] = useState(false);
    const [tab, setTab] = useState<'open' | 'history'>('open');
    const [selling, setSelling] = useState<number | null>(null);

    const sell = async (contractId: number) => {
        setSelling(contractId);
        try {
            await sellContract(contractId);
        } finally {
            // The portfolio stream removes the row once Deriv confirms the sale.
            setSelling(null);
        }
    };

    const sessionPnl = history.reduce((sum, t) => sum + t.profit, 0);

    return (
        <section id='positions' className='scroll-mt-24'>
            <div className='card !p-0'>
                {/* ── Header, always visible ──────────────────────────────── */}
                <button
                    type='button'
                    onClick={() => setExpanded(e => !e)}
                    aria-expanded={expanded}
                    aria-controls='positions-body'
                    className='flex w-full items-center justify-between gap-3 p-5 text-left sm:p-6'
                >
                    <div className='min-w-0'>
                        <h2 className='wordmark text-xl text-fg'>Positions</h2>
                        <p className='mt-1 text-sm text-mist-400'>
                            {openPositions.length === 0 && history.length === 0
                                ? 'Nothing open yet.'
                                : `${openPositions.length} open · ${history.length} settled this session`}
                        </p>
                    </div>

                    <div className='flex shrink-0 items-center gap-3'>
                        {history.length > 0 && (
                            <span className='text-right'>
                                <span className='label block'>Session</span>
                                <span
                                    className={`font-mono text-sm font-extrabold ${
                                        sessionPnl >= 0 ? 'text-gain' : 'text-loss'
                                    }`}
                                >
                                    {signed(sessionPnl)}
                                </span>
                            </span>
                        )}
                        {openPositions.length > 0 && (
                            <span className='chip-solid'>{openPositions.length} live</span>
                        )}
                        <ChevronDown
                            size={18}
                            className={`text-mist-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                    </div>
                </button>

                {/* ── Body ────────────────────────────────────────────────── */}
                {expanded && (
                    <div id='positions-body' className='flex flex-col gap-4 border-t border-line p-5 sm:p-6'>
                        <div className='flex items-center gap-1 self-start rounded-full border border-line p-1'>
                            {(['open', 'history'] as const).map(t => (
                                <button
                                    key={t}
                                    type='button'
                                    onClick={() => setTab(t)}
                                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                                        tab === t ? 'bg-fg text-on-fg' : 'text-mist-400 hover:text-fg'
                                    }`}
                                >
                                    {t === 'open' ? `Open (${openPositions.length})` : `Session (${history.length})`}
                                </button>
                            ))}
                        </div>

                        {tab === 'open' ? (
                            openPositions.length === 0 ? (
                                <p className='py-10 text-center text-sm text-mist-500'>No open positions.</p>
                            ) : (
                                <ul className='divide-y divide-line'>
                                    {openPositions.map(p => {
                                        const profit = Number(p.profit) || 0;
                                        return (
                                            <li
                                                key={p.contract_id}
                                                className='flex items-center justify-between gap-3 py-3'
                                            >
                                                <div className='min-w-0'>
                                                    <div className='truncate text-sm font-semibold text-fg'>
                                                        {p.display_name || p.underlying || '—'}
                                                    </div>
                                                    <div className='mt-0.5 truncate text-[11px] text-mist-500'>
                                                        {p.contract_type} · stake{' '}
                                                        {Number(p.buy_price ?? 0).toFixed(2)} {p.currency ?? ''}
                                                        {p.purchase_time ? ` · ${shortTime(p.purchase_time)}` : ''}
                                                    </div>
                                                </div>
                                                <div className='flex shrink-0 items-center gap-3'>
                                                    <span
                                                        className={`font-mono text-sm font-bold ${
                                                            profit >= 0 ? 'text-gain' : 'text-loss'
                                                        }`}
                                                    >
                                                        {signed(profit)}
                                                    </span>
                                                    <button
                                                        type='button'
                                                        onClick={() => sell(p.contract_id)}
                                                        disabled={selling === p.contract_id}
                                                        title='Sell at market'
                                                        aria-label='Sell at market'
                                                        className='flex h-7 w-7 items-center justify-center rounded-lg border border-line text-mist-400 transition-colors hover:border-fg hover:text-fg disabled:opacity-40'
                                                    >
                                                        {selling === p.contract_id ? (
                                                            <Loader2 size={13} className='animate-spin' />
                                                        ) : (
                                                            <X size={13} />
                                                        )}
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )
                        ) : history.length === 0 ? (
                            <p className='py-10 text-center text-sm text-mist-500'>
                                Nothing has settled yet this session.
                            </p>
                        ) : (
                            <>
                                <div className='flex items-center justify-between rounded-xl border border-line bg-ink-700 px-3.5 py-2.5'>
                                    <span className='label'>Session P/L</span>
                                    <span
                                        className={`font-mono text-sm font-extrabold ${
                                            sessionPnl >= 0 ? 'text-gain' : 'text-loss'
                                        }`}
                                    >
                                        {signed(sessionPnl)}
                                    </span>
                                </div>
                                <ul className='max-h-80 divide-y divide-line overflow-y-auto'>
                                    {history.map(t => (
                                        <li
                                            key={t.contract_id}
                                            className='flex items-center justify-between gap-3 py-2.5'
                                        >
                                            <div className='min-w-0'>
                                                <div className='truncate text-sm font-medium text-mist-200'>
                                                    {t.market}
                                                </div>
                                                <div className='mt-0.5 text-[11px] text-mist-500'>
                                                    {t.contract_type} · stake {t.buy_price.toFixed(2)} ·{' '}
                                                    {shortTime(t.time)}
                                                </div>
                                            </div>
                                            <span
                                                className={`shrink-0 font-mono text-sm font-bold ${
                                                    t.profit >= 0 ? 'text-gain' : 'text-loss'
                                                }`}
                                            >
                                                {signed(t.profit)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <button type='button' onClick={clearHistory} className='btn-ghost btn-sm self-end'>
                                    Clear session
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
};

export default PositionsPanel;
