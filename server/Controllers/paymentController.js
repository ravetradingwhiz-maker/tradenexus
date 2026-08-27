const crypto = require('crypto');
const createError = require('http-errors');
const Payment = require('../Models/Payment');
const Subscription = require('../Models/Subscription');
const { cryptoPaymentSchema, hostedPaymentSchema, proofSchema } = require('../Middlewares/validation');
const { getPlan, termLabel } = require('../config/plan');
const { getPaymentMethods } = require('../config/paymentMethods');
const {
    ASSET_DEFS,
    assetLabel,
    getAssetFlags,
    getPayableAssets,
    getWalletMap,
    routeFor,
} = require('../config/cryptoAssets');
const chainWatchers = require('../Services/chainWatchers');
const priceService = require('../Services/priceService');
const nowPayments = require('../Services/nowPaymentsService');
const paystack = require('../Services/paystackService');
const fx = require('../Services/fxService');
const { sendSubscriptionReceipt } = require('../Services/emailService');

// Currency Paystack charges cards in (must be enabled on the account). Amounts
// go to Paystack in the currency's smallest unit, so priceUSD * 100 for USD.
const PAYSTACK_CURRENCY = (process.env.PAYSTACK_CURRENCY || 'USD').toUpperCase();

// How long an order stays payable. For crypto this is also how long the quoted
// amount is honoured — the price is locked at creation and never moves.
const ORDER_TTL_MS = 60 * 60 * 1000; // 1 hour

const genOrderId = () => `TN-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`.toUpperCase();

const addMonths = (date, months) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
};

/**
 * Blocks a rail an admin has switched off. The checkout hides disabled rails,
 * but this is the actual enforcement — the UI can be bypassed.
 */
const assertMethodEnabled = async id => {
    const methods = await getPaymentMethods();
    if (!methods[id]) throw createError(403, 'That payment method is currently unavailable');
};

/**
 * Same enforcement, one level down: the individual crypto asset. Returns the
 * route and the resolved wallet, so the caller needs no second lookup.
 */
const assertAssetEnabled = async id => {
    const [flags, wallets] = await Promise.all([getAssetFlags(), getWalletMap()]);
    if (!flags[id]) throw createError(403, 'That asset is currently unavailable');
    const route = routeFor(id, wallets);
    if (!route) throw createError(503, `${assetLabel(id)} payments are not configured on this server`);
    return { route, wallet: wallets[id] };
};

/**
 * Turns the USD price into an amount of the asset, then adds a tiny unique tail
 * so an incoming transfer maps to exactly one open order.
 *
 * The tail is the whole identification mechanism on the direct route: we publish
 * one address per asset, so the amount is the only thing distinguishing two
 * buyers paying at the same time. It is scaled to the asset — a 0.001 tail is
 * noise on a USDT payment and a fortune on a BTC one.
 */
const quoteAmount = async (assetId, priceUSD) => {
    const def = ASSET_DEFS[assetId];
    const unitUsd = def.pegged ? 1 : await priceService.getUsdPrice(def.coingecko);
    const base = priceUSD / unitUsd;

    // Tail step: ~1/100000th of the order, rounded to a clean power of ten, and
    // never finer than the asset's own precision.
    const magnitude = Math.floor(Math.log10(base));
    const stepExp = Math.min(def.decimals, Math.max(2, 5 - magnitude));
    const step = Math.pow(10, -stepExp);
    const round = n => Number(n.toFixed(stepExp));

    const since = new Date(Date.now() - ORDER_TTL_MS);
    for (let i = 0; i < 60; i++) {
        const amount = round(base + crypto.randomInt(1, 500) * step);
        const clash = await Payment.exists({
            status: 'pending',
            asset: assetId,
            payAmount: amount,
            createdAt: { $gt: since },
        });
        if (!clash) return { amount, unitUsd };
    }
    // Effectively unreachable; fall back to the finest tail the asset allows.
    const fine = Number((base + crypto.randomInt(1, 999999) * Math.pow(10, -def.decimals)).toFixed(def.decimals));
    return { amount: fine, unitUsd };
};

/**
 * Activates a paid order: writes the subscription covering every loginid on the
 * account and emails the receipt. Idempotent — guarded by `payment.activated`,
 * so the webhook, the poll and an admin approval can all call it safely.
 */
