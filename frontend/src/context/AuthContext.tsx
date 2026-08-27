import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { generateLegacyOAuthURL, generateOAuthURL } from '@/config/auth-config';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { DerivWSAccountsService, type DerivAccount } from '@/services/derivws-accounts.service';
import { streamLegacyBalances, type BalanceMap, type BalanceStreamHandle } from '@/services/deriv-ws';
import { tradeWS, type Subscription } from '@/services/trade-ws';
import { clearAuthData } from '@/utils/auth-utils';

export type AuthMode = 'oauth2' | 'legacy' | null;

export interface AuthAccount {
    loginid: string;
    currency: string;
    is_demo: boolean;
}

interface AuthContextValue {
    isAuthenticated: boolean;
    mode: AuthMode;
    accounts: AuthAccount[];
    activeLoginId: string | null;
    /** Live balance for the active account (null while first loading). */
    balance: number | null;
    balanceCurrency: string | null;
    /** Per-account live balances — used by the switcher for instant display. */
    balances: BalanceMap;
    loginOAuth2: () => Promise<void>;
    loginLegacy: () => void;
    signup: () => Promise<void>;
    logout: () => void;
    switchAccount: (loginid: string) => void;
    /** Re-read auth state from storage (after a fresh login) without a reload. */
    refreshAuthState: () => void;
    /** Pull balances now — call after a trade settles instead of waiting. */
    refreshBalances: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const isDemoId = (id: string) => id.startsWith('VRT') || id.startsWith('VRTC');

const readAuthState = (): { mode: AuthMode; accounts: AuthAccount[]; activeLoginId: string | null } => {
    const activeLoginId = localStorage.getItem('active_loginid');

    if (OAuthTokenExchangeService.isAuthenticated()) {
        const stored: DerivAccount[] = DerivWSAccountsService.getStoredAccounts() ?? [];
        const accounts: AuthAccount[] = stored.map(a => ({
            loginid: a.account_id,
            currency: a.currency,
            is_demo: a.account_type === 'demo' || isDemoId(a.account_id),
        }));
        return { mode: 'oauth2', accounts, activeLoginId };
    }

    const authToken = localStorage.getItem('authToken');
    if (authToken && authToken !== 'null') {
        let clientAccounts: Record<string, { loginid: string; currency?: string }> = {};
        try {
            clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') ?? '{}');
        } catch {
            clientAccounts = {};
        }
        const accounts: AuthAccount[] = Object.values(clientAccounts).map(a => ({
            loginid: a.loginid,
            currency: a.currency || 'USD',
            is_demo: isDemoId(a.loginid),
        }));
        return { mode: 'legacy', accounts, activeLoginId };
    }

    return { mode: null, accounts: [], activeLoginId };
};

/** Builds a balance map from stored REST accounts (instant, no network). */
const balancesFromAccounts = (accounts: DerivAccount[]): BalanceMap =>
    accounts.reduce<BalanceMap>((acc, a) => {
        acc[a.account_id] = { balance: parseFloat(a.balance) || 0, currency: a.currency };
        return acc;
    }, {});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState(() => readAuthState());
    const [balances, setBalances] = useState<BalanceMap>(() => {
        const stored = DerivWSAccountsService.getStoredAccounts();
        return stored ? balancesFromAccounts(stored) : {};
    });
    const legacyStreamRef = useRef<BalanceStreamHandle | null>(null);
    // Set by whichever balance strategy is live, so `refreshBalances()` can
    // force an immediate update — a trade settling should not wait for a poll.
    const forceRefreshRef = useRef<(() => void) | null>(null);

    const isAuthenticated = state.mode !== null;

