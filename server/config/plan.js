// The subscription. One plan, one duration — a year of Nexus Bot Pro.
//
// `priceUSD` and `months` are admin-editable at runtime (stored in the
// `settings` collection under key 'plan'); the label lives here.

const PLAN = { label: 'Pro', priceUSD: 100, months: 12 };

/**
 * The plan with any admin override merged in. Falls back to the static default
 * if the DB is unavailable, so a database blip can never zero out a price.
 */
const getPlan = async () => {
    try {
        const Setting = require('../Models/Setting');
        const doc = await Setting.findOne({ key: 'plan' }).lean();
        const o = doc && doc.value ? doc.value : null;
        if (!o) return { ...PLAN };

        return {
            ...PLAN,
            ...(Number(o.priceUSD) > 0 ? { priceUSD: Number(o.priceUSD) } : {}),
            ...(Number(o.months) > 0 ? { months: Number(o.months) } : {}),
        };
    } catch {
        return { ...PLAN };
    }
};

/** "1 year" / "6 months" — used in receipts and on the checkout summary. */
const termLabel = months => {
    if (months % 12 === 0) {
        const years = months / 12;
        return years === 1 ? '1 year' : `${years} years`;
    }
    return months === 1 ? '1 month' : `${months} months`;
};

module.exports = { PLAN, getPlan, termLabel };
