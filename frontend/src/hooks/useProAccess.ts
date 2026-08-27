import { useAdminOptional } from '@/context/AdminContext';
import { useSubscriptionOptional } from '@/context/SubscriptionContext';

export interface ProAccess {
    /** True when Nexus Bot Pro should be usable. */
    hasPro: boolean;
    /** How access was granted — drives the badge and hides the upsell. */
    via: 'subscription' | 'admin' | null;
    /** Only meaningful for a paid subscription. */
    expiresAt?: string;
}

/**
 * The single answer to "can this account run Pro?".
 *
 * Two ways in: a paid subscription, or being on the admin allow-list. Admins
 * get everything without paying — they are the people running the platform, and
 * they need to be able to exercise the paid bot to support it.
 *
 * Every Pro gate reads this, so the bot, the dashboard badge and the upsell can
 * never disagree about who is allowed in.
 */
export const useProAccess = (): ProAccess => {
    const subscription = useSubscriptionOptional();
    const admin = useAdminOptional();

    // The admin check resolves asynchronously; `eligible` is only true once it
    // has come back positive, so this never flashes access open and shut.
    if (admin?.eligible) return { hasPro: true, via: 'admin' };
    if (subscription?.active) {
        return { hasPro: true, via: 'subscription', expiresAt: subscription.expiresAt };
    }
    return { hasPro: false, via: null };
};
