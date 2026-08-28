import { Outlet } from 'react-router-dom';
import BrandLogo from '@/components/BrandLogo';
import AccountSwitcher from '@/components/AccountSwitcher';
import AdminMenu from '@/components/AdminMenu';
import ThemeToggle from '@/components/ThemeToggle';
import Footer from '@/components/Footer';
import { AdminProvider } from '@/context/AdminContext';
import { PortfolioProvider } from '@/context/PortfolioContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';

/**
 * Authenticated shell.
 *
 * The providers live here rather than inside the dashboard so the portfolio
 * stream, subscription status and admin session all survive a trip to checkout
 * or an admin page and back.
 */
const AppLayout = () => (
    <SubscriptionProvider>
        <AdminProvider>
            <PortfolioProvider>
                <div className='flex min-h-screen flex-col bg-ink-900'>
                    <header className='sticky top-0 z-40 border-b border-line bg-ink-900/90 backdrop-blur'>
                        <div className='container-page flex h-16 items-center justify-between gap-3'>
                            <div className='flex items-center gap-2.5'>
                                <AdminMenu />
                                <BrandLogo to='/app' />
                            </div>
                            <div className='flex items-center gap-2'>
                                <ThemeToggle />
                                <AccountSwitcher />
                            </div>
                        </div>
                    </header>

                    <main className='flex-1'>
                        <Outlet />
                    </main>

                    <Footer />
                </div>
            </PortfolioProvider>
        </AdminProvider>
    </SubscriptionProvider>
);

export default AppLayout;
