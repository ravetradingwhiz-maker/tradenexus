import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import AdminShell from '@/pages/admin/AdminShell';
import Spinner from '@/components/Spinner';
import {
    createSubscription,
    deleteSubscription,
    listSubscriptions,
    updateSubscription,
    type AdminSubscription,
} from '@/services/admin-api';
import { shortDate } from '@/utils/format';

/** Grant, extend, expire and revoke subscriptions by Deriv loginid. */
const AdminSubscriptions = () => {
    const [rows, setRows] = useState<AdminSubscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');

    // New-grant form.
    const [newLoginids, setNewLoginids] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newMonths, setNewMonths] = useState<number | ''>('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        listSubscriptions({ q, status })
            .then(setRows)
            .catch(e => setError(e instanceof Error ? e.message : 'Could not load subscriptions.'))
            .finally(() => setLoading(false));
    }, [q, status]);

    useEffect(() => {
        load();
    }, [load]);

    const grant = async () => {
        const loginids = newLoginids
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        if (!loginids.length) {
            setError('Enter at least one loginid.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await createSubscription({
                loginids,
                email: newEmail || undefined,
                months: newMonths === '' ? undefined : Number(newMonths),
            });
            setNewLoginids('');
            setNewEmail('');
            setNewMonths('');
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create the subscription.');
        } finally {
            setSaving(false);
        }
    };

    const patch = async (id: string, body: Parameters<typeof updateSubscription>[1]) => {
        try {
            const updated = await updateSubscription(id, body);
            setRows(prev => prev.map(r => (r._id === id ? updated : r)));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not update the subscription.');
        }
    };

    const remove = async (id: string) => {
        try {
            await deleteSubscription(id);
            setRows(prev => prev.filter(r => r._id !== id));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not delete the subscription.');
        }
    };

    return (
        <AdminShell
            title='Subscriptions'
            description='Every active and expired subscription, and a way to grant one by hand.'
            actions={
                <button type='button' onClick={load} className='btn-ghost btn-sm'>
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            }
        >
            {/* Grant */}
            <div className='card flex flex-col gap-4'>
                <h2 className='text-sm font-bold text-fg'>Grant a subscription</h2>
                <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                    <label className='flex flex-col gap-1.5'>
                        <span className='label'>Loginids (comma separated)</span>
                        <input
                            value={newLoginids}
                            onChange={e => setNewLoginids(e.target.value)}
                            placeholder='CR123456, VRTC987654'
                            className='field'
                        />
                    </label>
                    <label className='flex flex-col gap-1.5'>
                        <span className='label'>Months (optional)</span>
                        <input
                            type='number'
                            min={1}
                            value={newMonths}
                            onChange={e => setNewMonths(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder='plan default'
                            className='field'
                        />
                    </label>
                    <label className='flex flex-col gap-1.5'>
                        <span className='label'>Email (optional)</span>
                        <input
                            type='email'
                            value={newEmail}
                            onChange={e => setNewEmail(e.target.value)}
                            placeholder='user@email.com'
                            className='field'
                        />
                    </label>
                </div>
                <button type='button' onClick={grant} disabled={saving} className='btn-solid btn-sm self-start'>
                    <Plus size={13} /> Grant
                </button>
            </div>

            {/* Filters + table */}
            <div className='card flex flex-col gap-4'>
                <div className='flex flex-wrap gap-3'>
                    <input
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder='Search loginid or email'
                        className='field max-w-xs'
                    />
                    <select value={status} onChange={e => setStatus(e.target.value)} className='field max-w-[10rem]'>
                        <option value='' className='bg-ink-700'>
                            All statuses
                        </option>
                        <option value='active' className='bg-ink-700'>
                            Active
                        </option>
                        <option value='expired' className='bg-ink-700'>
                            Expired
                        </option>
                    </select>
                </div>

                {error && <p className='text-sm text-mist-300'>{error}</p>}

                {loading ? (
                    <div className='flex justify-center py-10'>
                        <Spinner />
                    </div>
                ) : rows.length === 0 ? (
                    <p className='py-10 text-center text-sm text-mist-500'>No subscriptions match.</p>
                ) : (
                    <div className='overflow-x-auto'>
                        <table className='w-full min-w-[640px] text-left text-sm'>
                            <thead>
                                <tr className='border-b border-line'>
                                    {['Loginids', 'Email', 'Expires', 'Status', ''].map(h => (
                                        <th key={h} className='py-2 pr-3 label font-semibold'>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-line'>
                                {rows.map(r => (
                                    <tr key={r._id}>
                                        <td className='py-2.5 pr-3 font-mono text-xs text-fg'>
                                            {r.loginids.join(', ')}
                                        </td>
                                        <td className='py-2.5 pr-3 text-xs text-mist-400'>{r.email || '—'}</td>
                                        <td className='py-2.5 pr-3'>
                                            <input
                                                type='date'
                                                value={new Date(r.expiresAt).toISOString().slice(0, 10)}
                                                onChange={e =>
                                                    patch(r._id, {
                                                        expiresAt: new Date(e.target.value).toISOString(),
                                                    })
                                                }
                                                className='field !w-auto !px-2 !py-1 text-xs'
                                                title={shortDate(r.expiresAt)}
                                            />
                                        </td>
                                        <td className='py-2.5 pr-3'>
                                            <select
                                                value={r.status}
                                                onChange={e =>
                                                    patch(r._id, { status: e.target.value as 'active' | 'expired' })
                                                }
                                                className='field !w-auto !px-2 !py-1 text-xs'
                                            >
                                                <option value='active' className='bg-ink-700'>
                                                    active
                                                </option>
                                                <option value='expired' className='bg-ink-700'>
                                                    expired
                                                </option>
                                            </select>
                                        </td>
                                        <td className='py-2.5'>
                                            <button
                                                type='button'
                                                onClick={() => remove(r._id)}
                                                aria-label='Delete subscription'
                                                className='flex h-7 w-7 items-center justify-center rounded-lg border border-line text-mist-400 transition-colors hover:border-fg hover:text-fg'
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AdminShell>
    );
};

export default AdminSubscriptions;
