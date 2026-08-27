import { LogIn } from 'lucide-react';
import { Link } from 'react-router-dom';
import BrandLogo from '@/components/BrandLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth } from '@/context/AuthContext';

/** Public site header. Authenticated visitors get a link straight to the app. */
const Header = () => {
    const { isAuthenticated, loginOAuth2 } = useAuth();

    return (
        <header className='sticky top-0 z-40 border-b border-line bg-ink-900/85 backdrop-blur'>
            <div className='container-page flex h-16 items-center justify-between gap-4'>
                <BrandLogo />

                <nav aria-label='Main' className='hidden items-center gap-7 md:flex'>
                    <a href='#bots' className='text-sm font-medium text-mist-400 transition-colors hover:text-fg'>
                        AI Bots
                    </a>
                    <a href='#strategies' className='text-sm font-medium text-mist-400 transition-colors hover:text-fg'>
                        Strategies
                    </a>
                    <Link to='/pricing' className='text-sm font-medium text-mist-400 transition-colors hover:text-fg'>
                        Pricing
                    </Link>
                    <a href='#faq' className='text-sm font-medium text-mist-400 transition-colors hover:text-fg'>
                        FAQ
                    </a>
                </nav>

                <div className='flex items-center gap-2'>
                    <ThemeToggle />
                    {isAuthenticated ? (
                        <Link to='/app' className='btn-solid btn-sm'>
                            Open app
                        </Link>
                    ) : (
                        <button type='button' onClick={loginOAuth2} className='btn-solid btn-sm'>
                            <LogIn size={14} /> Log in
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
