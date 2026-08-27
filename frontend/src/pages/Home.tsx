import { useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    ArrowUpDown,
    Brain,
    Check,
    Dices,
    Gauge,
    Hash,
    Layers,
    Lock,
    LogIn,
    Printer,
    RefreshCw,
    Shield,
    Sigma,
    Target,
    TrendingUp,
    Zap,
} from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import HeroFigure from '@/components/HeroFigure';
import { useAuth } from '@/context/AuthContext';
import SITE from '@/config/site';

/** What Nexus AI can do — shown inside the hero panel. */
const NEXUS_CAN_DO = [
    'Ten strategies',
    'Runs 24/7',
    'Bulk trading',
    'Martingale recovery',
    'Adaptive risk engine',
    'Live tick analysis',
];

const BOTS = [
    {
        name: SITE.bots.basic,
        tag: 'Free',
        blurb:
            'Start here. Eight ways to trade, one tap each — including the Over 2 + Under 7 double play and bulk mode, which fires up to ten contracts on a single call.',
        points: [
            'Rise / Fall, Even / Odd, Over / Under',
            'Matches / Differs — and Differs on its own',
            'Over 2 + Under 7 on the same tick',
            'Smart AI picks the strongest play for you',
            'Bulk mode: up to 10 contracts at once',
        ],
    },
    {
        name: SITE.bots.recovery,
        tag: 'Free',
        blurb:
            'For chasing a loss back. Flip the martingale on and the stake steps up after every loss, then drops straight back the moment you win — with a ceiling you set.',
        points: [
            'Rise / Fall, Even / Odd, Over / Under',
            'Martingale on or off, one switch',
            'Your multiplier, your step limit',
            'See the worst case before you start',
            'Back to base stake on the first win',
        ],
    },
    {
        name: SITE.bots.pro,
        tag: 'Subscription',
        blurb:
            'The specialists. Four bots that hunt one setup each and sit out everything else — built for traders who would rather take five good trades than fifty average ones.',
        points: [
            'Digit Printer — hunts the repeating digit',
            'Over 8 Sniper — waits, then strikes',
            'Tick Striker — rides the 5-tick high',
            'Auto Switcher — flips with the trend',
            'Bulk mode included',
        ],
    },
];

const STRATEGIES = [
    { icon: TrendingUp, name: 'Rise / Fall', body: 'Calls the next move up or down, and backs it.' },
    { icon: Hash, name: 'Even / Odd', body: 'Reads the parity streak and rides it.' },
    { icon: Sigma, name: 'Over / Under', body: 'Spots when the digits are running high or low.' },
    { icon: Dices, name: 'Matches / Differs', body: 'Finds the digit that keeps showing up — or never does.' },
    { icon: Layers, name: 'Over 2 + Under 7', body: 'Two contracts, one tick. The middle digits pay twice.' },
    { icon: Brain, name: 'Smart AI', body: 'Can’t decide? It picks the best play for you, every tick.' },
    { icon: Printer, name: 'Digit Printer', body: 'Learns which digit follows which, then prints it.' },
    { icon: Target, name: 'Over 8 Sniper', body: 'Patient by design. Waits for the setup, then takes it.' },
    { icon: Zap, name: 'Tick Striker', body: 'Backs the last tick of five to top the lot.' },
    { icon: ArrowUpDown, name: 'Auto Switcher', body: 'Follows the trend and flips the moment it turns.' },
];

const FEATURES = [
    {
        icon: Shield,
        title: 'It stops when you say stop',
        body: 'Set a profit target and a maximum loss. The bot hits either one and shuts itself down — no runaway session while you sleep.',
    },
    {
        icon: Gauge,
        title: 'Nothing happens in the dark',
        body: 'Watch what it is seeing and why it is about to trade, live on screen. Every round it takes is logged, win or lose.',
    },
    {
        icon: RefreshCw,
        title: 'Run them all at once',
        body: 'Each bot has its own market and its own session, so you can put three strategies to work side by side and back the winner.',
    },
    {
        icon: Lock,
        title: 'Your money stays yours',
        body: 'You log in on Deriv’s own site. We never see your password, never hold your funds, and cannot withdraw a cent.',
    },
];

const STEPS = [
    { n: '01', title: 'Connect Deriv', body: 'Two clicks. No API keys, no forms, no waiting for approval.' },
    { n: '02', title: 'Set your limits', body: 'Your stake, your target, your stop. Takes about twenty seconds.' },
    { n: '03', title: 'Hit run', body: 'Walk away. It trades to your limits and stops itself when it gets there.' },
];

