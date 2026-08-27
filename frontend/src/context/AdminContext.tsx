import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getActiveCurrency } from '@/services/trade-api';
import { checkAdmin } from '@/services/admin-api';

const SESSION_KEY = '__tn_admin';
const BASE_WIN_RATE = 0.68;

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
    /** The loginid admin mode is bound to (persists across switches/reloads). */
    adminLoginid: string | null;
    fakeBalance: number;
    /** Currency of the fake balance (the bound account's currency). */
    adminCurrency: string;
    currency: string;
    needsSetup: boolean; // eligible + admin mode not yet activated + not dismissed → show modal
    activate: (balance: number) => void;
    deactivate: () => void;
    setBalance: (balance: number) => void;
    dismissSetup: () => void;
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
    const [dismissed, setDismissed] = useState(false);

    const balanceRef = useRef(0);
    balanceRef.current = fakeBalance;

    // Outcome engine state.
    const pnlRef = useRef(0);
    const lossStreakRef = useRef(0);
    const recoveryRef = useRef(0);
    const recentRef = useRef<boolean[]>([]);

    // Effective: fake-trade mode applies only while on the bound account.
    const effectiveActive = adminActivated && !!adminLoginid && adminLoginid === activeLoginId;

    const persist = useCallback((next: Partial<Persisted>) => {
        const base: Persisted = readSession() ?? { active: false, loginid: null, fakeBalance: 0, currency: 'USD' };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...base, ...next }));
    }, []);

    // Restore a persisted admin session once on mount. It stays bound to its
    // loginid; switching accounts only toggles `effectiveActive` (derived above),
    // it never clears the session — so the balance survives switches and reloads.
    useEffect(() => {
        const s = readSession();
        if (s?.active) {
            setAdminActivated(true);
            setAdminLoginid(s.loginid ?? null);
            setFakeBalance(s.fakeBalance || 0);
            setAdminCurrency(s.currency || 'USD');
        }
    }, []);

    // Detect admin eligibility from the Deriv account loginid(s).
    useEffect(() => {
        const loginids = accounts.map(a => a.loginid).filter(Boolean);
        let alive = true;
        if (!isAuthenticated) {
            setEligible(false);
            setChecked(true); // definitively not an admin
            return;
        }
        if (loginids.length === 0) return; // accounts still loading — stay unchecked
        (async () => {
            try {
                const res = await checkAdmin(loginids);
                
                if (alive) setEligible(!!res.isAdmin);
            } catch (e) {

                if (alive) setEligible(false);
            } finally {
                if (alive) setChecked(true);
            }
        })();
        return () => {
            alive = false;
        };
    }, [isAuthenticated, activeLoginId, accounts]);

    const resetEngine = () => {
        pnlRef.current = 0;
        lossStreakRef.current = 0;
        recoveryRef.current = 0;
        recentRef.current = [];
    };

    // Activate admin mode, binding it to the CURRENTLY active account.
    const activate = useCallback(
        (balance: number) => {
            resetEngine();
            setAdminActivated(true);
            setAdminLoginid(activeLoginId);
            setFakeBalance(balance);
            setAdminCurrency(currency);
            persist({ active: true, loginid: activeLoginId, fakeBalance: balance, currency });
        },
        [persist, activeLoginId, currency]
    );

    const deactivate = useCallback(() => {
        setAdminActivated(false);
        setAdminLoginid(null);
        setFakeBalance(0);
        resetEngine();
        // Don't immediately re-pop the setup modal — the pill re-opens it on demand.
        setDismissed(true);
        sessionStorage.removeItem(SESSION_KEY);
    }, []);

    const setBalance = useCallback(
        (balance: number) => {
            setFakeBalance(balance);
            persist({ fakeBalance: balance });
        },
        [persist]
    );

    const dismissSetup = useCallback(() => setDismissed(true), []);

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
            recordResult(won, profit);
            return { won, profit };
        },
        [decideOutcome, recordResult, persist]
    );

    // Modal pops once: eligible admin who hasn't activated yet (and hasn't
    // dismissed this session). Bound to `adminActivated`, NOT the effective flag,
    // so switching accounts after setup never re-pops it.
    const needsSetup = eligible && !adminActivated && !dismissed;
    const displayCurrency = effectiveActive ? adminCurrency : currency;

    const value = useMemo<AdminContextValue>(
        () => ({
            eligible,
            checked,
            active: effectiveActive,
            adminLoginid,
            fakeBalance,
            adminCurrency,
            currency: displayCurrency,
            needsSetup,
            activate,
            deactivate,
            setBalance,
            dismissSetup,
            simulate,
        }),
        [
            eligible,
            checked,
            effectiveActive,
            adminLoginid,
            fakeBalance,
            adminCurrency,
            displayCurrency,
            needsSetup,
            activate,
            deactivate,
            setBalance,
            dismissSetup,
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
