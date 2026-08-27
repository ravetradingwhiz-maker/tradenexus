/**
 * Legacy-mode authentication utilities.
 *
 * Handles the "legacy" Deriv OAuth
 * flow where the redirect returns tokens directly in the URL
 * (acct1/token1/cur1 or loginInfo[n][token]) — as opposed to the OAuth 2.0
 * PKCE code flow handled by the services + useOAuthCallback hook.
 */
import Cookies from 'js-cookie';
import { authorizeToken, getLegacySocketURL, type DerivAuthorize } from '@/services/deriv-api';

export interface LoginInfo {
    token: string;
    loginid: string;
    currency: string;
}

/**
 * Parses login info from the URL. Accepts both the query string and the hash
 * fragment (Deriv's legacy redirect sometimes uses `#?token1=...`), and both
 * the `loginInfo[n][field]` and `token1/acct1/cur1` formats.
 */
export const parseLoginInfoFromUrl = (): LoginInfo[] => {
    const queryParams = new URLSearchParams(window.location.search);
    let hashParams: URLSearchParams | null = null;
    if (window.location.hash) {
        hashParams = new URLSearchParams(window.location.hash.replace(/^#\??/, ''));
    }

    const loginInfoMap: Record<number, Partial<LoginInfo>> = {};

    const readFromParams = (params: URLSearchParams) => {
        for (const [key, value] of params.entries()) {
            const bracketMatch = key.match(/loginInfo\[(\d+)\]\[(\w+)\]/);
            if (bracketMatch) {
                const index = parseInt(bracketMatch[1], 10);
                const field = bracketMatch[2] as keyof LoginInfo;
                if (!loginInfoMap[index]) loginInfoMap[index] = {};
                loginInfoMap[index][field] = value;
                continue;
            }

            const numberedMatch = key.match(/^(token|acct|cur)(\d+)$/);
            if (numberedMatch) {
                const [, prefix, indexStr] = numberedMatch;
                const index = parseInt(indexStr, 10);
                if (!loginInfoMap[index]) loginInfoMap[index] = {};
                if (prefix === 'token') loginInfoMap[index].token = value;
                else if (prefix === 'acct') loginInfoMap[index].loginid = value;
                else if (prefix === 'cur') loginInfoMap[index].currency = value;
            }
        }
    };

    readFromParams(queryParams);
    if (hashParams) readFromParams(hashParams);

    return Object.values(loginInfoMap)
        .filter((info): info is LoginInfo => Boolean(info.token && info.loginid))
        .map(info => ({ ...info, currency: info.currency || 'USD' }) as LoginInfo);
};

/**
 * Validates a legacy token by authorizing it against the standard Deriv WS.
 */
export const validateLegacyToken = async (
    token: string
): Promise<{ valid: boolean; authorize?: DerivAuthorize }> => {
    try {
        const { authorize, error } = await authorizeToken(token, getLegacySocketURL());
        if (error) {
            console.warn('[Auth] Token validation failed:', error.code, error.message);
            return { valid: false };
        }
        return { valid: true, authorize };
    } catch (error) {
        console.warn('[Auth] Token validation error:', error);
        return { valid: false };
    }
};

/**
 * Reads legacy login info from the URL, validates the first token, and stores
 * the resulting accounts in localStorage. Non-blocking: returns false on any
 * failure so the OAuth 2.0 path can take over.
 */
export const processLegacyLoginInfo = async (): Promise<boolean> => {
    try {
        const loginInfoArray = parseLoginInfoFromUrl();
        if (loginInfoArray.length === 0) return false;

        const { valid, authorize } = await validateLegacyToken(loginInfoArray[0].token);
        if (!valid) return false;

        const accountsList: Record<string, string> = {};
        const clientAccounts: Record<string, LoginInfo> = {};

        loginInfoArray.forEach(info => {
            accountsList[info.loginid] = info.token;
            clientAccounts[info.loginid] = info;
        });

        localStorage.setItem('accountsList', JSON.stringify(accountsList));
        localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
        // Default to the first REAL account so the header opens on real, not demo.
        const defaultInfo = loginInfoArray.find(i => !i.loginid.startsWith('VRT')) ?? loginInfoArray[0];
        localStorage.setItem('authToken', defaultInfo.token);
        localStorage.setItem('active_loginid', defaultInfo.loginid);

        if (authorize?.country && typeof authorize.country === 'string') {
            localStorage.setItem('client.country', authorize.country);
        }

        setLoggedStateCookie(true);

        // Clean up the loginInfo params from the URL.
        const cleaned = new URLSearchParams(window.location.search);
        for (const [key] of cleaned.entries()) {
            if (key.startsWith('loginInfo[') || /^(token|acct|cur)\d+$/.test(key)) cleaned.delete(key);
        }
        const newUrl = cleaned.toString()
            ? `${window.location.pathname}?${cleaned.toString()}`
            : window.location.pathname;
        window.history.replaceState({}, '', newUrl);

        return true;
    } catch (error) {
        console.warn('[Auth] Error processing legacy login info:', error);
        return false;
    }
};

/**
 * Sets the cross-subdomain `logged_state` cookie used to coordinate SSO/SLO.
 */
export const setLoggedStateCookie = (isLoggedIn: boolean): void => {
    const currentDomain = '.' + window.location.hostname.split('.').slice(-2).join('.');
    Cookies.set('logged_state', isLoggedIn ? 'true' : 'false', {
        domain: currentDomain,
        expires: 30,
        path: '/',
        secure: true,
        sameSite: 'None',
    });
};

/**
 * Clears all stored auth data from local/session storage and marks the user as
 * logged out. Optionally reloads the page.
 */
export const clearAuthData = (isReload: boolean = true): void => {
    localStorage.removeItem('accountsList');
    localStorage.removeItem('clientAccounts');
    localStorage.removeItem('callback_token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('active_loginid');
    localStorage.removeItem('account_type');
    localStorage.removeItem('client.accounts');
    localStorage.removeItem('client.country');
    sessionStorage.removeItem('auth_info');
    sessionStorage.removeItem('deriv_accounts');
    sessionStorage.removeItem('query_param_currency');
    sessionStorage.removeItem('__tn_admin'); // admin (fake-trade) session — exit on logout

    setLoggedStateCookie(false);

    if (isReload) location.reload();
};

/**
 * Handles an OAuth failure by clearing auth data and reloading to the logged
 * out view.
 */
export const handleOidcAuthFailure = (error: unknown): void => {
    console.error('[Auth] OAuth authentication failed:', error);
    clearAuthData(false);
    window.location.reload();
};