const FAQS = [
    {
        q: 'Is TradeNexus an official Deriv product?',
        a: 'No. TradeNexus is an independent platform that connects to your Deriv account through the official Deriv API. It is not affiliated with, or endorsed by, Deriv.',
    },
    {
        q: 'What does the free tier include?',
        a: 'Nexus Bot Basic and Nexus Bot Recovery, with every strategy, bulk mode and the martingale switch. Not a trial — free, permanently. Pro is the only thing you ever pay for.',
    },
    {
        q: 'What is bulk trading?',
        a: 'When the bot sees a setup it likes, bulk lets it back that call with up to ten contracts instead of one. Bigger swings both ways — your stop still ends the session at the number you set.',
    },
    {
        q: 'How does Over 2 + Under 7 work?',
        a: 'Two contracts on the same tick. Land a 3, 4, 5 or 6 and both pay out. Anything else and one leg covers most of the other. The bot only takes it when those middle digits have been landing often enough to be worth it.',
    },
    {
        q: 'Can I use a demo account?',
        a: 'You can explore everything and watch the live read-out on demo. The bots only trade from a real account, because a demo winning streak tells you nothing about a real one.',
    },
    {
        q: 'How do I pay?',
        a: 'Card, M-Pesa, or any of ten coins — USDT, BTC, ETH, SOL, LTC, XRP, BNB, USDC or TRX. One payment covers a full year on every login of your Deriv account.',
    },
];

