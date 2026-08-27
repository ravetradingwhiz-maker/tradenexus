import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { subscribePortfolio } from '@/services/trade-api';
import type { Subscription } from '@/services/trade-ws';
import { useAuth } from '@/context/AuthContext';

export interface OpenPosition {
    contract_id: number;
    contract_type?: string;
    display_name?: string;
    underlying?: string;
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

interface PortfolioContextValue {
    /** Live open contracts for the active account (any source: manual or bot). */
    openPositions: OpenPosition[];
    /** Trades that have closed this session (in-memory; cleared on reload). */
    history: ClosedTrade[];
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
                        market: existing.display_name || existing.underlying || '—',
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
                                        market: poc.display_name || poc.underlying || '—',
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

    return (
        <PortfolioContext.Provider
            value={{
                openPositions,
                history,
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
