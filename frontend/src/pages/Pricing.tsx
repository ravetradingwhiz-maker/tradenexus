import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PricingPlans from '@/components/PricingPlans';
import { useAuth } from '@/context/AuthContext';

/** Public pricing page. Selecting a plan logs the visitor in, then resumes. */
const Pricing = () => {
    const navigate = useNavigate();
    const { isAuthenticated, loginOAuth2 } = useAuth();

    const select = () => {
        if (isAuthenticated) {
            navigate('/app/checkout');
            return;
        }
        // Remember where they were heading so the callback can finish the trip.
        sessionStorage.setItem('post_login_redirect', '/app/checkout');
        void loginOAuth2();
    };

    return (
        <div className='min-h-screen bg-ink-900'>
            <Header />

            <section className='border-b border-line py-16 sm:py-20'>
                <div className='container-page'>
                    <h1 className='wordmark text-4xl text-fg sm:text-5xl'>One price. One year.</h1>
                    <p className='mt-4 max-w-2xl text-lg text-mist-400'>
                        Two of the three bots are free, forever, with a real Deriv account. Pay once to add the four Pro
                        bots for a full year — no subscriptions to cancel, no card kept on file.
                    </p>

                    <div className='mt-12'>
                        <PricingPlans onSelect={select} />
                    </div>

                    <p className='mt-8 text-sm text-mist-500'>
                        Pay by card, M-Pesa, or any of nine coins — USDT, BTC, ETH, SOL, LTC, XRP, BNB or USDC.
                        Access unlocks on every login of your Deriv account, on every device. Prepaid and
                        non-refundable once activated.
                    </p>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default Pricing;
