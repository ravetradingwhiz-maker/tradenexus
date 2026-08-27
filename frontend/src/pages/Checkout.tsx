import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Check,
    CheckCircle2,
    Copy,
    CreditCard,
    Crown,
    Loader2,
    Lock,
    ShieldCheck,
    Smartphone,
    TriangleAlert,
    Wallet,
    X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import {
    createCryptoPayment,
    getCheckoutOptions,
    getPaymentOrder,
    getPlan,
    initCardPayment,
    initMpesaPayment,
    submitPaymentProof,
    type CheckoutOptions,
    type CryptoAsset,
    type CryptoAssetId,
    type Method,
    type PaymentOrder,
    type Plan,
} from '@/services/payments-api';
import CoinIcon from '@/components/CoinIcon';
import SITE from '@/config/site';

const FALLBACK_PLAN: Plan = { label: 'Pro', priceUSD: 100, months: 12, term: '1 year' };

const METHOD_META: Record<Method, { title: string; icon: typeof Wallet }> = {
    // Crypto leads: it is irreversible, so there is no chargeback exposure.
    crypto: { title: 'Crypto', icon: Wallet },
    card: { title: 'Card', icon: CreditCard },
    mpesa: { title: 'M-Pesa', icon: Smartphone },
};

const METHOD_ORDER: Method[] = ['crypto', 'card', 'mpesa'];

/** Mirrors the form's shape so the swap to real content doesn't jump. */
const CheckoutSkeleton = () => (
    <div className='card flex animate-pulse flex-col gap-5'>
        <div className='h-[68px] rounded-xl bg-ink-700' />
        <div className='grid grid-cols-3 gap-2.5'>
            {[0, 1, 2].map(i => (
                <div key={i} className='h-[86px] rounded-2xl bg-ink-700' />
            ))}
        </div>
        <div className='grid grid-cols-2 gap-2'>
            {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className='h-[42px] rounded-lg bg-ink-700' />
            ))}
        </div>
        <div className='h-[46px] rounded-xl bg-ink-700' />
        <div className='h-[46px] rounded-full bg-ink-700' />
    </div>
);

type Phase = 'form' | 'pending' | 'paid' | 'failed';

