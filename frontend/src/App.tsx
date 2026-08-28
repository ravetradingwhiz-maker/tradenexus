import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAdminOptional } from '@/context/AdminContext';
import ConsentGate from '@/components/ConsentGate';
import InstallPrompt from '@/components/InstallPrompt';
import ScrollToTop from '@/components/ScrollToTop';
import Spinner from '@/components/Spinner';
import Home from '@/pages/Home';
import Pricing from '@/pages/Pricing';
import Callback from '@/pages/Callback';
import AppLayout from '@/pages/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Checkout from '@/pages/Checkout';
import AdminMarkup from '@/pages/admin/AdminMarkup';
import AdminSubscriptions from '@/pages/admin/AdminSubscriptions';
import AdminPayments from '@/pages/admin/AdminPayments';
import AdminPricing from '@/pages/admin/AdminPricing';
import AdminPaymentMethods from '@/pages/admin/AdminPaymentMethods';

/**
 * True when the URL carries an auth redirect payload — either an OAuth 2.0
 * code/state/error or legacy tokens (acct1/token1 or loginInfo).
 */
const isAuthRedirect = (search: string): boolean => {
    const params = new URLSearchParams(search);
    if (params.has('code') || params.has('state') || params.has('error')) return true;
    const haystack = `${search}${window.location.hash}`;
    return /(?:^|[?&#])(token1=|acct1=|loginInfo\[)/.test(haystack);
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) return <Navigate to='/' replace />;
    return <>{children}</>;
};

/** Gates the admin pages on admin eligibility (waits for the check to resolve). */
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    const admin = useAdminOptional();
    if (!admin || !admin.checked) {
        return (
            <div className='flex min-h-[50vh] items-center justify-center'>
                <Spinner />
            </div>
        );
    }
    if (!admin.eligible) return <Navigate to='/app' replace />;
    return <>{children}</>;
};

/**
 * Renders the auth callback handler the moment an auth redirect lands — on ANY
 * path — so the user never sees a page flash before being routed.
 */
const AppBody = () => {
    const location = useLocation();
    if (isAuthRedirect(location.search) || location.pathname === '/callback') {
        return <Callback />;
    }

    return (
        <Routes>
            <Route path='/' element={<Home />} />
            <Route path='/pricing' element={<Pricing />} />

            {/* The authenticated product: one scrollable page, plus checkout
                and the admin screens. */}
            <Route
                path='/app'
                element={
                    <ProtectedRoute>
                        <AppLayout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<Dashboard />} />
                <Route path='checkout' element={<Checkout />} />

                <Route
                    path='admin/markup'
                    element={
                        <AdminRoute>
                            <AdminMarkup />
                        </AdminRoute>
                    }
                />
                <Route
                    path='admin/subscriptions'
                    element={
                        <AdminRoute>
                            <AdminSubscriptions />
                        </AdminRoute>
                    }
                />
                <Route
                    path='admin/payments'
                    element={
                        <AdminRoute>
                            <AdminPayments />
                        </AdminRoute>
                    }
                />
                <Route
                    path='admin/pricing'
                    element={
                        <AdminRoute>
                            <AdminPricing />
                        </AdminRoute>
                    }
                />
                <Route
                    path='admin/payment-methods'
                    element={
                        <AdminRoute>
                            <AdminPaymentMethods />
                        </AdminRoute>
                    }
                />
            </Route>

            <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
    );
};

const App = () => (
    <ThemeProvider>
        <AuthProvider>
            <ConsentGate />
            <InstallPrompt appName='TradeNexus' />
            <BrowserRouter>
                <ScrollToTop />
                <AppBody />
            </BrowserRouter>
        </AuthProvider>
    </ThemeProvider>
);

export default App;
