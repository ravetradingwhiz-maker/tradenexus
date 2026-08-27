/**
 * Lightweight Deriv API helpers.
 *
 * Instead of pulling in the
 * heavy @deriv/deriv-api package, we talk to the Deriv WebSocket directly for
 * the few request/response calls we need (authorize, balance).
 */

export const getLegacyAppId = (): string => {
    const envAppId = process.env.APP_ID;
    if (envAppId) return String(envAppId).replace(/[^a-zA-Z0-9]/g, '');
    // Fallback app id (Deriv's generic bot app id) so the WS still connects.
    return '36300';
};

export const getLegacySocketURL = (): string => {
    const appId = getLegacyAppId();
    return `wss://ws.derivws.com/websockets/v3?app_id=${appId}&l=EN&brand=deriv`;
};

export const getLoginId = (): string | null => {
    const loginId = localStorage.getItem('active_loginid');
    if (loginId && loginId !== 'null') return loginId;
    return null;
};

export const getActiveToken = (): string | null => {
    const token = localStorage.getItem('authToken');
    if (token && token !== 'null') return token;
    return null;
};

export const getToken = (): { token?: string; account_id?: string } => {
    const activeLoginId = getLoginId();
    let accountsList: Record<string, string> | undefined;
    try {
        accountsList = JSON.parse(localStorage.getItem('accountsList') ?? 'null') ?? undefined;
    } catch {
        accountsList = undefined;
    }
    const token = (activeLoginId && accountsList?.[activeLoginId]) || undefined;
    return { token, account_id: activeLoginId ?? undefined };
};

// =============================================================================
// Minimal request/response WebSocket client
// =============================================================================

export interface DerivAuthorize {
    loginid?: string;
    currency?: string;
    balance?: number;
    country?: string;
    email?: string;
    fullname?: string;
    account_list?: Array<{ loginid: string; currency?: string; is_virtual?: number }>;
    [key: string]: unknown;
}

interface DerivResponse {
    msg_type?: string;
    error?: { code: string; message: string };
    authorize?: DerivAuthorize;
    balance?: { balance: number; currency: string; loginid: string };
    [key: string]: unknown;
}

/**
 * Opens a socket, sends a single request, resolves with the first matching
 * response, then closes. Used for one-shot calls like authorize.
 */
const requestOnce = (url: string, request: Record<string, unknown>, timeoutMs = 10_000): Promise<DerivResponse> =>
    new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        const timer = setTimeout(() => {
            try {
                socket.close();
            } catch {
                /* noop */
            }
            reject(new Error('WS request timeout'));
        }, timeoutMs);

        socket.addEventListener('open', () => socket.send(JSON.stringify(request)));
        socket.addEventListener('message', event => {
            clearTimeout(timer);
            let data: DerivResponse = {};
            try {
                data = JSON.parse(event.data);
            } catch {
                /* ignore parse errors */
            }
            try {
                socket.close();
            } catch {
                /* noop */
            }
            resolve(data);
        });
        socket.addEventListener('error', err => {
            clearTimeout(timer);
            reject(err);
        });
    });

/**
 * Authorizes a token against a given WebSocket URL (defaults to the legacy WS).
 */
export const authorizeToken = async (token: string, url: string = getLegacySocketURL()): Promise<DerivResponse> => {
    return requestOnce(url, { authorize: token });
};
