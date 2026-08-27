// The crypto assets the checkout can offer.
//
// Every asset is paid straight into YOUR OWN wallet. An address can come from
// either of two places, in this order:
//
//   1. server/.env  — e.g. WALLET_BTC. Wins if set, so a deployment can pin an
//      address that nobody can change from the browser.
//   2. the database — set by an admin from Admin -> Payment methods. Used
//      whenever the env variable is empty.
//
// Ids are stable strings shared with the frontend — never derive them from the
// ticker, because one ticker exists on several chains (USDT on TRON vs
// Ethereum) and paying on the wrong one loses the funds.
//
// Per asset:
//   envKey     the .env variable holding your receiving address
//   chain      which watcher confirms it (see Services/chainWatchers.js)
//   kind       'native' (the chain's own coin) or 'token' (a contract)
//   contract   token contract address, for kind 'token'
//   decimals   token decimals, for kind 'token'
//   pegged     true for USD stablecoins — 1 unit is 1 USD, so no price feed
//              sits between the quote and the payment
//   coingecko  price id, for everything not pegged
//   memo       true when the chain identifies deposits by a tag/memo (XRP)

const ASSET_DEFS = {
    usdt_trc20: {
        ticker: 'USDT',
        name: 'Tether',
        network: 'TRC-20 · TRON',
        envKey: 'WALLET_USDT_TRC20',
        chain: 'tron',
        kind: 'token',
        contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        decimals: 6,
        pegged: true,
        nowpayments: 'usdttrc20',
    },
    usdt_erc20: {
        ticker: 'USDT',
        name: 'Tether',
        network: 'ERC-20 · Ethereum',
        envKey: 'WALLET_USDT_ERC20',
        chain: 'ethereum',
        kind: 'token',
        contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
        pegged: true,
        nowpayments: 'usdterc20',
    },
    btc: {
        ticker: 'BTC',
        name: 'Bitcoin',
        network: 'Bitcoin',
        envKey: 'WALLET_BTC',
        chain: 'bitcoin',
        kind: 'native',
        decimals: 8,
        coingecko: 'bitcoin',
        nowpayments: 'btc',
    },
    eth: {
        ticker: 'ETH',
        name: 'Ethereum',
        network: 'ERC-20 · Ethereum',
        envKey: 'WALLET_ETH',
        chain: 'ethereum',
        kind: 'native',
        decimals: 18,
        coingecko: 'ethereum',
        nowpayments: 'eth',
    },
    sol: {
        ticker: 'SOL',
        name: 'Solana',
        network: 'Solana',
        envKey: 'WALLET_SOL',
        chain: 'solana',
        kind: 'native',
        decimals: 9,
        coingecko: 'solana',
        nowpayments: 'sol',
    },
    ltc: {
        ticker: 'LTC',
        name: 'Litecoin',
        network: 'Litecoin',
        envKey: 'WALLET_LTC',
        chain: 'litecoin',
        kind: 'native',
        decimals: 8,
        coingecko: 'litecoin',
        nowpayments: 'ltc',
    },
    xrp: {
        ticker: 'XRP',
        name: 'Ripple',
        network: 'XRP Ledger',
        envKey: 'WALLET_XRP',
        chain: 'xrp',
        kind: 'native',
        decimals: 6,
        coingecko: 'ripple',
        // XRP deposits into an exchange or shared wallet are identified by a
        // destination tag; set WALLET_XRP_TAG if yours needs one.
        memo: true,
        memoEnvKey: 'WALLET_XRP_TAG',
        nowpayments: 'xrp',
    },
    bnb: {
        ticker: 'BNB',
        name: 'BNB',
        network: 'BEP-20 · BSC',
        envKey: 'WALLET_BNB',
        chain: 'bsc',
        kind: 'native',
        decimals: 18,
        coingecko: 'binancecoin',
        nowpayments: 'bnbbsc',
    },
    usdc_bep20: {
        ticker: 'USDC',
        name: 'USD Coin',
        network: 'BEP-20 · BSC',
        envKey: 'WALLET_USDC_BEP20',
        chain: 'bsc',
        kind: 'token',
        contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        decimals: 18,
        pegged: true,
        nowpayments: 'usdcbsc',
    },
    trx: {
        ticker: 'TRX',
        name: 'Tron',
        network: 'TRON',
        envKey: 'WALLET_TRX',
        chain: 'tron',
        kind: 'native',
        decimals: 6,
        coingecko: 'tron',
        nowpayments: 'trx',
    },
};

