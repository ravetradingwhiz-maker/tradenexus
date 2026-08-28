import { useEffect, useState } from 'react';

/** The `beforeinstallprompt` event, which the platform fires when installable. */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa_install_dismissed';

/**
 * First-visit install nudge. When the browser says the app is installable
 * (`beforeinstallprompt`), a small modal offers a one-tap install. Shown once —
 * dismissing or installing remembers the choice — and never while already
 * installed. iOS Safari doesn't fire the event, so nothing shows there.
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

    useEffect(() => {
        const standalone =
            window.matchMedia?.('(display-mode: standalone)').matches ||
            (navigator as unknown as { standalone?: boolean }).standalone === true;
        if (standalone) return; // already installed

        let dismissed = false;
        try {
            dismissed = localStorage.getItem(DISMISS_KEY) === '1';
        } catch {
            /* storage blocked — treat as not dismissed */
        }
        if (dismissed) return;

        const onBeforeInstall = (e: Event) => {
            e.preventDefault(); // keep the browser's own mini-infobar from showing
            setPromptEvent(e as BeforeInstallPromptEvent);
            setOpen(true);
        };
        const onInstalled = () => {
            setOpen(false);
            remember();
        };
        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onInstalled);
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
                alignItems: 'flex-end',
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
                    maxWidth: '400px',
                    background: '#161b22',
                    border: '1px solid #2a2f3a',
                    borderRadius: '20px',
                    padding: '22px',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    marginBottom: '8px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <img
                        src={iconSrc}
                        alt=""
                        width={52}
                        height={52}
                        style={{ borderRadius: '12px', flexShrink: 0 }}
                    />
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>Install {appName}?</div>
                        <div style={{ fontSize: '13px', color: '#9aa4b2', marginTop: '2px' }}>
                            Do you want to install for quick access?
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button
                        type="button"
                        onClick={dismiss}
                        style={{
                            flex: 1,
                            padding: '11px',
                            borderRadius: '12px',
                            border: '1px solid #2a2f3a',
                            background: 'transparent',
                            color: '#c5ccd6',
                            fontWeight: 600,
                            fontSize: '14px',
                            cursor: 'pointer',
                        }}
                    >
                        Not now
                    </button>
                    <button
                        type="button"
                        onClick={install}
                        style={{
                            flex: 1,
                            padding: '11px',
                            borderRadius: '12px',
                            border: 'none',
                            background: accent,
                            color: accentText,
                            fontWeight: 800,
                            fontSize: '14px',
                            cursor: 'pointer',
                        }}
                    >
                        Install
                    </button>
                </div>
            </div>
        </div>
    );
}
