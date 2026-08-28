import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAdminOptional } from '@/context/AdminContext';
import CurrencyIcon from '@/components/CurrencyIcon';

const fmt = (n: number | null, currency: string | null): string =>
    n == null
        ? '—'
        : `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency ?? ''}`.trim();

/**
 * Real accounts get their currency icon; demo accounts get Deriv's demo mark
 * plus a DEMO flag. Nothing here is decorative — the bots refuse to trade from
 * a demo account, so which kind is active has to be unmistakable.
 */
const AccountBadge = ({ isDemo, currency }: { isDemo: boolean; currency?: string }) => (
    <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-700'>
        <CurrencyIcon currency={currency} isVirtual={isDemo} iconSize='sm' />
    </span>
);

const AccountSwitcher = () => {
    const { accounts, activeLoginId, balance, balanceCurrency, balances, switchAccount, logout } = useAuth();
    const admin = useAdminOptional();
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const active = accounts.find(a => a.loginid === activeLoginId);

    // The header shows whichever balance the engine is actually spending. It is
    // presented identically either way — the chrome never announces the mode.
    const showBalance = admin?.active ? admin.fakeBalance : balance;
    const showCurrency = admin?.active ? admin.adminCurrency : balanceCurrency;

    const real = accounts.filter(a => !a.is_demo);
    const demo = accounts.filter(a => a.is_demo);

    const row = (loginid: string, currency: string, isDemo: boolean) => {
        const b = balances[loginid];
        const isActive = loginid === activeLoginId;
        return (
            <button
                key={loginid}
                type='button'
                onClick={() => {
                    switchAccount(loginid);
                    setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                    isActive ? 'bg-ink-600' : 'hover:bg-ink-700'
                }`}
            >
                <AccountBadge isDemo={isDemo} currency={currency} />

                <span className='min-w-0 flex-1'>
                    <span className='flex items-center gap-1.5'>
                        <span className='truncate font-mono text-xs font-semibold text-fg'>{loginid}</span>
                        <span
                            className={`rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.1em] ${
                                isDemo ? 'bg-ink-500 text-mist-300' : 'bg-fg text-on-fg'
                            }`}
                        >
                            {isDemo ? 'Demo' : 'Real'}
                        </span>
                    </span>
                    <span className='mt-0.5 block text-[11px] text-mist-500'>{currency}</span>
                </span>

                <span className='flex shrink-0 items-center gap-2'>
                    <span className={`font-mono text-xs font-bold ${b ? 'text-gain' : 'text-mist-400'}`}>
                        {b ? fmt(b.balance, b.currency) : '—'}
                    </span>
                    {isActive && <Check size={14} className='text-fg' />}
                </span>
            </button>
        );
    };

    return (
        <div ref={boxRef} className='relative'>
            <button
                type='button'
                onClick={() => setOpen(o => !o)}
                aria-haspopup='menu'
                aria-expanded={open}
                className='flex items-center gap-2 rounded-lg border border-line bg-ink-800 py-1.5 pl-1.5 pr-2 transition-colors hover:border-line-strong'
            >
                {active && <AccountBadge isDemo={active.is_demo} currency={active.currency} />}

                <span className='flex flex-col items-end leading-none'>
                    <span className={`font-mono text-xs font-bold ${showBalance == null ? 'text-mist-400' : 'text-gain'}`}>
                        {fmt(showBalance, showCurrency)}
                    </span>
                    <span className='mt-0.5 flex items-center gap-1 text-[10px] text-mist-500'>
                        {active?.loginid ?? 'Account'}
                        {active && (
                            <span
                                className={`rounded px-1 py-px text-[8px] font-bold uppercase tracking-[0.1em] ${
                                    active.is_demo ? 'bg-ink-500 text-mist-300' : 'bg-fg text-on-fg'
                                }`}
                            >
                                {active.is_demo ? 'Demo' : 'Real'}
                            </span>
                        )}
                    </span>
                </span>

                <ChevronDown size={14} className={`text-mist-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div
                    role='menu'
                    className='absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-ink-800 shadow-2xl'
                >
                    {real.length > 0 && (
                        <>
                            <div className='px-3 pb-1 pt-3 label'>Real</div>
                            {real.map(a => row(a.loginid, a.currency, false))}
                        </>
                    )}
                    {demo.length > 0 && (
                        <>
                            <div className='px-3 pb-1 pt-3 label'>Demo</div>
                            {demo.map(a => row(a.loginid, a.currency, true))}
                        </>
                    )}
                    <button
                        type='button'
                        onClick={logout}
                        className='flex w-full items-center gap-2 border-t border-line px-3 py-3 text-left text-xs font-semibold text-mist-300 transition-colors hover:bg-ink-700 hover:text-fg'
                    >
                        <LogOut size={14} /> Log out
                    </button>
                </div>
            )}
        </div>
    );
};

export default AccountSwitcher;
