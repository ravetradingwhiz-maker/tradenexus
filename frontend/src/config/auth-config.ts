/**
 * Authentication configuration & helpers.
 *
 * Provides:
 *  - environment helpers (isProduction / isLocal)
 *  - PKCE code-verifier / code-challenge generation + storage
 *  - CSRF (state) token generation + validation
 *  - generateOAuthURL() for the OAuth 2.0 (PKCE) flow
 *  - getSocketURL() which picks the right WebSocket URL for the active auth mode
 */
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { getLegacySocketURL } from '@/services/deriv-api';
import brandConfig from '@/config/brand';

// =============================================================================
// Environment helpers
// =============================================================================

export const isLocal = (): boolean => /localhost(:\d+)?$/i.test(window.location.hostname);

// Always use production Deriv endpoints (auth.deriv.com, api.derivws.com),
// even on localhost — the Deriv sandbox is not used by this app.
export const isProduction = (): boolean => true;

const toWss = (httpUrl: string) => httpUrl.replace(/^http/i, 'ws');

const getDefaultServerURL = (): string =>
    `${toWss(brandConfig.platform.derivws.url.production)}options/ws/public`;

// =============================================================================
// WebSocket URL resolution
// =============================================================================

/**
 * Resolves the WebSocket URL for the active authentication mode:
 *  1. OAuth 2.0 (PKCE): exchange access token -> OTP-authenticated WS url.
 *  2. Legacy: a stored authToken -> standard Deriv WS (authorize with token).
 *  3. Neither: the public default server.
 */
export const getSocketURL = async (): Promise<string> => {
    try {
        const authInfo = OAuthTokenExchangeService.getAuthInfo();
        if (authInfo?.access_token) {
            return await DerivWSAccountsService.getAuthenticatedWebSocketURL(authInfo.access_token);
        }

        const legacyToken = localStorage.getItem('authToken');
        if (legacyToken && legacyToken !== 'null') {
            return getLegacySocketURL();
        }

        return getDefaultServerURL();
    } catch (error) {
        console.error('[Auth] Error in getSocketURL:', error);
        return getDefaultServerURL();
    }
};

// =============================================================================
// PKCE + CSRF primitives
// =============================================================================

const toBase64Url = (bytes: Uint8Array): string => {
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const generateCSRFToken = (): string => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return toBase64Url(array);
};

const generateCodeVerifier = (): string => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return toBase64Url(array);
};

const generateCodeChallenge = async (verifier: string): Promise<string> => {
    const data = new TextEncoder().encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return toBase64Url(new Uint8Array(hashBuffer));
};

const TEN_MINUTES = 600_000;

const storeCodeVerifier = (verifier: string): void => {
    sessionStorage.setItem('oauth_code_verifier', verifier);
    sessionStorage.setItem('oauth_code_verifier_timestamp', Date.now().toString());
};

export const getCodeVerifier = (): string | null => {
    const verifier = sessionStorage.getItem('oauth_code_verifier');
    const timestamp = sessionStorage.getItem('oauth_code_verifier_timestamp');
    if (!verifier || !timestamp) return null;

    if (Date.now() - parseInt(timestamp, 10) > TEN_MINUTES) {
        clearCodeVerifier();
        return null;
    }
    return verifier;
};

export const clearCodeVerifier = (): void => {
    sessionStorage.removeItem('oauth_code_verifier');
    sessionStorage.removeItem('oauth_code_verifier_timestamp');
};

const storeCSRFToken = (token: string): void => {
    sessionStorage.setItem('oauth_csrf_token', token);
    sessionStorage.setItem('oauth_csrf_token_timestamp', Date.now().toString());
};

export const validateCSRFToken = (token: string): boolean => {
    const storedToken = sessionStorage.getItem('oauth_csrf_token');
    const timestamp = sessionStorage.getItem('oauth_csrf_token_timestamp');
    if (!storedToken || !timestamp) return false;
    if (storedToken !== token) return false;
    if (Date.now() - parseInt(timestamp, 10) > TEN_MINUTES) {
        clearCSRFToken();
        return false;
    }
    return true;
};

export const clearCSRFToken = (): void => {
    sessionStorage.removeItem('oauth_csrf_token');
    sessionStorage.removeItem('oauth_csrf_token_timestamp');
};

// =============================================================================
// OAuth 2.0 authorization URL (PKCE)
// =============================================================================

/**
 * The OAuth redirect URI: the BARE origin (no path) unless
 * REDIRECT_URL is explicitly set. This must be identical in the authorize
 * request and the token exchange, and must match a URL registered on Deriv.
 */
export const getRedirectURL = (): string =>
    process.env.REDIRECT_URL || `${window.location.protocol}//${window.location.host}`;

/**
 * Builds the OAuth 2.0 (PKCE) authorization URL. Generates and stores the CSRF
 * state token and the PKCE code verifier so the callback can complete the flow.
 *
 * @param prompt - optional, e.g. 'registration' to send users to sign-up.
 */
export const generateOAuthURL = async (prompt?: string): Promise<string> => {
    try {
        const hostname = brandConfig.platform.auth2_url.production;
        const clientId = process.env.CLIENT_ID;

        if (!hostname || !clientId) {
            console.error('[Auth] Missing CLIENT_ID or auth2_url — cannot build OAuth URL.');
            return '';
        }

        const csrfToken = generateCSRFToken();
        storeCSRFToken(csrfToken);

        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        storeCodeVerifier(codeVerifier);

        const redirectUrl = getRedirectURL();
        const scopes = 'trade';

        let oauthUrl =
            `${hostname}auth?scope=${scopes}` +
            `&response_type=code` +
            `&client_id=${encodeURIComponent(clientId)}` +
            `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
            `&state=${csrfToken}` +
            `&code_challenge=${codeChallenge}` +
            `&code_challenge_method=S256`;

        if (prompt) oauthUrl += `&prompt=${encodeURIComponent(prompt)}`;

        const appId = process.env.APP_ID;
        if (appId) oauthUrl += `&app_id=${encodeURIComponent(appId)}`;

        
        return oauthUrl;
    } catch (error) {
        console.error('[Auth] Error generating OAuth URL:', error);
        return '';
    }
};

/**
 * Builds the legacy OAuth authorization URL (returns tokens directly in the
 * redirect: acct1/token1/cur1). Uses the legacy app_id.
 */
export const generateLegacyOAuthURL = (): string => {
    const appId = process.env.APP_ID || '';
    const redirect = encodeURIComponent(getRedirectURL());
    return `https://oauth.deriv.com/oauth2/authorize?app_id=${encodeURIComponent(appId)}&l=EN&brand=deriv&redirect_uri=${redirect}`;
};
