import { useEffect, useMemo, useState } from 'react';
import { Brain, Dices, Hash, Layers, Lock, Shuffle, Sigma, SlidersHorizontal, TrendingUp } from 'lucide-react';
import BotShell from '@/components/BotShell';
import BotResultModal from '@/components/BotResultModal';
import { NumberField, Segmented, type SegmentedOption } from '@/components/Field';
import { useAuth } from '@/context/AuthContext';
import { getActiveCurrency } from '@/services/trade-api';
import { DEFAULT_MARKET } from '@/constants/markets';
import SITE from '@/config/site';
import {
    MAX_BULK,
    useNexusBot,
    type NexusFamily,
    type NexusStrategy,
    type RiskLevel,
} from '@/hooks/useNexusBot';

/**
 * Nexus Bot Basic — the full strategy bench, free with any real Deriv account.
 *
 * It carries every family the engine models (Rise/Fall, Even/Odd, Over/Under,
 * Matches/Differs and Differs on its own), the two meta-strategies that pick
 * between them, the simultaneous Over 2 + Under 7 pair, and bulk trading.
 */

const STRATEGIES: SegmentedOption<NexusStrategy>[] = [
    { id: 'rise_fall', label: 'Rise / Fall', icon: TrendingUp, desc: 'Direction' },
    { id: 'even_odd', label: 'Even / Odd', icon: Hash, desc: 'Parity' },
    { id: 'over_under', label: 'Over / Under', icon: Sigma, desc: 'Digit band' },
    { id: 'matches_differs', label: 'Matches / Differs', icon: Dices, desc: 'Best side' },
    { id: 'differs', label: 'Differs', icon: Dices, desc: 'Differs only' },
    { id: 'over2_under7', label: 'Over 2 + Under 7', icon: Layers, desc: 'Simultaneous' },
    { id: 'mix', label: 'Mix', icon: Shuffle, desc: 'Round-robin' },
    { id: 'smart_ai', label: 'Smart AI', icon: Brain, desc: 'Best edge' },
];

/**
 * What Mix and Smart AI draw from. With no picker on the card they consider
 * every family — Smart AI trades the strongest edge of the lot, Mix rotates
 * through them all.
 */
const ALL_FAMILIES: NexusFamily[] = ['rise_fall', 'even_odd', 'over_under', 'matches_differs', 'differs'];

/** Demo accounts are blocked so a "winning" demo run can't be mistaken for real. */
const ALLOW_DEMO_TRADING = false;

const BasicBot = () => {
    const { accounts, activeLoginId, balanceCurrency } = useAuth();
    const activeAccount = accounts.find(a => a.loginid === activeLoginId);
    const isDemo = activeAccount?.is_demo ?? true;
    const currency = balanceCurrency || getActiveCurrency();

    const [strategy, setStrategy] = useState<NexusStrategy>('smart_ai');
    const [risk, setRisk] = useState<RiskLevel>('low');
    const [symbol, setSymbol] = useState(DEFAULT_MARKET);
    const [stake, setStake] = useState(1);
    const [bulkSize, setBulkSize] = useState(1);
    const [profitTarget, setProfitTarget] = useState(10);
    const [maxLoss, setMaxLoss] = useState(10);

    const isMeta = strategy === 'mix' || strategy === 'smart_ai';
    const isCombo = strategy === 'over2_under7';

    const config = useMemo(
        () => ({ strategy, risk, symbol, stake, profitTarget, maxLoss, currency, families: ALL_FAMILIES, bulkSize }),
        [strategy, risk, symbol, stake, profitTarget, maxLoss, currency, bulkSize]
    );

    const engine = useNexusBot(config);
    const demoLocked = isDemo && !ALLOW_DEMO_TRADING;
    const { isRunning, stop } = engine;

    // If the account is switched to a blocked demo mid-run, stop immediately.
    useEffect(() => {
        if (demoLocked && isRunning) stop();
    }, [demoLocked, isRunning, stop]);

    // Contracts bought per round, so the cost of a round is never a surprise.
    const legsPerRound = bulkSize * (isCombo ? 2 : 1);
    const roundCost = stake * legsPerRound;

    return (
        <>
            <BotShell
                id='basic'
                name={SITE.bots.basic}
                tagline='Eight ways to trade. Free, with any real Deriv account.'
                badges={
                    <>
                        <span className='chip'>Free</span>
                        <span className='chip'>Real account only</span>
                    </>
                }
                engine={engine}
                currency={currency}
                symbol={symbol}
                onSymbol={setSymbol}
                risk={risk}
                onRisk={setRisk}
                stake={stake}
                onStake={setStake}
                profitTarget={profitTarget}
                onProfitTarget={setProfitTarget}
                maxLoss={maxLoss}
                onMaxLoss={setMaxLoss}
                strategySlot={
                    <Segmented
                        options={STRATEGIES}
                        value={strategy}
                        onChange={setStrategy}
                        disabled={engine.isRunning}
                        columns={4}
                    />
                }
                extraSlot={
                    <div className='flex flex-col gap-4'>
                        {isCombo && (
                            <p className='rounded-xl border border-line bg-ink-700 px-3.5 py-3 text-[11px] leading-relaxed text-mist-400'>
                                <strong className='text-mist-200'>Two contracts, one tick.</strong> Land a 3, 4, 5 or 6
                                and both pay. Anything else and one leg covers most of the other. It only fires when
                                those middle digits have been landing often enough to be worth taking.
                            </p>
                        )}

                        <div className='grid gap-4 sm:grid-cols-2'>
                            <NumberField
                                label='Bulk size'
                                value={bulkSize}
                                onChange={v => setBulkSize(Math.min(MAX_BULK, Math.max(1, Math.floor(v) || 1)))}
                                suffix={`/ ${MAX_BULK}`}
                                min={1}
                                step='1'
                                disabled={engine.isRunning}
                                hint={`Contracts per signal · ${legsPerRound} per round`}
                            />
                            <div className='flex flex-col gap-1.5'>
                                <span className='label'>Cost per round</span>
                                <div className='flex items-center gap-2 rounded-xl border border-line bg-ink-700 px-3.5 py-2.5'>
                                    <SlidersHorizontal size={14} className='shrink-0 text-mist-500' />
                                    <span className='font-mono text-sm font-bold text-fg'>
                                        {roundCost.toFixed(2)} {currency}
                                    </span>
                                    <span className='text-[11px] text-mist-500'>
                                        {stake.toFixed(2)} × {legsPerRound}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                }
                lockedSlot={
                    demoLocked ? (
                        <button type='button' disabled className='btn-outline w-full py-3.5 text-base'>
                            <Lock size={17} /> Switch to a real account to run
                        </button>
                    ) : undefined
                }
                footnote={
                    isMeta
                        ? strategy === 'mix'
                            ? 'Mix takes turns across the strategies you picked, skipping any that are quiet.'
                            : 'Smart AI plays whichever of your picks looks strongest right now.'
                        : undefined
                }
            />

            {engine.sessionResult && (
                <BotResultModal result={engine.sessionResult} onClose={engine.clearSessionResult} />
            )}
        </>
    );
};

export default BasicBot;