const activatePayment = async payment => {
    if (payment.activated) return;

    const plan = await getPlan();
    const expiresAt = addMonths(Date.now(), plan.months);

    await Subscription.create({
        loginids: payment.loginids,
        email: payment.email,
        startedAt: new Date(),
        expiresAt,
        status: 'active',
        paymentId: payment.orderId,
    });

    payment.status = 'paid';
    payment.activated = true;
    payment.paidAt = new Date();
    await payment.save();

    try {
        await sendSubscriptionReceipt({
            ...payment.toObject(),
            expiresAt,
            planLabel: plan.label,
            term: termLabel(plan.months),
        });
    } catch (e) {
        // A failed receipt must never un-sell a subscription.
        console.error('[payment] receipt email failed:', e.message);
    }
};

/** Expires an order that has run past its TTL. Returns true if it did. */
const expireIfStale = async payment => {
    if (Date.now() - new Date(payment.createdAt).getTime() <= ORDER_TTL_MS) return false;
    payment.status = 'expired';
    await payment.save();
    return true;
};

/**
 * Direct route: look for a confirmed transfer into our own wallet matching this
 * order's exact, unique amount.
 */
const checkDirectOnchain = async payment => {
    if (payment.status !== 'pending') return;

    const def = ASSET_DEFS[payment.asset];
    if (!def) return;

    // Chains with no watcher wait for the buyer's tx hash and an admin's nod.
    if (!chainWatchers.canWatch(def)) {
        payment.needsManualCheck = true;
        await payment.save();
        await expireIfStale(payment);
        return;
    }

    if (await expireIfStale(payment)) return;

    let transfers = [];
    try {
        transfers = await chainWatchers.getIncoming({
            assetDef: def,
            address: payment.payAddress,
            sinceMs: new Date(payment.createdAt).getTime(),
        });
    } catch (e) {
        console.error(`[payment] ${def.chain} watch failed for ${payment.orderId}:`, e.message);
        return;
    }

    // Match on the exact quoted amount. A tolerance of half the last decimal
    // place absorbs float noise without letting a different order's amount in.
    const tolerance = Math.pow(10, -def.decimals) / 2;

    for (const t of transfers) {
        if (Math.abs(t.amount - payment.payAmount) > tolerance) continue;
        // Don't let one transaction settle two orders.
        if (await Payment.exists({ providerPaymentId: t.txid })) continue;

        payment.providerPaymentId = t.txid;
        await activatePayment(payment);
        return;
    }
};

/** NOWPayments route: ask the provider what happened to this payment. */
const checkNowPayments = async payment => {
    if (payment.status !== 'pending') return;
    if (!payment.providerPaymentId) {
        await expireIfStale(payment);
        return;
    }

    let data;
    try {
        data = await nowPayments.getPaymentStatus(payment.providerPaymentId);
    } catch (e) {
        console.error('[payment] NOWPayments status lookup failed:', e.message);
        return;
    }

    const state = data && data.payment_status;
    if (nowPayments.PAID_STATUSES.includes(state)) {
        await activatePayment(payment);
        return;
    }
    if (nowPayments.FAILED_STATUSES.includes(state)) {
        payment.status = state === 'expired' ? 'expired' : 'failed';
        await payment.save();
        return;
    }
    // waiting / confirming / confirmed / sending / partially_paid → still open.
    await expireIfStale(payment);
};

/**
 * Paystack route: confirm against Paystack's own record rather than trusting
 * anything the browser or the webhook payload said.
 */
const verifyPaystack = async payment => {
    if (payment.status !== 'pending') return;

    let data;
    try {
        data = await paystack.verifyTransaction(payment.orderId);
    } catch (e) {
        console.error('[payment] Paystack verify failed:', e.message);
        return;
    }

    if (data.status === 'success') {
        // Guard against a tampered client paying less than we charged.
        // `payAmount` is in the charged currency's major unit (USD for card, KES
        // for M-Pesa); Paystack reports `data.amount` in the minor unit (×100).
        const expected = Math.round(payment.payAmount * 100);
        if (typeof data.amount === 'number' && data.amount < expected) {
            console.error(`[payment] Paystack underpayment on ${payment.orderId}: ${data.amount} < ${expected}`);
            payment.status = 'failed';
            await payment.save();
            return;
        }
        payment.providerPaymentId = String(data.id || data.reference || '');
        await activatePayment(payment);
        return;
    }

    if (data.status === 'failed' || data.status === 'reversed') {
        payment.status = 'failed';
        await payment.save();
        return;
    }
    // 'abandoned' / 'ongoing' / 'pending' → leave open; the poll retries.
};

