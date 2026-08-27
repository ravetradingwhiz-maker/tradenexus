import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, CreditCard, Menu, ShieldCheck, Tag, Users, Wallet, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAdminOptional } from '@/context/AdminContext';

interface AdminPage {
    to: string;
    label: string;
    icon: LucideIcon;
}

export const ADMIN_PAGES: AdminPage[] = [
    { to: '/app/admin/markup', label: 'Markup', icon: BarChart3 },
    { to: '/app/admin/subscriptions', label: 'Subscriptions', icon: Users },
    { to: '/app/admin/payments', label: 'Payments', icon: CreditCard },
    { to: '/app/admin/pricing', label: 'Pricing', icon: Tag },
    { to: '/app/admin/payment-methods', label: 'Payment methods', icon: Wallet },
];

/** Admin-only drawer in the app header. Hidden entirely for non-admins. */
const AdminMenu = () => {
    const admin = useAdminOptional();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    if (!admin?.eligible) return null;

    return (
        <>
            <button
                type='button'
                aria-label={open ? 'Close admin menu' : 'Open admin menu'}
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                className='flex h-9 w-9 items-center justify-center rounded-lg border border-line text-mist-300 transition-colors hover:border-line-strong hover:text-fg'
            >
                {open ? <X size={16} /> : <Menu size={16} />}
            </button>

            {open && (
                <>
                    <div
                        className='fixed inset-0 top-16 z-40 bg-black/70'
                        onClick={() => setOpen(false)}
                        aria-hidden='true'
                    />
                    <aside className='fixed left-0 top-16 z-50 h-[calc(100dvh-4rem)] w-72 overflow-y-auto border-r border-line bg-ink-800 p-4'>
                        <div className='flex items-center gap-2 px-1 pb-3'>
                            <ShieldCheck size={15} className='text-fg' />
                            <span className='label'>Admin</span>
                        </div>

                        <nav className='flex flex-col gap-1'>
                            {ADMIN_PAGES.map(page => (
                                <NavLink
                                    key={page.to}
                                    to={page.to}
                                    onClick={() => setOpen(false)}
                                    className={({ isActive }) =>
                                        `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                                            isActive ? 'bg-fg text-on-fg' : 'text-mist-300 hover:bg-ink-700 hover:text-fg'
                                        }`
                                    }
                                >
                                    <page.icon size={16} />
                                    {page.label}
                                </NavLink>
                            ))}
                        </nav>

                        <NavLink
                            to='/app'
                            onClick={() => setOpen(false)}
                            className='mt-4 block rounded-lg border border-line px-3 py-2.5 text-center text-xs font-semibold text-mist-300 transition-colors hover:border-line-strong hover:text-fg'
                        >
                            Back to the bots
                        </NavLink>
                    </aside>
                </>
            )}
        </>
    );
};

export default AdminMenu;
