/**
 * Legacy-mode balance streaming.
 *
 * For OAuth 2.0 we poll the REST accounts endpoint (it already includes
 * per-account balances) — see AuthContext. For legacy mode we open the standard
 * Deriv WS, authorize the token, and subscribe to balances for ALL accounts at
 * once (`account: 'all'`), so switching accounts is instant.
 */
import { getActiveToken, getLegacySocketURL } from '@/services/deriv-api';

export interface AccountBalance {
    balance: number;
    currency: string;
}

export type BalanceMap = Record<string, AccountBalance>;

export interface BalanceStreamHandle {
    close: () => void;
}

interface StreamCallbacks {
    onBalances: (balances: BalanceMap) => void;
    onError?: (error: { code: string; message: string }) => void;
}

/**
 * Opens the legacy WS, authorizes the stored token, and subscribes to all
 * account balances. Returns a handle to close the stream.
 */
export const streamLegacyBalances = ({ onBalances, onError }: StreamCallbacks): BalanceStreamHandle => {
    const token = getActiveToken();
    const socket = new WebSocket(getLegacySocketURL());
    let closed = false;

    const send = (payload: Record<string, unknown>) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    };

    socket.addEventListener('open', () => {
        if (token) send({ authorize: token });
        else send({ balance: 1, subscribe: 1, account: 'all' });
    });

    socket.addEventListener('message', event => {
        let data: Record<string, any> = {};
        try {
            data = JSON.parse(event.data);
        } catch {
            return;
        }

        if (data.error) {
            onError?.(data.error);
            return;
        }

        if (data.msg_type === 'authorize') {
            send({ balance: 1, subscribe: 1, account: 'all' });
        } else if (data.msg_type === 'balance' && data.balance) {
            const b = data.balance;
            const map: BalanceMap = {};
            if (b.accounts && typeof b.accounts === 'object') {
                for (const [loginid, acc] of Object.entries<any>(b.accounts)) {
                    map[loginid] = { balance: Number(acc.balance), currency: acc.currency };
                }
            } else if (b.loginid) {
                map[b.loginid] = { balance: Number(b.balance), currency: b.currency };
            }
            if (Object.keys(map).length) onBalances(map);
        }
    });

    socket.addEventListener('error', () => onError?.({ code: 'WSError', message: 'WebSocket connection error' }));

    return {
        close: () => {
            if (closed) return;
            closed = true;
            try {
                send({ forget_all: 'balance' });
                socket.close();
            } catch {
                /* noop */
            }
        },
    };
};
