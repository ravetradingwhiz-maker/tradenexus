// Which checkout rails are offered. Labels are fixed in code; the enabled flags
// are admin-editable at runtime (stored in the `settings` collection under key
// 'payment_methods'), mirroring config/plan.js.

const METHOD_DEFS = {
    crypto: { label: 'Crypto', desc: 'USDT, BTC, ETH, SOL, LTC, XRP, BNB and USDC' },
    card: { label: 'Card', desc: 'Credit / debit card via Paystack' },
    mpesa: { label: 'M-Pesa', desc: 'Safaricom mobile money via Paystack (KES)' },
};

const METHOD_IDS = Object.keys(METHOD_DEFS);
const DEFAULTS = { crypto: true, card: true, mpesa: true };

/**
 * Returns { crypto, card, mpesa } with admin overrides merged over the
 * defaults. Falls back to the defaults if the DB is unavailable.
 */
const getPaymentMethods = async () => {
    try {
        const Setting = require('../Models/Setting');
        const doc = await Setting.findOne({ key: 'payment_methods' }).lean();
        const override = doc && doc.value ? doc.value : null;
        if (!override) return { ...DEFAULTS };

        const merged = {};
        for (const key of METHOD_IDS) {
            merged[key] = typeof override[key] === 'boolean' ? override[key] : DEFAULTS[key];
        }
        // Never leave the checkout with nothing to pay by.
        if (!Object.values(merged).some(Boolean)) return { ...DEFAULTS };
        return merged;
    } catch {
        return { ...DEFAULTS };
    }
};

module.exports = { METHOD_DEFS, METHOD_IDS, DEFAULTS, getPaymentMethods };
