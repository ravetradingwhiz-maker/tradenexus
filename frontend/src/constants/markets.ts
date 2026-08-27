/**
 * Markets the bots can trade. Volatility indices only: they run 24/7, quote at
 * a fixed tick rate, and expose the last-digit behaviour every digit strategy
 * depends on. The "(1s)" variants tick once a second — faster signal turnover.
 */
export interface BotMarket {
    symbol: string;
    name: string;
    /** Short label for compact selectors. */
    short: string;
    /** Nominal seconds between ticks — 1 for the (1s) family, 2 otherwise. */
    tickSeconds: number;
}

export const BOT_MARKETS: BotMarket[] = [
    { symbol: '1HZ10V', name: 'Volatility 10 (1s)', short: 'V10 (1s)', tickSeconds: 1 },
    { symbol: '1HZ25V', name: 'Volatility 25 (1s)', short: 'V25 (1s)', tickSeconds: 1 },
    { symbol: '1HZ50V', name: 'Volatility 50 (1s)', short: 'V50 (1s)', tickSeconds: 1 },
    { symbol: '1HZ75V', name: 'Volatility 75 (1s)', short: 'V75 (1s)', tickSeconds: 1 },
    { symbol: '1HZ100V', name: 'Volatility 100 (1s)', short: 'V100 (1s)', tickSeconds: 1 },
    { symbol: 'R_10', name: 'Volatility 10 Index', short: 'V10', tickSeconds: 2 },
    { symbol: 'R_25', name: 'Volatility 25 Index', short: 'V25', tickSeconds: 2 },
    { symbol: 'R_50', name: 'Volatility 50 Index', short: 'V50', tickSeconds: 2 },
    { symbol: 'R_75', name: 'Volatility 75 Index', short: 'V75', tickSeconds: 2 },
    { symbol: 'R_100', name: 'Volatility 100 Index', short: 'V100', tickSeconds: 2 },
];

export const DEFAULT_MARKET = '1HZ100V';

export const marketName = (symbol: string): string =>
    BOT_MARKETS.find(m => m.symbol === symbol)?.name ?? symbol;
