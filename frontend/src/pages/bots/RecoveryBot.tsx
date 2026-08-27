import { useEffect, useMemo, useState } from 'react';
import { Hash, Lock, Sigma, TrendingUp, TriangleAlert } from 'lucide-react';
import BotShell from '@/components/BotShell';
import BotResultModal from '@/components/BotResultModal';
import { NumberField, Segmented, Toggle, type SegmentedOption } from '@/components/Field';
import { useAuth } from '@/context/AuthContext';
import { getActiveCurrency } from '@/services/trade-api';
import { DEFAULT_MARKET } from '@/constants/markets';
import SITE from '@/config/site';
import { stakingLabel, useNexusBot, type NexusStrategy, type RiskLevel } from '@/hooks/useNexusBot';

/**
 * Nexus Bot Recovery — the three even-money families with an explicit martingale.
 *
 * The staking rule is the point of this bot, so it is a first-class control
 * rather than a side effect of the risk level: switch it off for flat stakes,
 * or on to size up after a losing round, with a hard cap on how far it goes.
 */

const STRATEGIES: SegmentedOption<NexusStrategy>[] = [
    { id: 'rise_fall', label: 'Rise / Fall', icon: TrendingUp, desc: 'Direction' },
    { id: 'even_odd', label: 'Even / Odd', icon: Hash, desc: 'Parity' },
    { id: 'over_under', label: 'Over / Under', icon: Sigma, desc: 'Digit band' },
];

const ALLOW_DEMO_TRADING = false;

/** Worst-case cost of a full martingale ladder, so the risk is stated up front. */
const ladderCost = (stake: number, multiplier: number, steps: number): number => {
    let total = 0;
    for (let i = 0; i <= steps; i++) total += stake * Math.pow(multiplier, i);
    return total;
};

const RecoveryBot = () => {
    const { accounts, activeLoginId, balanceCurrency } = useAuth();
    const activeAccount = accounts.find(a => a.loginid === activeLoginId);
    const isDemo = activeAccount?.is_demo ?? true;
    const currency = balanceCurrency || getActiveCurrency();

    const [strategy, setStrategy] = useState<NexusStrategy>('even_odd');
    const [risk, setRisk] = useState<RiskLevel>('low');
    const [symbol, setSymbol] = useState(DEFAULT_MARKET);
    const [stake, setStake] = useState(1);
    const [profitTarget, setProfitTarget] = useState(10);
    const [maxLoss, setMaxLoss] = useState(20);

    // Martingale is the headline control of this bot — on by default.
    const [martingaleOn, setMartingaleOn] = useState(true);
    const [multiplier, setMultiplier] = useState(2);
    const [maxSteps, setMaxSteps] = useState(3);

    const martingale = useMemo(
        () => ({ enabled: martingaleOn, multiplier, maxSteps }),
        [martingaleOn, multiplier, maxSteps]
    );

    const config = useMemo(
        () => ({ strategy, risk, symbol, stake, profitTarget, maxLoss, currency, martingale }),
        [strategy, risk, symbol, stake, profitTarget, maxLoss, currency, martingale]
    );

    const engine = useNexusBot(config);
    const demoLocked = isDemo && !ALLOW_DEMO_TRADING;
    const { isRunning, stop } = engine;

    // If the account is switched to a blocked demo mid-run, stop immediately.
    useEffect(() => {
        if (demoLocked && isRunning) stop();
    }, [demoLocked, isRunning, stop]);

    const worstCase = ladderCost(stake, multiplier, maxSteps);
    const finalStake = stake * Math.pow(multiplier, maxSteps);
    // The ladder is only honest if the max loss can actually absorb it.
    const ladderExceedsMaxLoss = martingaleOn && worstCase > maxLoss;

    return (
        <>
            <BotShell
                id='recovery'
                name={SITE.bots.recovery}
                tagline='Chase a loss back on your terms — with a ceiling you set.'
                badges={
                    <>
                        <span className='chip'>Free</span>
                        <span className='chip'>{martingaleOn ? `Martingale ×${multiplier}` : 'Flat stake'}</span>
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
                    />
                }
                extraSlot={
                    <div className='flex flex-col gap-3'>
                        <Toggle
                            checked={martingaleOn}
                            onChange={setMartingaleOn}
                            disabled={engine.isRunning}
                            label='Martingale recovery'
                            hint={
                                martingaleOn
                                    ? 'Stake steps up after every loss, and drops back the moment you win.'
                                    : 'Same stake every round, win or lose.'
                            }
                        />

                        {martingaleOn && (
                            <>
                                <div className='grid gap-4 sm:grid-cols-2'>
                                    <NumberField
                                        label='Multiplier'
                                        value={multiplier}
                                        onChange={v => setMultiplier(Math.max(1, v || 1))}
                                        suffix='×'
                                        min={1}
                                        step='0.1'
                                        disabled={engine.isRunning}
                                    />
                                    <NumberField
                                        label='Max steps'
                                        value={maxSteps}
                                        onChange={v => setMaxSteps(Math.max(0, Math.min(10, Math.floor(v) || 0)))}
                                        suffix='losses'
                                        min={0}
                                        step='1'
                                        disabled={engine.isRunning}
                                        hint={`Stake caps at ${finalStake.toFixed(2)} ${currency}`}
                                    />
                                </div>

                                <div
                                    className={`flex items-start gap-2 rounded-xl border px-3.5 py-3 text-[11px] leading-relaxed ${
                                        ladderExceedsMaxLoss
                                            ? 'border-fg bg-ink-700 text-mist-200'
                                            : 'border-line bg-ink-700 text-mist-400'
                                    }`}
                                >
                                    <TriangleAlert size={14} className='mt-0.5 shrink-0' />
                                    <span>
                                        A full losing ladder costs{' '}
                                        <strong className='font-mono text-fg'>
                                            {worstCase.toFixed(2)} {currency}
                                        </strong>{' '}
                                        across {maxSteps + 1} rounds.
                                        {ladderExceedsMaxLoss
                                            ? ` That is more than your ${maxLoss} ${currency} max loss, so the bot will stop mid-ladder — raise the max loss or lower the multiplier to let it complete.`
                                            : ' Your max loss covers it.'}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                }
                lockedSlot={
                    demoLocked ? (
                        <button type='button' disabled className='btn-outline w-full py-3.5 text-base'>
                            <Lock size={17} /> Switch to a real account to run
                        </button>
                    ) : undefined
                }
                footnote={stakingLabel(risk, martingale)}
            />

            {engine.sessionResult && (
                <BotResultModal result={engine.sessionResult} onClose={engine.clearSessionResult} />
            )}
        </>
    );
};

export default RecoveryBot;
