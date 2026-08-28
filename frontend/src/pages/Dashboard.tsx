import { useNavigate } from 'react-router-dom';
import { Crown } from 'lucide-react';
import PositionsPanel from '@/components/PositionsPanel';
import PricingPlans from '@/components/PricingPlans';
import BasicBot from '@/pages/bots/BasicBot';
import RecoveryBot from '@/pages/bots/RecoveryBot';
import ProBot from '@/pages/bots/ProBot';
import { useAuth } from '@/context/AuthContext';
import { useAdmin } from '@/context/AdminContext';
import { useProAccess } from '@/hooks/useProAccess';
import { usePortfolio } from '@/context/PortfolioContext';
import { getActiveCurrency } from '@/services/trade-api';
import { signed, shortDate } from '@/utils/format';
import SITE from '@/config/site';

/**
 * The whole authenticated product: one page, scrolled top to bottom.
 *
 * Overview → the AI Bots → positions → plans. Every bot keeps its own engine
 * and its own session, so all three can run at once on different markets.
 */
const Dashboard = () => {
    const navigate = useNavigate();
    const { accounts, activeLoginId, balance, balanceCurrency } = useAuth();
    const admin = useAdmin();
    const pro = useProAccess();
    const { openPositions, history } = usePortfolio();

    const activeAccount = accounts.find(a => a.loginid === activeLoginId);
    const currency = balanceCurrency || getActiveCurrency();
    const shownBalance = admin.active ? admin.fakeBalance : balance;
    const shownCurrency = admin.active ? admin.adminCurrency : currency;
    const sessionPnl = history.reduce((sum, t) => sum + t.profit, 0);
    const atRisk = openPositions.reduce((sum, p) => sum + (Number(p.buy_price) || 0), 0);

    return (
        <>
            <div className='container-page flex flex-col gap-6 py-8'>
                {/* ── Overview ────────────────────────────────────────────── */}
                <section id='overview' className='scroll-mt-24'>
                    <div className='card grid-lines'>
                        <div className='flex flex-wrap items-start justify-between gap-4'>
                            <div>
                                <h1 className='wordmark text-2xl text-fg sm:text-3xl'>
                                    {activeAccount?.is_demo ? 'Demo account' : 'Real account'} 
                                </h1>
                                <p className='mt-1.5 max-w-lg text-sm text-mist-400'>
                                    Pick a bot, set your limits, hit run. Every trade shows up in Positions below as it
                                    happens.
                                </p>
                            </div>

                            <div className='flex flex-wrap items-center gap-2'>
                                {pro.via === 'admin' ? (
                                    <span className='chip'>
                                        <Crown size={11} /> Pro
                                    </span>
                                ) : pro.hasPro ? (
                                    <span className='chip'>
                                        <Crown size={11} /> Pro until {pro.expiresAt ? shortDate(pro.expiresAt) : '—'}
                                    </span>
                                ) : (
                                    <button
                                        type='button'
                                        onClick={() => navigate('/app/checkout')}
                                        className='btn-solid btn-sm'
                                    >
                                        <Crown size={13} /> Unlock Pro
                                    </button>
                                )}
                            </div>
                        </div>

                        <dl className='mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4'>
                            <Tile
                                tone='gain'
                                label='Balance'
                                // Hold a shimmer until the admin balance resolves, so the
                                // real balance never flashes before the admin figure.
                                loading={admin.resolving}
                                value={
                                    shownBalance == null
                                        ? '—'
                                        : `${shownBalance.toLocaleString(undefined, {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                          })} ${shownCurrency ?? ''}`
                                }
                            />
                            <Tile label='Account' value={activeAccount?.loginid ?? '—'} />
                            <Tile label='Open positions' value={`${openPositions.length}`} sub={`${atRisk.toFixed(2)} at risk`} />
                            <Tile label='Session P/L' value={signed(sessionPnl)} pnl={sessionPnl} />
                        </dl>
                    </div>
                </section>

                {/* ── The AI Bots ──────────────────────────────────────── */}
                <BasicBot />
                <RecoveryBot />
                <ProBot />

                {/* ── Positions ───────────────────────────────────────────── */}
                <PositionsPanel />

                {/* ── Plans ───────────────────────────────────────────────── */}
                {pro.via !== 'admin' && (
                <section id='plans' className='scroll-mt-24'>
                    <div className='card'>
                        <div className='border-b border-line pb-4'>
                            <h2 className='wordmark text-xl text-fg'>Go Pro</h2>
                            <p className='mt-1 text-sm text-mist-400'>
                                {SITE.bots.basic} and {SITE.bots.recovery} stay free forever. One payment adds the four
                                Pro bots.
                            </p>
                        </div>
                        <div className='pt-6'>
                            <PricingPlans ctaLabel='Get Pro' onSelect={() => navigate('/app/checkout')} />
                        </div>
                    </div>
                </section>
                )}
            </div>
        </>
    );
};

/**
 * `pnl` colours the value green/red by sign. `tone='gain'` forces green for
 * figures that are money-in-hand rather than a result — a balance is always
 * green, since it has no losing side to contrast against.
 */
const Tile = ({
    label,
    value,
    sub,
    pnl,
    tone,
    loading,
}: {
    label: string;
    value: string;
    sub?: string;
    pnl?: number;
    tone?: 'gain';
    loading?: boolean;
}) => (
    <div className='rounded-xl border border-line bg-ink-700 p-3.5'>
        <dt className='label'>{label}</dt>
        {loading ? (
            <dd className='mt-1.5 h-4 w-20 animate-pulse rounded bg-ink-600' aria-label='Loading' />
        ) : (
            <dd
                className={`mt-1 truncate font-mono text-sm font-extrabold ${
                    pnl !== undefined ? (pnl >= 0 ? 'text-gain' : 'text-loss') : tone === 'gain' ? 'text-gain' : 'text-fg'
                }`}
            >
                {value}
            </dd>
        )}
        {sub && <dd className='mt-0.5 text-[11px] text-mist-500'>{sub}</dd>}
    </div>
);

export default Dashboard;
