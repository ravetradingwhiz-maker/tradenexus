import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets the scroll position on navigation.
 *
 * The dashboard is one long page, so without this a jump to checkout or an
 * admin screen lands you halfway down a page you have never seen. A hash link
 * is left alone — that navigation is asking for a specific spot.
 */
const ScrollToTop = () => {
    const { pathname, hash } = useLocation();

    useEffect(() => {
        if (hash) return;
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, [pathname, hash]);

    return null;
};

export default ScrollToTop;
