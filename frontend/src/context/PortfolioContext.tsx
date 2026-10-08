import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { subscribePortfolio } from '@/services/trade-api';
import type { Subscription } from '@/services/trade-ws';
import { useAuth } from '@/context/AuthContext';

import { FALLBACK_SYMBOLS } from '@/constants/symbols';

/**
 * The market a contract names, however the payload spells it.
 *
 * `proposal_open_contract` carries `underlying_symbol` — not `underlying`, and
 * not `display_name`, which it has never sent. Reading only the two old names
 * meant every real position fell through to a dash, while admin-simulated ones
 * read correctly because the app fills those fields in itself.
 *
 * The symbol is resolved to its name through the same catalogue the market
 * picker uses, and failing that shows the code: "R_50" says more than "—".
 */
export const marketNameOf = (c: {
    display_name?: string;
    underlying?: string;
    underlying_symbol?: string;
}): string => {
    if (c.display_name) return c.display_name;
    const symbol = c.underlying_symbol || c.underlying || '';
    if (!symbol) return '—';
    return FALLBACK_SYMBOLS.find(s => s.symbol === symbol)?.display_name ?? symbol;
};

export interface OpenPosition {
    contract_id: number;
    contract_type?: string;
    display_name?: string;
    underlying?: string;
    /** What the API actually sends. `underlying` and `display_name` are the old
     *  spellings, kept because the admin-simulated path fills those in. */
    underlying_symbol?: string;
    longcode?: string;
    buy_price?: number;
    bid_price?: number;
    profit?: number;
    currency?: string;
    purchase_time?: number;
    is_sold?: number;
}

export interface ClosedTrade {
    contract_id: number;
    contract_type?: string;
    market: string;
    longcode?: string;
    buy_price: number;
    profit: number;
    time: number;
}

/**
 * The panel's six figures, over the trades that have closed this session.
 *
 * Derived from `history` rather than counted as trades settle, so it can never
 * drift from the list it describes — and Reset, which just empties `history`,
 * zeroes the statistics for free.
 */
export interface SessionStats {
    /** Closed contracts — what the panel calls "No. of runs". */
    runs: number;
    won: number;
    lost: number;
    totalStake: number;
    totalPayout: number;
    totalProfit: number;
}

