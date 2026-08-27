import { Target, TrendingDown, X } from 'lucide-react';
import type { SessionResult } from '@/hooks/useNexusBot';
import { signed, winRate } from '@/utils/format';

/** Session summary, shown when a bot stops on its profit target or max loss. */
const BotResultModal = ({ result, onClose }: { result: SessionResult; onClose: () => void }) => {
    const hitTarget = result.reason === 'target';
    const Icon = hitTarget ? Target : TrendingDown;

    return (
        <div
            role='dialog'
            aria-modal='true'
            aria-label='Session summary'
            className='fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm'
            onClick={onClose}
        >
            <div
                className='w-full max-w-sm rounded-2xl border border-line bg-ink-800 p-6 shadow-2xl'
                onClick={e => e.stopPropagation()}
            >
                <div className='flex items-start justify-between'>
                    <span
                        className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                            hitTarget ? 'bg-gain text-on-fg' : 'bg-loss text-on-fg'
                        }`}
                    >
                        <Icon size={20} />
                    </span>
                    <button
                        type='button'
                        onClick={onClose}
                        aria-label='Close'
                        className='text-mist-400 transition-colors hover:text-fg'
                    >
                        <X size={18} />
                    </button>
                </div>

                <h3 className='mt-4 text-lg font-bold text-fg'>
                    {hitTarget ? 'Profit target reached' : 'Max loss reached'}
                </h3>
                <p className='mt-1 text-sm text-mist-400'>
                    {hitTarget
                        ? 'The bot stopped itself after hitting your target.'
                        : 'The bot stopped itself to protect the rest of your balance.'}
                </p>

                <dl className='mt-5 grid grid-cols-2 gap-2'>
                    <Cell
                        label='Net P/L'
                        value={`${signed(result.netProfit)} ${result.currency}`}
                        pnl={result.netProfit}
                    />
                    <Cell label='Rounds' value={String(result.trades)} />
                    <Cell label='Win rate' value={`${winRate(result.wins, result.trades).toFixed(0)}%`} />
                    <Cell label='Won / lost' value={`${result.wins} / ${result.losses}`} />
                    <Cell label='Contracts' value={String(result.contracts)} />
                    <Cell label='Worst streak' value={`${result.worstStreak} loss${result.worstStreak === 1 ? '' : 'es'}`} />
                </dl>

                <button type='button' onClick={onClose} className='btn-solid mt-5 w-full'>
                    Close
                </button>
            </div>
        </div>
    );
};

const Cell = ({ label, value, pnl }: { label: string; value: string; pnl?: number }) => (
    <div className='card-flat !p-3'>
        <dt className='label'>{label}</dt>
        <dd
            className={`mt-1 font-mono text-sm font-bold ${
                pnl === undefined ? 'text-fg' : pnl >= 0 ? 'text-gain' : 'text-loss'
            }`}
        >
            {value}
        </dd>
    </div>
);

export default BotResultModal;
