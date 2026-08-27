const createError = require('http-errors');
const Admin = require('../Models/Admin');
const Subscription = require('../Models/Subscription');
const Payment = require('../Models/Payment');
const Setting = require('../Models/Setting');
const { PLAN, getPlan, termLabel } = require('../config/plan');
const { METHOD_DEFS, METHOD_IDS, getPaymentMethods } = require('../config/paymentMethods');
const {
    ASSET_DEFS,
    ASSET_ORDER,
    getAssetFlags,
    getWalletMap,
    isNowPaymentsConfigured,
    routeFor,
    setWalletOverride,
    validateAddress,
    validateMemo,
} = require('../config/cryptoAssets');
const chainWatchers = require('../Services/chainWatchers');
const { activatePayment } = require('../Controllers/paymentController');

// Deriv's v4 markup-statistics endpoint must be called server-side with a
// read-scoped app token — the browser gets a 403.
const DERIV_V4_URL = 'https://api.derivws.com/applications/v1/markup-statistics';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MARKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const markupCache = new Map();

const normalizeLoginid = v => String(v || '').trim().toUpperCase();

const parseLoginidList = raw =>
    (Array.isArray(raw) ? raw : String(raw || '').split(','))
        .map(s => String(s).trim())
        .filter(Boolean);

/**
 * Payment configuration, shaped for the admin screen.
 *
 * The address IS sent back here — an admin who can set it can already see it,
 * and showing it is the only way they can check what they pasted. It never
 * leaves this admin-only endpoint.
 */
const paymentConfigPayload = async () => {
    const [methods, assets, wallets] = await Promise.all([getPaymentMethods(), getAssetFlags(), getWalletMap()]);
    return {
        methods,
        methodDefs: METHOD_DEFS,
        assets,
        // Each asset reports whether it *could* be charged, so the admin UI can
        // warn about switching on something with no wallet behind it.
        assetDefs: ASSET_ORDER.map(id => ({
            id,
            ticker: ASSET_DEFS[id].ticker,
            name: ASSET_DEFS[id].name,
            network: ASSET_DEFS[id].network,
            envKey: ASSET_DEFS[id].envKey,
            supportsMemo: Boolean(ASSET_DEFS[id].memo),
            address: wallets[id].address,
            memo: wallets[id].memo,
            // 'env' addresses are pinned by the deployment and can't be edited
            // from the browser; 'admin' ones can.
            addressSource: wallets[id].source,
            walletConfigured: Boolean(wallets[id].address),
            route: routeFor(id, wallets),
            autoConfirm: chainWatchers.canWatch(ASSET_DEFS[id]),
        })),
        nowpaymentsConfigured: isNowPaymentsConfigured(),
    };
};