interface PortfolioContextValue {
    /** Live open contracts for the active account (any source: manual or bot). */
    openPositions: OpenPosition[];
    /** Trades that have closed this session (in-memory; cleared on reload). */
    history: ClosedTrade[];
    /** Session totals over `history`, for the transactions panel. */
    sessionStats: SessionStats;
    clearHistory: () => void;
    /** Admin (fake-trade) mode: inject a simulated open position so it shows live. */
    addAdminPosition: (pos: OpenPosition) => void;
    /** Admin (fake-trade) mode: settle a simulated position and record it to history. */
    settleAdminPosition: (contractId: number, profit: number) => void;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

/**
 * Lives above the app tabs so the portfolio subscription stays alive across
 * navigation. Streams account-wide open contracts and records each one to a
 * session history as it settles. Session history is in-memory only, so a page
 * reload starts fresh.
 */
export const PortfolioProvider = ({ children }: { children: ReactNode }) => {
    const { isAuthenticated, activeLoginId } = useAuth();
    const [positions, setPositions] = useState<Record<number, OpenPosition>>({});
    const [history, setHistory] = useState<ClosedTrade[]>([]);
    const recordedRef = useRef<Set<number>>(new Set());
    const positionsRef = useRef(positions);
    positionsRef.current = positions;
    const subRef = useRef<Subscription | null>(null);

    const clearHistory = useCallback(() => {
        setHistory([]);
        recordedRef.current = new Set();
    }, []);

    // ── Admin (fake-trade) mode ──────────────────────────────────────────────
    // Simulated bot trades never hit the real portfolio stream, so feed them in
    // here too — that way the Positions drawer / Open Positions page show them
    // live, then move them to session history when they settle.
    const addAdminPosition = useCallback((pos: OpenPosition) => {
        setPositions(prev => ({ ...prev, [pos.contract_id]: pos }));
    }, []);

    const settleAdminPosition = useCallback((contractId: number, profit: number) => {
        const existing = positionsRef.current[contractId];
        setPositions(prev => {
            const next = { ...prev };
            delete next[contractId];
            return next;
        });
        if (existing && !recordedRef.current.has(contractId)) {
            recordedRef.current.add(contractId);
            setHistory(prev =>
                [
                    {
                        contract_id: contractId,
                        contract_type: existing.contract_type,
                        market: marketNameOf(existing),
                        longcode: existing.longcode,
                        buy_price: Number(existing.buy_price) || 0,
                        profit,
                        time: Math.floor(Date.now() / 1000),
                    },
                    ...prev,
                ].slice(0, 100)
            );
        }
    }, []);

    useEffect(() => {
        // Reset on (re)subscribe — including account switches.
        setPositions({});
        setHistory([]);
        recordedRef.current = new Set();

        if (!isAuthenticated) return;

        let active = true;
        (async () => {
            try {
                subRef.current = await subscribePortfolio((poc: OpenPosition & { sell_price?: number; sell_time?: number }) => {
                    if (!active) return;
                    const id = poc?.contract_id;
                    // No open contracts → Deriv sends an empty object. Ignore it
                    // so it doesn't render as a blank "—" position.
                    if (!id) return;

                    if (poc.is_sold) {
                        setPositions(prev => {
                            const next = { ...prev };
                            delete next[id];
                            return next;
                        });
                        if (!recordedRef.current.has(id)) {
                            recordedRef.current.add(id);
                            const buy = Number(poc.buy_price) || 0;
                            const profit = poc.profit != null ? Number(poc.profit) : (Number(poc.sell_price) || 0) - buy;
                            setHistory(prev =>
                                [
                                    {
                                        contract_id: id,
                                        contract_type: poc.contract_type,
                                        market: marketNameOf(poc),
                                        longcode: poc.longcode,
                                        buy_price: buy,
                                        profit,
                                        time: poc.sell_time || poc.purchase_time || Math.floor(Date.now() / 1000),
                                    },
                                    ...prev,
                                ].slice(0, 100)
                            );
                        }
                    } else {
                        setPositions(prev => ({ ...prev, [id]: poc }));
                    }
                });
            } catch {
                /* portfolio stream unavailable — pages just show empty */
            }
        })();

        return () => {
            active = false;
            subRef.current?.forget();
            subRef.current = null;
        };
    }, [isAuthenticated, activeLoginId]);

    const openPositions = Object.values(positions).sort((a, b) => (b.purchase_time ?? 0) - (a.purchase_time ?? 0));

    const sessionStats = useMemo<SessionStats>(() => {
        let won = 0;
        let lost = 0;
        let totalStake = 0;
        let totalPayout = 0;
        let totalProfit = 0;

        for (const trade of history) {
            const profit = Number(trade.profit) || 0;
            const stake = Number(trade.buy_price) || 0;
            totalStake += stake;
            totalProfit += profit;
            // `>= 0` counts as a win, matching the bot engine and the trade rows.
            // A loser pays nothing, so only a winner adds to the payout.
            if (profit >= 0) {
                won += 1;
                totalPayout += stake + profit;
            } else {
                lost += 1;
            }
        }

        // Summed floats drift; these are money, so they are rounded once here
        // rather than at each of the six places they are displayed.
        const round2 = (n: number) => Math.round(n * 100) / 100;
        return {
            runs: history.length,
            won,
            lost,
            totalStake: round2(totalStake),
            totalPayout: round2(totalPayout),
            totalProfit: round2(totalProfit),
        };
    }, [history]);

    return (
        <PortfolioContext.Provider
            value={{
                openPositions,
                history,
                sessionStats,
                clearHistory,
                addAdminPosition,
                settleAdminPosition,
            }}
        >
            {children}
        </PortfolioContext.Provider>
    );
};

export const usePortfolio = (): PortfolioContextValue => {
    const ctx = useContext(PortfolioContext);
    if (!ctx) throw new Error('usePortfolio must be used within a PortfolioProvider');
    return ctx;
};

export const usePortfolioOptional = (): PortfolioContextValue | null => useContext(PortfolioContext);
