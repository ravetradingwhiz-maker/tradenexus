// Live USD -> KES rate for M-Pesa charges (M-Pesa settles only in KES, but our
// prices are in USD). Cached in-memory for an hour so we don't hit the FX API on
// every checkout, with graceful fallbacks so a payment never fails on FX alone.
const axios = require('axios');

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FALLBACK_RATE = Number(process.env.USD_KES_RATE) || 130;

let cache = { rate: null, ts: 0 };

/**
 * Returns the current USD->KES rate. Order of preference:
 *   1. fresh cached value (< 1h old)
 *   2. live value from open.er-api.com (no API key required)
 *   3. stale cached value (better than nothing)
 *   4. USD_KES_RATE env / hardcoded fallback
 */
const getUsdToKes = async () => {
    const now = Date.now();
    if (cache.rate && now - cache.ts < CACHE_TTL_MS) return cache.rate;

    try {
        const { data } = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 10000 });
        const rate = data && data.rates && data.rates.KES;
        if (typeof rate === 'number' && rate > 0) {
            cache = { rate, ts: now };
            return rate;
        }
        throw new Error('KES rate missing in FX response');
    } catch (e) {
        console.error('[fx] USD->KES lookup failed:', e.message);
        return cache.rate || FALLBACK_RATE;
    }
};

module.exports = { getUsdToKes };
