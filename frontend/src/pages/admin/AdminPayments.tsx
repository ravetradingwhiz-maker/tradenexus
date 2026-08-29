import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, RefreshCw, X } from 'lucide-react';
import AdminShell from '@/pages/admin/AdminShell';
import Spinner from '@/components/Spinner';
import { approvePayment, listPayments, rejectPayment, type AdminPayment } from '@/services/admin-api';
import type { CryptoAssetId } from '@/services/payments-api';
import { useAuth } from '@/context/AuthContext';
import { shortDate } from '@/utils/format';

const STATUSES = ['', 'pending', 'paid', 'expired', 'failed'];

/** Block explorers, so a claimed transaction is one click from being verified. */
const EXPLORERS: Record<CryptoAssetId, (tx: string) => string> = {
    usdt_trc20: tx => `https://tronscan.org/#/transaction/${tx}`,
    usdt_erc20: tx => `https://etherscan.io/tx/${tx}`,
    eth: tx => `https://etherscan.io/tx/${tx}`,
    bnb: tx => `https://bscscan.com/tx/${tx}`,
    usdc_bep20: tx => `https://bscscan.com/tx/${tx}`,
    btc: tx => `https://mempool.space/tx/${tx}`,
    ltc: tx => `https://litecoinspace.org/tx/${tx}`,
    sol: tx => `https://solscan.io/tx/${tx}`,
    xrp: tx => `https://xrpscan.com/tx/${tx}`,
};

/**
 * The order ledger — and the desk where payments on chains we cannot watch get
 * settled by hand. Approving takes the same activation path as an automatic
 * confirmation, so a manually released subscription is identical to a normal one.
 */