module.exports = {
    // GET /api/admin/check?loginids=CR123,VRTC456  (public — the frontend calls it)
    check: async (req, res, next) => {
        try {
            const raw = req.query.loginids || req.query.loginid || '';
            const loginids = String(raw).split(',').map(normalizeLoginid).filter(Boolean);
            if (!loginids.length) return res.json({ isAdmin: false, role: null });

            const admin = await Admin.findOne({ loginid: { $in: loginids } });
            res.json({ isAdmin: !!admin, role: admin ? admin.role : null });
        } catch (error) {
            next(error);
        }
    },

    // GET /api/admin/list
    list: async (req, res, next) => {
        try {
            const admins = await Admin.find({}, 'loginid role createdAt').sort('-createdAt');
            res.json({ count: admins.length, admins });
        } catch (error) {
            next(error);
        }
    },

    // POST /api/admin  { loginid }
    add: async (req, res, next) => {
        try {
            const loginid = normalizeLoginid(req.body.loginid);
            if (!loginid) throw createError(422, 'A loginid is required');

            const existing = await Admin.findOne({ loginid });
            if (existing) return res.json({ ok: true, created: false, loginid, message: 'Already an admin' });

            await Admin.create({ loginid, role: 'admin' });
            res.status(201).json({ ok: true, created: true, loginid });
        } catch (error) {
            next(error);
        }
    },

    // DELETE /api/admin  { loginid }
    remove: async (req, res, next) => {
        try {
            const loginid = normalizeLoginid(req.body.loginid || req.query.loginid);
            if (!loginid) throw createError(422, 'A loginid is required');
            const r = await Admin.deleteOne({ loginid });
            res.json({ ok: true, removed: r.deletedCount });
        } catch (error) {
            next(error);
        }
    },

    // ── Markup (Deriv v4 REST proxy) ────────────────────────────────────────
    markup: async (req, res, next) => {
        try {
            const { date_from, date_to } = req.query;
            if (!DATE_RE.test(date_from || '') || !DATE_RE.test(date_to || '')) {
                throw createError(422, 'date_from and date_to are required (YYYY-MM-DD)');
            }

            const token = process.env.MARKUP_API_TOKEN;
            const appId = process.env.MARKUP_APP_ID;
            if (!token || !appId) {
                throw createError(503, 'MARKUP_API_TOKEN / MARKUP_APP_ID are not configured on the server');
            }

            const cacheKey = `${appId}:${date_from}:${date_to}`;
            const cached = markupCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < MARKUP_CACHE_TTL_MS) return res.json(cached.data);

            const url = `${DERIV_V4_URL}?date_from=${encodeURIComponent(date_from)}&date_to=${encodeURIComponent(date_to)}`;
            const r = await fetch(url, {
                headers: { Authorization: `Bearer ${token}`, 'Deriv-App-ID': String(appId) },
            });
            const json = await r.json().catch(() => null);
            if (!r.ok || !json) return res.status(r.status || 502).json(json || { message: 'Deriv markup error' });

            // Deriv returns every app on the token; keep only ours.
            const breakdown = Array.isArray(json.data && json.data.breakdown) ? json.data.breakdown : [];
            const row = breakdown.find(x => String(x.app_id) === String(appId));
            const payload = {
                markup: (row && row.app_markup_usd) || 0,
                volume: (row && row.volume_usd) || 0,
                payout: (row && row.payout_usd) || 0,
                contracts: (row && row.contract_count) || 0,
                clients: (row && row.client_count) || 0,
                app_id: String(appId),
            };

            markupCache.set(cacheKey, { timestamp: Date.now(), data: payload });
            res.json(payload);
        } catch (error) {
            next(error);
        }
    },

    // ── Subscriptions ───────────────────────────────────────────────────────
    listSubscriptions: async (req, res, next) => {
        try {
            const filter = {};
            const status = String(req.query.status || '').trim();
            if (status === 'active' || status === 'expired') filter.status = status;

            const q = String(req.query.q || '').trim();
            if (q) filter.$or = [{ loginids: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }];

            const subs = await Subscription.find(filter).sort('-createdAt').limit(1000).lean();
            res.json({ count: subs.length, subscriptions: subs });
        } catch (error) {
            next(error);
        }
    },

    // POST /api/admin/subscriptions  { loginids, months?, email? }
    createSubscription: async (req, res, next) => {
        try {
            const loginids = parseLoginidList(req.body.loginids ?? req.body.loginid);
            if (!loginids.length) throw createError(422, 'At least one loginid is required');

            const plan = await getPlan();
            const months = Number(req.body.months) > 0 ? Number(req.body.months) : plan.months;
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + months);

            const sub = await Subscription.create({
                loginids,
                email: String(req.body.email || ''),
                startedAt: new Date(),
                expiresAt,
                status: 'active',
                paymentId: 'admin-grant',
            });
            res.status(201).json({ ok: true, subscription: sub });
        } catch (error) {
            next(error);
        }
    },

    // PATCH /api/admin/subscriptions/:id  { status?, expiresAt?, loginids? }
    updateSubscription: async (req, res, next) => {
        try {
            const patch = {};

            if (req.body.loginids != null) {
                const loginids = parseLoginidList(req.body.loginids);
                if (!loginids.length) throw createError(422, 'loginids cannot be empty');
                patch.loginids = loginids;
            }
            if (req.body.status) {
                if (!['active', 'expired'].includes(req.body.status)) throw createError(422, 'Invalid status');
                patch.status = req.body.status;
            }
            if (req.body.expiresAt) {
                const d = new Date(req.body.expiresAt);
                if (Number.isNaN(d.getTime())) throw createError(422, 'Invalid expiresAt');
                patch.expiresAt = d;
            }

            const sub = await Subscription.findByIdAndUpdate(req.params.id, patch, { new: true });
            if (!sub) throw createError(404, 'Subscription not found');
            res.json({ ok: true, subscription: sub });
        } catch (error) {
            next(error);
        }
    },

    // DELETE /api/admin/subscriptions/:id
    deleteSubscription: async (req, res, next) => {
        try {
            const r = await Subscription.deleteOne({ _id: req.params.id });
            res.json({ ok: true, removed: r.deletedCount });
        } catch (error) {
            next(error);
        }
    },

    // ── Payments ────────────────────────────────────────────────────────────
    listPayments: async (req, res, next) => {
        try {
            const filter = {};
            const status = String(req.query.status || '').trim();
            if (['pending', 'paid', 'expired', 'failed'].includes(status)) filter.status = status;
            // Anything a buyer has claimed to have paid but nobody has checked.
            if (String(req.query.awaiting || '') === '1') {
                filter.status = 'pending';
                filter.proofTxHash = { $ne: '' };
            }

            const q = String(req.query.q || '').trim();
            if (q) filter.$or = [{ orderId: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }];

            const payments = await Payment.find(filter).sort('-createdAt').limit(1000).lean();
            res.json({ count: payments.length, payments });
        } catch (error) {
            next(error);
        }
    },

    // POST /api/admin/payments/:orderId/approve
    // Manual settlement for chains with no automatic watcher: an admin checks
    // the transaction on a block explorer, then releases the subscription. This
    // takes exactly the same activation path as an automatic confirmation.
    approvePayment: async (req, res, next) => {
        try {
            const payment = await Payment.findOne({ orderId: req.params.orderId });
            if (!payment) throw createError.NotFound('Order not found');
            if (payment.activated) return res.json({ ok: true, alreadyPaid: true });
            if (payment.status === 'failed') throw createError(409, 'This order failed and cannot be approved');

            const by = normalizeLoginid(req.body && req.body.by);
            if (req.body && req.body.txHash) payment.providerPaymentId = String(req.body.txHash).trim();
            else if (payment.proofTxHash) payment.providerPaymentId = payment.proofTxHash;
            payment.approvedBy = by || 'admin';
            await payment.save();

            await activatePayment(payment);
            res.json({ ok: true, order: { orderId: payment.orderId, status: payment.status } });
        } catch (error) {
            next(error);
        }
    },

    // POST /api/admin/payments/:orderId/reject
    rejectPayment: async (req, res, next) => {
        try {
            const payment = await Payment.findOne({ orderId: req.params.orderId });
            if (!payment) throw createError.NotFound('Order not found');
            if (payment.activated) throw createError(409, 'This order is already paid');

            payment.status = 'failed';
            await payment.save();
            res.json({ ok: true });
        } catch (error) {
            next(error);
        }
    },

    // ── Receiving wallets ───────────────────────────────────────────────────
    // PUT /api/admin/wallets  { assetId, address, memo? }
    // An empty address clears the override and falls back to .env (or hides the
    // coin, if .env has nothing either).
    setWallet: async (req, res, next) => {
        try {
            const assetId = String((req.body && req.body.assetId) || '').trim();
            if (!ASSET_DEFS[assetId]) throw createError(422, 'Unknown asset');

            const address = String((req.body && req.body.address) || '').trim();
            const memo = String((req.body && req.body.memo) || '').trim();

            // An env-pinned address is deliberately not editable from here —
            // silently accepting a change that has no effect would be worse
            // than refusing it.
            const wallets = await getWalletMap();
            if (wallets[assetId].source === 'env') {
                throw createError(
                    409,
                    `${ASSET_DEFS[assetId].envKey} is set in the server environment and takes priority. Clear it there to manage this address here.`
                );
            }

            if (address) {
                const check = validateAddress(assetId, address);
                if (!check.ok) throw createError(422, check.message);
                const memoCheck = validateMemo(memo);
                if (!memoCheck.ok) throw createError(422, memoCheck.message);
            }

            await setWalletOverride(assetId, { address, memo });
            res.json(await paymentConfigPayload());
        } catch (error) {
            next(error);
        }
    },

    // ── Plan (price + duration) ─────────────────────────────────────────────
    getPlanConfig: async (req, res, next) => {
        try {
            const plan = await getPlan();
            res.json({ plan: { ...plan, term: termLabel(plan.months) }, defaults: PLAN });
        } catch (error) {
            next(error);
        }
    },

    // PUT /api/admin/plan  { priceUSD, months }
    setPlanConfig: async (req, res, next) => {
        try {
            const body = req.body || {};
            const value = {};
            if (Number(body.priceUSD) > 0) value.priceUSD = Number(body.priceUSD);
            if (Number(body.months) > 0) value.months = Math.round(Number(body.months));

            await Setting.updateOne({ key: 'plan' }, { $set: { value } }, { upsert: true });
            const plan = await getPlan();
            res.json({ ok: true, plan: { ...plan, term: termLabel(plan.months) }, defaults: PLAN });
        } catch (error) {
            next(error);
        }
    },

    // ── Payment configuration (rails + individual crypto assets) ────────────
    getPaymentConfig: async (req, res, next) => {
        try {
            res.json(await paymentConfigPayload());
        } catch (error) {
            next(error);
        }
    },

    // PUT /api/admin/payment-config  { methods?: {...}, assets?: {...} }
    setPaymentConfig: async (req, res, next) => {
        try {
            const body = req.body || {};

            if (body.methods) {
                const value = {};
                for (const key of METHOD_IDS) {
                    if (typeof body.methods[key] === 'boolean') value[key] = body.methods[key];
                }
                // Refuse to switch every rail off — that leaves a dead checkout.
                if (Object.keys(value).length && !Object.values(value).some(Boolean)) {
                    throw createError(422, 'At least one payment method must stay enabled');
                }
                await Setting.updateOne({ key: 'payment_methods' }, { $set: { value } }, { upsert: true });
            }

            if (body.assets) {
                const value = {};
                for (const id of ASSET_ORDER) {
                    if (typeof body.assets[id] === 'boolean') value[id] = body.assets[id];
                }
                await Setting.updateOne({ key: 'crypto_assets' }, { $set: { value } }, { upsert: true });
            }

            res.json(await paymentConfigPayload());
        } catch (error) {
            next(error);
        }
    },
};
