/**
 * The shared admin balance lives in quantum-vault — the same figure the Deriv
 * wallet clone sets and the bot clones trade against. Admin (fake-trade) mode
 * here reads it, keeps it in a live 2-way sync, and writes each trade's delta
 * back so a balance changed in the wallet clone shows up, and a trade here
 * shows up there.
 *
 * The admin *check* is unrelated — that stays on this app's own server. This
 * only carries the balance.
 */
const QV_BASE = 'https://quantum-vault-bnhm.onrender.com/api/admin-account';

/**
 * Which admin these calls act for.
 *
 * Balances stopped being one shared figure — each admin has their own, keyed by
 * loginid — so every call has to say whose. Set once by AdminContext when the
 * admin check resolves, rather than threaded through six call signatures that
 * would all pass the same value.
 */
let actingLoginid = '';

export function setQvLoginid(loginid: string): void {
    actingLoginid = String(loginid || '').trim().toUpperCase();
}

/** Appends the acting loginid; the server resolves it against its allow-list. */
function withId(url: string): string {
    if (!actingLoginid) return url;
    return `${url}${url.includes('?') ? '&' : '?'}loginids=${encodeURIComponent(actingLoginid)}`;
}

export interface QvBalance {
    balance: number;
    currency: string;
    active: boolean;
}

/** Read the current shared balance. Time-boxed so a slow server can't hang the UI. */
export async function fetchPreset(timeoutMs = 3000): Promise<QvBalance | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const r = await fetch(withId(QV_BASE), { signal: controller.signal });
        const j = await r.json();
        if (j?.success) {
            return {
                balance: Number(j.data.balance) || 0,
                currency: j.data.currency || 'USD',
                active: !!j.data.active,
            };
        }
    } catch {
        /* offline / timeout — caller falls back to the real balance */
    } finally {
        clearTimeout(timer);
    }
    return null;
}

/** Apply a delta ($inc server-side) so a concurrent wallet-clone change survives. */
export function adjustPreset(delta: number): Promise<void> {
    if (!delta) return Promise.resolve();
    return fetch(withId(`${QV_BASE}/adjust`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
    })
        .then(() => undefined)
        .catch(() => undefined);
}

/** Overwrite the shared balance outright (used by the admin balance editor). */
export function setPreset(balance: number, currency?: string): Promise<void> {
    return fetch(withId(`${QV_BASE}/preset`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance, currency }),
    })
        .then(() => undefined)
        .catch(() => undefined);
}

/** Tell the server admin mode has the session. */
export function activatePreset(): void {
    fetch(withId(`${QV_BASE}/activate`), { method: 'POST' }).catch(() => undefined);
}

/** Tell the server admin mode ended (balance preserved). */
export function deactivatePreset(): void {
    fetch(withId(`${QV_BASE}/deactivate`), { method: 'POST' }).catch(() => undefined);
}
