import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import AdminShell from '@/pages/admin/AdminShell';
import Spinner from '@/components/Spinner';
import { getMarkup, type MarkupTotals } from '@/services/admin-api';

const ZERO: MarkupTotals = { markup: 0, volume: 0, payout: 0, contracts: 0, clients: 0 };
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const usd = (n: number): string => `$${(n || 0).toFixed(2)}`;

/**
 * Calendar-month bounds in UTC. `offset` 0 = this month, -1 = last month.
 * This month runs to today; a completed month runs to its own last day — so the
 * range is always a clean calendar month, not a rolling window.
 */
const monthRange = (offset: number): { from: string; to: string } => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + offset;
    const start = new Date(Date.UTC(y, m, 1));
    const end = offset === 0 ? now : new Date(Date.UTC(y, m + 1, 0));
    return { from: isoDay(start), to: isoDay(end) };
};

/** Deriv app markup revenue, proxied through our server (the browser gets 403). */
const AdminMarkup = () => {
    const thisRange = monthRange(0);
    const [from, setFrom] = useState(thisRange.from);
    const [to, setTo] = useState(thisRange.to);
    const [data, setData] = useState<MarkupTotals | null>(null);
    const [thisMonth, setThisMonth] = useState(0);
    const [lastMonth, setLastMonth] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = (f = from, t = to): void => {
        if (!f || !t) return;
        setLoading(true);
        setError(null);
        getMarkup(f, t)
            .then(setData)
            .catch(e => setError(e instanceof Error ? e.message : 'Could not load markup.'))
            .finally(() => setLoading(false));
    };

    // Month comparison (independent of the range picker) + the first load.
    useEffect(() => {
        const tm = monthRange(0);
        const lm = monthRange(-1);
        Promise.all([getMarkup(tm.from, tm.to).catch(() => ZERO), getMarkup(lm.from, lm.to).catch(() => ZERO)]).then(
            ([a, b]) => {
                setThisMonth(a.markup);
                setLastMonth(b.markup);
            }
        );
        load(tm.from, tm.to);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Apply a month preset: set the range and load it in one tap.
    const pickMonth = (offset: number): void => {
        const r = monthRange(offset);
        setFrom(r.from);
        setTo(r.to);
        load(r.from, r.to);
    };

    const now = new Date();
    const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
    const predicted = (thisMonth / Math.max(1, now.getUTCDate())) * daysInMonth;
    const mom = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

    const lastRange = monthRange(-1);
    const isThisMonth = from === thisRange.from && to === thisRange.to;
    const isLastMonth = from === lastRange.from && to === lastRange.to;

    const summary: { label: string; value: string }[] = [
        { label: 'This month', value: usd(thisMonth) },
        { label: 'Last month', value: usd(lastMonth) },
        { label: 'Predicted month', value: usd(predicted) },
        { label: 'MoM change', value: mom == null ? '—' : `${mom >= 0 ? '↑' : '↓'} ${Math.abs(mom).toFixed(1)}%` },
    ];

    const cells: { label: string; value: string }[] = data
        ? [
              { label: 'Markup earned', value: usd(data.markup) },
              { label: 'Volume', value: usd(data.volume) },
              { label: 'Payout', value: usd(data.payout) },
              { label: 'Contracts', value: String(data.contracts) },
              { label: 'Clients', value: String(data.clients) },
          ]
        : [];

    return (
        <AdminShell title='Markup' description='Deriv app markup revenue by month.'>
            <div className='flex flex-col gap-4'>
                {/* Month comparison — this vs last, with a run-rate projection. */}
                <dl className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                    {summary.map(c => (
                        <div key={c.label} className='card-flat'>
                            <dt className='label'>{c.label}</dt>
                            <dd className='mt-1 font-mono text-lg font-extrabold text-fg'>{c.value}</dd>
                        </div>
                    ))}
                </dl>

                <div className='card flex flex-col gap-5'>
                    {/* Quick month presets */}
                    <div className='flex flex-wrap items-center gap-2'>
                        <button type='button' onClick={() => pickMonth(0)} className={isThisMonth ? 'chip-solid' : 'chip'}>
                            This month
                        </button>
                        <button
                            type='button'
                            onClick={() => pickMonth(-1)}
                            className={isLastMonth ? 'chip-solid' : 'chip'}
                        >
                            Last month
                        </button>
                    </div>

                    {/* Custom range */}
                    <div className='flex flex-wrap items-end gap-3'>
                        <label className='flex flex-col gap-1.5'>
                            <span className='label'>From</span>
                            <input type='date' value={from} onChange={e => setFrom(e.target.value)} className='field' />
                        </label>
                        <label className='flex flex-col gap-1.5'>
                            <span className='label'>To</span>
                            <input type='date' value={to} onChange={e => setTo(e.target.value)} className='field' />
                        </label>
                        <button type='button' onClick={() => load()} disabled={loading} className='btn-solid btn-sm'>
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Load
                        </button>
                    </div>

                    {error && <p className='text-sm text-mist-300'>{error}</p>}

                    {loading && !data ? (
                        <div className='flex justify-center py-10'>
                            <Spinner />
                        </div>
                    ) : (
                        <dl className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                            {cells.map(c => (
                                <div key={c.label} className='card-flat'>
                                    <dt className='label'>{c.label}</dt>
                                    <dd className='mt-1 font-mono text-lg font-extrabold text-fg'>{c.value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>
            </div>
        </AdminShell>
    );
};

export default AdminMarkup;