    // Balance updates. Depends only on mode/auth (NOT activeLoginId) so switching
    // accounts never tears down the connection — balances are already in the map.
    useEffect(() => {
        if (!isAuthenticated) {
            setBalances({});
            return;
        }

        // --- OAuth 2.0 ---
        // The OTP socket is scoped to one account and does not reliably push
        // balance, so the REST accounts endpoint is the source of truth: poll it
        // for EVERY account, including the active one. The WS subscription stays
        // as a faster path when it does fire, but nothing depends on it.
        if (state.mode === 'oauth2') {
            let cancelled = false;
            let balSub: Subscription | null = null;
            let timer: ReturnType<typeof setTimeout> | null = null;

            // Seed instantly from whatever we already have stored.
            const seed = DerivWSAccountsService.getStoredAccounts();
            if (seed?.length) setBalances(balancesFromAccounts(seed));

            (async () => {
                try {
                    balSub = await tradeWS.subscribe({ balance: 1 }, (msg: any) => {
                        if (cancelled || msg?.error) return;
                        const b = msg?.balance;
                        if (b?.loginid) {
                            setBalances(prev => ({
                                ...prev,
                                [b.loginid]: { balance: Number(b.balance) || 0, currency: b.currency },
                            }));
                        }
                    });
                } catch {
                    /* the REST refresh below is what actually keeps this current */
                }
            })();

            const BASE_DELAY = 5000;
            let delay = BASE_DELAY;

            const fetchBalances = async () => {
                const authInfo = OAuthTokenExchangeService.getAuthInfo();
                if (!authInfo?.access_token) {
                    cancelled = true;
                    return;
                }
                const accounts = await DerivWSAccountsService.refreshAccountsList(authInfo.access_token);
                if (cancelled || !accounts?.length) return;
                setBalances(prev => {
                    const next = { ...prev };
                    for (const a of accounts) {
                        next[a.account_id] = { balance: parseFloat(a.balance) || 0, currency: a.currency };
                    }
                    return next;
                });
            };

            const tick = async () => {
                if (cancelled) return;
                if (document.visibilityState === 'hidden') {
                    timer = setTimeout(tick, delay);
                    return;
                }
                try {
                    await fetchBalances();
                    delay = BASE_DELAY;
                } catch (err: any) {
                    const status = err?.status ?? err?.response?.status;
                    // Back off on rate limits / server errors, not on everything.
                    delay =
                        status === 429 || (status >= 500 && status < 600)
                            ? Math.min(delay * 2, 60000)
                            : BASE_DELAY;
                } finally {
                    if (!cancelled) timer = setTimeout(tick, delay);
                }
            };

            // Fetch straight away rather than after the first interval.
            void tick();

            forceRefreshRef.current = () => {
                fetchBalances().catch(() => {
                    /* the regular poll will catch up */
                });
            };

            return () => {
                cancelled = true;
                forceRefreshRef.current = null;
                balSub?.forget();
                if (timer) clearTimeout(timer);
            };
        }

        // --- Legacy: one WS subscription for all account balances ---
        const openLegacyStream = () => {
            legacyStreamRef.current?.close();
            legacyStreamRef.current = streamLegacyBalances({
                onBalances: map => setBalances(prev => ({ ...prev, ...map })),
                onError: err => console.warn('[Auth] legacy balance stream error:', err),
            });
        };
        openLegacyStream();

        // The legacy socket streams `account: 'all'`, so it normally keeps up on
        // its own. If it has died quietly, reopening it is the way to force a
        // fresh reading.
        forceRefreshRef.current = openLegacyStream;

        return () => {
            forceRefreshRef.current = null;
            legacyStreamRef.current?.close();
            legacyStreamRef.current = null;
        };
        // activeLoginId is included so the OAuth2 stream re-targets the newly
        // selected account (its OTP socket is per-account).
    }, [isAuthenticated, state.mode, state.activeLoginId]);

    const refreshBalances = useCallback(() => {
        forceRefreshRef.current?.();
    }, []);

    const refreshAuthState = useCallback(() => {
        setState(readAuthState());
        const stored = DerivWSAccountsService.getStoredAccounts();
        if (stored?.length) setBalances(balancesFromAccounts(stored));
    }, []);

    const loginOAuth2 = useCallback(async () => {
        const url = await generateOAuthURL();
        if (url) window.location.assign(url);
        else console.error('[Auth] Could not build OAuth URL — check CLIENT_ID.');
    }, []);

    const signup = useCallback(async () => {
        const url = await generateOAuthURL('registration');
        if (url) window.location.assign(url);
    }, []);

    const loginLegacy = useCallback(() => {
        window.location.assign(generateLegacyOAuthURL());
    }, []);

    const logout = useCallback(() => {
        DerivWSAccountsService.clearCache();
        OAuthTokenExchangeService.clearAuthInfo();
        clearAuthData(false);
        legacyStreamRef.current?.close();
        legacyStreamRef.current = null;
        setState({ mode: null, accounts: [], activeLoginId: null });
        setBalances({});
    }, []);

    const switchAccount = useCallback((loginid: string) => {
        localStorage.setItem('active_loginid', loginid);
        try {
            const list = JSON.parse(localStorage.getItem('accountsList') ?? 'null') as Record<string, string> | null;
            if (list?.[loginid]) localStorage.setItem('authToken', list[loginid]);
        } catch {
            /* noop */
        }
        localStorage.setItem('account_type', isDemoId(loginid) ? 'demo' : 'real');
        // Instant — balance for the new account is already in the map.
        setState(prev => ({ ...prev, activeLoginId: loginid }));
    }, []);

    const value = useMemo<AuthContextValue>(() => {
        const active = state.activeLoginId ? balances[state.activeLoginId] : undefined;
        return {
            isAuthenticated,
            mode: state.mode,
            accounts: state.accounts,
            activeLoginId: state.activeLoginId,
            balance: active ? active.balance : null,
            balanceCurrency: active ? active.currency : null,
            balances,
            loginOAuth2,
            loginLegacy,
            signup,
            logout,
            switchAccount,
            refreshAuthState,
            refreshBalances,
        };
    }, [
        isAuthenticated,
        state,
        balances,
        loginOAuth2,
        loginLegacy,
        signup,
        logout,
        switchAccount,
        refreshAuthState,
        refreshBalances,
    ]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Like useAuth but returns null outside a provider — used by shared hooks. */
export const useAuthOptional = (): AuthContextValue | null => useContext(AuthContext);

export const useAuth = (): AuthContextValue => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
};