/** Display order at checkout — stablecoins first, then the majors. */
const ASSET_ORDER = ['usdt_trc20', 'usdt_erc20', 'btc', 'eth', 'sol', 'ltc', 'xrp', 'bnb', 'usdc_bep20', 'trx'];

/** All assets are on by default; admins narrow the list down. */
const ASSET_DEFAULTS = ASSET_ORDER.reduce((acc, id) => {
    acc[id] = true;
    return acc;
}, {});

const SETTING_KEY = 'crypto_wallets';

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------
//
// A mistyped address is money gone, with no way to claw it back. These are
// shape checks, not proof of ownership — they catch the realistic mistakes
// (pasting an ETH address into the TRON slot, a truncated copy) rather than
// pretending to verify the key behind it.

const ADDRESS_RULES = {
    tron: { re: /^T[1-9A-HJ-NP-Za-km-z]{33}$/, hint: 'a TRON address starts with T and is 34 characters' },
    ethereum: { re: /^0x[0-9a-fA-F]{40}$/, hint: 'an Ethereum address starts with 0x and is 42 characters' },
    bsc: { re: /^0x[0-9a-fA-F]{40}$/, hint: 'a BNB Smart Chain address starts with 0x and is 42 characters' },
    bitcoin: {
        re: /^(bc1[02-9ac-hj-np-z]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
        hint: 'a Bitcoin address starts with bc1, 1 or 3',
    },
    litecoin: {
        re: /^(ltc1[02-9ac-hj-np-z]{11,71}|[LM3][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
        hint: 'a Litecoin address starts with ltc1, L or M',
    },
    solana: { re: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, hint: 'a Solana address is 32-44 base58 characters' },
    xrp: { re: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, hint: 'an XRP address starts with r' },
};

/**
 * Validates an address against its chain.
 * Returns { ok: true } or { ok: false, message } — never throws, so callers can
 * surface the reason straight to the admin who typed it.
 */
const validateAddress = (assetId, address) => {
    const def = ASSET_DEFS[assetId];
    if (!def) return { ok: false, message: 'Unknown asset' };

    const value = String(address || '').trim();
    if (!value) return { ok: false, message: 'Address is required' };

    const rule = ADDRESS_RULES[def.chain];
    if (!rule) return { ok: true };
    if (!rule.re.test(value)) {
        return { ok: false, message: `That does not look like a ${def.network} address — ${rule.hint}.` };
    }
    return { ok: true };
};

/** XRP destination tags are numeric and fit in 32 bits. */
const validateMemo = memo => {
    const value = String(memo == null ? '' : memo).trim();
    if (!value) return { ok: true }; // optional
    if (!/^\d{1,10}$/.test(value) || Number(value) > 4294967295) {
        return { ok: false, message: 'A destination tag must be a whole number below 4294967296.' };
    }
    return { ok: true };
};

// ---------------------------------------------------------------------------
// Where an address comes from
// ---------------------------------------------------------------------------

// Addresses are read on every checkout, so the DB lookup is cached briefly.
// Writes clear it immediately, so an admin never has to wait to see their change.
const CACHE_TTL_MS = 30 * 1000;
let cache = { value: null, ts: 0 };

const clearWalletCache = () => {
    cache = { value: null, ts: 0 };
};

/** Admin-entered addresses: { [assetId]: { address, memo } }. */
const loadWalletOverrides = async () => {
    if (cache.value && Date.now() - cache.ts < CACHE_TTL_MS) return cache.value;
    try {
        const Setting = require('../Models/Setting');
        const doc = await Setting.findOne({ key: SETTING_KEY }).lean();
        const value = (doc && doc.value) || {};
        cache = { value, ts: Date.now() };
        return value;
    } catch {
        // A DB blip must not wipe out addresses that .env already provides.
        return cache.value || {};
    }
};

const envAddress = id => {
    const def = ASSET_DEFS[id];
    return def ? String(process.env[def.envKey] || '').trim() : '';
};

const envMemo = id => {
    const def = ASSET_DEFS[id];
    if (!def || !def.memoEnvKey) return '';
    return String(process.env[def.memoEnvKey] || '').trim();
};

/**
 * The resolved wallet for every asset, as
 *   { [assetId]: { address, memo, source: 'env' | 'admin' | null } }
 *
 * Resolved once per request and passed around, so a single checkout never
 * makes ten separate database round-trips.
 */
const getWalletMap = async () => {
    const overrides = await loadWalletOverrides();
    const map = {};

    for (const id of ASSET_ORDER) {
        const fromEnv = envAddress(id);
        const saved = overrides[id] || {};
        const address = fromEnv || String(saved.address || '').trim();
        const memo = envMemo(id) || String(saved.memo || '').trim();

        map[id] = {
            address,
            memo,
            source: address ? (fromEnv ? 'env' : 'admin') : null,
        };
    }
    return map;
};

/** Saves (or clears) an admin-entered address. Returns the fresh wallet map. */
const setWalletOverride = async (assetId, { address, memo }) => {
    const Setting = require('../Models/Setting');
    const overrides = { ...(await loadWalletOverrides()) };

    const value = String(address || '').trim();
    if (value) overrides[assetId] = { address: value, memo: String(memo || '').trim() };
    else delete overrides[assetId];

    await Setting.updateOne({ key: SETTING_KEY }, { $set: { value: overrides } }, { upsert: true });
    clearWalletCache();
    return getWalletMap();
};

const isNowPaymentsConfigured = () => Boolean(process.env.NOWPAYMENTS_API_KEY);

/**
 * How an asset would be charged, given a resolved wallet map:
 *
 *   'direct'      — straight into your own wallet (preferred: no provider fee,
 *                   no middleman holding the funds)
 *   'nowpayments' — a provider-issued address, only when you have no wallet set
 *                   for that asset but NOWPayments credentials are present
 *   null          — no route; the asset is hidden from the checkout
 */
const routeFor = (id, wallets) => {
    if (wallets && wallets[id] && wallets[id].address) return 'direct';
    if (ASSET_DEFS[id] && ASSET_DEFS[id].nowpayments && isNowPaymentsConfigured()) return 'nowpayments';
    return null;
};

/** "USDT (TRC-20 · TRON)" — the label shown on the pending-payment screen. */
const assetLabel = id => {
    const def = ASSET_DEFS[id];
    return def ? `${def.ticker} (${def.network})` : id;
};

/**
 * Admin-enabled flags merged over the defaults. Falls back to the defaults if
 * the DB is unavailable, so a database blip never empties the checkout.
 */
const getAssetFlags = async () => {
    try {
        const Setting = require('../Models/Setting');
        const doc = await Setting.findOne({ key: 'crypto_assets' }).lean();
        const override = doc && doc.value ? doc.value : null;
        if (!override) return { ...ASSET_DEFAULTS };

        const merged = {};
        for (const id of ASSET_ORDER) {
            merged[id] = typeof override[id] === 'boolean' ? override[id] : ASSET_DEFAULTS[id];
        }
        return merged;
    } catch {
        return { ...ASSET_DEFAULTS };
    }
};

/**
 * Assets the checkout should actually show: enabled by an admin AND backed by a
 * route. Filtering here (rather than in the UI) means the checkout can never
 * present a tile that would fail on submit.
 */
const getPayableAssets = async () => {
    const [flags, wallets] = await Promise.all([getAssetFlags(), getWalletMap()]);
    return ASSET_ORDER.filter(id => flags[id] && routeFor(id, wallets)).map(id => ({
        id,
        ticker: ASSET_DEFS[id].ticker,
        name: ASSET_DEFS[id].name,
        network: ASSET_DEFS[id].network,
    }));
};

module.exports = {
    ASSET_DEFS,
    ASSET_ORDER,
    ASSET_DEFAULTS,
    assetLabel,
    routeFor,
    getWalletMap,
    setWalletOverride,
    clearWalletCache,
    validateAddress,
    validateMemo,
    isNowPaymentsConfigured,
    getAssetFlags,
    getPayableAssets,
};
