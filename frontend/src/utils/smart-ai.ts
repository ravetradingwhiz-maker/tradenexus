/**
 * Smart AI — the strategy behind the Smart AI tile.
 *
 * Two 80% digit contracts taken in turn, one per round:
 *
 *   Under 8 — wins on 0–7, loses on 8 or 9
 *   Over 1  — wins on 2–9, loses on 0 or 1
 *
 * Alternating is the point of the pairing: the two lose at opposite ends of the
 * digit range, so no two consecutive rounds are exposed to the same digits.
 *
 * A losing round puts the session into recovery — the printer's ladder, copied
 * across from server/Services/printerEngine.js. The base rotation is replaced
 * by a single Even at a fixed opening stake, doubling on every further loss
 * until one lands. Even pays 1.94x, so one win clears what is owed and puts the
 * session back in profit, at which point the rotation resumes where it left off.
 *
 * Worth being straight about the shape of this. Under 8 and Over 1 each lose one
 * round in five, where the printer's Differs loses one in ten, so the ladder is
 * entered twice as often — and the ladder is where the risk lives. It is
 * uncapped by design, so the session's max loss is the only brake. That is why
 * the max-loss test runs against the round's worst case BEFORE it is bought and
 * not only after it settles: a doubled stake can land a session well past its
 * limit in a single rung.
 */

/**
 * The markets the scan runs over — the 1-second family, the same set the
 * printer trades. They tick once a second, so a round turns over in about a
 * second instead of two.
 */
export const SMART_AI_MARKETS = ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'];

/** Below this many ticks a market is treated as not streaming rather than analysed. */
const MIN_SAMPLE = 50;
/** Deriv's floor. */
const MIN_STAKE = 0.35;
/** The ladder's opening rung, and what each further loss multiplies it by. */
const RECOVERY_START_STAKE = 1;
const RECOVERY_MULTIPLIER = 2;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * How many decimals a symbol is quoted to.
 *
 * The last digit is the last of those decimals, but JSON numbers have already
 * dropped trailing zeros — 1234.50 arrives as 1234.5 — so reading the final
 * character of the raw number would report 5 where the true digit is 0. The
 * width is recovered from the sample instead: across a few hundred ticks the
 * widest price is the symbol's real pip size, because a tick ending in a
 * non-zero digit turns up almost immediately.
 */
const pipSizeOf = (prices: number[]): number => {
    let width = 0;
    for (const price of prices) {
        const text = String(price);
        const dot = text.indexOf('.');
        if (dot >= 0) width = Math.max(width, text.length - dot - 1);
    }
    return width;
};

/** Last digits for a price series, oldest first — the order Deriv returns. */
const digitsOf = (prices: number[]): number[] => {
    const pip = pipSizeOf(prices);
    return prices.map(price => Number(price.toFixed(pip).slice(-1)));
};

export type SmartSide = 'under8' | 'over1';

/** The two digits each side loses on. */
const LOSING_DIGITS: Record<SmartSide, [number, number]> = {
    under8: [8, 9],
    over1: [0, 1],
};

/** Everything the strategy carries between rounds. */
export interface SmartAiState {
    /** What losing rounds have left owed. Above zero means recovery. */
    deficit: number;
    /** The rung just played, so the next one can double it. */
    lastRecoveryStake: number;
    /** A fresh ladder waits for two odd digits before its first rung. */
    waitArmed: boolean;
    /** Which side the next base round takes. */
    side: SmartSide;
    /** Never traded twice in a row. */
    lastSymbol: string;
}

export const freshSmartAiState = (): SmartAiState => ({
    deficit: 0,
    lastRecoveryStake: 0,
    waitArmed: false,
    side: 'under8',
    lastSymbol: '',
});

export interface SmartAiRound {
    symbol: string;
    contract_type: 'DIGITUNDER' | 'DIGITOVER' | 'DIGITEVEN';
    barrier?: number;
    stake: number;
    /** What the run panel and journal show. */
    label: string;
    isRecovery: boolean;
}

interface Market {
    symbol: string;
    digits: number[];
}

/** Markets with enough history to act on, last traded one dropped. */
const usableMarkets = (windows: Record<string, number[]>, excludeSymbol: string): Market[] => {
    const out: Market[] = [];
    for (const symbol of SMART_AI_MARKETS) {
        // Consecutive rounds never reuse a market.
        if (symbol === excludeSymbol) continue;
        const prices = windows[symbol];
        if (!Array.isArray(prices) || prices.length < MIN_SAMPLE) continue;
        out.push({ symbol, digits: digitsOf(prices) });
    }
    return out;
};

/** Are the two most recent digits both odd? History is oldest first. */
const endsWithTwoOdd = (digits: number[]): boolean =>
    digits.length >= 2 && digits[digits.length - 1] % 2 === 1 && digits[digits.length - 2] % 2 === 1;

