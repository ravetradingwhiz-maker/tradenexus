/**
 * Multiplexed tick feed.
 *
 * All three bots run at once, and they usually watch the same market. Deriv
 * refuses a second identical `ticks_history` subscription on one connection
 * (`AlreadySubscribed`), so the second and third bot would sit on "Loading
 * market…" forever while the first one traded happily.
 *
 * This opens exactly ONE subscription per symbol and fans it out. Late joiners
 * are replayed the cached history immediately, so a bot added to a running feed
 * is warmed up on the spot rather than waiting for 500 fresh ticks.
 */
import { subscribeTicks } from '@/services/trade-api';
import type { Subscription } from '@/services/trade-ws';

export interface TickMessage {
    history?: { prices?: unknown[] };
    tick?: { quote?: number };
    error?: { code: string; message: string };
}

type Listener = (msg: TickMessage) => void;

interface Feed {
    listeners: Set<Listener>;
    /** The live WS subscription, once it has been established. */
    sub: Subscription | null;
    /** In-flight connect, so simultaneous joiners share one request. */
    opening: Promise<void> | null;
    /**
     * The most recent full history, kept as a rolling window and replayed to
     * every new listener. Live ticks are appended so the replay is current.
     */
    prices: number[];
    /** A terminal error on the feed; replayed to joiners so they don't hang. */
    error: { code: string; message: string } | null;
}

const MAX_CACHED = 600;

class TickFeed {
    private feeds = new Map<string, Feed>();

    /** Subscribes `onData` to `symbol`. Resolves once the feed is established. */
    async subscribe(symbol: string, onData: Listener): Promise<Subscription> {
        let feed = this.feeds.get(symbol);

        if (!feed) {
            feed = { listeners: new Set(), sub: null, opening: null, prices: [], error: null };
            this.feeds.set(symbol, feed);
        }
        feed.listeners.add(onData);

        // Replay whatever the feed already knows, so this listener is usable
        // immediately rather than after the next tick.
        if (feed.prices.length) onData({ history: { prices: [...feed.prices] } });
        else if (feed.error) onData({ error: feed.error });

        if (!feed.sub && !feed.opening) feed.opening = this.open(symbol, feed);
        if (feed.opening) {
            try {
                await feed.opening;
            } catch {
                /* the error was already dispatched to listeners */
            }
        }

        return { forget: () => this.release(symbol, onData) };
    }

    private async open(symbol: string, feed: Feed): Promise<void> {
        try {
            const sub = await subscribeTicks({
                symbol,
                style: 'ticks',
                count: 500,
                onData: (msg: TickMessage) => this.dispatch(feed, msg),
            });

            // Everyone may have left while we were connecting.
            if (feed.listeners.size === 0) {
                sub.forget();
                this.feeds.delete(symbol);
                return;
            }
            feed.sub = sub;
        } catch (e) {
            const error = { code: 'FeedError', message: e instanceof Error ? e.message : 'Could not open the feed' };
            feed.error = error;
            feed.listeners.forEach(l => l({ error }));
            throw e;
        } finally {
            feed.opening = null;
        }
    }

    /** Caches what arrived, then hands it to every listener on this symbol. */
    private dispatch(feed: Feed, msg: TickMessage): void {
        if (msg?.error) {
            feed.error = msg.error;
        } else if (msg?.history?.prices) {
            feed.prices = msg.history.prices.map(Number).slice(-MAX_CACHED);
            feed.error = null;
        } else if (msg?.tick?.quote != null) {
            feed.prices.push(Number(msg.tick.quote));
            if (feed.prices.length > MAX_CACHED) feed.prices.shift();
            feed.error = null;
        }

        // Copy first: a listener may unsubscribe from inside its own callback.
        [...feed.listeners].forEach(l => l(msg));
    }

    /** Drops one listener, closing the upstream subscription when it's the last. */
    private release(symbol: string, onData: Listener): void {
        const feed = this.feeds.get(symbol);
        if (!feed) return;

        feed.listeners.delete(onData);
        if (feed.listeners.size > 0) return;

        feed.sub?.forget();
        this.feeds.delete(symbol);
    }
}

export const tickFeed = new TickFeed();
