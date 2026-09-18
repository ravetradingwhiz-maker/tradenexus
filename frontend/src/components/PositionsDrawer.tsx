import { useRef, useState, useEffect } from 'react';
import { ListChecks, Loader2, RotateCcw, Square, X } from 'lucide-react';
import { LabelPairedChevronsRightCaptionRegularIcon } from '@deriv/quill-icons/LabelPaired';
import { LegacyHandleLessIcon } from '@deriv/quill-icons/Legacy';
import { useAuth } from '@/context/AuthContext';
import { usePortfolio, type ClosedTrade, type OpenPosition } from '@/context/PortfolioContext';
import { useBotRun } from '@/context/BotRunContext';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { getActiveCurrency, sellContract } from '@/services/trade-api';
import { contractTypeLabel, shortTime, signed } from '@/utils/format';
import TradeTypeIcon from '@/components/TradeTypeIcon';

/**
 * Global transactions panel — the run panel the bots have, in this app's clothes.
 *
 * Opens and closes from a tab on its own edge, never a floating button: a strip
 * down the left edge on desktop, a bar across the top on mobile. The strip is
 * always there, so the panel is always one tap away and nothing has to decide
 * whether a button should exist. It carries the panel's own mark and the number
 * of trades behind it, because a bare chevron reads as a border.
 *
 * One list, newest first. A contract joins it live the moment it is bought and
 * settles in place — so the list is the session, not two tabs that have to be
 * reconciled against each other.
 *
 * It reports rather than drives: the only control over a run is a Stop, and only
 * while one is going. Starting stays on the bot's own page, where the settings
 * that a run needs actually live. It sits above the route outlet, so a session
 * survives navigation.
 */

/** Height of the collapsed handle on mobile. */
const HANDLE = 40;
/**
 * Width of the collapsed toggle strip on desktop — wide enough to hold a mark
 * and a count rather than a lone chevron.
 */
const TOGGLE = 36;
const PANEL = 366;
/** The app header is 4rem tall and sticky; the panel starts below it. */
const HEADER = 64;

/** Rows come from two stores; this is the shape the list actually renders. */
interface Row {
    contract_id: number;
    contract_type?: string;
    market: string;
    stake: number;
    profit: number;
    /** Live contracts show a Sell button and a moving P&L. */
    isOpen: boolean;
    /** Closed rows carry the time they settled; open ones their current value. */
    time?: number;
    value?: number;
}

const openRow = (p: OpenPosition): Row => ({
    contract_id: p.contract_id,
    contract_type: p.contract_type,
    market: p.display_name || p.underlying || '—',
    stake: Number(p.buy_price) || 0,
    profit: Number(p.profit) || 0,
    value: Number(p.bid_price) || 0,
    isOpen: true,
});

const closedRow = (t: ClosedTrade): Row => ({
    contract_id: t.contract_id,
    contract_type: t.contract_type,
    market: t.market,
    stake: Number(t.buy_price) || 0,
    profit: Number(t.profit) || 0,
    time: t.time,
    isOpen: false,
});

/**
 * The drawer's toggle mark — the pair the bots' run panel uses, each on the
 * breakpoint they use it on.
 *
 * Desktop gets the paired chevron, turned to face the way the panel travels:
 * left to pull it out, right to send it back. Mobile gets the handle, which is a
 * grip rather than an arrow — the mobile drawer is dragged up, not pointed at.
 */
const Arrow = ({ open, mobile }: { open: boolean; mobile?: boolean }) =>
    mobile ? (
        <LegacyHandleLessIcon
            iconSize='sm'
            fill='currentColor'
            className='text-mist-400 transition-transform duration-300'
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
    ) : (
        <LabelPairedChevronsRightCaptionRegularIcon
            fill='currentColor'
            className='text-fg transition-transform duration-300'
            style={{ transform: open ? 'none' : 'rotate(180deg)' }}
        />
    );

/** One statistics tile. Three across, two rows — the run panel's grid. */
const Tile = ({ title, value, tone }: { title: string; value: string; tone?: string }) => (
    <div className='flex flex-col gap-0.5 rounded-lg border border-line bg-ink-800 px-2.5 py-2'>
        <span className='text-[9px] font-semibold uppercase tracking-wide text-mist-500'>{title}</span>
        <span className={`font-mono text-xs font-bold ${tone ?? 'text-fg'}`}>{value}</span>
    </div>
);

