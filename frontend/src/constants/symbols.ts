import type { ActiveSymbol } from '@/services/trade-api';

/**
 * Built-in fallback symbol catalog. Shown immediately and if the live
 * `active_symbols` request returns nothing, so the markets list is never empty.
 * Live `active_symbols` (with exchange_is_open etc.) replaces this when available.
 */
const mk = (
    symbol: string,
    display_name: string,
    market: string,
    market_display_name: string,
    submarket_display_name: string,
    pip = 0.01
): ActiveSymbol => ({
    symbol,
    display_name,
    market,
    market_display_name,
    submarket: submarket_display_name.toLowerCase().replace(/[^a-z]/g, '_'),
    submarket_display_name,
    exchange_is_open: 1,
    pip,
});

const DERIVED = 'synthetic_index';
const CI = 'Continuous Indices';

export const FALLBACK_SYMBOLS: ActiveSymbol[] = [
    // Volatility (1s)
    mk('1HZ10V', 'Volatility 10 (1s) Index', DERIVED, 'Derived', CI),
    mk('1HZ25V', 'Volatility 25 (1s) Index', DERIVED, 'Derived', CI),
    mk('1HZ50V', 'Volatility 50 (1s) Index', DERIVED, 'Derived', CI),
    mk('1HZ75V', 'Volatility 75 (1s) Index', DERIVED, 'Derived', CI),
    mk('1HZ100V', 'Volatility 100 (1s) Index', DERIVED, 'Derived', CI),
    // Volatility
    mk('R_10', 'Volatility 10 Index', DERIVED, 'Derived', CI),
    mk('R_25', 'Volatility 25 Index', DERIVED, 'Derived', CI),
    mk('R_50', 'Volatility 50 Index', DERIVED, 'Derived', CI),
    mk('R_75', 'Volatility 75 Index', DERIVED, 'Derived', CI),
    mk('R_100', 'Volatility 100 Index', DERIVED, 'Derived', CI),
    // Crash / Boom
    mk('BOOM300N', 'Boom 300 Index', DERIVED, 'Derived', 'Crash/Boom'),
    mk('BOOM500', 'Boom 500 Index', DERIVED, 'Derived', 'Crash/Boom'),
    mk('BOOM1000', 'Boom 1000 Index', DERIVED, 'Derived', 'Crash/Boom'),
    mk('CRASH300N', 'Crash 300 Index', DERIVED, 'Derived', 'Crash/Boom'),
    mk('CRASH500', 'Crash 500 Index', DERIVED, 'Derived', 'Crash/Boom'),
    mk('CRASH1000', 'Crash 1000 Index', DERIVED, 'Derived', 'Crash/Boom'),
    // Jump
    mk('JD10', 'Jump 10 Index', DERIVED, 'Derived', 'Jump Indices'),
    mk('JD25', 'Jump 25 Index', DERIVED, 'Derived', 'Jump Indices'),
    mk('JD50', 'Jump 50 Index', DERIVED, 'Derived', 'Jump Indices'),
    mk('JD75', 'Jump 75 Index', DERIVED, 'Derived', 'Jump Indices'),
    mk('JD100', 'Jump 100 Index', DERIVED, 'Derived', 'Jump Indices'),
    // Step
    mk('STPRNG', 'Step Index', DERIVED, 'Derived', 'Step Indices'),
    // Forex
    mk('frxEURUSD', 'EUR/USD', 'forex', 'Forex', 'Major Pairs', 0.00001),
    mk('frxGBPUSD', 'GBP/USD', 'forex', 'Forex', 'Major Pairs', 0.00001),
    mk('frxUSDJPY', 'USD/JPY', 'forex', 'Forex', 'Major Pairs', 0.001),
    mk('frxAUDUSD', 'AUD/USD', 'forex', 'Forex', 'Major Pairs', 0.00001),
    // Commodities
    mk('frxXAUUSD', 'Gold/USD', 'commodities', 'Commodities', 'Metals', 0.01),
    mk('frxXAGUSD', 'Silver/USD', 'commodities', 'Commodities', 'Metals', 0.0001),
    // Crypto
    mk('cryBTCUSD', 'BTC/USD', 'cryptocurrency', 'Cryptocurrencies', 'Crypto', 0.01),
    mk('cryETHUSD', 'ETH/USD', 'cryptocurrency', 'Cryptocurrencies', 'Crypto', 0.01),
];