/** Routes one pending order to whichever confirmation path it belongs to. */
const refreshPending = async payment => {
    if (payment.provider === 'paystack') return verifyPaystack(payment);
    if (payment.provider === 'nowpayments') return checkNowPayments(payment);
    return checkDirectOnchain(payment);
};

/**
 * Runs a refresh but gives up waiting after `ms`. The refresh keeps running in
 * the background and can still settle the order — this only caps how long a
 * caller blocks on it.
 *
 * The checkout polls every few seconds, so an answer that is one poll stale
 * beats a request that hangs for twenty seconds behind a slow block explorer.
 */
const refreshWithDeadline = (payment, ms) =>
    new Promise(resolve => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            resolve();
        };
        const timer = setTimeout(finish, ms);
        refreshPending(payment)
            .catch(e => console.error(`[payment] refresh failed for ${payment.orderId}:`, e.message))
            .finally(() => {
                clearTimeout(timer);
                finish();
            });
    });

/** Background sweep, so orders confirm even if the payer closed the tab. */
const pollPendingOrders = async () => {
    const since = new Date(Date.now() - ORDER_TTL_MS);
    const pending = await Payment.find({ status: 'pending', createdAt: { $gt: since } }).limit(50);
    for (const p of pending) {
        try {
            await refreshPending(p);
        } catch (e) {
            console.error(`[payment] sweep failed for ${p.orderId}:`, e.message);
        }
    }
};

/** The order shape the frontend polls. */
const publicOrder = payment => ({
    orderId: payment.orderId,
    status: payment.status,
    provider: payment.provider,
    priceUSD: payment.priceUSD,
    asset: payment.asset || undefined,
    assetLabel: payment.asset ? assetLabel(payment.asset) : undefined,
    ticker: payment.asset && ASSET_DEFS[payment.asset] ? ASSET_DEFS[payment.asset].ticker : undefined,
    payCurrency: payment.payCurrency,
    payAddress: payment.payAddress,
    payAmount: payment.payAmount,
    payMemo: payment.payMemo || undefined,
    needsManualCheck: payment.needsManualCheck || undefined,
    proofTxHash: payment.proofTxHash || undefined,
    expiresAt: payment.expiresAt,
});