const Home = () => {
    const { isAuthenticated, loginOAuth2, signup } = useAuth();
    const navigate = useNavigate();

    const start = () => (isAuthenticated ? navigate('/app') : loginOAuth2());

    // "Trade now" lands on the first bot rather than the top of the dashboard,
    // so a visitor arrives at something they can actually run.
    const tradeNow = () => {
        if (isAuthenticated) {
            navigate('/app#basic');
            return;
        }
        sessionStorage.setItem('post_login_redirect', '/app#basic');
        void loginOAuth2();
    };

    return (
        <div className='min-h-screen bg-ink-900'>
            <Header />

            {/* ── Hero ───────────────────────────────────────────────────── */}
            <section className='relative overflow-hidden border-b border-line'>
                <div className='pointer-events-none absolute inset-0 grid-lines opacity-60' aria-hidden='true' />
                <div className='container-page relative grid gap-12 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:py-28'>
                    <div className='animate-fade-up'>
                        <h1 className='wordmark text-4xl leading-[1.05] text-fg sm:text-5xl lg:text-6xl'>
                            Master
                            <br />
                            Deriv Options Trading
                            <br />
                            <span className='text-mist-400'>with our AI Powered Bots.</span>
                        </h1>
                        <p className='mt-6 max-w-xl text-lg leading-relaxed text-mist-400'>
                            Stop staring at charts. Name your stake, your profit target and the most you will risk —
                            then let the bots take the trades while you get on with your day.
                        </p>

                        <div className='mt-8 flex flex-wrap gap-3'>
                            <button type='button' onClick={start} className='btn-solid px-7 py-3'>
                                {isAuthenticated ? 'Open the dashboard' : 'Connect Deriv'} <ArrowRight size={16} />
                            </button>
                            {!isAuthenticated && (
                                <button type='button' onClick={signup} className='btn-outline px-7 py-3'>
                                    <LogIn size={16} /> Create a Deriv account
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Nexus AI — everything sits ON the artwork, so the panel
                        is only ever as tall as the image itself. The scrim is
                        what keeps the text readable over a busy picture. */}
                    <div className='animate-fade-up mx-auto w-full max-w-[520px] lg:mx-0 lg:ml-auto'>
                        <div className='relative overflow-hidden rounded-2xl border border-line'>
                            <HeroFigure className='aspect-square w-full object-cover' />

                            {/* Top-left badge */}
                            <div className='absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-4 pb-10'>
                                <span className='rounded-full border border-white/25 bg-black/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur'>
                                    AI powered
                                </span>
                                <span className='text-[11px] text-white/80'>Your autonomous trading copilot</span>
                            </div>

                            {/* Capabilities + the way in, over a scrim */}
                            <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent p-4 pt-20'>
                                <ul className='grid grid-cols-2 gap-1.5'>
                                    {NEXUS_CAN_DO.map(c => (
                                        <li
                                            key={c}
                                            className='flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white backdrop-blur'
                                        >
                                            <Check size={11} className='shrink-0' />
                                            {c}
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    type='button'
                                    onClick={tradeNow}
                                    className='mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-black transition-opacity hover:opacity-90'
                                >
                                    <Zap size={17} /> Trade now
                                </button>
                                <p className='mt-2 text-center text-[10px] text-white/60'>
                                    One secure Deriv login — no password ever stored.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Bots ───────────────────────────────────────────────────── */}
            <section id='bots' className='border-b border-line py-20 sm:py-24'>
                <div className='container-page'>
                    <h2 className='wordmark text-3xl text-fg sm:text-4xl'>AI Bots</h2>
                    <p className='mt-3 max-w-2xl text-mist-400'>
                        Two are free forever. One is for the traders who want the edge cases covered. Run them together
                        or one at a time — they never step on each other.
                    </p>

                    <div className='mt-10 grid gap-4 lg:grid-cols-3'>
                        {BOTS.map(bot => (
                            <article key={bot.name} className='flex flex-col rounded-2xl border border-line bg-ink-800 p-6'>
                                <div className='flex items-center justify-between gap-2'>
                                    <h3 className='wordmark text-lg text-fg'>{bot.name}</h3>
                                    <span className={bot.tag === 'Free' ? 'chip' : 'chip-solid'}>{bot.tag}</span>
                                </div>
                                <p className='mt-3 text-sm leading-relaxed text-mist-400'>{bot.blurb}</p>
                                <ul className='mt-5 flex-1 space-y-2 border-t border-line pt-5'>
                                    {bot.points.map(p => (
                                        <li key={p} className='flex items-start gap-2 text-sm text-mist-300'>
                                            <span className='mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg' />
                                            {p}
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Strategies ─────────────────────────────────────────────── */}
            <section id='strategies' className='border-b border-line py-20 sm:py-24'>
                <div className='container-page'>
                    <h2 className='wordmark text-3xl text-fg sm:text-4xl'>Ten ways to take a trade</h2>
                    <p className='mt-3 max-w-2xl text-mist-400'>
                        Pick one and go. Every strategy waits for its moment and skips the coin-flips — no trade is
                        better than a bad trade.
                    </p>

                    <div className='mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                        {STRATEGIES.map(s => (
                            <div key={s.name} className='rounded-xl border border-line bg-ink-800 p-5'>
                                <s.icon size={18} className='text-fg' />
                                <h3 className='mt-3 text-sm font-bold text-fg'>{s.name}</h3>
                                <p className='mt-1.5 text-[13px] leading-relaxed text-mist-400'>{s.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Features ───────────────────────────────────────────────── */}
            <section className='border-b border-line py-20 sm:py-24'>
                <div className='container-page grid gap-4 sm:grid-cols-2'>
                    {FEATURES.map(f => (
                        <div key={f.title} className='flex gap-4 rounded-2xl border border-line bg-ink-800 p-6'>
                            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fg text-on-fg'>
                                <f.icon size={18} />
                            </span>
                            <div>
                                <h3 className='text-base font-bold text-fg'>{f.title}</h3>
                                <p className='mt-1.5 text-sm leading-relaxed text-mist-400'>{f.body}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── How it works ───────────────────────────────────────────── */}
            <section className='border-b border-line py-20 sm:py-24'>
                <div className='container-page'>
                    <h2 className='wordmark text-3xl text-fg sm:text-4xl'>Trading in under a minute</h2>
                    <div className='mt-10 grid gap-4 md:grid-cols-3'>
                        {STEPS.map(s => (
                            <div key={s.n} className='rounded-2xl border border-line bg-ink-800 p-6'>
                                <span className='font-mono text-3xl font-extrabold text-mist-600'>{s.n}</span>
                                <h3 className='mt-3 text-base font-bold text-fg'>{s.title}</h3>
                                <p className='mt-1.5 text-sm leading-relaxed text-mist-400'>{s.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FAQ ────────────────────────────────────────────────────── */}
            <section id='faq' className='border-b border-line py-20 sm:py-24'>
                <div className='container-page grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]'>
                    <div>
                        <h2 className='wordmark text-3xl text-fg sm:text-4xl'>Questions</h2>
                        <p className='mt-3 text-mist-400'>
                            Still unsure? Write to{' '}
                            <a href={`mailto:${SITE.supportEmail}`} className='text-fg underline underline-offset-4'>
                                {SITE.supportEmail}
                            </a>
                            .
                        </p>
                    </div>

                    <div className='divide-y divide-line border-y border-line'>
                        {FAQS.map(f => (
                            <details key={f.q} className='group py-4'>
                                <summary className='flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-fg'>
                                    {f.q}
                                    <span className='shrink-0 font-mono text-lg text-mist-500 transition-transform group-open:rotate-45'>
                                        +
                                    </span>
                                </summary>
                                <p className='mt-3 text-sm leading-relaxed text-mist-400'>{f.a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA ────────────────────────────────────────────────────── */}
            <section className='py-20 sm:py-24'>
                <div className='container-page'>
                    <div className='relative overflow-hidden rounded-2xl border border-line bg-ink-800 p-10 text-center sm:p-14'>
                        <div className='pointer-events-none absolute inset-0 grid-lines opacity-50' aria-hidden='true' />
                        <div className='relative'>
                            <h2 className='wordmark text-3xl text-fg sm:text-4xl'>Your first trade is free</h2>
                            <p className='mx-auto mt-3 max-w-xl text-mist-400'>
                                Two full bots, no card, no trial clock. Connect your Deriv account and run one in the
                                next five minutes.
                            </p>
                            <button type='button' onClick={start} className='btn-solid mt-8 px-8 py-3'>
                                {isAuthenticated ? 'Open the dashboard' : 'Connect Deriv'} <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default Home;
