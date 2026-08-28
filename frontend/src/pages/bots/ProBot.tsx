import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, Crown, Lock, Printer, Target, Zap } from 'lucide-react';
import BotShell from '@/components/BotShell';
import BotResultModal from '@/components/BotResultModal';
import { NumberField, Segmented, type SegmentedOption } from '@/components/Field';
import { useAuth } from '@/context/AuthContext';
import { useProAccess } from '@/hooks/useProAccess';
import { getActiveCurrency } from '@/services/trade-api';
import { getPlan, type Plan } from '@/services/payments-api';
import { DEFAULT_MARKET } from '@/constants/markets';
import SITE from '@/config/site';
import { MAX_BULK, useNexusBot, type NexusStrategy, type RiskLevel } from '@/hooks/useNexusBot';

/**
 * Nexus Bot Pro — four named, single-purpose bots behind the subscription.
 *
 * Unlike Basic, each of these is locked to one contract type with signal logic
 * written for it specifically, rather than a general family model.
 */

const STRATEGIES: SegmentedOption<NexusStrategy>[] = [
    { id: 'digit_printer', label: 'Digit Printer', icon: Printer, desc: 'Matches' },
    { id: 'over8_sniper', label: 'Over 8 Sniper', icon: Target, desc: 'Over 8' },
    { id: 'tick_striker', label: 'Tick Striker', icon: Zap, desc: 'Tick High' },
    { id: 'auto_switcher', label: 'Auto Switcher', icon: ArrowUpDown, desc: 'Only Ups/Downs' },
];

const DESCRIPTIONS: Record<string, string> = {
    digit_printer:
        'Learns which digit tends to follow which, then backs the one it expects next. The most patient way to play Matches.',
    over8_sniper:
        'Only a 9 pays here, so it waits — sometimes a long time — until 9s start running hot, then takes the shot.',
    tick_striker:
        'Backs the last of five ticks to be the highest of them all. It only steps in when the market is already pushing up.',
    auto_switcher:
        'Always in the market, always on the side the trend is taking. It flips itself the moment the direction turns.',
};

const ALLOW_DEMO_TRADING = false;

const ProBot = () => {
    const navigate = useNavigate();
    const { accounts, activeLoginId, balanceCurrency } = useAuth();
    const pro = useProAccess();
    const activeAccount = accounts.find(a => a.loginid === activeLoginId);
    const isDemo = activeAccount?.is_demo ?? true;
    const currency = balanceCurrency || getActiveCurrency();

    const [strategy, setStrategy] = useState<NexusStrategy>('digit_printer');
    const [risk, setRisk] = useState<RiskLevel>('low');
    const [symbol, setSymbol] = useState(DEFAULT_MARKET);
    const [stake, setStake] = useState(1);
    const [bulkSize, setBulkSize] = useState(1);
    const [profitTarget, setProfitTarget] = useState(20);
    const [maxLoss, setMaxLoss] = useState(20);

    // Quoted on the paywall. The static default keeps the overlay from flashing
    // an empty price before the API answers.
    const [plan, setPlan] = useState<Plan>({ label: 'Pro', priceUSD: 100, months: 12, term: '1 year' });
    useEffect(() => {
        getPlan()
            .then(setPlan)
            .catch(() => {
                /* keep the default */
            });
    }, []);

    const config = useMemo(
        () => ({ strategy, risk, symbol, stake, profitTarget, maxLoss, currency, bulkSize }),
        [strategy, risk, symbol, stake, profitTarget, maxLoss, currency, bulkSize]
    );

    const engine = useNexusBot(config);
    const { isRunning, stop } = engine;

    const subscribed = pro.hasPro;
    const demoLocked = isDemo && !ALLOW_DEMO_TRADING;
    const locked = !subscribed || demoLocked;

    // Losing the subscription (or switching to a demo) mid-run stops the bot.
    useEffect(() => {
        if (locked && isRunning) stop();
    }, [locked, isRunning, stop]);

    return (
        <>
            <BotShell
                id='pro'
                name={SITE.bots.pro}
                tagline='Four specialists. Each hunts one setup and ignores the rest.'
                badges={
                    <>
                        <span className={subscribed ? 'chip-solid' : 'chip'}>
                            <Crown size={11} /> {subscribed ? 'Active' : 'Locked'}
                        </span>
                        {pro.via === 'subscription' && pro.expiresAt && (
                            <span className='chip'>
                                until{' '}
                                {new Date(pro.expiresAt).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                })}
                            </span>
                        )}
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
                        <p className='rounded-xl border border-line bg-ink-700 px-3.5 py-3 text-[11px] leading-relaxed text-mist-400'>
                            {DESCRIPTIONS[strategy]}
                        </p>
                        <NumberField
                            label='Bulk size'
                            value={bulkSize}
                            onChange={v => setBulkSize(Math.min(MAX_BULK, Math.max(1, Math.floor(v) || 1)))}
                            suffix={`/ ${MAX_BULK}`}
                            min={1}
                            step='1'
                            disabled={engine.isRunning}
                            hint={`Round costs ${(stake * bulkSize).toFixed(2)} ${currency}`}
                        />
                    </div>
                }
                lockedSlot={
                    demoLocked && subscribed ? (
                        <button type='button' disabled className='btn-outline w-full py-3.5 text-base'>
                            <Lock size={17} /> Switch to a real account to run
                        </button>
                    ) : undefined
                }
                lockOverlay={
                    subscribed
                        ? undefined
                        : {
                              priceLine: `${plan.term} access · ${plan.priceUSD} USD`.toUpperCase(),
                              cta: `Unlock ${SITE.bots.pro}`,
                              onClick: () => navigate('/app/checkout'),
                          }
                }
            />

            {engine.sessionResult && (
                <BotResultModal result={engine.sessionResult} onClose={engine.clearSessionResult} />
            )}
        </>
    );
};

export default ProBot;
