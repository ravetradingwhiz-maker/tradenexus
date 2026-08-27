import { useState } from 'react';
import NexusRobot from '@/components/NexusRobot';

/**
 * The hero visual.
 *
 * Drop your own artwork at `frontend/public/hero-robot.png` and it is used as
 * is — no code change needed. Until that file exists (or if it fails to load)
 * the drawn figure stands in, so the hero is never a broken image.
 *
 * Sizing comes entirely from the caller so the artwork and the drawn fallback
 * occupy the same box either way.
 */
const HERO_IMAGE = '/hero-robot.png';

const HeroFigure = ({ className = '' }: { className?: string }) => {
    const [failed, setFailed] = useState(false);

    if (failed) return <NexusRobot className={className} />;

    return (
        <img
            src={HERO_IMAGE}
            alt='Nexus AI'
            onError={() => setFailed(true)}
            className={className}
            // The hero is the first thing painted, so this one image is worth
            // fetching eagerly rather than lazily.
            loading='eager'
            decoding='async'
        />
    );
};

export default HeroFigure;
