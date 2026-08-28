import { useEffect, useState } from 'react';

/** The `beforeinstallprompt` event, which the platform fires when installable. */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
    interface Window {
        /** Stashed by the early-capture snippet in index.html. */
        __pwaInstallEvent?: BeforeInstallPromptEvent | null;
    }
}

const DISMISS_KEY = 'pwa_install_dismissed';

const isStandalone = (): boolean =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

const isIOS = (): boolean =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac, but it has a touch screen.
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/**
 * First-visit install nudge — a small centred modal offering one-tap install.
 *
 * `beforeinstallprompt` usually fires BEFORE React has mounted, which is why a
 * listener registered here alone never sees it on mobile. The snippet in
 * index.html captures it early and stashes it on `window.__pwaInstallEvent`;
 * this reads that on mount and also listens for late arrivals.
 *
 * iOS Safari never fires the event at all, so there we show the manual
 * "Add to Home Screen" instructions instead.
 */
export default function InstallPrompt({
    appName,
    iconSrc = '/icon-192.png',
    accent = '#ffffff',
    accentText = '#000000',
}: {
    appName: string;
    iconSrc?: string;
    accent?: string;
    accentText?: string;
}) {
    const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [open, setOpen] = useState(false);
    const [iosHint, setIosHint] = useState(false);

    useEffect(() => {
        if (isStandalone()) return; // already installed

        let dismissed = false;
        try {
            dismissed = localStorage.getItem(DISMISS_KEY) === '1';
        } catch {
            /* storage blocked — treat as not dismissed */
        }
        if (dismissed) return;

        // 1) The event may already have fired before React mounted.
        if (window.__pwaInstallEvent) {
            setPromptEvent(window.__pwaInstallEvent);
            setOpen(true);
        }

        // 2) …or it may still be on its way.
        const onAvailable = () => {
            if (!window.__pwaInstallEvent) return;
            setPromptEvent(window.__pwaInstallEvent);
            setOpen(true);
        };
        const onBeforeInstall = (e: Event) => {
            e.preventDefault();
            window.__pwaInstallEvent = e as BeforeInstallPromptEvent;
            onAvailable();
        };
        const onInstalled = () => {
            setOpen(false);
            remember();
        };

        window.addEventListener('pwa-install-available', onAvailable);
        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onInstalled);

        // 3) iOS Safari never fires it — offer the manual route instead.
        let iosTimer: ReturnType<typeof setTimeout> | null = null;
        if (isIOS()) {
            iosTimer = setTimeout(() => {
                if (!window.__pwaInstallEvent) {
                    setIosHint(true);
                    setOpen(true);
                }
            }, 1500);
        }

        return () => {
            window.removeEventListener('pwa-install-available', onAvailable);
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onInstalled);
            if (iosTimer) clearTimeout(iosTimer);
        };
    }, []);

    const remember = () => {
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            /* ignore */
        }
    };

    const install = async () => {
        setOpen(false);
        remember();
        if (!promptEvent) return;
        try {
            await promptEvent.prompt();
            await promptEvent.userChoice;
        } catch {
            /* user closed the native prompt */
        }
        window.__pwaInstallEvent = null;
        setPromptEvent(null);
    };

    const dismiss = () => {
        setOpen(false);
        remember();
    };

    if (!open) return null;

    return (
        <div
            onClick={dismiss}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(2px)',
                padding: '16px',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={`Install ${appName}`}
                style={{
                    width: '100%',
                    maxWidth: '320px',
                    background: '#161b22',
                    border: '1px solid #2a2f3a',
                    borderRadius: '16px',
                    padding: '18px',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    textAlign: 'center',
                }}
            >
                <img
                    src={iconSrc}
                    alt=""
                    width={44}
                    height={44}
                    style={{ borderRadius: '10px', margin: '0 auto', display: 'block' }}
                />
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', marginTop: '10px' }}>
                    Install {appName}?
                </div>
                <div style={{ fontSize: '12.5px', color: '#9aa4b2', marginTop: '4px', lineHeight: 1.45 }}>
                    {iosHint
                        ? 'Tap the Share button, then “Add to Home Screen”.'
                        : 'Do you want to install for quick access?'}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                    <button
                        type="button"
                        onClick={dismiss}
                        style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: '10px',
                            border: '1px solid #2a2f3a',
                            background: 'transparent',
                            color: '#c5ccd6',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        {iosHint ? 'Got it' : 'Not now'}
                    </button>
                    {!iosHint && (
                        <button
                            type="button"
                            onClick={install}
                            style={{
                                flex: 1,
                                padding: '10px',
                                borderRadius: '10px',
                                border: 'none',
                                background: accent,
                                color: accentText,
                                fontWeight: 800,
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            Install
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
