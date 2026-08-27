// Live USD prices for the volatile coins, so a $100 order can be quoted as an
// exact amount of BTC/ETH/SOL/LTC/XRP/BNB.
//
// The quote is taken ONCE, when the order is created, and stored on the order.
// It is never recomputed while the order is open: the buyer must send the exact
// amount they were shown, and re-pricing mid-flight would move that target
// under them. The order's 1-hour TTL is the window the quote is honoured for.
//
// USD-pegged assets never come through here — 1 USDT is 1 USD by definition.
const axios = require('axios');

const COINGECKO = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

const cache = new Map(); // coingeckoId -> { usd, ts }

/**
 * USD price for one CoinGecko id. Cached briefly so a burst of checkouts does
 * not hammer the (keyless, rate-limited) public endpoint.
 *
 * Throws rather than guessing: quoting a payment off a stale or invented price
 * either short-changes you or overcharges the buyer.
 */
const getUsdPrice = async coingeckoId => {
    const hit = cache.get(coingeckoId);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.usd;

    const { data } = await axios.get(COINGECKO, {
        params: { ids: coingeckoId, vs_currencies: 'usd' },
        timeout: 15000,
        headers: process.env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY } : {},
    });

    const usd = data && data[coingeckoId] && Number(data[coingeckoId].usd);
    if (!usd || !Number.isFinite(usd) || usd <= 0) {
        throw new Error(`No USD price returned for ${coingeckoId}`);
    }

    cache.set(coingeckoId, { usd, ts: Date.now() });
    return usd;
};

module.exports = { getUsdPrice };
