import { useState } from 'react';
import type { CryptoAssetId } from '@/services/payments-api';

/**
 * Brand coin marks, served from jsDelivr — the same source live-deriv uses.
 *
 * These are the one place colour is allowed back into the monochrome system:
 * a buyer about to send real money identifies the coin by its mark before they
 * read the ticker, and a wrong-chain transfer is unrecoverable.
 */
const SLUG: Record<CryptoAssetId, string> = {
    usdt_trc20: 'usdt',
    usdt_erc20: 'usdt',
    btc: 'btc',
    eth: 'eth',
    sol: 'sol',
    ltc: 'ltc',
    xrp: 'xrp',
    bnb: 'bnb',
    usdc_bep20: 'usdc',
};

const CDN = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color';

export interface CoinIconProps {
    asset: CryptoAssetId;
    ticker: string;
    size?: number;
}

const CoinIcon = ({ asset, ticker, size = 28 }: CoinIconProps) => {
    const [failed, setFailed] = useState(false);
    const slug = SLUG[asset];

    // If the CDN is blocked or the mark is missing, fall back to the ticker
    // monogram rather than an empty box — the tile stays readable either way.
    if (failed || !slug) {
        return (
            <span
                className='flex shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[9px] font-bold text-mist-300'
                style={{ width: size, height: size }}
            >
                {ticker.slice(0, 4)}
            </span>
        );
    }

    return (
        <img
            src={`${CDN}/${slug}.png`}
            alt=''
            aria-hidden='true'
            width={size}
            height={size}
            loading='lazy'
            onError={() => setFailed(true)}
            className='shrink-0 rounded-full'
            style={{ width: size, height: size }}
        />
    );
};

export default CoinIcon;
