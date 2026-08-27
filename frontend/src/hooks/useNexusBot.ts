/**
 * Nexus trading engine — the single engine behind all three TradeNexus bots.
 *
 * It reads the live tick feed for one symbol and maintains first-order Markov
 * models over the derived binary sequences:
 *
 *   • parity    — even/odd last digit   (Even/Odd)
 *   • high/low  — last digit > 4        (Over/Under)
 *   • direction — tick up/down          (Rise/Fall)
 *   • digit frequency + digit Markov    (Matches/Differs, digit snipers)
 *
 * Each model's prediction is blended with the observed stationary frequency, so
 * both the immediate pattern and the overall bias feed the confidence. A trade
 * only fires when confidence clears the risk threshold.
 *
 * Two things generalise the original single-contract design:
 *
 *   1. A round is a LIST of legs, not one contract. That is what makes the
 *      simultaneous Over 2 / Under 7 pair and bulk trading possible — the round
 *      settles (and the martingale steps) only once every leg has closed.
 *   2. Staking is configurable. The risk profile supplies a default, and the
 *      Recovery bot overrides it with its own martingale switch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    buyWithParameters,
    getActiveSymbols,
    getProposalPayout,
    subscribeOpenContract,
    type ActiveSymbol,
    type BuyResult,
} from '@/services/trade-api';
import { tickFeed, type TickMessage } from '@/services/tick-feed';
import type { Subscription } from '@/services/trade-ws';
import { useAuthOptional } from '@/context/AuthContext';
import { useAdminOptional } from '@/context/AdminContext';
import { usePortfolioOptional } from '@/context/PortfolioContext';
import { FALLBACK_SYMBOLS } from '@/constants/symbols';

const symbolDisplayName = (symbol: string): string =>
    FALLBACK_SYMBOLS.find(s => s.symbol === symbol)?.display_name ?? symbol;

// ---------------------------------------------------------------------------
// Strategy taxonomy
// ---------------------------------------------------------------------------

/** A single-contract family the engine can model and trade. */
export type NexusFamily = 'rise_fall' | 'even_odd' | 'over_under' | 'matches_differs' | 'differs';

/** Multi-leg strategies: one decision, several contracts bought together. */
export type NexusCombo = 'over2_under7';

/** Meta-strategies that choose among the enabled families each tick. */
export type NexusMeta = 'mix' | 'smart_ai';

/** Named Pro bots, each locked to one contract type with its own signal logic. */
export type NexusPro = 'digit_printer' | 'over8_sniper' | 'tick_striker' | 'auto_switcher';

export type NexusStrategy = NexusFamily | NexusCombo | NexusMeta | NexusPro;

export type RiskLevel = 'low' | 'medium' | 'high';

const PRO_SET = new Set<NexusStrategy>(['digit_printer', 'over8_sniper', 'tick_striker', 'auto_switcher']);
export const isProStrategy = (s: NexusStrategy): s is NexusPro => PRO_SET.has(s);

const COMBO_SET = new Set<NexusStrategy>(['over2_under7']);
export const isComboStrategy = (s: NexusStrategy): s is NexusCombo => COMBO_SET.has(s);