/** Share of the window taken by the two digits this side loses on. */
const losingShare = (digits: number[], side: SmartSide): number => {
    const [a, b] = LOSING_DIGITS[side];
    let hits = 0;
    for (const digit of digits) {
        if (digit === a || digit === b) hits += 1;
    }
    return hits / digits.length;
};

/**
 * What the next round will stake: the configured stake for the rotation, or the
 * next rung of the ladder while there is a deficit to clear.
 *
 * Split out so the "next stake" readout can show it without having to find a
 * market first — the figure is a function of the ladder alone.
 */
export const nextSmartAiStake = (state: SmartAiState, baseStake: number): number => {
    if (state.deficit <= 0) return Math.max(MIN_STAKE, round2(baseStake));
    const next = state.lastRecoveryStake > 0 ? state.lastRecoveryStake * RECOVERY_MULTIPLIER : RECOVERY_START_STAKE;
    return Math.max(MIN_STAKE, round2(next));
};

/**
 * The round to place next, or null when there is nothing to act on yet —
 * either no market is streaming, or an armed ladder is still waiting for its
 * two odd digits.
 *
 * Worth being straight about what the base scan is. Deriv's digit streams are
 * uniform and independent, so a losing pair having been rare over the last few
 * hundred ticks says nothing about the next one — the odds are 80% whichever
 * market is picked. This ranks by the coldest pair because that is the ranking
 * asked for; it does not make the round more likely to win. Excluding the
 * previous round's market is the part that does something: it spreads the
 * session across markets instead of stacking it on one.
 */
export const chooseSmartAiRound = (
    windows: Record<string, number[]>,
    state: SmartAiState,
    baseStake: number
): SmartAiRound | null => {
    const markets = usableMarkets(windows, state.lastSymbol);
    if (!markets.length) return null;

    // A deficit carried from earlier losses replaces the rotation with the
    // ladder until it is paid off.
    if (state.deficit > 0) {
        // The first rung of a ladder takes a market showing two odd digits in a
        // row; every rung after it fires on whatever is streaming.
        const pick = state.waitArmed ? markets.find(m => endsWithTwoOdd(m.digits)) : markets[0];
        if (!pick) return null;

        return {
            symbol: pick.symbol,
            contract_type: 'DIGITEVEN',
            stake: nextSmartAiStake(state, baseStake),
            label: 'Even',
            isRecovery: true,
        };
    }

    const side = state.side;
    const coldest = markets
        .map(market => ({ market, share: losingShare(market.digits, side) }))
        .reduce((a, b) => (b.share < a.share ? b : a)).market;

    const stake = nextSmartAiStake(state, baseStake);
    return side === 'under8'
        ? { symbol: coldest.symbol, contract_type: 'DIGITUNDER', barrier: 8, stake, label: 'Under 8', isRecovery: false }
        : { symbol: coldest.symbol, contract_type: 'DIGITOVER', barrier: 1, stake, label: 'Over 1', isRecovery: false };
};

/**
 * Would this round, losing outright, take the session past its max loss?
 *
 * Checked before the purchase fires rather than only after it settles —
 * otherwise a doubled recovery stake can land the session well past the
 * configured limit before the reactive check ever runs.
 */
export const wouldBreachMaxLoss = (netProfit: number, maxLoss: number, round: SmartAiRound): boolean => {
    if (!(maxLoss > 0)) return false;
    return round2(netProfit - round.stake) <= -Math.abs(maxLoss);
};

/** Record a round that actually went out. */
export const markSmartAiPlaced = (state: SmartAiState, round: SmartAiRound): void => {
    state.lastSymbol = round.symbol;
    if (round.isRecovery) {
        state.lastRecoveryStake = round.stake;
        state.waitArmed = false;
    }
};

/** Fold a settled round back into the state. */
export const settleSmartAiRound = (state: SmartAiState, round: SmartAiRound, profit: number): void => {
    // A losing round adds to the deficit; a winning one pays it down.
    const wasInRecovery = state.deficit > 0;
    state.deficit = Math.max(0, round2(state.deficit - profit));

    // Opening a fresh ladder arms the two-odd wait for its first rung only.
    // Deepening one that is already open must not re-arm it — that is the whole
    // point of the wait applying once: a rung that loses is followed
    // immediately, not after another confirmation.
    if (!wasInRecovery && state.deficit > 0) state.waitArmed = true;

    // Debt cleared — the ladder resets, so the next recovery starts at the
    // bottom rung instead of continuing from the last one.
    if (state.deficit === 0) {
        state.lastRecoveryStake = 0;
        state.waitArmed = false;
    }

    // Only a base round advances the rotation, so a ladder hands back to the
    // side that had not been played yet.
    if (!round.isRecovery) state.side = state.side === 'under8' ? 'over1' : 'under8';
};
