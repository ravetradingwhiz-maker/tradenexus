/**
 * Minimal Deriv WebSocket manager for trading: one-shot requests + streaming
 * subscriptions with forget, over a single shared connection.
 *
 * Connection URL comes from getSocketURL() (OAuth2 OTP socket or legacy WS).
 * For legacy it authorizes the stored token on open; the OAuth2 OTP socket is
 * already authenticated. Requests are matched by req_id.
 */
import { getSocketURL } from '@/config/auth-config';
import { getActiveToken } from '@/services/deriv-api';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';

type Listener = (data: any) => void;

export interface Subscription {
    forget: () => void;
}

class TradeWS {
    private socket: WebSocket | null = null;
    private ready: Promise<void> | null = null;
    private reqId = 0;
    private pending = new Map<number, { resolve: (d: any) => void; reject: (e: any) => void }>();
    private streams = new Map<number, Listener>();
    private subIds = new Map<number, string>();
    private connectedKey: string | null = null;

    /** Identifies the account/mode a connection belongs to. */
    private currentKey(): string {
        const loginid = localStorage.getItem('active_loginid') ?? '';
        const mode = sessionStorage.getItem('auth_info') ? 'oauth2' : 'legacy';
        return `${mode}:${loginid}`;
    }

    /** Drop the current connection (e.g. on account switch). */
    reset(): void {
        this.pending.clear();
        this.streams.clear();
        this.subIds.clear();
        if (this.socket) {
            try {
                this.socket.close();
            } catch {
                /* noop */
            }
        }
        this.socket = null;
        this.ready = null;
    }

    private ensure(): Promise<void> {
        // Reconnect if the active account/mode changed since we last connected
        // (the OAuth2 OTP socket is scoped to one account).
        if (this.connectedKey && this.connectedKey !== this.currentKey()) {
            this.reset();
        }
        if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
        if (this.ready) return this.ready;
        this.ready = this.connect();
        return this.ready;
    }

    private async connect(): Promise<void> {
        const key = this.currentKey();
        const url = await getSocketURL();
        await new Promise<void>((resolve, reject) => {
            const sock = new WebSocket(url);
            this.socket = sock;
            const timer = setTimeout(() => reject(new Error('WS connect timeout')), 12000);

            sock.addEventListener('message', this.onMessage);
            sock.addEventListener('close', () => {
                this.socket = null;
                this.ready = null;
            });
            sock.addEventListener('error', () => {
                /* surfaced via timeout / failed sends */
            });
            sock.addEventListener('open', async () => {
                clearTimeout(timer);
                try {
                    const isOAuth2 = OAuthTokenExchangeService.isAuthenticated();
                    const token = getActiveToken();
                    if (!isOAuth2 && token) {
                        await this.dispatch({ authorize: token });
                    }
                    this.connectedKey = key;
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    private onMessage = (event: MessageEvent) => {
        let data: any;
        try {
            data = JSON.parse(event.data);
        } catch {
            return;
        }
        const reqId = data.req_id as number | undefined;
        if (reqId == null) return;

        if (this.streams.has(reqId)) {
            if (data.subscription?.id) this.subIds.set(reqId, data.subscription.id);
            this.streams.get(reqId)!(data);
            return;
        }
        if (this.pending.has(reqId)) {
            const { resolve } = this.pending.get(reqId)!;
            this.pending.delete(reqId);
            resolve(data);
        }
    };

    /** Sends a request on the (already open) socket and resolves the first reply. */
    private dispatch(request: Record<string, unknown>): Promise<any> {
        const req_id = ++this.reqId;
        return new Promise((resolve, reject) => {
            this.pending.set(req_id, { resolve, reject });
            try {
                this.socket!.send(JSON.stringify({ ...request, req_id }));
            } catch (err) {
                this.pending.delete(req_id);
                reject(err);
                return;
            }
            setTimeout(() => {
                if (this.pending.has(req_id)) {
                    this.pending.delete(req_id);
                    reject(new Error('WS request timeout'));
                }
            }, 20000);
        });
    }

    /** One-shot request. Resolves with the raw response (check `.error`). */
    async send(request: Record<string, unknown>): Promise<any> {
        await this.ensure();
        return this.dispatch(request);
    }

    /** Streaming subscription. `cb` receives every message; returns a forget handle. */
    async subscribe(request: Record<string, unknown>, cb: Listener): Promise<Subscription> {
        await this.ensure();
        const req_id = ++this.reqId;
        this.streams.set(req_id, cb);
        try {
            this.socket!.send(JSON.stringify({ ...request, subscribe: 1, req_id }));
        } catch {
            this.streams.delete(req_id);
        }
        return { forget: () => this.forget(req_id) };
    }

    private forget(req_id: number): void {
        const subId = this.subIds.get(req_id);
        this.streams.delete(req_id);
        this.subIds.delete(req_id);
        if (subId && this.socket?.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify({ forget: subId }));
            } catch {
                /* noop */
            }
        }
    }
}

export const tradeWS = new TradeWS();
