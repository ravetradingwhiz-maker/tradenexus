import { useCallback, useEffect, useRef, useState } from 'react';
import { clearCSRFToken, validateCSRFToken } from '@/config/auth-config';
import { clearAuthData } from '@/utils/auth-utils';

/**
 * OAuth 2.0 (PKCE) callback hook.
 *
 * Extracts the `code`/`state`/`error` params from the
 * URL, validates the CSRF state token, and exposes the authorization code plus a
 * cleanup function. The consumer exchanges the code and then calls cleanupURL().
 */
export interface OAuthCallbackParams {
    code: string | null;
    state: string | null;
    error: string | null;
    error_description: string | null;
}

export interface OAuthCallbackResult {
    isProcessing: boolean;
    isValid: boolean;
    params: OAuthCallbackParams;
    error: string | null;
    cleanupURL: () => void;
}

const EMPTY_PARAMS: OAuthCallbackParams = { code: null, state: null, error: null, error_description: null };

export const useOAuthCallback = (): OAuthCallbackResult => {
    const [result, setResult] = useState<Omit<OAuthCallbackResult, 'cleanupURL'>>({
        isProcessing: true,
        isValid: false,
        params: EMPTY_PARAMS,
        error: null,
    });

    // Guard so the callback is processed exactly once. React StrictMode invokes
    // effects twice in dev; since validating consumes (clears) the CSRF token,
    // a second run would always fail with "CSRF token validation failed".
    const processedRef = useRef(false);

    const cleanupURL = useCallback(() => {
        const url = new URL(window.location.href);
        ['code', 'state', 'scope', 'error', 'error_description'].forEach(p => url.searchParams.delete(p));
        window.history.replaceState({}, '', url.toString());
    }, []);

    useEffect(() => {
        if (processedRef.current) return;
        processedRef.current = true;

        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');
        const error_description = urlParams.get('error_description');

        const isOAuthCallback = code !== null || error !== null || state !== null;
        if (!isOAuthCallback) {
            setResult({ isProcessing: false, isValid: false, params: EMPTY_PARAMS, error: null });
            return;
        }

        if (error) {
            console.error('[OAuth] error:', error, error_description);
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                error: error_description || error,
            });
            cleanupURL();
            return;
        }

        if (!state) {
            console.error('[OAuth] Missing state parameter — potential security threat');
            clearAuthData(false);
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                error: 'Missing state parameter',
            });
            return;
        }

        if (!validateCSRFToken(state)) {
            console.error('[OAuth] CSRF token validation failed — potential security threat');
            clearAuthData(false);
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                error: 'CSRF token validation failed',
            });
            return;
        }

        clearCSRFToken();

        if (!code) {
            setResult({
                isProcessing: false,
                isValid: false,
                params: { code, state, error, error_description },
                error: 'Missing authorization code',
            });
            cleanupURL();
            return;
        }

        setResult({
            isProcessing: false,
            isValid: true,
            params: { code, state, error, error_description },
            error: null,
        });
    }, [cleanupURL]);

    return { ...result, cleanupURL };
};
