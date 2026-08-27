import { lazy, Suspense } from 'react';

/**
 * Deriv's own currency icons, lazily loaded one at a time so the whole icon
 * pack never lands in the bundle.
 *
 * Virtual accounts get Deriv's demo mark, which is how a demo account is
 * signalled everywhere in Deriv's own apps — worth matching, because mistaking
 * a demo balance for a real one is an expensive misread.
 */
const CURRENCY_ICONS = {
    aud: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyAudIcon }))),
    bch: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyBchIcon }))),
    btc: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyBtcIcon }))),
    busd: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyBusdIcon }))),
    dai: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyDaiIcon }))),
    eth: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyEthIcon }))),
    eur: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyEurIcon }))),
    eurs: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyEursIcon }))),
    eusdt: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyUsdtIcon }))),
    gbp: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyGbpIcon }))),
    ltc: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyLtcIcon }))),
    tusdt: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyUsdtIcon }))),
    unknown: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyPlaceholderIcon }))),
    usd: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyUsdIcon }))),
    usdc: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyUsdcIcon }))),
    ust: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyUsdtIcon }))),
    virtual: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyDemoIcon }))),
    xrp: lazy(() => import('@deriv/quill-icons/Currencies').then(m => ({ default: m.CurrencyXrpIcon }))),
} as const;

export interface CurrencyIconProps {
    currency?: string;
    isVirtual?: boolean;
    iconSize?: 'xs' | 'sm' | 'md' | 'lg';
}

const CurrencyIcon = ({ currency, isVirtual, iconSize = 'sm' }: CurrencyIconProps) => {
    const Icon = isVirtual
        ? CURRENCY_ICONS.virtual
        : CURRENCY_ICONS[currency?.toLowerCase() as keyof typeof CURRENCY_ICONS] || CURRENCY_ICONS.unknown;

    return (
        // A null fallback keeps the row from jumping while the chunk loads —
        // the surrounding box is already the right size.
        <Suspense fallback={null}>
            <Icon iconSize={iconSize} />
        </Suspense>
    );
};

export default CurrencyIcon;
