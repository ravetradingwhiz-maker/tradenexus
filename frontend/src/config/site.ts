/**
 * Public site identity. Every user-visible name, URL and legal string lives
 * here so a rebrand or a domain change is a one-file edit.
 */
export const SITE = {
    name: 'TradeNexus',
    tagline: 'Automated Deriv trading, in black and white.',
    /** Canonical origin (no trailing slash). Overridable at build time. */
    url: (process.env.SITE_URL || 'https://derivbot.app').replace(/\/$/, ''),
    supportEmail: 'support@derivbot.app',
    bots: {
        basic: 'Nexus Bot Basic',
        recovery: 'Nexus Bot Recovery',
        pro: 'Nexus Bot Pro',
    },
} as const;

export default SITE;
