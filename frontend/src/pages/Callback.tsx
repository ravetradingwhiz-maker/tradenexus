import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOAuthCallback } from '@/hooks/useOAuthCallback';
import { useAuth } from '@/context/AuthContext';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { parseLoginInfoFromUrl, processLegacyLoginInfo } from '@/utils/auth-utils';
import Spinner from '@/components/Spinner';

type Status = 'processing' | 'error';

/**
 * Unified auth callback. Handles BOTH modes:
 *  - Legacy: the redirect returns tokens directly (token1/acct1/cur1).
 *  - OAuth 2.0 (PKCE): the redirect returns ?code — validate CSRF, exchange it.
 *
 * On success it refreshes auth state and navigates client-side, so there is no
 * page reload and no flash of the landing page.
 */
const Callback = () => {
    const { isProcessing, isValid, params, error: callbackError } = useOAuthCallback();
    const { refreshAuthState } = useAuth();
    const navigate = useNavigate();
    const [status, setStatus] = useState<Status>('processing');
    const [message, setMessage] = useState('Completing your login…');
    const handled = useRef(false);

    useEffect(() => {
        if (handled.current) return;

        const finishSuccess = () => {
            refreshAuthState();
            // A page may stash where to land after login (e.g. a pricing card).
            const dest = sessionStorage.getItem('post_login_redirect') || '/app';
            sessionStorage.removeItem('post_login_redirect');
            navigate(dest, { replace: true });
        };
        const finishError = (msg: string) => {
            setStatus('error');
            setMessage(msg);
        };

        // 1) Legacy token flow takes priority when those params are present.
        if (parseLoginInfoFromUrl().length > 0) {
            handled.current = true;
            processLegacyLoginInfo()
                .then(ok => (ok ? finishSuccess() : finishError('We could not validate your login tokens.')))
                .catch(() => finishError('Something went wrong while signing you in.'));
            return;
        }

        // 2) OAuth 2.0 (PKCE) code flow — wait for the hook to finish parsing.
        if (isProcessing) return;

        if (callbackError) {
            handled.current = true;
            finishError(callbackError);
            return;
        }

        if (isValid && params.code) {
            handled.current = true;
            OAuthTokenExchangeService.exchangeCodeForToken(params.code)
                .then(res => {
                    if (res.access_token) finishSuccess();
                    else finishError(res.error_description || 'Token exchange failed.');
                })
                .catch(() => finishError('Token exchange request failed.'));
            return;
        }

        if (!isValid && !params.code) {
            handled.current = true;
            finishError('This page expects a login redirect from Deriv.');
        }
    }, [isProcessing, isValid, params.code, callbackError, navigate, refreshAuthState]);

    return (
        <div className='flex min-h-screen flex-col items-center justify-center bg-ink-900 px-6 text-center'>
            {status === 'processing' ? (
                <>
                    <Spinner />
                    <p className='mt-6 text-lg font-medium text-fg'>{message}</p>
                    <p className='mt-1 text-sm text-mist-500'>Securely connecting to your Deriv account.</p>
                </>
            ) : (
                <div className='card max-w-md'>
                    <h1 className='text-xl font-bold text-fg'>Login failed</h1>
                    <p className='mt-2 text-sm text-mist-400'>{message}</p>
                    <button
                        type='button'
                        className='btn-solid mt-6 w-full'
                        onClick={() => navigate('/', { replace: true })}
                    >
                        Back to home
                    </button>
                </div>
            )}
        </div>
    );
};

export default Callback;
