/** Client for the TradeNexus payments / subscription server (tradenexus/server). */

// Empty by default → calls are same-origin (/api/...) and the Vite dev server
// proxies them to the backend. Set API_URL only when the API is on another host.
const API_URL = (process.env.API_URL || '').replace(/\/$/, '');

/** Payment rails the checkout can start. */
export type Method = 'crypto' | 'card' | 'mpesa';

/**
 * Crypto assets the checkout offers. Ids are stable strings shared with the
 * server (`server/config/cryptoAssets.js`) — never derive them from the ticker,
 * because one ticker can exist on several chains (USDT on TRON vs Ethereum).
 */
export type CryptoAssetId =
    | 'usdt_trc20'
    | 'usdt_erc20'
    | 'btc'
    | 'eth'
    | 'sol'
    | 'ltc'
    | 'xrp'
    | 'bnb'
    | 'usdc_bep20'
    | 'trx';

export interface CryptoAsset {
    id: CryptoAssetId;
    /** Ticker shown large on the tile, e.g. "USDT". */
    ticker: string;
    /** Full asset name, e.g. "Tether". */
    name: string;
    /** Chain / standard line, e.g. "TRC-20 · TRON". */
    network: string;
}

/** The single subscription plan. */
export interface Plan {
    label: string;
    priceUSD: number;
    months: number;
    /** Pre-formatted duration, e.g. "1 year". */
    term: string;
}

export interface PaymentOrder {
    orderId: string;
    status: 'pending' | 'paid' | 'expired' | 'failed';
    provider?: 'direct' | 'nowpayments' | 'paystack';
    priceUSD: number;
    /** Asset id for crypto orders (absent for card / M-Pesa). */
    asset?: CryptoAssetId;
    /** Human label, e.g. "USDT (TRC-20 · TRON)". */
    assetLabel?: string;
    /** Ticker on its own, for the "send exactly" line. */
    ticker?: string;
    payCurrency: string;
    payAddress: string;
    payAmount: number;
    /** Some chains (XRP) also need a destination tag / memo. */
    payMemo?: string;
    /** True when this chain has no automatic watcher — we ask for a tx hash. */
    needsManualCheck?: boolean;
    proofTxHash?: string;
    /** ISO timestamp after which the quoted amount is no longer honoured. */
    expiresAt?: string;
}

export interface HostedInitResult {
    orderId: string;
    authorizationUrl: string;
    status: string;
    /** Present for M-Pesa: the KES amount actually charged. */
    currency?: string;
    amount?: number;
}

export interface SubscriptionStatus {
    active: boolean;
    expiresAt?: string;
}

/** Which rails and which individual crypto assets an admin has enabled. */
export interface CheckoutOptions {
    methods: Record<Method, boolean>;
    /** Enabled crypto assets, in display order. Empty ⇒ crypto is unavailable. */
    assets: CryptoAsset[];
}

const json = async (res: Response) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.message || `Request failed (${res.status})`);
    return data;
};

const post = (path: string, body: unknown) =>
    fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).then(json);

// ── Checkout configuration ──────────────────────────────────────────────────

export const getCheckoutOptions = (): Promise<CheckoutOptions> =>
    fetch(`${API_URL}/api/payments/options`).then(json);

/** The current price and duration (reflects admin overrides). */
export const getPlan = (): Promise<Plan> =>
    fetch(`${API_URL}/api/payments/plan`)
        .then(json)
        .then(d => d.plan);

// ── Starting a payment ──────────────────────────────────────────────────────

export interface CreateCryptoBody {
    asset: CryptoAssetId;
    email: string;
    loginids: string[];
}

/** Creates an on-chain order: returns the address + exact amount to send. */
export const createCryptoPayment = (body: CreateCryptoBody): Promise<PaymentOrder> =>
    post('/api/payments/crypto/create', body);

/** Starts a Paystack hosted card checkout; redirect to `authorizationUrl`. */
export const initCardPayment = (body: { email: string; loginids: string[] }): Promise<HostedInitResult> =>
    post('/api/payments/card/init', body);

/** Starts an M-Pesa (Paystack mobile money, KES) checkout. */
export const initMpesaPayment = (body: { email: string; loginids: string[] }): Promise<HostedInitResult> =>
    post('/api/payments/mpesa/init', body);

/**
 * Records the transaction hash for a chain we cannot watch automatically, so an
 * admin can verify it on a block explorer and release the subscription.
 */
export const submitPaymentProof = (orderId: string, txHash: string): Promise<{ order: PaymentOrder }> =>
    post(`/api/payments/${encodeURIComponent(orderId)}/proof`, { txHash });

// ── Status ──────────────────────────────────────────────────────────────────

export const getPaymentOrder = (orderId: string): Promise<PaymentOrder> =>
    fetch(`${API_URL}/api/payments/${encodeURIComponent(orderId)}`).then(json);

export const getSubscription = (loginids: string[]): Promise<SubscriptionStatus> => {
    if (!loginids.length) return Promise.resolve({ active: false });
    return fetch(`${API_URL}/api/subscription?loginids=${encodeURIComponent(loginids.join(','))}`).then(json);
};
