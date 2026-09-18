import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Whether a bot is running, and how to stop it — hoisted out of the bot page so
 * the transactions panel can offer a Stop.
 *
 * The panel is global and the engine is not: `useNexusBot` lives inside
 * whichever bot page is mounted, and that page can be navigated away from while
 * the bot keeps trading. So the page publishes its state up here and the panel
 * reads it, rather than the panel reaching for a hook it cannot own.
 *
 * Only one bot runs at a time — the pages are separate routes — so a single slot
 * is enough.
 */
interface BotRunContextValue {
    isRunning: boolean;
    /** Called by the bot page whenever its run state changes. */
    publish: (isRunning: boolean, stop: (() => void) | null) => void;
    /** Stops whatever is running. A no-op when nothing is. */
    stop: () => void;
}

const BotRunContext = createContext<BotRunContextValue | null>(null);

export const BotRunProvider = ({ children }: { children: ReactNode }) => {
    const [isRunning, setIsRunning] = useState(false);
    /* A ref, not state: swapping the stop function must not re-render the panel,
       and the panel only ever calls it. */
    const stopRef = useRef<(() => void) | null>(null);

    const publish = useCallback((running: boolean, stop: (() => void) | null) => {
        stopRef.current = stop;
        setIsRunning(running);
    }, []);

    const stop = useCallback(() => stopRef.current?.(), []);

    return <BotRunContext.Provider value={{ isRunning, publish, stop }}>{children}</BotRunContext.Provider>;
};

export const useBotRun = (): BotRunContextValue => {
    const ctx = useContext(BotRunContext);
    if (!ctx) throw new Error('useBotRun must be used within a BotRunProvider');
    return ctx;
};

/**
 * Publishes a bot page's run state for the panel, and clears it on unmount so a
 * Stop button can never outlive the engine behind it.
 */
export const usePublishBotRun = (isRunning: boolean, stop: () => void): void => {
    const { publish } = useBotRun();

    /* The engine hands back a fresh `stop` on some renders. Through a ref, so a
       new identity doesn't republish and the panel always calls the current one. */
    const stopRef = useRef(stop);
    stopRef.current = stop;

    useEffect(() => {
        publish(isRunning, () => stopRef.current());
    }, [isRunning, publish]);

    useEffect(() => () => publish(false, null), [publish]);
};
