/**
 * Deriv platform endpoints.
 *
 * Mirrors the brand.config.json shape the ported Deriv auth services expect
 * (auth2_url, derivws.url, directories) so they can be used unchanged.
 */
export const brandConfig = {
    brand_name: 'TradeNexus',
    brand_domain: 'https://derivbot.app',
    platform: {
        name: 'TradeNexus',
        // OAuth 2.0 (PKCE) authorization server — production only.
        auth2_url: {
            production: 'https://auth.deriv.com/oauth2/',
        },
        // DerivWS REST gateway used by the OAuth2 flow (accounts + OTP -> WS url).
        derivws: {
            url: {
                production: 'https://api.derivws.com/trading/v1/',
            },
            directories: {
                options: 'options/',
                derivatives: 'derivatives/',
            },
        },
    },
} as const;

export default brandConfig;