/** Human labels — used by every bot's strategy picker and the journal. */
export const STRATEGY_LABELS: Record<NexusStrategy, string> = {
    rise_fall: 'Rise / Fall',
    even_odd: 'Even / Odd',
    over_under: 'Over / Under',
    matches_differs: 'Matches / Differs',
    differs: 'Differs',
    over2_under7: 'Over 2 + Under 7',
    mix: 'Mix',
    smart_ai: 'Smart AI',
    digit_printer: 'Digit Printer',
    over8_sniper: 'Over 8 Sniper',
    tick_striker: 'Tick Striker',
    auto_switcher: 'Auto Switcher',
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Staking override. When `enabled` is false the stake stays flat. */
export interface MartingaleConfig {
    enabled: boolean;
    /** Stake multiplier applied per consecutive losing round. */
    multiplier: number;
    /** Cap on the number of multiplied steps, so the stake cannot run away. */
    maxSteps: number;
}

export interface NexusConfig {
    strategy: NexusStrategy;
    risk: RiskLevel;
    symbol: string;
    /** Base stake PER LEG (a bulk/combo round costs stake × legs). */
    stake: number;
    profitTarget: number;
    maxLoss: number;
    currency: string;
    /** Families `mix` / `smart_ai` may choose from. Defaults to Even/Odd + Rise/Fall. */
    families?: NexusFamily[];
    /**
     * How many identical contracts to buy per signal (bulk trading). 1 = off.
     * Applies to combo strategies too: bulk 3 on Over 2 + Under 7 buys 6 legs.
     */
    bulkSize?: number;
    /** Overrides the risk profile's staking. Omit to use the risk default. */
    martingale?: MartingaleConfig;
}

const DEFAULT_FAMILIES: NexusFamily[] = ['even_odd', 'rise_fall'];

/** Bulk is capped so a mis-typed value can't fire an unbounded order burst. */
export const MAX_BULK = 10;

/**
 * How long the engine will hold out for a signal that clears its confidence
 * gate before taking the best one on the table anyway.
 *
 * The gates exist to skip coin-flips, but on a quiet market they can keep a bot
 * idle indefinitely, which reads as broken. After this long it stops waiting and
 * trades the strongest read it has — still the best available option, just
 * without the veto.
 */
const FORCE_ENTRY_AFTER_MS = 5000;

interface RiskProfile {
    /** Minimum model confidence required before a trade is placed. */
    minConfidence: number;
    /** Default stake multiplier per consecutive loss (1 = flat staking). */
    martingale: number;
    /** Default cap on the martingale step. */
    maxStep: number;
    /** Rise/Fall contract duration in ticks. */
    riseDuration: number;
}

// Balanced thresholds: selective enough to skip coin-flip ticks (fewer, better
// trades) without stalling. Lower risk = more selective + flat stake; higher
// risk = looser + gentler recovery staking so losing streaks don't blow up.
const RISK: Record<RiskLevel, RiskProfile> = {
    low: { minConfidence: 0.54, martingale: 1, maxStep: 0, riseDuration: 3 },
    medium: { minConfidence: 0.525, martingale: 1.6, maxStep: 2, riseDuration: 2 },
    high: { minConfidence: 0.51, martingale: 2.0, maxStep: 3, riseDuration: 1 },
};

/** Resolves the staking rule actually in force (explicit config beats risk). */
const stakingFor = (risk: RiskLevel, martingale?: MartingaleConfig): { multiplier: number; maxSteps: number } => {
    if (martingale) {
        return martingale.enabled
            ? { multiplier: Math.max(1, martingale.multiplier), maxSteps: Math.max(0, martingale.maxSteps) }
            : { multiplier: 1, maxSteps: 0 };
    }
    const p = RISK[risk];
    return { multiplier: p.martingale, maxSteps: p.maxStep };
};

/** Human-readable staking mode, for the UI. */
export const stakingLabel = (risk: RiskLevel, martingale?: MartingaleConfig): string => {
    const { multiplier, maxSteps } = stakingFor(risk, martingale);
    return multiplier <= 1
        ? 'Flat stake — no martingale'
        : `Martingale ×${multiplier} on loss (capped at ${maxSteps} steps)`;
};

// ---------------------------------------------------------------------------
// Signals & rounds
// ---------------------------------------------------------------------------

/** One contract inside a round. */
export interface TradeLeg {
    contract_type: string;
    label: string;
    barrier?: number;
    /** Duration in ticks. */
    duration: number;
}

export interface NexusSignal {
    family: string;
    label: string;
    predictionText: string;
    conf: number;
    passes: boolean;
    /** Normalised edge in [0,1] so families can be ranked against each other. */
    strength: number;
    /** Every contract this signal buys. One entry for all but combo strategies. */
    legs: TradeLeg[];
}

export interface DigitStat {
    digit: number;
    pct: number;
}

export interface DigitBehaviour {
    dist: DigitStat[];
    evenPct: number;
    oddPct: number;
    /** Share of ticks whose last digit is > 4 — drives Over/Under. */
    highPct: number;
    currentDigit: number | null;
    recentDirs: ('up' | 'down')[];
    sampleSize: number;
}

export interface SessionStats {
    netProfit: number;
    /** Completed rounds (a combo/bulk round counts once). */
    trades: number;
    wins: number;
    losses: number;
    /** Individual contracts bought — diverges from `trades` under bulk/combo. */
    contracts: number;
    /** Longest run of consecutive losing rounds this session. */
    worstStreak: number;
}

export interface JournalEntry {
    id: number;
    result: 'win' | 'loss' | 'error';
    text: string;
    profit?: number;
    stake?: number;
    legs?: number;
}

/** Emitted when a session ends by hitting the profit target or the max loss. */
export interface SessionResult extends SessionStats {
    reason: 'target' | 'maxloss';
    currency: string;
}

export type BotStatus =
    | { kind: 'idle'; text: string }
    | { kind: 'running'; text: string }
    | { kind: 'trading'; text: string }
    | { kind: 'target'; text: string }
    | { kind: 'error'; text: string };

// ---------------------------------------------------------------------------
// Pure model math
// ---------------------------------------------------------------------------

const lastDigitOf = (price: number, decimals: number): number => {
    const s = price.toFixed(decimals);
    return Number(s[s.length - 1]);
};

const decimalsFromPip = (pip: number): number => Math.max(0, Math.round(-Math.log10(pip || 0.01)));

/**
 * First-order Markov prediction for a binary state sequence (values 0/1).
 * Returns P(next === 1), blended with the stationary frequency of 1s so both
 * the immediate pattern and the overall bias contribute.
 */
const predictBinary = (states: number[], blend = 0.65): number => {
    const n = states.length;
    if (n < 8) return 0.5;

    let ones = 0;
    for (const s of states) ones += s;
    const freqOne = ones / n;

    const cur = states[n - 1];
    let c0 = 0;
    let c1 = 0;
    for (let i = 1; i < n; i++) {
        if (states[i - 1] === cur) {
            if (states[i] === 1) c1++;
            else c0++;
        }
    }
    const tot = c0 + c1;
    const markovOne = tot ? c1 / tot : freqOne;

    return blend * markovOne + (1 - blend) * freqOne;
};

const DIGIT_WINDOW = 120;

/** Builds a two-sided (yes/no) signal for a ~50/50 family from P(yes). */
const mkBinary = (
    family: NexusFamily,
    pYes: number,
    yes: { label: string; type: string; barrier?: number },
    no: { label: string; type: string; barrier?: number },
    minConf: number,
    duration: number
): NexusSignal => {
    const isYes = pYes >= 0.5;
    const conf = isYes ? pYes : 1 - pYes;
    const side = isYes ? yes : no;
    return {
        family,
        label: side.label,
        predictionText: side.label,
        conf,
        passes: conf >= minConf,
        strength: (conf - 0.5) / 0.5,
        legs: [{ contract_type: side.type, label: side.label, barrier: side.barrier, duration }],
    };
};

/** Risk-scaled edge a digit must clear for Matches/Differs to fire. */
const MD_GATES: Record<RiskLevel, { match: number; diff: number }> = {
    low: { match: 0.06, diff: 0.035 },
    medium: { match: 0.045, diff: 0.025 },
    high: { match: 0.03, diff: 0.015 },
};

/** Digit distribution over the scoring window. */
const digitProbs = (win: number[]): number[] => {
    const counts = new Array(10).fill(0);
    for (const d of win) counts[d]++;
    const n = win.length || 1;
    return counts.map(c => c / n);
};

/** Up/down states for the tick sequence (1 = up). */
const directionStates = (quotes: number[]): number[] => {
    const dirs: number[] = [];
    for (let i = 1; i < quotes.length; i++) dirs.push(quotes[i] > quotes[i - 1] ? 1 : 0);
    return dirs;
};

/**
 * Evaluate every single-contract family against the current tick window. Each
 * yields a directional signal with a win-probability, a `passes` gate, and a
 * normalised `strength` so the meta-strategies can rank them.
 */
const evaluateFamilies = (quotes: number[], decimals: number, risk: RiskLevel): Record<NexusFamily, NexusSignal> => {
    const minConf = RISK[risk].minConfidence;
    const win = quotes.map(q => lastDigitOf(q, decimals)).slice(-DIGIT_WINDOW);

    // Even / Odd  (P(even) = 1 - P(odd))
    const pOdd = predictBinary(win.map(d => d % 2));
    const eo = mkBinary(
        'even_odd',
        1 - pOdd,
        { label: 'Even', type: 'DIGITEVEN' },
        { label: 'Odd', type: 'DIGITODD' },
        minConf,
        1
    );

    // Rise / Fall
    const pUp = predictBinary(directionStates(quotes));
    const rf = mkBinary(
        'rise_fall',
        pUp,
        { label: 'Rise', type: 'CALL' },
        { label: 'Fall', type: 'PUT' },
        minConf,
        RISK[risk].riseDuration
    );

    // Over 4 / Under 5  (P(high) drives Over)
    const pHigh = predictBinary(win.map(d => (d > 4 ? 1 : 0)));
    const ou = mkBinary(
        'over_under',
        pHigh,
        { label: 'Over 4', type: 'DIGITOVER', barrier: 4 },
        { label: 'Under 5', type: 'DIGITUNDER', barrier: 5 },
        minConf,
        1
    );

    // Matches / Differs from the digit-frequency distribution.
    const probs = digitProbs(win);
    let maxD = 0;
    let minD = 0;
    for (let i = 1; i < 10; i++) {
        if (probs[i] > probs[maxD]) maxD = i;
        if (probs[i] < probs[minD]) minD = i;
    }
    const u = 0.1; // uniform digit probability
    const pMost = probs[maxD];
    const pLeast = probs[minD];
    const strengthMatch = Math.max(0, (pMost - u) / (1 - u));
    const strengthDiff = Math.max(0, (u - pLeast) / u);
    const gate = MD_GATES[risk];

    const matchSig: NexusSignal = {
        family: 'matches_differs',
        label: `Matches ${maxD}`,
        predictionText: `Next digit = ${maxD}`,
        conf: pMost,
        passes: pMost - u >= gate.match,
        strength: strengthMatch,
        legs: [{ contract_type: 'DIGITMATCH', label: `Matches ${maxD}`, barrier: maxD, duration: 1 }],
    };

    // Differs is also selectable on its own: it pays small but wins on ~9 ticks
    // in 10, so it plays very differently from the combined family.
    const differSig: NexusSignal = {
        family: 'differs',
        label: `Differs ${minD}`,
        predictionText: `Next digit ≠ ${minD}`,
        conf: 1 - pLeast,
        passes: u - pLeast >= gate.diff,
        strength: strengthDiff,
        legs: [{ contract_type: 'DIGITDIFF', label: `Differs ${minD}`, barrier: minD, duration: 1 }],
    };

    // The combined family plays whichever side currently has the bigger edge.
    const md: NexusSignal =
        strengthMatch >= strengthDiff ? matchSig : { ...differSig, family: 'matches_differs' };

    return { even_odd: eo, rise_fall: rf, over_under: ou, matches_differs: md, differs: differSig };
};

/**
 * Over 2 + Under 7, bought on the same tick.
 *
 * Over 2 wins on digits 3-9; Under 7 wins on 0-6. Digits 3,4,5,6 win BOTH legs;
 * everything else wins exactly one and loses the other. So the round only turns
 * a profit when the middle band lands, and the gate is the observed share of
 * 3-6 in the window.
 */
const over2Under7Signal = (quotes: number[], decimals: number, risk: RiskLevel): NexusSignal => {
    const win = quotes.map(q => lastDigitOf(q, decimals)).slice(-DIGIT_WINDOW);
    const probs = digitProbs(win);
    const pMiddle = probs[3] + probs[4] + probs[5] + probs[6];

    // Uniform digits give 40%. Both legs pay roughly 1.36×, so the round breaks
    // even near 47% — require a real cushion, scaled by risk appetite.
    const need = { low: 0.5, medium: 0.47, high: 0.44 }[risk];

    return {
        family: 'over2_under7',
        label: 'Over 2 + Under 7',
        predictionText: `Next digit in 3–6 (${(pMiddle * 100).toFixed(0)}% recently)`,
        conf: pMiddle,
        passes: pMiddle >= need,
        strength: Math.max(0, (pMiddle - 0.4) / 0.6),
        legs: [
            { contract_type: 'DIGITOVER', label: 'Over 2', barrier: 2, duration: 1 },
            { contract_type: 'DIGITUNDER', label: 'Under 7', barrier: 7, duration: 1 },
        ],
    };
};

// ── Pro bots ────────────────────────────────────────────────────────────────
// Each is one fixed contract type with its own signal logic.
const proSignal = (strategy: NexusPro, quotes: number[], decimals: number, risk: RiskLevel): NexusSignal | null => {
    const win = quotes.map(q => lastDigitOf(q, decimals)).slice(-DIGIT_WINDOW);
    const n = win.length || 1;
    if (win.length < 12) return null;

    if (strategy === 'digit_printer') {
        // Blend the stationary frequency with a 1st-order digit Markov (which
        // digit most often follows the current one), then play the best digit.
        const freq = digitProbs(win);
        const cur = win[win.length - 1];
        const tCounts = new Array(10).fill(0);
        let tTot = 0;
        for (let i = 1; i < win.length; i++) {
            if (win[i - 1] === cur) {
                tCounts[win[i]]++;
                tTot++;
            }
        }
        const markov = tCounts.map(c => (tTot ? c / tTot : 0.1));
        const blend = 0.6;
        let best = 0;
        let bestScore = -1;
        for (let d = 0; d < 10; d++) {
            const score = blend * markov[d] + (1 - blend) * freq[d];
            if (score > bestScore) {
                bestScore = score;
                best = d;
            }
        }
        return {
            family: 'digit_printer',
            label: `Matches ${best}`,
            predictionText: `Next digit = ${best}`,
            conf: bestScore,
            passes: bestScore - 0.1 >= MD_GATES[risk].match,
            strength: Math.max(0, (bestScore - 0.1) / 0.9),
            legs: [{ contract_type: 'DIGITMATCH', label: `Matches ${best}`, barrier: best, duration: 1 }],
        };
    }

    if (strategy === 'over8_sniper') {
        // Over 8 wins only on digit 9. Fire when 9 is over-represented recently.
        const p9 = win.filter(d => d === 9).length / n;
        const need = { low: 0.14, medium: 0.12, high: 0.1 }[risk];
        return {
            family: 'over8_sniper',
            label: 'Over 8',
            predictionText: 'Last digit > 8',
            conf: Math.max(p9, 0.1),
            passes: p9 >= need,
            strength: Math.max(0, (p9 - 0.1) / 0.9),
            legs: [{ contract_type: 'DIGITOVER', label: 'Over 8', barrier: 8, duration: 5 }],
        };
    }

    if (strategy === 'tick_striker') {
        // High tick → predict the 5th tick is the highest of the series.
        // Favoured by upward momentum, so gate on a bullish direction model.
        const pUp = predictBinary(directionStates(quotes));
        return {
            family: 'tick_striker',
            label: 'Tick High',
            predictionText: 'Last of 5 ticks is the highest',
            conf: pUp,
            passes: pUp >= 0.5, // eager: any bullish lean
            strength: Math.max(0, (pUp - 0.5) / 0.5),
            legs: [{ contract_type: 'TICKHIGH', label: 'Tick High', barrier: 5, duration: 5 }],
        };
    }

    // auto_switcher → Only Ups / Only Downs over 2 ticks; the tick-direction
    // Markov picks the side, so it flips automatically with the trend.
    const pUp = predictBinary(directionStates(quotes));
    const up = pUp >= 0.5;
    const conf = up ? pUp : 1 - pUp;
    return {
        family: 'auto_switcher',
        label: up ? 'Only Ups' : 'Only Downs',
        predictionText: up ? '2 ticks all rise' : '2 ticks all fall',
        conf,
        passes: true, // always picks a side — it auto-switches each round
        strength: Math.max(0, (conf - 0.5) / 0.5),
        legs: [{ contract_type: up ? 'RUNHIGH' : 'RUNLOW', label: up ? 'Only Ups' : 'Only Downs', duration: 2 }],
    };
};

/** Pick the signal a non-Pro, non-combo strategy would act on right now. */
const selectSignal = (
    sigs: Record<NexusFamily, NexusSignal>,
    strategy: NexusFamily | NexusMeta,
    families: NexusFamily[]
): NexusSignal => {
    if (strategy === 'mix' || strategy === 'smart_ai') {
        const pool = families.length ? families : DEFAULT_FAMILIES;
        return pool.map(f => sigs[f]).reduce((a, b) => (b.strength > a.strength ? b : a));
    }
    return sigs[strategy];
};

/** Mutable round-robin cursor for `mix`, owned by the caller. */
export interface MixCursor {
    turn: number;
    quiet: number;
}

/**
 * Decides what to trade this tick — the whole entry decision, with no React and
 * no side effects beyond advancing the mix cursor.
 *
 * `forcing` is the escape hatch: when the confidence gates have kept the bot out
 * for too long, it stops requiring a signal to pass and takes the strongest read
 * available. Passing `forcing` in (rather than reading a clock in here) keeps
 * this a pure function of its inputs.
 *
 * Returns null only when nothing is tradeable at all — which, once `forcing` is
 * true, can happen only during the tick warm-up.
 */
export const selectTradeSignal = (
    strategy: NexusStrategy,
    quotes: number[],
    decimals: number,
    risk: RiskLevel,
    families: NexusFamily[],
    forcing: boolean,
    mix: MixCursor
): NexusSignal | null => {
    if (isProStrategy(strategy)) {
        const s = proSignal(strategy, quotes, decimals, risk);
        return s && (s.passes || forcing) ? s : null;
    }

    if (isComboStrategy(strategy)) {
        const s = over2Under7Signal(quotes, decimals, risk);
        return s.passes || forcing ? s : null;
    }

    const sigs = evaluateFamilies(quotes, decimals, risk);
    const fams = families.length ? families : DEFAULT_FAMILIES;

    if (strategy === 'smart_ai') {
        // The highest-edge family that clears its gate — or, once forcing,
        // simply the highest-edge family.
        const pool = fams.map(f => sigs[f]);
        const passing = pool.filter(x => x.passes);
        const candidates = passing.length ? passing : forcing ? pool : [];
        if (!candidates.length) return null;
        return candidates.reduce((a, b) => (b.strength > a.strength ? b : a));
    }

    if (strategy === 'mix') {
        // Round-robin so the split stays balanced; if the family whose turn it
        // is stays quiet for long enough, let another go once.
        const turn = mix.turn % fams.length;
        const turnSig = sigs[fams[turn]];

        if (turnSig.passes || forcing) {
            mix.turn = (turn + 1) % fams.length;
            mix.quiet = 0;
            return turnSig;
        }
        if (mix.quiet >= 10) {
            const alt = fams.map(f => sigs[f]).find(x => x.family !== turnSig.family && x.passes);
            if (alt) {
                mix.quiet = 0;
                return alt;
            }
        }
        mix.quiet += 1;
        return null;
    }

    const s = sigs[strategy];
    return s.passes || forcing ? s : null;
};

/** The signal the current config would act on right now (for the live display). */
const currentSignal = (
    strategy: NexusStrategy,
    quotes: number[],
    decimals: number,
    risk: RiskLevel,
    families: NexusFamily[]
): NexusSignal | null => {
    if (isProStrategy(strategy)) return proSignal(strategy, quotes, decimals, risk);
    if (isComboStrategy(strategy)) return over2Under7Signal(quotes, decimals, risk);
    return selectSignal(evaluateFamilies(quotes, decimals, risk), strategy, families);
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clampBulk = (n?: number): number => Math.min(MAX_BULK, Math.max(1, Math.floor(n ?? 1) || 1));

// Cache the symbol catalogue once (used only for pip → decimals).
let symbolsCache: Promise<ActiveSymbol[]> | null = null;
const loadSymbols = (): Promise<ActiveSymbol[]> => (symbolsCache ??= getActiveSymbols());

const EMPTY_BEHAVIOUR: DigitBehaviour = {
    dist: Array.from({ length: 10 }, (_, digit) => ({ digit, pct: 0 })),
    evenPct: 50,
    oddPct: 50,
    highPct: 50,
    currentDigit: null,
    recentDirs: [],
    sampleSize: 0,
};

const EMPTY_STATS: SessionStats = {
    netProfit: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    contracts: 0,
    worstStreak: 0,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useNexusBot = (config: NexusConfig) => {
    const [ticksReady, setTicksReady] = useState(false);
    const [behaviour, setBehaviour] = useState<DigitBehaviour>(EMPTY_BEHAVIOUR);
    const [signal, setSignal] = useState<NexusSignal | null>(null);
    const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
    const [journal, setJournal] = useState<JournalEntry[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [status, setStatus] = useState<BotStatus>({ kind: 'idle', text: 'Configure the bot and run.' });
    const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
    /** Stake the NEXT round will use — shown live so the martingale is visible. */
    const [nextStake, setNextStake] = useState(config.stake);

    const quotesRef = useRef<number[]>([]);
    const decimalsRef = useRef(2);
    const cfgRef = useRef(config);
    cfgRef.current = config;

    // Live balance, so a settled round can refresh it immediately.
    const auth = useAuthOptional();
    const authRef = useRef(auth);
    authRef.current = auth;

    // Admin (fake-trade) mode — when active, trades are simulated, not real.
    const admin = useAdminOptional();
    const adminRef = useRef(admin);
    adminRef.current = admin;
    // Portfolio feed, so simulated trades still show in Open Positions.
    const portfolio = usePortfolioOptional();
    const portfolioRef = useRef(portfolio);
    portfolioRef.current = portfolio;

    const runningRef = useRef(false);
    const inFlightRef = useRef(false);
    /** When the hunt for the current round's signal started. */
    const scanStartedRef = useRef(0);
    const stepRef = useRef(0);
    const lossStreakRef = useRef(0);
    // Mix mode: whose turn it is + a quiet counter, so the enabled families stay
    // balanced without the bot stalling on one that never fires.
    const mixRef = useRef<MixCursor>({ turn: 0, quiet: 0 });
    const netRef = useRef(0);
    const statsRef = useRef<SessionStats>({ ...EMPTY_STATS });
    /** Live proposal_open_contract subscriptions for the in-flight round. */
    const legSubsRef = useRef<Subscription[]>([]);
    const journalIdRef = useRef(0);

    const pushJournal = useCallback((entry: Omit<JournalEntry, 'id'>) => {
        const id = ++journalIdRef.current;
        setJournal(prev => [{ id, ...entry }, ...prev].slice(0, 20));
    }, []);

    /** Stake for a given martingale step, per leg. */
    const stakeForStep = useCallback((cfg: NexusConfig, step: number): number => {
        const { multiplier, maxSteps } = stakingFor(cfg.risk, cfg.martingale);
        return round2(cfg.stake * Math.pow(multiplier, Math.min(step, maxSteps)));
    }, []);

    const releaseLegSubs = useCallback(() => {
        legSubsRef.current.forEach(s => s.forget());
        legSubsRef.current = [];
    }, []);

    const stopInternal = useCallback(
        (reason: 'user' | 'target' | 'maxloss' | 'error', message?: string) => {
            runningRef.current = false;
            setIsRunning(false);
            releaseLegSubs();

            if (reason === 'target') setStatus({ kind: 'target', text: 'Profit target reached.' });
            else if (reason === 'maxloss') setStatus({ kind: 'error', text: 'Max loss reached — bot stopped.' });
            else if (reason === 'error') setStatus({ kind: 'error', text: message ?? 'Bot stopped on error.' });
            else setStatus({ kind: 'idle', text: 'Bot stopped.' });

            if (reason === 'target' || reason === 'maxloss') {
                setSessionResult({ reason, currency: cfgRef.current.currency, ...statsRef.current });
            }
        },
        [releaseLegSubs]
    );

    const clearSessionResult = useCallback(() => setSessionResult(null), []);

    const refreshDisplay = useCallback(() => {
        const q = quotesRef.current;
        const dec = decimalsRef.current;
        if (q.length < 6) return;

        const win = q.slice(-100);
        const digits = win.map(p => lastDigitOf(p, dec));
        const counts = new Array(10).fill(0);
        for (const d of digits) counts[d]++;
        const dist = counts.map((c, digit) => ({ digit, pct: (c / digits.length) * 100 }));
        const evenPct = (digits.filter(d => d % 2 === 0).length / digits.length) * 100;
        const highPct = (digits.filter(d => d > 4).length / digits.length) * 100;

        const recentDirs: ('up' | 'down')[] = [];
        for (let i = Math.max(1, q.length - 15); i < q.length; i++) recentDirs.push(q[i] > q[i - 1] ? 'up' : 'down');

        setBehaviour({
            dist,
            evenPct,
            oddPct: 100 - evenPct,
            highPct,
            currentDigit: lastDigitOf(q[q.length - 1], dec),
            recentDirs,
            sampleSize: digits.length,
        });

        const cfg = cfgRef.current;
        setSignal(currentSignal(cfg.strategy, q, dec, cfg.risk, cfg.families ?? DEFAULT_FAMILIES));
    }, []);

    /** Called once per round, after every leg has closed. */
    const onRoundSettled = useCallback(
        (profit: number, sig: NexusSignal, legCount: number, stakePerLeg: number) => {
            const won = profit >= 0;
            netRef.current = round2(netRef.current + profit);

            const s = statsRef.current;
            s.netProfit = netRef.current;
            s.trades += 1;
            s.contracts += legCount;
            if (won) {
                s.wins += 1;
                lossStreakRef.current = 0;
            } else {
                s.losses += 1;
                lossStreakRef.current += 1;
                s.worstStreak = Math.max(s.worstStreak, lossStreakRef.current);
            }
            setStats({ ...s });

            stepRef.current = won ? 0 : stepRef.current + 1;
            setNextStake(stakeForStep(cfgRef.current, stepRef.current));

            pushJournal({
                result: won ? 'win' : 'loss',
                text: `${sig.label}${legCount > 1 ? ` ×${legCount}` : ''}`,
                profit,
                stake: round2(stakePerLeg * legCount),
                legs: legCount,
            });

            inFlightRef.current = false;
            scanStartedRef.current = Date.now();
            releaseLegSubs();

            // The account balance just moved. Pull it now rather than leaving
            // the header stale until the next poll.
            authRef.current?.refreshBalances();

            const cfg = cfgRef.current;
            if (netRef.current >= cfg.profitTarget) {
                stopInternal('target');
                return;
            }
            if (netRef.current <= -Math.abs(cfg.maxLoss)) {
                stopInternal('maxloss');
                return;
            }
            if (runningRef.current) setStatus({ kind: 'running', text: 'Scanning market for the next signal…' });
        },
        [pushJournal, releaseLegSubs, stakeForStep, stopInternal]
    );

    /**
     * Buys every leg of a round. Legs go out together (Promise.all) so the
     * simultaneous pair really is simultaneous; the round settles once the last
     * contract closes, and only then does the martingale step.
     */
    const placeRound = useCallback(
        async (sig: NexusSignal) => {
            inFlightRef.current = true;
            const cfg = cfgRef.current;
            const bulk = clampBulk(cfg.bulkSize);
            const stake = stakeForStep(cfg, stepRef.current);

            // Bulk repeats the whole plan, so a combo keeps its legs paired.
            const legs: TradeLeg[] = [];
            for (let i = 0; i < bulk; i++) legs.push(...sig.legs);

            const totalCost = round2(stake * legs.length);
            setStatus({
                kind: 'trading',
                text:
                    `Trading ${sig.label}` +
                    (legs.length > 1 ? ` · ${legs.length} contracts` : '') +
                    ` · ${totalCost.toFixed(2)} ${cfg.currency} · ${(sig.conf * 100).toFixed(0)}% confidence`,
            });

            // ── Admin fake-trade path: simulate outcomes, place no real order ──
            const adminCtx = adminRef.current;
            if (adminCtx?.active) {
                let simSettled = 0;
                let simProfit = 0;
                const simFinish = (profit: number) => {
                    simProfit = round2(simProfit + profit);
                    simSettled += 1;
                    if (simSettled === legs.length) onRoundSettled(simProfit, sig, legs.length, stake);
                };

                for (const leg of legs) {
                    // Ask for the REAL proposal first so simulated wins pay what
                    // Deriv would. A failed lookup falls back to the static table.
                    const payout = await getProposalPayout({
                        contract_type: leg.contract_type,
                        symbol: cfg.symbol,
                        amount: stake,
                        duration: leg.duration,
                        duration_unit: 't',
                        barrier: leg.barrier,
                        currency: cfg.currency,
                    }).catch(() => null);

                    const outcome = adminCtx.simulate(stake, leg.contract_type, leg.barrier, payout ?? undefined);
                    if (outcome.insufficient) {
                        pushJournal({ result: 'error', text: 'Insufficient balance' });
                        inFlightRef.current = false;
                        stopInternal('error', 'Insufficient balance');
                        return;
                    }

                    // Show the simulated trade live in Open Positions, then settle
                    // it after the contract's tick duration, like a real position.
                    const contractId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
                    const finalProfit = outcome.profit;
                    portfolioRef.current?.addAdminPosition({
                        contract_id: contractId,
                        contract_type: leg.contract_type,
                        display_name: symbolDisplayName(cfg.symbol),
                        underlying: cfg.symbol,
                        buy_price: stake,
                        bid_price: round2(Math.max(0, stake + finalProfit)),
                        profit: finalProfit,
                        currency: cfg.currency,
                        purchase_time: Math.floor(Date.now() / 1000),
                    });
                    setTimeout(
                        () => {
                            portfolioRef.current?.settleAdminPosition(contractId, finalProfit);
                            simFinish(finalProfit);
                        },
                        leg.duration * 1000 + 400 + Math.random() * 400
                    );
                }
                return;
            }

            // ── Real orders ───────────────────────────────────────────────────
            const results = await Promise.all(
                legs.map(leg =>
                    buyWithParameters({
                        contract_type: leg.contract_type,
                        symbol: cfg.symbol,
                        amount: stake,
                        duration: leg.duration,
                        duration_unit: 't',
                        barrier: leg.barrier,
                        currency: cfg.currency,
                    }).catch(
                        (err): BuyResult => ({ error: { code: 'BuyFailed', message: String(err?.message ?? err) } })
                    )
                )
            );

            const bought = results.filter(r => !r.error && r.contract_id);
            const rejected = results.filter(r => r.error || !r.contract_id);

            if (!bought.length) {
                const msg = rejected[0]?.error?.message ?? 'Trade rejected';
                pushJournal({ result: 'error', text: msg });
                inFlightRef.current = false;
                stopInternal('error', msg);
                return;
            }

            // A partial fill still has to settle cleanly: count only what was
            // actually bought, and record the rejected legs in the journal.
            if (rejected.length) {
                pushJournal({
                    result: 'error',
                    text: `${rejected.length} of ${legs.length} contracts rejected — settling the rest`,
                });
            }

            const liveLegs = bought.length;
            let settled = 0;
            let roundProfit = 0;
            const finishLeg = (profit: number) => {
                roundProfit = round2(roundProfit + profit);
                settled += 1;
                if (settled === liveLegs) onRoundSettled(roundProfit, sig, liveLegs, stake);
            };

            for (const res of bought) {
                const sub = await subscribeOpenContract(
                    res.contract_id as number,
                    (poc: { is_sold?: number; profit?: number }) => {
                        if (!poc?.is_sold) return;
                        finishLeg(Number(poc.profit) || 0);
                    }
                );
                legSubsRef.current.push(sub);
            }
        },
        [onRoundSettled, pushJournal, stakeForStep, stopInternal]
    );

    const maybeTrade = useCallback(() => {
        if (!runningRef.current || inFlightRef.current) return;
        const q = quotesRef.current;
        if (q.length < 18) return; // warm-up window

        const cfg = cfgRef.current;
        if (!scanStartedRef.current) scanStartedRef.current = Date.now();
        const forcing = Date.now() - scanStartedRef.current >= FORCE_ENTRY_AFTER_MS;

        const pick = selectTradeSignal(
            cfg.strategy,
            q,
            decimalsRef.current,
            cfg.risk,
            cfg.families ?? DEFAULT_FAMILIES,
            forcing,
            mixRef.current
        );
        if (!pick) return;

        // The clock restarts when the round settles; zero it so a slow fill
        // cannot immediately re-arm the forced entry.
        scanStartedRef.current = 0;
        void placeRound(pick);
    }, [placeRound]);

    const handleTick = useCallback(
        (msg: TickMessage) => {
            if (msg?.error) {
                setStatus({ kind: 'error', text: `Market feed: ${msg.error.message}` });
                return;
            }
            if (msg?.history?.prices) {
                quotesRef.current = msg.history.prices.map(Number).slice(-500);
                setTicksReady(true);
                refreshDisplay();
                return;
            }
            if (msg?.tick?.quote != null) {
                quotesRef.current.push(Number(msg.tick.quote));
                if (quotesRef.current.length > 600) quotesRef.current.shift();
                setTicksReady(true);
                refreshDisplay();
                maybeTrade();
            }
        },
        [refreshDisplay, maybeTrade]
    );

    // (Re)subscribe to the tick feed whenever the symbol changes.
    useEffect(() => {
        let active = true;
        let sub: Subscription | null = null;
        setTicksReady(false);
        setBehaviour(EMPTY_BEHAVIOUR);
        setSignal(null);
        quotesRef.current = [];

        (async () => {
            try {
                const syms = await loadSymbols();
                if (!active) return;
                const found = syms.find(x => x.symbol === config.symbol);
                decimalsRef.current = found ? decimalsFromPip(found.pip) : 2;
            } catch {
                decimalsRef.current = 2;
            }
            try {
                // Shared across every bot watching this symbol — Deriv refuses a
                // second identical subscription on one connection.
                sub = await tickFeed.subscribe(config.symbol, handleTick);
                if (!active) sub.forget();
            } catch {
                if (active) setStatus({ kind: 'error', text: 'Could not load market ticks.' });
            }
        })();

        return () => {
            active = false;
            sub?.forget();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.symbol]);

    // Keep the displayed next stake in step with the configured base stake while
    // the bot is idle (the martingale owns it once a session is running).
    useEffect(() => {
        if (!runningRef.current) setNextStake(config.stake);
    }, [config.stake]);

    // Tear down on unmount.
    useEffect(
        () => () => {
            runningRef.current = false;
            legSubsRef.current.forEach(s => s.forget());
            legSubsRef.current = [];
        },
        []
    );

    const start = useCallback(() => {
        netRef.current = 0;
        stepRef.current = 0;
        lossStreakRef.current = 0;
        mixRef.current = { turn: 0, quiet: 0 };
        inFlightRef.current = false;
        scanStartedRef.current = Date.now();
        statsRef.current = { ...EMPTY_STATS };
        setStats({ ...statsRef.current });
        setJournal([]);
        setSessionResult(null);
        setNextStake(cfgRef.current.stake);
        runningRef.current = true;
        setIsRunning(true);
        setStatus({ kind: 'running', text: 'Scanning market for the next signal…' });
    }, []);

    const stop = useCallback(() => stopInternal('user'), [stopInternal]);

    return {
        ticksReady,
        behaviour,
        signal,
        stats,
        journal,
        isRunning,
        status,
        sessionResult,
        nextStake,
        clearSessionResult,
        start,
        stop,
    };
};
