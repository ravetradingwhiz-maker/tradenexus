import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getActiveCurrency } from '@/services/trade-api';
import { checkAdmin } from '@/services/admin-api';
import {
    activatePreset,
    adjustPreset,
    deactivatePreset,
    fetchPreset,
    setPreset as setPresetRemote,
} from '@/services/qv-balance';

const SESSION_KEY = '__tn_admin';
// A manual exit (triple-click the balance) parks the loginid here so a reload
// doesn't immediately re-detect and re-activate it. Cleared on a real logout,
// so the next fresh login is detected again.
const EXIT_KEY = `${SESSION_KEY}_exit`;
const BASE_WIN_RATE = 0.68;
const POLL_MS = 3000;
// After a local balance change, ignore remote values briefly so a poll that
// races the write-back can't clobber the fresh figure.
const LOCAL_GRACE_MS = 4000;

// Approximate Deriv payout multipliers (fallback; good enough for simulation).
const MULT: Record<string, number> = {
    CALL: 1.95,
    PUT: 1.95,
    DIGITEVEN: 1.94,
    DIGITODD: 1.94,
    DIGITMATCH: 9.3,
    DIGITDIFF: 1.06,
    TICKHIGH: 5.0,
    TICKLOW: 5.0,
    RUNHIGH: 3.7, // Only Ups (2 ticks)
    RUNLOW: 3.7, // Only Downs (2 ticks)
};
const OVER: Record<number, number> = { 0: 1.06, 1: 1.19, 2: 1.36, 3: 1.58, 4: 1.94, 5: 2.39, 6: 3.17, 7: 4.76, 8: 9.3 };
const UNDER: Record<number, number> = { 1: 9.3, 2: 4.76, 3: 3.17, 4: 2.39, 5: 1.94, 6: 1.58, 7: 1.36, 8: 1.19, 9: 1.06 };

