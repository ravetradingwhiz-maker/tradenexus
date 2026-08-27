import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import SITE from '@/config/site';

const CONSENT_KEY = 'tn_consent_accepted';

/**
 * First-visit consent gate covering the risk disclaimer, the Deriv disclosure
 * and how the OAuth token is handled. Blocking by design — the product places
 * real money trades, so the disclaimer has to be seen, not tucked in a footer.
 */
const ConsentGate = () => {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        try {
            if (localStorage.getItem(CONSENT_KEY) !== 'true') setOpen(true);
        } catch {
            // Blocked storage: show the gate rather than silently skipping it.
            setOpen(true);
        }
    }, []);

    if (!open) return null;

    const accept = () => {
        try {
            localStorage.setItem(CONSENT_KEY, 'true');
        } catch {
            /* the gate will simply show again next visit */
        }
        setOpen(false);
    };

    return (
        <div
            role='dialog'
            aria-modal='true'
            aria-labelledby='consent-title'
            className='fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm'
        >
            <div className='w-full max-w-lg rounded-2xl border border-line bg-ink-800 p-6 shadow-2xl'>
                <span className='flex h-11 w-11 items-center justify-center rounded-xl bg-fg text-on-fg'>
                    <ShieldCheck size={20} />
                </span>
                <h2 id='consent-title' className='mt-4 text-lg font-bold text-fg'>
                    Before you start
                </h2>

                <div className='mt-4 max-h-[45vh] space-y-3 overflow-y-auto pr-1 text-sm leading-relaxed text-mist-400'>
                    <p>
                        <strong className='text-mist-200'>{SITE.name} is an independent tool.</strong> It is not
                        affiliated with, or endorsed by, Deriv. It connects to your Deriv account through Deriv&apos;s
                        official API.
                    </p>
                    <p>
                        <strong className='text-mist-200'>Trading carries risk.</strong> Automated strategies can and do
                        lose money. Past performance says nothing about future results, and no bot here guarantees a
                        profit. Only trade funds you can afford to lose.
                    </p>
                    <p>
                        <strong className='text-mist-200'>You stay in control.</strong> Every bot runs against limits you
                        set — a stake, a profit target and a max loss — and stops itself when either boundary is hit. You
                        can stop it manually at any time.
                    </p>
                    <p>
                        <strong className='text-mist-200'>Your login stays with Deriv.</strong> Authentication happens on
                        Deriv&apos;s own domain. We never see your password — only a scoped access token, held in your
                        browser for the session.
                    </p>
                </div>

                <button type='button' onClick={accept} className='btn-solid mt-6 w-full'>
                    I understand and accept
                </button>
            </div>
        </div>
    );
};

export default ConsentGate;
