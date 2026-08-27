import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import AdminShell from '@/pages/admin/AdminShell';
import Spinner from '@/components/Spinner';
import { getMarkup, type MarkupTotals } from '@/services/admin-api';

const isoDaysAgo = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
};

/** Deriv app markup revenue, proxied through our server (the browser gets 403). */
const AdminMarkup = () => {
    const [from, setFrom] = useState(isoDaysAgo(30));
    const [to, setTo] = useState(isoDaysAgo(0));
    const [data, setData] = useState<MarkupTotals | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        getMarkup(from, to)
            .then(setData)
            .catch(e => setError(e instanceof Error ? e.message : 'Could not load markup.'))
            .finally(() => setLoading(false));
    }, [from, to]);

    useEffect(() => {
        load();
    }, [load]);

    const cells: { label: string; value: string }[] = data
        ? [
              { label: 'Markup earned', value: `$${data.markup.toFixed(2)}` },
              { label: 'Volume', value: `$${data.volume.toFixed(2)}` },
              { label: 'Payout', value: `$${data.payout.toFixed(2)}` },
              { label: 'Contracts', value: String(data.contracts) },
              { label: 'Clients', value: String(data.clients) },
              { label: 'App id', value: data.app_id ?? '—' },
          ]
        : [];

    return (
        <AdminShell title='Markup' description='Deriv app markup revenue for the selected period.'>
            <div className='card flex flex-col gap-5'>
                <div className='flex flex-wrap items-end gap-3'>
                    <label className='flex flex-col gap-1.5'>
                        <span className='label'>From</span>
                        <input type='date' value={from} onChange={e => setFrom(e.target.value)} className='field' />
                    </label>
                    <label className='flex flex-col gap-1.5'>
                        <span className='label'>To</span>
                        <input type='date' value={to} onChange={e => setTo(e.target.value)} className='field' />
                    </label>
                    <button type='button' onClick={load} disabled={loading} className='btn-solid btn-sm'>
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
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
        </AdminShell>
    );
};

export default AdminMarkup;
