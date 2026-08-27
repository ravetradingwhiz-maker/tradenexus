import { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';

/**
 * Admin simulation setup. When the logged-in account is allow-listed and the
 * mode is not active yet, this pops so the admin can set a simulated balance.
 * While it is on, the bots place no real orders — outcomes are simulated
 * against Deriv's real proposal payouts.
 */
const AdminPanel = () => {
    const { eligible, needsSetup, currency, activate, dismissSetup } = useAdmin();
    const [open, setOpen] = useState(false);
    const [amount, setAmount] = useState(1000);

    useEffect(() => {
        if (needsSetup) setOpen(true);
    }, [needsSetup]);

    if (!eligible || !open) return null;

    const valid = Number.isFinite(amount) && amount > 0;

    const close = () => {
        setOpen(false);
        dismissSetup();
    };

    return (
        <div
            role='dialog'
            aria-modal='true'
            aria-labelledby='admin-sim-title'
            className='fixed inset-0 z-[60] flex items-center justify-center p-4'
        >
            <div className='absolute inset-0 bg-black/75' onClick={close} />
            <div className='relative w-full max-w-sm rounded-2xl border border-line bg-ink-800 p-6 shadow-2xl'>
                <button
                    type='button'
                    aria-label='Close — stay in normal mode'
                    onClick={close}
                    className='absolute right-4 top-4 text-mist-400 transition-colors hover:text-fg'
                >
                    <X size={18} />
                </button>

                <span className='flex h-11 w-11 items-center justify-center rounded-xl bg-fg text-on-fg'>
                    <ShieldCheck size={20} />
                </span>
                <h2 id='admin-sim-title' className='mt-4 text-lg font-bold text-fg'>
                    Simulation mode
                </h2>
                <p className='mt-1 text-sm text-mist-400'>
                    The bots will place no real orders. Outcomes are simulated against Deriv&apos;s live proposal
                    payouts, drawn from the balance you set here.
                </p>

                <label className='mt-5 flex flex-col gap-1.5'>
                    <span className='label'>Simulated balance</span>
                    <div className='flex items-center rounded-xl border border-line bg-ink-700 px-3.5'>
                        <input
                            type='number'
                            min={1}
                            step='any'
                            value={Number.isFinite(amount) ? amount : ''}
                            onChange={e => setAmount(parseFloat(e.target.value))}
                            className='w-full bg-transparent py-2.5 font-mono text-sm font-semibold text-fg outline-none'
                        />
                        <span className='pl-2 text-xs font-medium text-mist-500'>{currency}</span>
                    </div>
                </label>

                <div className='mt-5 flex gap-2'>
                    <button type='button' onClick={close} className='btn-ghost flex-1'>
                        Not now
                    </button>
                    <button
                        type='button'
                        disabled={!valid}
                        onClick={() => {
                            activate(amount);
                            setOpen(false);
                        }}
                        className='btn-solid flex-1'
                    >
                        Start
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
