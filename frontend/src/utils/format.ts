/** Small display helpers shared across the dashboard. */

/** Money with a forced sign, e.g. "+12.40" / "-3.00". */
export const signed = (n: number, dp = 2): string => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(dp)}`;

export const money = (n: number, currency: string, dp = 2): string => `${n.toFixed(dp)} ${currency}`;

export const pct = (n: number, dp = 0): string => `${n.toFixed(dp)}%`;

/** Win rate over completed rounds; 0 when nothing has settled yet. */
export const winRate = (wins: number, trades: number): number => (trades ? (wins / trades) * 100 : 0);

export const shortDate = (value: string | number | Date): string =>
    new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export const shortTime = (unixSeconds: number): string =>
    new Date(unixSeconds * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