const Checkout = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { accounts } = useAuth();
    const subscription = useSubscription();

    const [plan, setPlan] = useState<Plan>(FALLBACK_PLAN);
    const [planReady, setPlanReady] = useState(false);
    // `null` = still loading. We render a skeleton rather than guessing, so
    // disabled methods never flash on screen and then vanish.
    const [options, setOptions] = useState<CheckoutOptions | null>(null);

    const [email, setEmail] = useState('');
    const [method, setMethod] = useState<Method>('crypto');
    const [asset, setAsset] = useState<CryptoAssetId>('usdt_trc20');
    const [agreed, setAgreed] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [phase, setPhase] = useState<Phase>('form');
    const [order, setOrder] = useState<PaymentOrder | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [copied, setCopied] = useState<'address' | 'amount' | 'memo' | null>(null);
    const [txHash, setTxHash] = useState('');
    const [proofSending, setProofSending] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const priceUSD = plan.priceUSD;
    const loginids = accounts.map(a => a.loginid);
    const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

    useEffect(() => {
        getPlan()
            .then(setPlan)
            .catch(() => {
                /* fall back to the built-in plan */
            })
            .finally(() => setPlanReady(true));

        getCheckoutOptions()
            .then(setOptions)
            // If the config can't be read, offer nothing rather than a dead
            // button — the error surfaces below instead.
            .catch(() => setOptions({ methods: { crypto: false, card: false, mpesa: false }, assets: [] }));
    }, []);

    // Derive the active selections rather than syncing them in an effect, so the
    // choice is never briefly out of step with what is actually on offer.
    const visibleMethods = options ? METHOD_ORDER.filter(m => options.methods[m]) : [];
    const activeMethod: Method = visibleMethods.includes(method) ? method : (visibleMethods[0] ?? method);
    const assets: CryptoAsset[] = options?.assets ?? [];
    const activeAsset: CryptoAssetId = assets.some(a => a.id === asset) ? asset : (assets[0]?.id ?? asset);
    const activeAssetMeta = assets.find(a => a.id === activeAsset);

    const formLoading = !planReady || options === null;
    const nothingEnabled = options !== null && visibleMethods.length === 0;

    // ── Starting a payment ──────────────────────────────────────────────────

    const startCrypto = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const created = await createCryptoPayment({ asset: activeAsset, email, loginids });
            setOrder(created);
            setPhase('pending');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not start the payment.');
        } finally {
            setSubmitting(false);
        }
    };

    // Card / M-Pesa hand off to Paystack's hosted page. `submitting` is left on:
    // the browser navigates away, then returns here with ?reference=.
    const startHosted = async (kind: 'card' | 'mpesa') => {
        setSubmitting(true);
        setError(null);
        try {
            const init =
                kind === 'card'
                    ? await initCardPayment({ email, loginids })
                    : await initMpesaPayment({ email, loginids });
            window.location.href = init.authorizationUrl;
        } catch (e) {
            setError(e instanceof Error ? e.message : `Could not start the ${kind} payment.`);
            setSubmitting(false);
        }
    };

    const sendProof = async () => {
        if (!order || txHash.trim().length < 16) return;
        setProofSending(true);
        setError(null);
        try {
            const res = await submitPaymentProof(order.orderId, txHash.trim());
            setOrder(res.order);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not record that transaction.');
        } finally {
            setProofSending(false);
        }
    };

    // On return from Paystack the URL carries the order reference. Load it and
    // drop into the polling `pending` phase so the server verifies the charge.
    useEffect(() => {
        const ref = params.get('reference') || params.get('trxref');
        if (!ref) return;
        setPhase('pending');
        getPaymentOrder(ref)
            .then(setOrder)
            .catch(() => setError('Could not load your payment.'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Poll order status while we're awaiting payment.
    useEffect(() => {
        if (phase !== 'pending' || !order) return;
        const tick = async () => {
            try {
                const fresh = await getPaymentOrder(order.orderId);
                setOrder(fresh);
                if (fresh.status === 'paid') {
                    setPhase('paid');
                    subscription.refresh();
                } else if (fresh.status === 'expired' || fresh.status === 'failed') {
                    setPhase('failed');
                    setError(`Payment ${fresh.status}.`);
                }
            } catch {
                /* keep polling */
            }
        };
        pollRef.current = setInterval(tick, 6000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [phase, order, subscription]);

    const copy = (kind: 'address' | 'amount' | 'memo', value: string) => {
        navigator.clipboard?.writeText(value);
        setCopied(kind);
        setTimeout(() => setCopied(null), 1500);
    };

    const payLabel =
        activeMethod === 'card'
            ? `Pay $${priceUSD} by card`
            : activeMethod === 'mpesa'
              ? 'Pay with M-Pesa'
              : `Pay in ${activeAssetMeta?.ticker ?? 'crypto'}`;

    return (
        <div className='container-page flex flex-col items-center py-10'>
            <div className='w-full max-w-xl'>
                {/* ── Header ─────────────────────────────────────────────── */}
                <div className='mb-5 text-center'>
                    <h1 className='label'>Choose payment</h1>
                    <p className='mt-2 wordmark text-lg text-fg'>{SITE.bots.pro}</p>
                    <p className='mt-1 font-mono text-xs text-mist-500'>
                        {plan.term} · {priceUSD} USD
                    </p>
                </div>

                {phase === 'paid' ? (
                    <div className='card flex flex-col items-center gap-3 text-center'>
                        <CheckCircle2 size={40} className='text-fg' />
                        <h2 className='text-lg font-bold text-fg'>You&apos;re in.</h2>
                        <p className='text-sm text-mist-400'>
                            {SITE.bots.pro} is unlocked for the next {plan.term}, on every login of your Deriv account.
                            A receipt is on its way to <strong className='text-fg'>{email || 'your email'}</strong>.
                        </p>
                        <button type='button' onClick={() => navigate('/app#pro')} className='btn-solid mt-2 w-full'>
                            Start trading
                        </button>
                    </div>
                ) : phase === 'pending' && order ? (
                    order.provider === 'paystack' ? (
                        <div className='card flex flex-col items-center gap-3 text-center'>
                            <Loader2 size={40} className='animate-spin text-fg' />
                            <h2 className='text-lg font-bold text-fg'>Confirming your payment…</h2>
                            <p className='text-sm text-mist-400'>
                                This usually takes a few seconds and updates here on its own.
                            </p>
                        </div>
                    ) : (
                        <div className='card flex flex-col gap-4'>
                            <div className='flex items-center justify-between gap-2'>
                                <span className='flex items-center gap-2'>
                                    {order.asset && <CoinIcon asset={order.asset} ticker={order.ticker ?? ''} size={22} />}
                                    <span className='label'>Send exactly</span>
                                </span>
                                <button
                                    type='button'
                                    onClick={() => copy('amount', String(order.payAmount))}
                                    title='Copy amount'
                                    className='flex items-center gap-1.5 font-mono text-xl font-extrabold text-fg transition-opacity hover:opacity-80'
                                >
                                    {order.payAmount} {order.ticker ?? ''}
                                    <Copy size={14} />
                                    {copied === 'amount' && <span className='text-[11px] font-semibold'>Copied</span>}
                                </button>
                            </div>

                            <div className='flex justify-center'>
                                <img
                                    alt='Payment address QR code'
                                    width={180}
                                    height={180}
                                    className='rounded-lg bg-white p-2'
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(order.payAddress)}`}
                                />
                            </div>

                            <div>
                                <span className='label'>To this address</span>
                                <div className='mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-ink-700 px-3.5 py-2.5'>
                                    <span className='flex-1 break-all font-mono text-xs text-fg'>{order.payAddress}</span>
                                    <button
                                        type='button'
                                        onClick={() => copy('address', order.payAddress)}
                                        className='btn-ghost btn-sm shrink-0'
                                    >
                                        <Copy size={12} /> {copied === 'address' ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                            </div>

                            {order.payMemo && (
                                <div>
                                    <span className='label'>Destination tag / memo — required</span>
                                    <div className='mt-1.5 flex items-center gap-2 rounded-xl border border-fg bg-ink-700 px-3.5 py-2.5'>
                                        <span className='flex-1 break-all font-mono text-xs text-fg'>{order.payMemo}</span>
                                        <button
                                            type='button'
                                            onClick={() => copy('memo', order.payMemo as string)}
                                            className='btn-ghost btn-sm shrink-0'
                                        >
                                            <Copy size={12} /> {copied === 'memo' ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Chains we watch confirm themselves. The rest ask
                                for the transaction hash so we can check it. */}
                            {order.needsManualCheck ? (
                                order.proofTxHash ? (
                                    <div className='flex items-center justify-center gap-2 rounded-xl border border-line bg-ink-700 px-3.5 py-3 text-sm text-mist-200'>
                                        <Loader2 size={15} className='animate-spin' /> Got it — we&apos;re checking your
                                        transaction now.
                                    </div>
                                ) : (
                                    <div className='flex flex-col gap-2 rounded-xl border border-line bg-ink-700 p-3.5'>
                                        <span className='label'>Already sent it? Paste the transaction hash</span>
                                        <input
                                            value={txHash}
                                            onChange={e => setTxHash(e.target.value)}
                                            placeholder='0x… / transaction id'
                                            className='field !bg-ink-800 font-mono text-xs'
                                        />
                                        <button
                                            type='button'
                                            onClick={sendProof}
                                            disabled={proofSending || txHash.trim().length < 16}
                                            className='btn-solid btn-sm self-start'
                                        >
                                            {proofSending ? <Loader2 size={13} className='animate-spin' /> : null}
                                            Confirm payment
                                        </button>
                                        <span className='text-[11px] leading-relaxed text-mist-500'>
                                            We verify it on the block explorer and unlock your account, usually within
                                            a few minutes.
                                        </span>
                                    </div>
                                )
                            ) : (
                                <div className='flex items-center justify-center gap-2 text-sm text-mist-200'>
                                    <Loader2 size={15} className='animate-spin' /> Waiting for the network to confirm…
                                </div>
                            )}

                            <p className='text-center text-[11px] leading-relaxed text-mist-500'>
                                Send the <strong className='text-mist-300'>exact</strong> amount on the{' '}
                                <strong className='text-mist-300'>{order.assetLabel}</strong> network — that exact
                                figure is how we match the payment to you. Sending on a different network will lose the
                                funds. This page unlocks itself the moment it clears.
                            </p>
                        </div>
                    )
                ) : formLoading ? (
                    <CheckoutSkeleton />
                ) : (
                    <div className='card flex flex-col gap-5'>
                        {/* Order summary */}
                        <div className='flex items-center justify-between rounded-xl border border-line bg-ink-700 px-4 py-3.5'>
                            <div>
                                <div className='text-sm font-bold text-fg'>{plan.term} of {SITE.bots.pro}</div>
                                <div className='text-[11px] text-mist-500'>
                                    One payment. No auto-renewal, no card kept on file.
                                </div>
                            </div>
                            <span className='font-mono text-2xl font-extrabold text-fg'>${priceUSD}</span>
                        </div>

                        {nothingEnabled ? (
                            <p className='flex items-center gap-2 rounded-xl border border-line bg-ink-700 px-3.5 py-3 text-xs text-mist-300'>
                                <TriangleAlert size={14} className='shrink-0' />
                                No payment method is currently available. Please try again shortly.
                            </p>
                        ) : (
                            <>
                                {/* Method */}
                                <div>
                                    <span className='label'>Payment method</span>
                                    <div
                                        className={`mt-2.5 grid gap-2.5 ${
                                            visibleMethods.length === 1
                                                ? 'grid-cols-1'
                                                : visibleMethods.length === 2
                                                  ? 'grid-cols-2'
                                                  : 'grid-cols-3'
                                        }`}
                                    >
                                        {visibleMethods.map(m => {
                                            const meta = METHOD_META[m];
                                            const active = m === activeMethod;
                                            // The crypto subtitle counts what is
                                            // actually on offer, so it can never
                                            // promise more coins than are shown.
                                            const sub =
                                                m === 'crypto'
                                                    ? `${assets.length} coin${assets.length === 1 ? '' : 's'}`
                                                    : m === 'card'
                                                      ? 'Visa / Mastercard'
                                                      : 'Mobile money';
                                            return (
                                                <button
                                                    key={m}
                                                    type='button'
                                                    onClick={() => setMethod(m)}
                                                    className={`relative flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all ${
                                                        active
                                                            ? 'border-fg bg-fg text-on-fg'
                                                            : 'border-line bg-ink-700 text-mist-300 hover:border-line-strong hover:text-fg'
                                                    }`}
                                                >
                                                    <meta.icon size={20} />
                                                    <span className='flex flex-col items-center'>
                                                        <span className='text-sm font-bold'>{meta.title}</span>
                                                        <span
                                                            className={`text-[10px] ${active ? 'opacity-70' : 'text-mist-500'}`}
                                                        >
                                                            {sub}
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Crypto asset grid */}
                                {activeMethod === 'crypto' && (
                                    <div>
                                        <span className='label'>Choose your network</span>
                                        {assets.length === 0 ? (
                                            <p className='mt-2.5 rounded-xl border border-line bg-ink-700 px-3.5 py-3 text-xs text-mist-400'>
                                                No crypto asset is enabled right now — pick another method.
                                            </p>
                                        ) : (
                                            <div className='mt-2.5 grid grid-cols-2 gap-2'>
                                                {assets.map(a => {
                                                    const active = a.id === activeAsset;
                                                    return (
                                                        <button
                                                            key={a.id}
                                                            type='button'
                                                            onClick={() => setAsset(a.id)}
                                                            className={`relative flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all ${
                                                                active
                                                                    ? 'border-fg bg-fg text-on-fg'
                                                                    : 'border-line bg-ink-700 hover:border-line-strong'
                                                            }`}
                                                        >
                                                            <CoinIcon asset={a.id} ticker={a.ticker} size={22} />
                                                            <span className='min-w-0 flex-1'>
                                                                <span
                                                                    className={`block truncate text-xs font-bold leading-tight ${active ? '' : 'text-fg'}`}
                                                                >
                                                                    {a.ticker}
                                                                </span>
                                                                <span
                                                                    className={`block truncate font-mono text-[9px] leading-tight ${
                                                                        active ? 'opacity-70' : 'text-mist-500'
                                                                    }`}
                                                                >
                                                                    {a.network}
                                                                </span>
                                                            </span>
                                                            {active && <Check size={12} strokeWidth={3} className='shrink-0' />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Email */}
                                <label className='flex flex-col gap-1.5'>
                                    <span className='label'>Email for your receipt</span>
                                    <input
                                        type='email'
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder='you@email.com'
                                        className='field'
                                    />
                                </label>

                                {activeMethod === 'mpesa' && (
                                    <p className='rounded-xl border border-line bg-ink-700 px-3.5 py-3 text-[11px] leading-relaxed text-mist-400'>
                                        Charged in <strong className='text-mist-200'>KES</strong> at today&apos;s rate.
                                        You&apos;ll get a PIN prompt on your phone.
                                    </p>
                                )}

                                {activeMethod === 'crypto' && activeAssetMeta && (
                                    <p className='rounded-xl border border-line bg-ink-700 px-3.5 py-3 text-[11px] leading-relaxed text-mist-400'>
                                        You&apos;ll pay in{' '}
                                        <strong className='text-mist-200'>
                                            {activeAssetMeta.ticker} ({activeAssetMeta.network})
                                        </strong>
                                        . Send on that network only — funds sent on any other chain cannot be recovered.
                                    </p>
                                )}

                                {error && (
                                    <p className='flex items-start gap-1.5 text-xs text-mist-300'>
                                        <TriangleAlert size={13} className='mt-0.5 shrink-0' /> {error}
                                    </p>
                                )}

                                {/* Terms */}
                                <label className='flex items-start gap-2.5 text-xs text-mist-400'>
                                    <input
                                        type='checkbox'
                                        checked={agreed}
                                        onChange={e => setAgreed(e.target.checked)}
                                        className='mt-0.5 h-4 w-4 shrink-0 accent-white'
                                    />
                                    <span>
                                        I agree to the{' '}
                                        <button
                                            type='button'
                                            onClick={() => setShowTerms(true)}
                                            className='font-semibold text-fg underline underline-offset-2'
                                        >
                                            Terms &amp; Conditions
                                        </button>
                                        .
                                    </span>
                                </label>

                                <button
                                    type='button'
                                    onClick={() =>
                                        activeMethod === 'crypto' ? void startCrypto() : void startHosted(activeMethod)
                                    }
                                    disabled={
                                        !emailValid ||
                                        submitting ||
                                        loginids.length === 0 ||
                                        !agreed ||
                                        (activeMethod === 'crypto' && assets.length === 0)
                                    }
                                    className='btn-solid w-full py-3'
                                >
                                    {submitting ? <Loader2 size={17} className='animate-spin' /> : <Crown size={17} />}
                                    {payLabel}
                                </button>

                                <p className='flex items-center justify-center gap-1.5 text-center text-[11px] text-mist-500'>
                                    <Lock size={11} /> Unlocks the moment your payment clears.
                                </p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Terms modal */}
            {showTerms && (
                <div
                    role='dialog'
                    aria-modal='true'
                    aria-labelledby='terms-title'
                    className='fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm'
                    onClick={() => setShowTerms(false)}
                >
                    <div
                        className='w-full max-w-md rounded-2xl border border-line bg-ink-800 p-6 shadow-2xl'
                        onClick={e => e.stopPropagation()}
                    >
                        <div className='flex items-center justify-between'>
                            <h3 id='terms-title' className='flex items-center gap-2 text-base font-bold text-fg'>
                                <ShieldCheck size={17} /> Terms &amp; Conditions
                            </h3>
                            <button
                                type='button'
                                onClick={() => setShowTerms(false)}
                                aria-label='Close'
                                className='text-mist-400 transition-colors hover:text-fg'
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className='mt-4 space-y-3 text-sm leading-relaxed text-mist-400'>
                            <p>
                                {SITE.name} is an independent analytics and automation tool. It is not affiliated with,
                                or endorsed by, Deriv.
                            </p>
                            <p>
                                The subscription is prepaid for {plan.term} and is non-refundable once activated. It
                                does not auto-renew.
                            </p>
                            <p>
                                Crypto payments are final. Send the exact amount on the exact network shown — funds sent
                                on another chain cannot be recovered.
                            </p>
                            <p>
                                Trading carries risk. You alone are responsible for your trading decisions and any
                                resulting losses. No profit is guaranteed.
                            </p>
                        </div>
                        <button
                            type='button'
                            onClick={() => {
                                setAgreed(true);
                                setShowTerms(false);
                            }}
                            className='btn-solid mt-5 w-full'
                        >
                            I understand &amp; agree
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Checkout;
