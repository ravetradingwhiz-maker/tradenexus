import { useEffect, useState } from 'react';

/** True when the viewport is desktop-width (>= 768px). */
export const useIsDesktop = (): boolean => {
    const [isDesktop, setIsDesktop] = useState(() =>
        typeof window === 'undefined' ? true : window.innerWidth >= 768
    );
    useEffect(() => {
        const onResize = () => setIsDesktop(window.innerWidth >= 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    return isDesktop;
};
