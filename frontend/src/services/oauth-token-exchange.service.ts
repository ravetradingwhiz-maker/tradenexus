/**
 * OAuth 2.0 (PKCE) token-exchange service.
 *
 * Exchanges the authorization code for an access
 * token, persists auth info in sessionStorage, and bootstraps the account list.
 */
import { clearCodeVerifier, getCodeVerifier, getRedirectURL } from '@/config/auth-config';
import brandConfig from '@/config/brand';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';

interface TokenExchangeResponse {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
}

export interface AuthInfo {
    access_token: string;
    token_type: string;
    expires_in: number;
    expires_at: number;
    scope?: string;
    refresh_token?: string;
}

export class OAuthTokenExchangeService {
    private static getOAuth2BaseURL(): string {
        return brandConfig.platform.auth2_url.production;
    }

    static getAuthInfo(): AuthInfo | null {
        try {
            const raw = sessionStorage.getItem('auth_info');
            if (!raw) return null;

            const authInfo: AuthInfo = JSON.parse(raw);
            if (authInfo.expires_at && Date.now() >= authInfo.expires_at) {
                this.clearAuthInfo();
                return null;
            }
            return authInfo;
        } catch (error) {
            console.error('[OAuth] Error parsing auth_info:', error);
            return null;
        }
    }

    static clearAuthInfo(): void {
        sessionStorage.removeItem('auth_info');
    }

    static isAuthenticated(): boolean {
        const authInfo = this.getAuthInfo();
        return authInfo !== null && !!authInfo.access_token;
    }

    static getAccessToken(): string | null {
        return this.getAuthInfo()?.access_token ?? null;
    }

    private static persistAuthInfo(data: TokenExchangeResponse): AuthInfo {
        const authInfo: AuthInfo = {
            access_token: data.access_token!,
            token_type: data.token_type || 'bearer',
            expires_in: data.expires_in || 3600,
            expires_at: Date.now() + (data.expires_in || 3600) * 1000,
            scope: data.scope,
        };
        if (data.refresh_token) authInfo.refresh_token = data.refresh_token;
        sessionStorage.setItem('auth_info', JSON.stringify(authInfo));
        return authInfo;
    }

    /**
     * Exchanges the authorization code for an access token (PKCE), persists it,
     * then fetches + stores the account list and sets the active account.
     */
    static async exchangeCodeForToken(code: string): Promise<TokenExchangeResponse> {
        try {
            const tokenEndpoint = `${this.getOAuth2BaseURL()}token`;

            const codeVerifier = getCodeVerifier();
            if (!codeVerifier) {
                return {
                    error: 'invalid_request',
                    error_description: 'PKCE code verifier not found or expired. Restart the login flow.',
                };
            }

            const clientId = process.env.CLIENT_ID;
            if (!clientId) {
                return {
                    error: 'invalid_client',
                    error_description: 'CLIENT_ID is not configured.',
                };
            }

            const requestBody = new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                redirect_uri: getRedirectURL(),
                code_verifier: codeVerifier,
            });

            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: requestBody.toString(),
            });

            const data: TokenExchangeResponse = await response.json();
            if (data.error) {
                console.error('[OAuth] Token exchange error:', data.error, data.error_description);
                return { error: data.error, error_description: data.error_description };
            }

            if (data.access_token) {
                clearCodeVerifier();
                this.persistAuthInfo(data);

                try {
                    const accounts = await DerivWSAccountsService.fetchAccountsList(data.access_token);
                    if (accounts && accounts.length > 0) {
                        DerivWSAccountsService.storeAccounts(accounts);
                        // Default to the first REAL account so the header opens on real, not demo.
                        // OAuth2 accounts mark demo via account_type (no VRT prefix).
                        const defaultAccount = accounts.find(a => a.account_type === 'real') ?? accounts[0];
                        localStorage.setItem('active_loginid', defaultAccount.account_id);
                        localStorage.setItem('account_type', defaultAccount.account_type);
                        DerivWSAccountsService.prewarmOTPForAllAccounts(data.access_token, accounts);
                    } else {
                        this.clearAuthInfo();
                        return {
                            error: 'no_accounts',
                            error_description: 'No accounts available after successful authentication',
                        };
                    }
                } catch (error) {
                    this.clearAuthInfo();
                    return {
                        error: 'account_fetch_failed',
                        error_description:
                            error instanceof Error ? error.message : 'Failed to fetch accounts after authentication',
                    };
                }
            }

            return data;
        } catch (error) {
            console.error('[OAuth] Token exchange network error:', error);
            return {
                error: 'network_error',
                error_description: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }

    static async refreshAccessToken(refreshToken: string): Promise<TokenExchangeResponse> {
        try {
            const tokenEndpoint = `${this.getOAuth2BaseURL()}token`;
            const requestBody = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            });

            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: requestBody.toString(),
            });

            const data: TokenExchangeResponse = await response.json();
            if (data.error) {
                return { error: data.error, error_description: data.error_description };
            }

            if (data.access_token) {
                const authInfo = this.persistAuthInfo(data);
                if (!data.refresh_token) {
                    const existing = this.getAuthInfo();
                    if (existing?.refresh_token) {
                        authInfo.refresh_token = existing.refresh_token;
                        sessionStorage.setItem('auth_info', JSON.stringify(authInfo));
                    }
                }
            }

            return data;
        } catch (error) {
            console.error('[OAuth] Token refresh error:', error);
            return {
                error: 'network_error',
                error_description: error instanceof Error ? error.message : 'Unknown error occurred',
            };
        }
    }
}
