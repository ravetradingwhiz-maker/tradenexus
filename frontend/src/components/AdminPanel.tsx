import { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';

/**
 * Activation dialog for the allow-listed admin session. While the session is
 * on, the engine places no real orders and settles against Deriv's real
 * proposal payouts, drawn from the balance entered here.
 *
 * The on-screen wording is deliberately plain: once active, nothing anywhere in
 * the interface indicates the mode is on.
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
                    Set balance
                </h2>
                <p className='mt-1 text-sm text-mist-400'>
                    Enter the balance this session should run against.
                </p>

                <label className='mt-5 flex flex-col gap-1.5'>
                    <span className='label'>Balance</span>
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