const AdminPayments = () => {
    const { activeLoginId } = useAuth();
    const [rows, setRows] = useState<AdminPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');
    const [awaiting, setAwaiting] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        listPayments({ q, status, awaiting })
            .then(setRows)
            .catch(e => setError(e instanceof Error ? e.message : 'Could not load payments.'))
            .finally(() => setLoading(false));
    }, [q, status, awaiting]);

    useEffect(() => {
        load();
    }, [load]);

    const act = async (orderId: string, action: 'approve' | 'reject') => {
        setBusy(orderId);
        setError(null);
        try {
            if (action === 'approve') await approvePayment(orderId, activeLoginId ?? undefined);
            else await rejectPayment(orderId);
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : `Could not ${action} that payment.`);
        } finally {
            setBusy(null);
        }
    };

    const paidTotal = rows.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.priceUSD, 0);
    const claimed = rows.filter(r => r.status === 'pending' && r.proofTxHash);

    return (
        <AdminShell
            title='Payments'
            description='Every order the checkout has created, and where it ended up.'
            actions={
                <button type='button' onClick={load} className='btn-ghost btn-sm'>
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            }
        >
            {claimed.length > 0 && !awaiting && (
                <button
                    type='button'
                    onClick={() => setAwaiting(true)}
                    className='card-flat flex items-center justify-between gap-3 text-left transition-colors hover:border-line-strong'
                >
                    <span className='text-sm font-semibold text-fg'>
                        {claimed.length} payment{claimed.length === 1 ? '' : 's'} waiting on your check
                    </span>
                    <span className='chip-solid'>Review</span>
                </button>
            )}

            <div className='card flex flex-col gap-4'>
                <div className='flex flex-wrap items-center gap-3'>
                    <input
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder='Search order id or email'
                        className='field max-w-xs'
                    />
                    <select value={status} onChange={e => setStatus(e.target.value)} className='field max-w-[10rem]'>
                        {STATUSES.map(s => (
                            <option key={s} value={s} className='bg-ink-700'>
                                {s || 'All statuses'}
                            </option>
                        ))}
                    </select>
                    <label className='flex items-center gap-2 text-xs text-mist-400'>
                        <input
                            type='checkbox'
                            checked={awaiting}
                            onChange={e => setAwaiting(e.target.checked)}
                            className='h-4 w-4 accent-white'
                        />
                        Awaiting my check
                    </label>
                    <span className='ml-auto rounded-full border border-line px-3 py-1.5 text-xs text-mist-400'>
                        Paid total: <strong className='font-mono text-fg'>${paidTotal.toFixed(2)}</strong>
                    </span>
                </div>

                {error && <p className='text-sm text-mist-300'>{error}</p>}

                {loading ? (
                    <div className='flex justify-center py-10'>
                        <Spinner />
                    </div>
                ) : rows.length === 0 ? (
                    <p className='py-10 text-center text-sm text-mist-500'>No payments match.</p>
                ) : (
                    <div className='overflow-x-auto'>
                        <table className='w-full min-w-[900px] text-left text-sm'>
                            <thead>
                                <tr className='border-b border-line'>
                                    {['Order', 'Created', 'Email', 'USD', 'Paid in', 'Proof', 'Status', ''].map(h => (
                                        <th key={h} className='py-2 pr-3 label font-semibold'>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-line'>
                                {rows.map(r => {
                                    const explorer = r.asset && r.proofTxHash ? EXPLORERS[r.asset] : null;
                                    const settleable = r.status === 'pending';
                                    return (
                                        <tr key={r._id}>
                                            <td className='py-2.5 pr-3 font-mono text-xs text-fg'>{r.orderId}</td>
                                            <td className='py-2.5 pr-3 text-xs text-mist-400'>
                                                {r.createdAt ? shortDate(r.createdAt) : '—'}
                                            </td>
                                            <td className='py-2.5 pr-3 text-xs text-mist-400'>{r.email}</td>
                                            <td className='py-2.5 pr-3 font-mono text-xs text-fg'>
                                                ${r.priceUSD.toFixed(2)}
                                            </td>
                                            <td className='py-2.5 pr-3 font-mono text-xs text-mist-400'>
                                                {r.payAmount} {r.payCurrency.toUpperCase()}
                                            </td>
                                            <td className='py-2.5 pr-3'>
                                                {r.proofTxHash ? (
                                                    explorer ? (
                                                        <a
                                                            href={explorer(r.proofTxHash)}
                                                            target='_blank'
                                                            rel='noreferrer noopener'
                                                            className='inline-flex items-center gap-1 font-mono text-[11px] text-fg underline underline-offset-2'
                                                        >
                                                            {r.proofTxHash.slice(0, 10)}… <ExternalLink size={10} />
                                                        </a>
                                                    ) : (
                                                        <span className='font-mono text-[11px] text-mist-400'>
                                                            {r.proofTxHash.slice(0, 10)}…
                                                        </span>
                                                    )
                                                ) : (
                                                    <span className='text-[11px] text-mist-600'>—</span>
                                                )}
                                            </td>
                                            <td className='py-2.5 pr-3'>
                                                <span className={r.status === 'paid' ? 'chip-solid' : 'chip'}>
                                                    {r.status}
                                                </span>
                                            </td>
                                            <td className='py-2.5'>
                                                {settleable && (
                                                    <span className='flex items-center gap-1.5'>
                                                        <button
                                                            type='button'
                                                            disabled={busy === r.orderId}
                                                            onClick={() => act(r.orderId, 'approve')}
                                                            title='Verified — release the subscription'
                                                            aria-label='Approve payment'
                                                            className='flex h-7 w-7 items-center justify-center rounded-lg border border-line text-mist-300 transition-colors hover:border-fg hover:bg-fg hover:text-on-fg disabled:opacity-40'
                                                        >
                                                            <Check size={13} />
                                                        </button>
                                                        <button
                                                            type='button'
                                                            disabled={busy === r.orderId}
                                                            onClick={() => act(r.orderId, 'reject')}
                                                            title='Reject this order'
                                                            aria-label='Reject payment'
                                                            className='flex h-7 w-7 items-center justify-center rounded-lg border border-line text-mist-400 transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40'
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AdminShell>
    );
};

export default AdminPayments;