const PositionsDrawer = () => {
    const { openPositions, history, sessionStats, clearHistory } = usePortfolio();
    const { isRunning, stop: stopBot } = useBotRun();
    const { balanceCurrency } = useAuth();
    const isDesktop = useIsDesktop();
    const currency = balanceCurrency || getActiveCurrency();

    const [open, setOpen] = useState(false);
    const [selling, setSelling] = useState<Record<number, boolean>>({});

    /*
     * Opens itself whenever a NEW trade appears. Positions already open when the
     * panel first mounts are seeded silently, so it doesn't pop on load.
     *
     * It deliberately never closes itself. The panel carries the session's
     * transactions and statistics, and the moment the last contract settles is
     * exactly when those are worth reading — closing then would take them off
     * screen at the worst possible time.
     */
    const seenRef = useRef<Set<number>>(new Set());
    const firstRunRef = useRef(true);
    useEffect(() => {
        let hasNew = false;
        for (const p of openPositions) {
            if (!seenRef.current.has(p.contract_id)) {
                seenRef.current.add(p.contract_id);
                hasNew = true;
            }
        }
        if (firstRunRef.current) {
            firstRunRef.current = false;
            return;
        }
        if (hasNew) setOpen(true);
    }, [openPositions]);

    /* Open contracts first, then the closed ones newest-first. Both stores are
       already in that order, and an open contract is by definition newer than
       anything that has settled, so concatenating them is the whole sort. */
    const rows: Row[] = [...openPositions.map(openRow), ...history.map(closedRow)];

    const onSell = async (id: number) => {
        setSelling(s => ({ ...s, [id]: true }));
        try {
            await sellContract(id); // the portfolio stream removes it once sold
        } finally {
            setSelling(s => ({ ...s, [id]: false }));
        }
    };

    const { totalProfit } = sessionStats;

    /* Stretched between fixed edges rather than sized, so the collapsed state is
       one transform away and the open state needs no height of its own. There is
       no fixed bottom bar in this app, so the mobile panel runs to the floor. */
    const geometry: React.CSSProperties = isDesktop
        ? {
              top: HEADER,
              bottom: 0,
              right: 0,
              width: PANEL,
              transform: open ? 'none' : `translateX(${PANEL - TOGGLE}px)`,
          }
        : {
              top: HEADER,
              bottom: 0,
              left: 0,
              right: 0,
              transform: open ? 'none' : `translateY(calc(100% - ${HANDLE}px))`,
          };

    return (
        <>
            {/* Backdrop, mobile only — on desktop the page stays usable beside
                the panel. Starts below the header so the account switcher and
                theme toggle are neither dimmed nor swallowed. */}
            <div
                onClick={() => setOpen(false)}
                className={`fixed inset-x-0 bottom-0 top-16 z-30 bg-black/50 transition-opacity duration-300 md:hidden ${
                    open ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
            />

            <aside
                style={geometry}
                className='fixed z-40 flex flex-col bg-ink-900 transition-transform duration-300 md:flex-row'
            >
                {/* The toggle: a strip down the left edge on desktop, a bar across
                    the top on mobile. The only way in or out — the bots' run panel
                    has no close button either. */}
                <button
                    type='button'
                    onClick={() => setOpen(v => !v)}
                    title={open ? 'Hide transactions' : 'Transactions'}
                    aria-label={open ? 'Close transactions panel' : 'Open transactions panel'}
                    style={isDesktop ? { width: TOGGLE } : { height: HANDLE }}
                    className='flex shrink-0 items-center justify-center gap-2 border-b border-line bg-ink-800 px-3 text-mist-400 transition-colors hover:text-fg md:flex-col md:border-x md:border-b-0 md:px-0'
                >
                    {isDesktop ? (
                        <>
                            {/* Dropped once the panel is out — the header two
                                centimetres away already carries both. */}
                            {!open && (
                                <>
                                    <ListChecks size={16} className='text-fg' />
                                    {rows.length > 0 && (
                                        <span className='rounded-full bg-ink-700 px-1 font-mono text-[10px] font-bold leading-[1.6] text-mist-300'>
                                            {rows.length}
                                        </span>
                                    )}
                                </>
                            )}
                            <Arrow open={open} />
                        </>
                    ) : (
                        <>
                            {!open && (
                                <>
                                    <ListChecks size={15} className='text-fg' />
                                    <span className='text-xs font-bold text-mist-300'>Transactions</span>
                                </>
                            )}
                            {!open && rows.length > 0 && (
                                <span
                                    className={`font-mono text-xs font-bold ${
                                        totalProfit >= 0 ? 'text-gain' : 'text-loss'
                                    }`}
                                >
                                    {signed(totalProfit)} {currency}
                                </span>
                            )}
                            {/* Right of the bar while a label sits beside it; centred
                                once the panel is up and it is the only thing on the
                                bar. An auto margin takes all the free space, so it
                                beats the centring while it is set. */}
                            <span className={`flex items-center${open ? '' : ' ml-auto'}`}>
                                <Arrow open={open} mobile />
                            </span>
                        </>
                    )}
                </button>

                <div className='flex min-h-0 flex-1 flex-col md:border-l md:border-line'>
                    {/* Header — title, Stop while a run is going, and Reset. */}
                    <div className='flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3'>
                        <h2 className='flex items-center gap-2 text-sm font-bold text-fg'>
                            <ListChecks size={18} /> Transactions
                        </h2>
                        <div className='flex items-center gap-2'>
                            {/* Only while a bot is actually running — there is nothing
                                to start from here, so the pair would be misleading. */}
                            {isRunning && (
                                <button
                                    type='button'
                                    onClick={stopBot}
                                    className='flex items-center gap-1.5 rounded-lg border border-line-strong bg-ink-700 px-2.5 py-1.5 text-xs font-bold text-fg transition-colors hover:border-fg'
                                >
                                    <Square size={11} fill='currentColor' /> Stop
                                </button>
                            )}
                            {/* Clears the session history, and with it the statistics
                                below. Open contracts are live on Deriv and cannot be
                                cleared — same as the bots, where Reset leaves the
                                running one alone. */}
                            <button
                                type='button'
                                onClick={clearHistory}
                                disabled={history.length === 0}
                                className='flex items-center gap-1.5 rounded-lg border border-line bg-ink-800 px-2.5 py-1.5 text-xs font-semibold text-mist-300 transition-colors hover:border-fg hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-mist-300'
                            >
                                <RotateCcw size={13} /> Reset
                            </button>
                        </div>
                    </div>

                    {/* `min-h-0` so this scrolls instead of stretching the panel and
                        pushing the statistics off the bottom. */}
                    <div className='flex min-h-0 flex-1 flex-col overflow-y-auto p-3'>
                        {rows.length === 0 ? (
                            <div className='flex min-h-[10rem] flex-1 flex-col items-center justify-center text-center'>
                                <span className='flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-800 text-mist-500'>
                                    <ListChecks size={26} />
                                </span>
                                <p className='mt-4 text-sm text-mist-400'>No trades this session.</p>
                                <p className='mt-1 text-xs text-mist-600'>
                                    Trades you place — manual or bot — appear here live.
                                </p>
                            </div>
                        ) : (
                            <div className='flex flex-col gap-2'>
                                {rows.map(r => (
                                    <div
                                        key={r.contract_id}
                                        className={`flex items-center gap-2 rounded-xl border bg-ink-800 p-2.5 ${
                                            r.isOpen ? 'border-line-strong' : 'border-line'
                                        }`}
                                    >
                                        <TradeTypeIcon
                                            type={r.contract_type}
                                            label={contractTypeLabel(r.contract_type)}
                                        />
                                        <div className='min-w-0 flex-1'>
                                            <p className='truncate text-xs font-semibold text-fg'>{r.market}</p>
                                            <p className='mt-0.5 truncate text-[10px] text-mist-500'>
                                                {r.isOpen
                                                    ? `Stake ${r.stake.toFixed(2)} · Value ${(r.value ?? 0).toFixed(2)}`
                                                    : `${shortTime(r.time ?? 0)} · Stake ${r.stake.toFixed(2)}`}
                                            </p>
                                        </div>
                                        <span
                                            className={`shrink-0 font-mono text-sm font-bold ${
                                                r.profit >= 0 ? 'text-gain' : 'text-loss'
                                            }`}
                                        >
                                            {signed(r.profit)}
                                        </span>
                                        {r.isOpen && (
                                            <button
                                                type='button'
                                                onClick={() => onSell(r.contract_id)}
                                                disabled={!!selling[r.contract_id]}
                                                title='Sell at market'
                                                aria-label='Sell at market'
                                                className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-mist-400 transition-colors hover:border-fg hover:text-fg disabled:opacity-40'
                                            >
                                                {selling[r.contract_id] ? (
                                                    <Loader2 size={13} className='animate-spin' />
                                                ) : (
                                                    <X size={13} />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Statistics, over the trades that have closed this session. */}
                    <div className='grid shrink-0 grid-cols-3 gap-2 border-t border-line p-3'>
                        <Tile title='Total stake' value={`${sessionStats.totalStake.toFixed(2)} ${currency}`} />
                        <Tile title='Total payout' value={`${sessionStats.totalPayout.toFixed(2)} ${currency}`} />
                        <Tile title='No. of runs' value={String(sessionStats.runs)} />
                        <Tile title='Contracts lost' value={String(sessionStats.lost)} />
                        <Tile title='Contracts won' value={String(sessionStats.won)} />
                        <Tile
                            title='Total P/L'
                            value={`${signed(totalProfit)} ${currency}`}
                            tone={totalProfit > 0 ? 'text-gain' : totalProfit < 0 ? 'text-loss' : undefined}
                        />
                    </div>
                </div>
            </aside>
        </>
    );
};

export default PositionsDrawer;
