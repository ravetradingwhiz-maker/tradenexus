/** Admin role check + management against the TradeNexus payments server. */

import type { CryptoAssetId, Method, Plan } from '@/services/payments-api';

// Empty by default → same-origin (/api/...), proxied to the backend by Vite.
const API_URL = (process.env.API_URL || '').replace(/\/$/, '');

const json = async (res: Response) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.message || `Request failed (${res.status})`);
    return data;
};

// ── Role check ───────────────────────────────────────────────────────────────

export interface AdminCheck {
    isAdmin: boolean;
    role: string | null;
}

/** Returns admin if ANY of the supplied loginids is allow-listed. */
export const checkAdmin = (loginids: string[]): Promise<AdminCheck> => {
    const list = loginids.filter(Boolean).join(',');
    if (!list) return Promise.resolve({ isAdmin: false, role: null });
    return fetch(`${API_URL}/api/admin/check?loginids=${encodeURIComponent(list)}`)
        .then(r => r.json())
        .catch(() => ({ isAdmin: false, role: null }));
};

// ── Subscriptions ────────────────────────────────────────────────────────────

export interface AdminSubscription {
    _id: string;
    loginids: string[];
    email?: string;
    startedAt: string;
    expiresAt: string;
    status: 'active' | 'expired';
    paymentId?: string;
    createdAt?: string;
}

export const listSubscriptions = (params: { q?: string; status?: string } = {}): Promise<AdminSubscription[]> => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.status) qs.set('status', params.status);
    return fetch(`${API_URL}/api/admin/subscriptions?${qs.toString()}`)
        .then(json)
        .then(d => d.subscriptions ?? []);
};

export const createSubscription = (body: {
    loginids: string[];
    months?: number;
    email?: string;
}): Promise<AdminSubscription> =>
    fetch(`${API_URL}/api/admin/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
        .then(json)
        .then(d => d.subscription);

export const updateSubscription = (
    id: string,
    patch: { status?: 'active' | 'expired'; expiresAt?: string; loginids?: string[] }
): Promise<AdminSubscription> =>
    fetch(`${API_URL}/api/admin/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    })
        .then(json)
        .then(d => d.subscription);

export const deleteSubscription = (id: string): Promise<void> =>
    fetch(`${API_URL}/api/admin/subscriptions/${id}`, { method: 'DELETE' })
        .then(json)
        .then(() => undefined);

// ── Payments ─────────────────────────────────────────────────────────────────

export interface AdminPayment {
    _id: string;
    orderId: string;
    provider: string;
    priceUSD: number;
    asset?: CryptoAssetId;
    payCurrency: string;
    payAmount: number;
    payAddress?: string;
    email: string;
    loginids: string[];
    status: 'pending' | 'paid' | 'expired' | 'failed';
    /** True when this chain has no automatic watcher. */
    needsManualCheck?: boolean;
    /** Transaction hash the buyer submitted, awaiting your check. */
    proofTxHash?: string;
    proofSubmittedAt?: string;
    approvedBy?: string;
    paidAt?: string | null;
    createdAt?: string;
}

export const listPayments = (
    params: { q?: string; status?: string; awaiting?: boolean } = {}
): Promise<AdminPayment[]> => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.status) qs.set('status', params.status);
    if (params.awaiting) qs.set('awaiting', '1');
    return fetch(`${API_URL}/api/admin/payments?${qs.toString()}`)
        .then(json)
        .then(d => d.payments ?? []);
};

/** Releases a subscription for a payment you have verified on a block explorer. */
export const approvePayment = (orderId: string, by?: string): Promise<void> =>
    fetch(`${API_URL}/api/admin/payments/${encodeURIComponent(orderId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by }),
    })
        .then(json)
        .then(() => undefined);

export const rejectPayment = (orderId: string): Promise<void> =>
    fetch(`${API_URL}/api/admin/payments/${encodeURIComponent(orderId)}/reject`, { method: 'POST' })
        .then(json)
        .then(() => undefined);

// ── Plan ─────────────────────────────────────────────────────────────────────

export const getAdminPlan = (): Promise<{ plan: Plan; defaults: { priceUSD: number; months: number } }> =>
    fetch(`${API_URL}/api/admin/plan`).then(json);

export const setAdminPlan = (body: { priceUSD: number; months: number }): Promise<{ plan: Plan }> =>
    fetch(`${API_URL}/api/admin/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).then(json);

// ── Payment methods + crypto assets ─────────────────────────────────────────

export type MethodFlags = Record<Method, boolean>;
export type MethodDefs = Record<Method, { label: string; desc: string }>;
export type AssetFlags = Record<CryptoAssetId, boolean>;

export interface AssetDef {
    id: CryptoAssetId;
    ticker: string;
    name: string;
    network: string;
    /** The .env variable that would pin this address. */
    envKey: string;
    /** True for chains that also need a destination tag / memo (XRP). */
    supportsMemo: boolean;
    /** The receiving address in force, if any. Admin-only data. */
    address: string;
    memo: string;
    /** 'env' addresses are pinned by the deployment and read-only here. */
    addressSource: 'env' | 'admin' | null;
    walletConfigured: boolean;
    route: 'direct' | 'nowpayments' | null;
    /** False ⇒ payments on this chain need manual approval. */
    autoConfirm: boolean;
}

export interface AdminPaymentConfig {
    methods: MethodFlags;
    methodDefs: MethodDefs;
    assets: AssetFlags;
    assetDefs: AssetDef[];
    nowpaymentsConfigured: boolean;
}

export const getAdminPaymentConfig = (): Promise<AdminPaymentConfig> =>
    fetch(`${API_URL}/api/admin/payment-config`).then(json);

export const setAdminPaymentConfig = (body: {
    methods?: Partial<MethodFlags>;
    assets?: Partial<AssetFlags>;
}): Promise<AdminPaymentConfig> =>
    fetch(`${API_URL}/api/admin/payment-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).then(json);

/**
 * Saves the receiving address for one coin. An empty address clears it and
 * falls back to the .env value (or hides the coin entirely).
 */
export const setAdminWallet = (body: {
    assetId: CryptoAssetId;
    address: string;
    memo?: string;
}): Promise<AdminPaymentConfig> =>
    fetch(`${API_URL}/api/admin/wallets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).then(json);

// ── Markup (Deriv v4 via our server proxy) ──────────────────────────────────

export interface MarkupTotals {
    markup: number;
    volume: number;
    payout: number;
    contracts: number;
    clients: number;
    app_id?: string;
}

export const getMarkup = (dateFrom: string, dateTo: string): Promise<MarkupTotals> =>
    fetch(`${API_URL}/api/admin/markup?date_from=${dateFrom}&date_to=${dateTo}`).then(json);
