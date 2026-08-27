/**
 * High-level trading API on top of tradeWS. Covers both request shapes,
 * including the legacy (`symbol`) vs OAuth2 options (`underlying_symbol`) field.
 */
import { tradeWS, type Subscription } from '@/services/trade-ws';

export interface ActiveSymbol {
    symbol: string;
    display_name: string;
    market: string;
    market_display_name: string;
    submarket: string;
    submarket_display_name: string;
    exchange_is_open: number;
    pip: number;
}

export interface ProposalData {
    id: string;
    ask_price: number;
    payout: number;
    display_value: string;
    spot: number;
}

/** Legacy mode = no OAuth2 auth_info in sessionStorage. */
export const isLegacyAuthMode = (): boolean => !sessionStorage.getItem('auth_info');

/** Legacy WS expects `symbol`; the OAuth2 options WS expects `underlying_symbol`. */
const symbolField = (symbol: string): Record<string, string> =>
    isLegacyAuthMode() ? { symbol } : { underlying_symbol: symbol };

/** Resolve the active account's currency for proposal/buy requests. */
export const getActiveCurrency = (): string => {
    const loginid = localStorage.getItem('active_loginid') ?? '';
    try {
        if (!isLegacyAuthMode()) {
            const accounts = JSON.parse(sessionStorage.getItem('deriv_accounts') ?? '[]');
            const acc = accounts.find((a: any) => a.account_id === loginid);
            if (acc?.currency) return acc.currency;
        } else {
            const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') ?? '{}');
            if (clientAccounts[loginid]?.currency) return clientAccounts[loginid].currency;
        }
    } catch {
        /* noop */
    }
    return 'USD';
};

export const getActiveSymbols = async (): Promise<ActiveSymbol[]> => {
    const res = await tradeWS.send({ active_symbols: 'brief' });
    if (res.error) throw new Error(res.error.message);
    return (res.active_symbols ?? []) as ActiveSymbol[];
};

interface TickHistoryParams {
    symbol: string;
    style: 'ticks' | 'candles';
    granularity?: number;
    count?: number;
    onData: (msg: any) => void;
}

/**
 * Subscribes to ticks_history (history first, then live updates).
 *  - style 'ticks'   -> msg_type 'history' then 'tick'
 *  - style 'candles' -> msg_type 'candles' then 'ohlc'
 */
export const subscribeTicks = ({
    symbol,
    style,
    granularity,
    count = 1000,
    onData,
}: TickHistoryParams): Promise<Subscription> => {
    const request: Record<string, unknown> = {
        ticks_history: symbol,
        adjust_start_time: 1,
        count,
        end: 'latest',
        start: 1,
        style,
    };
    if (style === 'candles' && granularity) request.granularity = granularity;
    return tradeWS.subscribe(request, onData);
};

interface ProposalParams {
    contract_type: string;
    symbol: string;
    amount: number;
    duration: number;
    duration_unit: string;
    barrier?: string | number;
    currency?: string;
    onData: (proposal: ProposalData | null, error?: { code: string; message: string }) => void;
}

/** Subscribes to a live price proposal (payout) for a contract. */
export const subscribeProposal = ({
    contract_type,
    symbol,
    amount,
    duration,
    duration_unit,
    barrier,
    currency,
    onData,
}: ProposalParams): Promise<Subscription> => {
    const request: Record<string, unknown> = {
        proposal: 1,
        amount,
        basis: 'stake',
        contract_type,
        currency: currency ?? getActiveCurrency(),
        duration,
        duration_unit,
        ...symbolField(symbol),
    };
    if (barrier !== undefined) request.barrier = String(barrier);

    return tradeWS.subscribe(request, (msg: any) => {
        if (msg.error) {
            onData(null, msg.error);
            return;
        }
        if (msg.proposal) onData(msg.proposal as ProposalData);
    });
};

/**
 * One-shot proposal: returns Deriv's REAL payout for a contract (no subscription).
 * Used by admin fake-trade mode so simulated wins pay the same as a real trade.
 */
export const getProposalPayout = async (p: BuyParams): Promise<number | null> => {
    const request: Record<string, unknown> = {
        proposal: 1,
        amount: p.amount,
        basis: 'stake',
        contract_type: p.contract_type,
        currency: p.currency ?? getActiveCurrency(),
        duration: p.duration,
        duration_unit: p.duration_unit,
        ...symbolField(p.symbol),
    };
    if (p.barrier !== undefined) request.barrier = String(p.barrier);
    const res = await tradeWS.send(request);
    if (res.error || !res.proposal) return null;
    return Number(res.proposal.payout) || null;
};

export interface BuyResult {
    contract_id?: number;
    buy_price?: number;
    transaction_id?: number;
    longcode?: string;
    error?: { code: string; message: string };
}

/** Buys a contract from a subscribed proposal id. */
export const buyContract = async (proposalId: string, price: number): Promise<BuyResult> => {
    const res = await tradeWS.send({ buy: proposalId, price });
    if (res.error) return { error: res.error };
    return res.buy as BuyResult;
};

export interface BuyParams {
    contract_type: string;
    symbol: string;
    amount: number;
    duration: number;
    duration_unit: string;
    barrier?: string | number;
    currency?: string;
}

/**
 * One-shot buy without a separate proposal round-trip — used by the bot engine
 * so each decision executes immediately. `basis: 'stake'` means cost == amount,
 * so we cap `price` at the stake.
 */
export const buyWithParameters = async (p: BuyParams): Promise<BuyResult> => {
    const parameters: Record<string, unknown> = {
        amount: p.amount,
        basis: 'stake',
        contract_type: p.contract_type,
        currency: p.currency ?? getActiveCurrency(),
        duration: p.duration,
        duration_unit: p.duration_unit,
        ...symbolField(p.symbol),
    };
    if (p.barrier !== undefined) parameters.barrier = String(p.barrier);

    const res = await tradeWS.send({ buy: 1, price: p.amount, parameters });
    if (res.error) return { error: res.error };
    return res.buy as BuyResult;
};

/** Subscribes to a contract's live state (P&L, status) after purchase. */
export const subscribeOpenContract = (contractId: number, onData: (poc: any) => void): Promise<Subscription> =>
    tradeWS.subscribe({ proposal_open_contract: 1, contract_id: contractId }, (msg: any) => {
        if (msg.proposal_open_contract) onData(msg.proposal_open_contract);
    });

/** Subscribes to ALL open contracts for the active account (live portfolio). */
export const subscribePortfolio = (onData: (poc: any) => void): Promise<Subscription> =>
    tradeWS.subscribe({ proposal_open_contract: 1 }, (msg: any) => {
        if (msg.proposal_open_contract) onData(msg.proposal_open_contract);
    });

/** Sells an open contract at market price (price 0 = market). */
export const sellContract = async (
    contractId: number
): Promise<{ sold_for?: number; error?: { code: string; message: string } }> => {
    const res = await tradeWS.send({ sell: contractId, price: 0 });
    if (res.error) return { error: res.error };
    return res.sell ?? {};
};

export interface ProfitTableRow {
    contract_id: number;
    longcode: string;
    buy_price: number;
    sell_price: number;
    payout: number;
    purchase_time: number;
    sell_time: number;
    transaction_id: number;
}

/** Fetches the closed-trades profit table (most recent first). */
export const getProfitTable = async (limit = 50): Promise<ProfitTableRow[]> => {
    const res = await tradeWS.send({ profit_table: 1, description: 1, limit, sort: 'DESC' });
    if (res.error) throw new Error(res.error.message);
    return (res.profit_table?.transactions ?? []) as ProfitTableRow[];
};