module.exports = {
    pollPendingOrders,

    // GET /api/payments/plan — public; the current price and duration.
    plan: async (req, res, next) => {
        try {
            const plan = await getPlan();
            res.json({ plan: { ...plan, term: termLabel(plan.months) } });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/payments/options — public; what the checkout should render.
    // Assets are pre-filtered to those with a working route, so the UI can
    // never show a tile that would fail on submit.
    options: async (req, res, next) => {
        try {
            const [methods, assets] = await Promise.all([getPaymentMethods(), getPayableAssets()]);
            res.json({ methods: { ...methods, crypto: methods.crypto && assets.length > 0 }, assets });
        } catch (error) {
            next(error);
        }
    },

    // POST /api/payments/crypto/create
    createCrypto: async (req, res, next) => {
        try {
            const { asset, email, loginids } = await cryptoPaymentSchema.validateAsync(req.body);
            await assertMethodEnabled('crypto');
            const { route, wallet } = await assertAssetEnabled(asset);

            const plan = await getPlan();
            const orderId = genOrderId();
            const expiresAt = new Date(Date.now() + ORDER_TTL_MS);
            const def = ASSET_DEFS[asset];

            // ── Direct: our own wallet, matched by a unique amount ──────────
            if (route === 'direct') {
                let quote;
                try {
                    quote = await quoteAmount(asset, plan.priceUSD);
                } catch (e) {
                    throw createError(503, `Could not price ${assetLabel(asset)} right now: ${e.message}`);
                }

                const payment = await Payment.create({
                    orderId,
                    provider: 'direct',
                    priceUSD: plan.priceUSD,
                    asset,
                    quoteUsdPrice: quote.unitUsd,
                    payCurrency: asset,
                    payAddress: wallet.address,
                    payAmount: quote.amount,
                    payMemo: wallet.memo,
                    email,
                    loginids,
                    status: 'pending',
                    // Chains we cannot watch are flagged up front, so the
                    // checkout can ask for a tx hash instead of spinning.
                    needsManualCheck: !chainWatchers.canWatch(def),
                    expiresAt,
                });

                return res.status(201).json(publicOrder(payment));
            }

            // ── NOWPayments: provider-issued address, provider-quoted amount ─
            const base = (process.env.SERVER_PUBLIC_URL || '').replace(/\/$/, '');
            let created;
            try {
                created = await nowPayments.createPayment({
                    priceUSD: plan.priceUSD,
                    payCurrency: def.nowpayments,
                    orderId,
                    description: `TradeNexus ${plan.label} — ${termLabel(plan.months)}`,
                    ipnCallbackUrl: base ? `${base}/api/payments/crypto/webhook` : undefined,
                });
            } catch (e) {
                throw createError(502, `Could not start the ${assetLabel(asset)} payment: ${e.message}`);
            }

            const payment = await Payment.create({
                orderId,
                provider: 'nowpayments',
                providerPaymentId: String(created.payment_id || ''),
                priceUSD: plan.priceUSD,
                asset,
                payCurrency: asset,
                payAddress: created.pay_address,
                payAmount: Number(created.pay_amount) || 0,
                payMemo: created.payin_extra_id ? String(created.payin_extra_id) : '',
                email,
                loginids,
                status: 'pending',
                expiresAt,
            });

            res.status(201).json(publicOrder(payment));
        } catch (error) {
            if (error.isJoi) error.status = 422;
            next(error);
        }
    },

    // POST /api/payments/card/init — start a hosted card checkout.
    createCard: async (req, res, next) => {
        try {
            const { email, loginids } = await hostedPaymentSchema.validateAsync(req.body);
            await assertMethodEnabled('card');
            if (!process.env.PAYSTACK_SECRET_KEY) throw createError(503, 'Card payments are not configured');

            const plan = await getPlan();

            const payment = await Payment.create({
                orderId: genOrderId(),
                provider: 'paystack',
                priceUSD: plan.priceUSD,
                payCurrency: PAYSTACK_CURRENCY.toLowerCase(),
                payAmount: plan.priceUSD,
                email,
                loginids,
                status: 'pending',
                expiresAt: new Date(Date.now() + ORDER_TTL_MS),
            });

            // Paystack appends ?reference=<orderId>&trxref=<orderId> to this URL.
            const base = (process.env.CHECKOUT_RETURN_URL || process.env.ALLOWED_ORIGIN_1 || '').replace(/\/$/, '');
            const callbackUrl = base ? `${base}/app/checkout` : undefined;

            let init;
            try {
                init = await paystack.initTransaction({
                    email,
                    amountSubunit: Math.round(plan.priceUSD * 100),
                    currency: PAYSTACK_CURRENCY,
                    reference: payment.orderId,
                    callbackUrl,
                    metadata: { orderId: payment.orderId, loginids },
                });
            } catch (e) {
                payment.status = 'failed';
                await payment.save();
                throw createError(502, `Could not start the card payment: ${e.message}`);
            }

            res.status(201).json({
                orderId: payment.orderId,
                authorizationUrl: init.authorization_url,
                status: payment.status,
            });
        } catch (error) {
            if (error.isJoi) error.status = 422;
            next(error);
        }
    },

    // POST /api/payments/mpesa/init — M-Pesa settles only in KES, so the USD
    // price is converted at the live rate and charged in KES.
    createMpesa: async (req, res, next) => {
        try {
            const { email, loginids } = await hostedPaymentSchema.validateAsync(req.body);
            await assertMethodEnabled('mpesa');
            if (!process.env.PAYSTACK_SECRET_KEY) throw createError(503, 'M-Pesa payments are not configured');

            const plan = await getPlan();
            const rate = await fx.getUsdToKes();
            const kesAmount = Math.round(plan.priceUSD * rate); // whole shillings

            const payment = await Payment.create({
                orderId: genOrderId(),
                provider: 'paystack',
                priceUSD: plan.priceUSD,
                payCurrency: 'kes',
                // The charged amount, in KES — what the underpayment guard checks.
                payAmount: kesAmount,
                email,
                loginids,
                status: 'pending',
                expiresAt: new Date(Date.now() + ORDER_TTL_MS),
            });

            const base = (process.env.CHECKOUT_RETURN_URL || process.env.ALLOWED_ORIGIN_1 || '').replace(/\/$/, '');
            const callbackUrl = base ? `${base}/app/checkout` : undefined;

            let init;
            try {
                init = await paystack.initTransaction({
                    email,
                    amountSubunit: kesAmount * 100, // KES minor unit
                    currency: 'KES',
                    reference: payment.orderId,
                    callbackUrl,
                    channels: ['mobile_money'],
                    metadata: { orderId: payment.orderId, loginids, method: 'mpesa', usdKesRate: rate },
                });
            } catch (e) {
                payment.status = 'failed';
                await payment.save();
                throw createError(502, `Could not start the M-Pesa payment: ${e.message}`);
            }

            res.status(201).json({
                orderId: payment.orderId,
                authorizationUrl: init.authorization_url,
                status: payment.status,
                currency: 'KES',
                amount: kesAmount,
            });
        } catch (error) {
            if (error.isJoi) error.status = 422;
            next(error);
        }
    },

    // POST /api/payments/:orderId/proof  { txHash }
    // For chains with no automatic watcher: the buyer records what they sent so
    // an admin can verify it on a block explorer and approve. Recording a hash
    // never grants access on its own.
    submitProof: async (req, res, next) => {
        try {
            const { txHash } = await proofSchema.validateAsync(req.body);
            const payment = await Payment.findOne({ orderId: req.params.orderId });
            if (!payment) throw createError.NotFound('Order not found');
            if (payment.status !== 'pending') throw createError(409, `This order is already ${payment.status}`);

            payment.proofTxHash = txHash;
            payment.proofSubmittedAt = new Date();
            payment.needsManualCheck = true;
            await payment.save();

            res.json({ ok: true, order: publicOrder(payment) });
        } catch (error) {
            if (error.isJoi) error.status = 422;
            next(error);
        }
    },

    // POST /api/payments/paystack/webhook — signature is verified over the raw
    // body captured in index.js (req.rawBody).
    paystackWebhook: async (req, res) => {
        if (!paystack.verifyWebhookSignature(req.rawBody, req.headers['x-paystack-signature'])) {
            return res.status(401).json({ received: false });
        }
        try {
            const event = req.body;
            if (event && event.event === 'charge.success') {
                const reference = event.data && event.data.reference;
                const payment = reference ? await Payment.findOne({ orderId: reference }) : null;
                // Re-verify against the API rather than trusting the payload.
                if (payment && payment.status === 'pending') await verifyPaystack(payment);
            }
        } catch (e) {
            console.error('[payment] Paystack webhook error:', e.message);
        }
        // Always 200 on a valid signature so Paystack stops retrying.
        res.json({ received: true });
    },

    // POST /api/payments/crypto/webhook — NOWPayments IPN.
    cryptoWebhook: async (req, res) => {
        if (!nowPayments.verifyIpnSignature(req.body, req.headers['x-nowpayments-sig'])) {
            return res.status(401).json({ received: false });
        }
        try {
            const orderId = req.body && req.body.order_id;
            const payment = orderId ? await Payment.findOne({ orderId }) : null;
            // Re-check with the API rather than trusting the payload's status.
            if (payment && payment.status === 'pending') await checkNowPayments(payment);
        } catch (e) {
            console.error('[payment] NOWPayments webhook error:', e.message);
        }
        res.json({ received: true });
    },

    // GET /api/payments/:orderId — the frontend polls this; it confirms with the
    // provider or the chain on the way through.
    getOrder: async (req, res, next) => {
        try {
            const payment = await Payment.findOne({ orderId: req.params.orderId });
            if (!payment) throw createError.NotFound('Order not found');
            if (payment.status === 'pending') await refreshWithDeadline(payment, 4000);
            res.json(publicOrder(payment));
        } catch (error) {
            next(error);
        }
    },

    // Reused by the admin controller so a manual approval takes exactly the same
    // activation path as an automatic confirmation.
    activatePayment,
};
