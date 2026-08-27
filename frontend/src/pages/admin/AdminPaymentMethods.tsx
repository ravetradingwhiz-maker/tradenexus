import { useEffect, useState } from 'react';
import { Check, Lock, Pencil, Plus, Save, TriangleAlert, X } from 'lucide-react';
import AdminShell from '@/pages/admin/AdminShell';
import Spinner from '@/components/Spinner';
import CoinIcon from '@/components/CoinIcon';
import { Toggle } from '@/components/Field';
import {
    getAdminPaymentConfig,
    setAdminPaymentConfig,
    setAdminWallet,
    type AdminPaymentConfig,
    type AssetDef,
} from '@/services/admin-api';
import type { CryptoAssetId, Method } from '@/services/payments-api';

const METHOD_ORDER: Method[] = ['crypto', 'card', 'mpesa'];

const truncate = (v: string, head = 10, tail = 6) =>
    v.length <= head + tail + 1 ? v : `${v.slice(0, head)}…${v.slice(-tail)}`;

/**
 * Where an address is entered.
 *
 * Kept deliberately blunt: the network is repeated in the heading and again as
 * a warning, because the one mistake that cannot be undone here is pasting an
 * address for the wrong chain.
 */
const AddressModal = ({
    asset,
    onClose,
    onSaved,
}: {
    asset: AssetDef;
    onClose: () => void;
    onSaved: (config: AdminPaymentConfig) => void;
}) => {
    const [address, setAddress] = useState(asset.address);
    const [memo, setMemo] = useState(asset.memo);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const save = async (value: string) => {
        setSaving(true);
        setError(null);
        try {
            const config = await setAdminWallet({ assetId: asset.id, address: value, memo });
            onSaved(config);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save that address.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            role='dialog'
            aria-modal='true'
            aria-labelledby='wallet-title'
            className='fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm'
            onClick={onClose}
        >
            <div
                className='w-full max-w-md rounded-2xl border border-line bg-ink-800 p-6 shadow-2xl'
                onClick={e => e.stopPropagation()}
            >
                <div className='flex items-start justify-between gap-3'>
                    <div className='flex items-center gap-3'>
                        <CoinIcon asset={asset.id} ticker={asset.ticker} size={36} />
                        <div>
                            <h3 id='wallet-title' className='text-base font-bold text-fg'>
                                {asset.ticker} receiving address
                            </h3>
                            <p className='font-mono text-[11px] text-mist-500'>{asset.network}</p>
                        </div>
                    </div>
                    <button
                        type='button'
                        onClick={onClose}
                        aria-label='Close'
                        className='text-mist-400 transition-colors hover:text-fg'
                    >
                        <X size={18} />
                    </button>
                </div>

                <label className='mt-5 flex flex-col gap-1.5'>
                    <span className='label'>Address</span>
                    <input
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        placeholder={`Your ${asset.network} address`}
                        spellCheck={false}
                        autoFocus
                        className='field break-all font-mono text-xs'
                    />
                </label>

                {asset.supportsMemo && (
                    <label className='mt-3 flex flex-col gap-1.5'>
                        <span className='label'>Destination tag / memo (optional)</span>
                        <input
                            value={memo}
                            onChange={e => setMemo(e.target.value)}
                            placeholder='Required by most exchange deposit addresses'
                            inputMode='numeric'
                            className='field font-mono text-xs'
                        />
                    </label>
                )}

                <p className='mt-4 flex items-start gap-2 rounded-xl border border-loss/40 bg-ink-700 px-3.5 py-3 text-[11px] leading-relaxed text-mist-300'>
                    <TriangleAlert size={13} className='mt-0.5 shrink-0 text-loss' />
                    <span>
                        Customers will send real funds here. Check this is a <strong className='text-fg'>
                            {asset.network}
                        </strong>{' '}
                        address — a transfer to the wrong chain cannot be recovered.
                    </span>
                </p>

                {error && (
                    <p className='mt-3 flex items-start gap-1.5 text-xs text-loss'>
                        <TriangleAlert size={13} className='mt-0.5 shrink-0' /> {error}
                    </p>
                )}

                <div className='mt-5 flex gap-2'>
                    {asset.address && (
                        <button
                            type='button'
                            disabled={saving}
                            onClick={() => save('')}
                            className='btn-ghost flex-1'
                            title='Remove the address and hide this coin at checkout'
                        >
                            Remove
                        </button>
                    )}
                    <button
                        type='button'
                        disabled={saving || !address.trim() || address.trim() === asset.address}
                        onClick={() => save(address.trim())}
                        className='btn-solid flex-1'
                    >
                        <Save size={14} /> {saving ? 'Saving…' : 'Save address'}
                    </button>
                </div>
            </div>
        </div>
    );
};

/**
 * Controls what the checkout offers: the three rails, each coin, and the wallet
 * each coin pays into.
 *
 * An address set in server/.env wins over anything entered here — that is shown
 * on the card rather than silently ignoring an edit.
 */
const AdminPaymentMethods = () => {
    const [config, setConfig] = useState<AdminPaymentConfig | null>(null);
    const [editing, setEditing] = useState<AssetDef | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        getAdminPaymentConfig()
            .then(setConfig)
            .catch(e => setError(e instanceof Error ? e.message : 'Could not load the payment config.'))
            .finally(() => setLoading(false));
    }, []);

    const toggleMethod = (id: Method, on: boolean) =>
        setConfig(prev => (prev ? { ...prev, methods: { ...prev.methods, [id]: on } } : prev));

    const toggleAsset = (id: CryptoAssetId, on: boolean) =>
        setConfig(prev => (prev ? { ...prev, assets: { ...prev.assets, [id]: on } } : prev));

    const save = async () => {
        if (!config) return;
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const res = await setAdminPaymentConfig({ methods: config.methods, assets: config.assets });
            setConfig(res);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the payment config.');
        } finally {
            setSaving(false);
        }
    };

    const anyMethodOn = config ? METHOD_ORDER.some(m => config.methods[m]) : true;
    const cryptoOn = config?.methods.crypto ?? false;
    const live = config ? config.assetDefs.filter(a => config.assets[a.id] && a.route) : [];
    const missing = config ? config.assetDefs.filter(a => config.assets[a.id] && !a.route) : [];

    return (
        <AdminShell title='Payment methods' description='What the checkout offers, rail by rail and coin by coin.'>
            {loading || !config ? (
                <div className='card flex justify-center py-12'>
                    <Spinner />
                </div>
            ) : (
                <>
                    <div className='card flex flex-col gap-4'>
                        <h2 className='text-sm font-bold text-fg'>Rails</h2>
                        <div className='grid gap-2.5 md:grid-cols-3'>
                            {METHOD_ORDER.map(id => (
                                <Toggle
                                    key={id}
                                    checked={config.methods[id]}
                                    onChange={on => toggleMethod(id, on)}
                                    label={config.methodDefs[id]?.label ?? id}
                                    hint={config.methodDefs[id]?.desc}
                                />
                            ))}
                        </div>
                        {!anyMethodOn && (
                            <p className='flex items-center gap-1.5 text-xs text-loss'>
                                <TriangleAlert size={13} /> At least one rail must stay on — the server will reject an
                                empty checkout.
                            </p>
                        )}
                    </div>

                    <div className='card flex flex-col gap-4'>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                            <h2 className='text-sm font-bold text-fg'>Coins</h2>
                            <span className='chip'>
                                {live.length} live · {config.assetDefs.length} supported
                            </span>
                        </div>

                        <p className='text-xs leading-relaxed text-mist-500'>
                            Each coin pays into your own wallet. Add the address here, or pin it in{' '}
                            <code className='font-mono text-mist-300'>server/.env</code> — the env value wins when both
                            are set. A coin with no address stays hidden at checkout, whatever the switch says.
                        </p>

                        {!cryptoOn && (
                            <p className='text-xs text-mist-500'>
                                The crypto rail is off, so none of these appear at checkout.
                            </p>
                        )}

                        <div className='grid gap-2.5 sm:grid-cols-2'>
                            {config.assetDefs.map(a => {
                                const on = config.assets[a.id];
                                const pinned = a.addressSource === 'env';
                                return (
                                    <div
                                        key={a.id}
                                        className='flex flex-col gap-2 rounded-xl border border-line bg-ink-800 p-3'
                                    >
                                        <div className='flex items-center gap-3'>
                                            <CoinIcon asset={a.id} ticker={a.ticker} size={30} />
                                            <div className='min-w-0 flex-1'>
                                                <div className='flex items-center gap-1.5'>
                                                    <span className='text-sm font-bold text-fg'>{a.ticker}</span>
                                                    <span className='truncate text-[10px] text-mist-500'>{a.name}</span>
                                                </div>
                                                <div className='truncate font-mono text-[10px] text-mist-500'>
                                                    {a.network}
                                                </div>
                                            </div>
                                            <Toggle
                                                checked={on}
                                                onChange={v => toggleAsset(a.id, v)}
                                                label=''
                                                compact
                                            />
                                        </div>

                                        {/* Address row */}
                                        {a.address ? (
                                            <div className='flex items-center gap-2 rounded-lg border border-line bg-ink-700 px-2.5 py-2'>
                                                <Check size={12} className='shrink-0 text-gain' />
                                                <span
                                                    className='min-w-0 flex-1 truncate font-mono text-[10px] text-mist-200'
                                                    title={a.address}
                                                >
                                                    {truncate(a.address)}
                                                </span>
                                                {pinned ? (
                                                    <span
                                                        className='flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-mist-500'
                                                        title={`Pinned by ${a.envKey} in server/.env`}
                                                    >
                                                        <Lock size={9} /> env
                                                    </span>
                                                ) : (
                                                    <button
                                                        type='button'
                                                        onClick={() => setEditing(a)}
                                                        className='flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[10px] font-semibold text-mist-300 transition-colors hover:border-fg hover:text-fg'
                                                    >
                                                        <Pencil size={10} /> Edit
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <button
                                                type='button'
                                                onClick={() => setEditing(a)}
                                                className='flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong px-2.5 py-2 text-[11px] font-semibold text-mist-400 transition-colors hover:border-fg hover:text-fg'
                                            >
                                                <Plus size={12} /> Add address
                                            </button>
                                        )}

                                        {on && !a.route && (
                                            <p className='flex items-start gap-1 text-[10px] leading-tight text-loss'>
                                                <TriangleAlert size={10} className='mt-0.5 shrink-0' />
                                                No address — hidden at checkout.
                                            </p>
                                        )}
                                        {a.address && !a.autoConfirm && (
                                            <p className='text-[10px] leading-tight text-mist-500'>
                                                Confirmed by hand — needs ETHERSCAN_API_KEY to settle automatically.
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {missing.length > 0 && (
                            <p className='flex items-start gap-1.5 rounded-xl border border-line bg-ink-700 px-3.5 py-3 text-[11px] leading-relaxed text-mist-300'>
                                <TriangleAlert size={13} className='mt-0.5 shrink-0' />
                                <span>
                                    {missing.map(a => a.ticker).join(', ')} {missing.length === 1 ? 'is' : 'are'} on but{' '}
                                    {missing.length === 1 ? 'has' : 'have'} no receiving address, so{' '}
                                    {missing.length === 1 ? 'it stays' : 'they stay'} hidden at checkout. Use{' '}
                                    <strong className='text-fg'>Add address</strong> on each card.
                                </span>
                            </p>
                        )}
                    </div>

                    {error && <p className='text-sm text-loss'>{error}</p>}

                    <div className='flex items-center gap-3'>
                        <button type='button' onClick={save} disabled={saving} className='btn-solid btn-sm'>
                            <Save size={13} /> {saving ? 'Saving…' : 'Save changes'}
                        </button>
                        {saved && <span className='text-xs font-semibold text-gain'>Saved.</span>}
                        <span className='text-[11px] text-mist-500'>
                            Addresses save immediately; the switches save here.
                        </span>
                    </div>
                </>
            )}

            {editing && (
                <AddressModal asset={editing} onClose={() => setEditing(null)} onSaved={setConfig} />
            )}
        </AdminShell>
    );
};

export default AdminPaymentMethods;