const payoutMultiplier = (contractType: string, barrier?: number): number => {
    if (contractType === 'DIGITOVER' && barrier !== undefined) return OVER[barrier] ?? 1.94;
    if (contractType === 'DIGITUNDER' && barrier !== undefined) return UNDER[barrier] ?? 1.94;
    return MULT[contractType] ?? 1.95;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Exit suppression (per-loginid, this browser session) ──────────────────────
const isSuppressed = (loginid: string): boolean => {
    try {
        const raw = sessionStorage.getItem(EXIT_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) && list.includes(loginid);
    } catch {
        return false;
    }
};
const addSuppress = (loginid: string) => {
    try {
        const raw = sessionStorage.getItem(EXIT_KEY);
        const list = raw ? JSON.parse(raw) : [];
        if (!list.includes(loginid)) list.push(loginid);
        sessionStorage.setItem(EXIT_KEY, JSON.stringify(list));
    } catch {
        /* silent */
    }
};
const clearSuppress = () => {
    try {
        sessionStorage.removeItem(EXIT_KEY);
    } catch {
        /* silent */
    }
};

/**
 * Clear the exit suppression. Called on a fresh login (the OAuth callback), so
 * exiting admin mode then logging out and back in — even in the same tab —
 * re-activates it. A plain reload does NOT clear it, so an exit stays put.
 */
export const clearAdminExitSuppression = () => clearSuppress();

export interface SimOutcome {
    won: boolean;
    profit: number;
    insufficient?: boolean;
}

interface AdminContextValue {
    eligible: boolean; // this user has an admin loginid (any of their accounts)
    checked: boolean; // the admin check has resolved (for route gating)
    /**
     * Admin (fake-trade) mode is EFFECTIVE — true only while the active account
     * is the one admin mode was activated on. Switching accounts flips this to
     * false (real balance) without tearing the session down.
     */
    active: boolean;
    /**
     * True while the active login's admin status is still being resolved — the
     * allow-list check plus, for an admin, the quantum-vault balance fetch. The
     * balance area stays in a loading state until this is false, so the real
     * balance never flashes before the admin balance mounts.
     */
    resolving: boolean;
    /** The loginid admin mode is bound to (persists across switches/reloads). */
    adminLoginid: string | null;
    fakeBalance: number;
    /** Currency of the fake balance (the bound account's currency). */
    adminCurrency: string;
    currency: string;
    deactivate: () => void;
    /** Manual exit (triple-click the balance) — back to the real account. */
    exit: () => void;
    setBalance: (balance: number) => void;
    /**
     * Decide a fake outcome, adjust the fake balance, return profit. Pass `payout`
     * (Deriv's real proposal payout) so wins pay exactly like a real trade; falls
     * back to the static multiplier table when it's unavailable.
     */
    simulate: (stake: number, contractType: string, barrier?: number, payout?: number) => SimOutcome;
}

const AdminContext = createContext<AdminContextValue | null>(null);

interface Persisted {
    active: boolean; // admin mode has been activated (bound to `loginid`)
    loginid: string | null; // the account admin mode is bound to
    fakeBalance: number;
    currency: string;
}

const readSession = (): Persisted | null => {
    try {
        return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    } catch {
        return null;
    }
};

export const AdminProvider = ({ children }: { children: ReactNode }) => {
    const { isAuthenticated, activeLoginId, balanceCurrency, accounts } = useAuth();
    const currency = balanceCurrency || getActiveCurrency();

    const [eligible, setEligible] = useState(false);
    const [checked, setChecked] = useState(false);
    // Admin mode is bound to a loginid; these persist across account switches.
    const [adminActivated, setAdminActivated] = useState(false);
    const [adminLoginid, setAdminLoginid] = useState<string | null>(null);
    const [fakeBalance, setFakeBalance] = useState(0);
    const [adminCurrency, setAdminCurrency] = useState(currency);
    const balanceRef = useRef(0);
    balanceRef.current = fakeBalance;

    // The admin (fake) balance belongs to the REAL account only — demo stays
    // Deriv's own. The admin's real account is the first non-demo one; admin mode
    // binds to it, so switching to demo shows Deriv's demo balance untouched.
    const adminAccountId = useMemo(() => accounts.find(a => !a.is_demo)?.loginid ?? null, [accounts]);
    const activeIsAdminAccount = !!adminAccountId && activeLoginId === adminAccountId;

    // Effective: fake-trade mode applies only while the admin's real account is active.
    const effectiveActive = adminActivated && !!adminLoginid && adminLoginid === activeLoginId;
    const effectiveActiveRef = useRef(effectiveActive);
    effectiveActiveRef.current = effectiveActive;

    // Cross-device sync bookkeeping.
    const lastLocalRef = useRef(0); // last local balance change (write-back grace)
    const syncingRef = useRef(false);
    const pollRef = useRef<number | null>(null);
    // The loginid whose admin status has been resolved (checked / activated).
    const resolvedForRef = useRef<string | null>(null);
    const prevAuthRef = useRef(isAuthenticated);
    // The exact loginid set the eligibility check last ran for — so a fresh
    // login re-runs it instead of trusting a stale result from before logout.
    const checkedSigRef = useRef('');

    // Outcome engine state.
    const pnlRef = useRef(0);
    const lossStreakRef = useRef(0);
    const recoveryRef = useRef(0);
    const recentRef = useRef<boolean[]>([]);

    const persist = useCallback((next: Partial<Persisted>) => {
        const base: Persisted = readSession() ?? { active: false, loginid: null, fakeBalance: 0, currency: 'USD' };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...base, ...next }));
    }, []);

    const resetEngine = () => {
        pnlRef.current = 0;
        lossStreakRef.current = 0;
        recoveryRef.current = 0;
        recentRef.current = [];
    };

    // Ported recovery outcome engine: ~68% base, forces wins after losses /
    // drawdown so the session trends to profit.
    const decideOutcome = useCallback((stake: number): boolean => {
        const pnl = pnlRef.current;
        const drawdown = pnl < 0 ? Math.abs(pnl) / Math.max(stake, 0.01) : 0;
        let winProb = BASE_WIN_RATE;

        if (pnl < 0) {
            if (drawdown < 3) winProb = Math.min(0.85, BASE_WIN_RATE + drawdown * 0.05);
            else if (drawdown < 6) winProb = 0.9;
            else winProb = 0.95;
        }
        if (lossStreakRef.current >= 1) return true; // never two losses in a row
        if (recoveryRef.current > 0) return true; // forced wins after a loss
        if (pnl > stake * 5) winProb = Math.min(winProb, 0.6); // allow losses when well ahead
        if (recentRef.current.length === 0) winProb = 0.5; // first trade can lose
        return Math.random() < winProb;
    }, []);

    const recordResult = useCallback((won: boolean, profit: number) => {
        pnlRef.current = round2(pnlRef.current + profit);
        if (won) {
            if (lossStreakRef.current >= 1) recoveryRef.current = 5;
            if (recoveryRef.current > 0) recoveryRef.current -= 1;
            lossStreakRef.current = 0;
        } else {
            lossStreakRef.current += 1;
        }
        recentRef.current.push(won);
        if (recentRef.current.length > 20) recentRef.current.shift();
    }, []);

    // ── Cross-device balance sync ─────────────────────────────────────────────
    const stableOnVis = useCallback(() => {
        if (document.visibilityState === 'visible') applyRemoteRef.current();
    }, []);

    const stopPoller = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        document.removeEventListener('visibilitychange', stableOnVis);
        window.removeEventListener('focus', stableOnVis);
    }, [stableOnVis]);

    const deactivate = useCallback(() => {
        stopPoller();
        deactivatePreset();
        setAdminActivated(false);
        setAdminLoginid(null);
        setFakeBalance(0);
        balanceRef.current = 0;
        resetEngine();
        sessionStorage.removeItem(SESSION_KEY);
    }, [stopPoller]);

    // Pull the shared balance and apply it if it changed elsewhere. Skipped
    // right after a local change so a racing poll can't overwrite the write-back.
    const applyRemote = useCallback(async () => {
        if (!effectiveActiveRef.current || syncingRef.current) return;
        if (Date.now() - lastLocalRef.current < LOCAL_GRACE_MS) return;
        syncingRef.current = true;
        const preset = await fetchPreset();
        if (preset) {
            if (!preset.active) {
                deactivate(); // admin mode ended elsewhere
            } else if (
                Math.abs(preset.balance - balanceRef.current) > 0.001 &&
                Date.now() - lastLocalRef.current >= LOCAL_GRACE_MS
            ) {
                setFakeBalance(preset.balance);
                persist({ fakeBalance: preset.balance });
            }
        }
        syncingRef.current = false;
    }, [deactivate, persist]);

    const applyRemoteRef = useRef(applyRemote);
    applyRemoteRef.current = applyRemote;

    const startPoller = useCallback(() => {
        if (pollRef.current) return; // already polling
        pollRef.current = window.setInterval(() => applyRemoteRef.current(), POLL_MS);
        document.addEventListener('visibilitychange', stableOnVis);
        window.addEventListener('focus', stableOnVis);
    }, [stableOnVis]);

    // Activate admin mode from the shared quantum-vault balance (no typed figure).
    // Always bound to the admin's REAL account, whatever is active right now.
    const autoActivate = useCallback(
        (startBalance: number) => {
            if (!adminAccountId) return;
            resetEngine();
            setAdminActivated(true);
            setAdminLoginid(adminAccountId);
            setFakeBalance(startBalance);
            balanceRef.current = startBalance;
            setAdminCurrency(currency);
            persist({ active: true, loginid: adminAccountId, fakeBalance: startBalance, currency });
            activatePreset();
            startPoller();
        },
        [adminAccountId, currency, persist, startPoller]
    );

    const exit = useCallback(() => {
        const loginid = adminLoginid || activeLoginId;
        if (loginid) addSuppress(loginid);
        // Stay "resolved" so the balance un-gates to the real figure and the
        // resolution effect doesn't immediately re-activate.
        resolvedForRef.current = loginid ?? null;
        deactivate();
    }, [adminLoginid, activeLoginId, deactivate]);

    const setBalance = useCallback(
        (balance: number) => {
            setFakeBalance(balance);
            balanceRef.current = balance;
            persist({ fakeBalance: balance });
            lastLocalRef.current = Date.now();
            setPresetRemote(balance, currency);
        },
        [persist, currency]
    );

    const simulate = useCallback(
        (stake: number, contractType: string, barrier?: number, payout?: number): SimOutcome => {
            if (balanceRef.current < stake) return { won: false, profit: 0, insufficient: true };
            // Prefer Deriv's real payout; fall back to the static multiplier table.
            const winPayout = payout && payout > 0 ? payout : stake * payoutMultiplier(contractType, barrier);
            const won = decideOutcome(stake);
            const profit = won ? round2(winPayout - stake) : -round2(stake);
            const next = Math.max(0, round2(balanceRef.current + profit));
            balanceRef.current = next;
            setFakeBalance(next);
            persist({ fakeBalance: next });
            lastLocalRef.current = Date.now();
            // Write the delta back to the shared balance ($inc server-side) so a
            // trade here shows up in the wallet clone and the bot clones.
            adjustPreset(profit);
            recordResult(won, profit);
            return { won, profit };
        },
        [decideOutcome, recordResult, persist]
    );

    // Restore a persisted admin session once on mount. It stays bound to its
    // loginid; switching accounts only toggles `effectiveActive`, it never clears
    // the session — so the balance survives switches and reloads.
    useEffect(() => {
        const s = readSession();
        if (s?.active) {
            setAdminActivated(true);
            setAdminLoginid(s.loginid ?? null);
            setFakeBalance(s.fakeBalance || 0);
            balanceRef.current = s.fakeBalance || 0;
            setAdminCurrency(s.currency || 'USD');
        }
    }, []);

    // Detect admin eligibility from the Deriv account loginid(s). Keyed on the
    // exact set of loginids: a fresh login re-runs it, and `checked` drops back
    // to false until the new result lands — otherwise the resolution effect would
    // prematurely settle on the stale "not admin" carried over from before logout
    // and never auto-activate.
    useEffect(() => {
        let alive = true;
        if (!isAuthenticated) {
            setEligible(false);
            setChecked(true); // definitively not an admin
            checkedSigRef.current = '';
            return;
        }
        const loginids = accounts.map(a => a.loginid).filter(Boolean);
        if (loginids.length === 0) {
            setChecked(false); // authenticated but accounts not ready — not yet checked
            return;
        }
        const sig = loginids.slice().sort().join(',');
        if (checkedSigRef.current === sig) return; // already checked this exact set
        checkedSigRef.current = sig;
        setChecked(false); // starting a fresh check for this login
        (async () => {
            try {
                const res = await checkAdmin(loginids);
                if (alive) setEligible(!!res.isAdmin);
            } catch {
                if (alive) setEligible(false);
            } finally {
                if (alive) setChecked(true);
            }
        })();
        return () => {
            alive = false;
        };
    }, [isAuthenticated, accounts]);

    // Auto-activate admin mode for the admin's REAL account, once. Independent of
    // which account is active right now, so switching to real shows the fake
    // balance instantly and demo is never touched. Resolves exactly once per real
    // account, so a poll-driven deactivate never re-activates.
    useEffect(() => {
        if (!isAuthenticated || !adminAccountId) return;
        if (resolvedForRef.current === adminAccountId) return;
        if (!checked) return; // wait for the allow-list check
        // Not an admin, or exited this session → leave the real balance in place.
        if (!eligible || isSuppressed(adminAccountId)) {
            resolvedForRef.current = adminAccountId;
            return;
        }
        // A restored session is already bound to the real account.
        if (adminActivated && adminLoginid === adminAccountId) {
            resolvedForRef.current = adminAccountId;
            startPoller();
            return;
        }
        // Eligible, not suppressed, not active → pull the shared balance and go.
        let alive = true;
        (async () => {
            const preset = await fetchPreset();
            if (!alive) return;
            autoActivate(preset ? preset.balance : 0);
            resolvedForRef.current = adminAccountId;
        })();
        return () => {
            alive = false;
        };
    }, [isAuthenticated, adminAccountId, checked, eligible, adminActivated, adminLoginid, startPoller, autoActivate]);

    // A real logout clears the exit suppression and tears admin mode down, so the
    // next fresh login is detected again.
    useEffect(() => {
        if (prevAuthRef.current && !isAuthenticated) {
            clearSuppress();
            resolvedForRef.current = null;
            deactivate();
        }
        prevAuthRef.current = isAuthenticated;
    }, [isAuthenticated, deactivate]);

    // Gate the balance ONLY on the admin's real account, and only until the fake
    // balance is in place. On demo / non-admin accounts it never gates, so Deriv's
    // own balance shows immediately.
    const resolving =
        activeIsAdminAccount &&
        !effectiveActive &&
        (!checked || (eligible && !isSuppressed(adminAccountId ?? '')));

    const displayCurrency = effectiveActive ? adminCurrency : currency;

    const value = useMemo<AdminContextValue>(
        () => ({
            eligible,
            checked,
            active: effectiveActive,
            resolving,
            adminLoginid,
            fakeBalance,
            adminCurrency,
            currency: displayCurrency,
            deactivate,
            exit,
            setBalance,
            simulate,
        }),
        [
            eligible,
            checked,
            effectiveActive,
            resolving,
            adminLoginid,
            fakeBalance,
            adminCurrency,
            displayCurrency,
            deactivate,
            exit,
            setBalance,
            simulate,
        ]
    );

    return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};

export const useAdmin = (): AdminContextValue => {
    const ctx = useContext(AdminContext);
    if (!ctx) throw new Error('useAdmin must be used within an AdminProvider');
    return ctx;
};

export const useAdminOptional = (): AdminContextValue | null => useContext(AdminContext);
