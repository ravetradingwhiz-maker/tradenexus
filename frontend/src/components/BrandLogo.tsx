import { useRef } from 'react';
import { Link } from 'react-router-dom';
import SITE from '@/config/site';
import { useAdminOptional } from '@/context/AdminContext';

/**
 * The TradeNexus wordmark: a solid monogram tile plus the name. The tile uses
 * the inverted surface (`bg-fg` / `text-on-fg`), so it reads as the strongest
 * mark on the page in either theme.
 *
 * Hidden control: triple-click the logo to exit admin mode (a no-op with normal
 * navigation otherwise).
 */
const BrandLogo = ({ to = '/', compact = false }: { to?: string; compact?: boolean }) => {
    const admin = useAdminOptional();
    const clicksRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const onLogoClick = (e: React.MouseEvent) => {
        if (!admin?.active) return; // normal navigation unless admin mode is on
        e.preventDefault();
        clicksRef.current += 1;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (clicksRef.current >= 3) {
            clicksRef.current = 0;
            admin.exit();
        } else {
            timerRef.current = setTimeout(() => {
                clicksRef.current = 0;
            }, 2000);
        }
    };

    return (
        <Link to={to} onClick={onLogoClick} className='group flex items-center gap-2.5' aria-label={`${SITE.name} home`}>
            <span className='flex h-8 w-8 items-center justify-center rounded-lg bg-fg text-on-fg transition-transform group-hover:scale-105'>
                <svg viewBox='0 0 24 24' width='16' height='16' aria-hidden='true' fill='currentColor'>
                    <path d='M4 19V5h2.6l8.4 8.6V5H18v14h-2.6L7 10.4V19z' />
                </svg>
            </span>
            {!compact && (
                <span className='wordmark text-[17px] leading-none text-fg'>
                    Trade<span className='text-mist-400'>Nexus</span>
                </span>
            )}
        </Link>
    );
};

export default BrandLogo;
