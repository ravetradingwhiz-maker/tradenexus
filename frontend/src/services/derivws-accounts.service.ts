/**
 * DerivWS account service for the OAuth 2.0 flow.
 *
 * Given an OAuth2 access token it:
 *  - fetches the account list from the REST gateway
 *  - requests a short-lived OTP per account and resolves an authenticated
 *    WebSocket URL
 * Uses promise + OTP caching to avoid duplicate network calls.
 */
import brandConfig from '@/config/brand';

export interface DerivAccount {
    account_id: string;
    balance: string;
    currency: string;
    group: string;
    status: string;
    account_type: 'demo' | 'real';
}

interface AccountsResponse {
    data: DerivAccount[];
}

interface OTPResponse {
    data: { url: string };
}

export class DerivWSAccountsService {
    private static accountsFetchPromise: Promise<DerivAccount[]> | null = null;
    private static otpFetchPromises: Map<string, Promise<string>> = new Map();

    private static readonly OTP_CACHE_TTL_MS = 90_000;
    private static otpCache: Map<string, { url: string; expiresAt: number }> = new Map();

    private static getCachedOTPUrl(accountId: string): string | undefined {
        const entry = this.otpCache.get(accountId);
        if (entry && Date.now() < entry.expiresAt) return entry.url;
        this.otpCache.delete(accountId);
        return undefined;
    }

    private static getDerivWSBaseURL(): string {
        return brandConfig.platform.derivws.url.production;
    }

    static clearCache(): void {
        this.accountsFetchPromise = null;
        this.otpFetchPromises.clear();
        this.otpCache.clear();
    }

    static storeAccounts(accounts: DerivAccount[]): void {
        sessionStorage.setItem('deriv_accounts', JSON.stringify(accounts));
    }

    static getStoredAccounts(): DerivAccount[] | null {
        try {
            const raw = sessionStorage.getItem('deriv_accounts');
            return raw ? (JSON.parse(raw) as DerivAccount[]) : null;
        } catch (error) {
            console.error('[DerivWS] Error parsing stored accounts:', error);
            return null;
        }
    }

    static getDefaultAccount(): DerivAccount | null {
        const accounts = this.getStoredAccounts();
        return accounts && accounts.length ? accounts[0] : null;
    }

    static clearStoredAccounts(): void {
        sessionStorage.removeItem('deriv_accounts');
    }

    static prewarmOTPForAllAccounts(accessToken: string, accounts: DerivAccount[]): void {
        accounts.forEach(account => {
            if (this.getCachedOTPUrl(account.account_id)) return;
            this.fetchOTPWebSocketURL(accessToken, account.account_id).catch(() => {});
        });
    }

    static async refreshAccountsList(accessToken: string): Promise<DerivAccount[]> {
        this.accountsFetchPromise = null;
        return this.fetchAccountsList(accessToken);
    }

    static async fetchAccountsList(accessToken: string): Promise<DerivAccount[]> {
        if (this.accountsFetchPromise) return this.accountsFetchPromise;

        this.accountsFetchPromise = (async () => {
            try {
                const baseURL = this.getDerivWSBaseURL();
                const optionsDir = brandConfig.platform.derivws.directories.options;
                const endpoint = `${baseURL}${optionsDir}accounts`;

                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers: { Authorization: `Bearer ${accessToken}` },
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch accounts: ${response.status} ${response.statusText}`);
                }

                const data: AccountsResponse = await response.json();
                const accounts = data?.data || [];
                if (accounts.length === 0) console.warn('[DerivWS] No accounts found in response');

                this.storeAccounts(accounts);
                return accounts;
            } catch (error) {
                console.error('[DerivWS] Error fetching accounts:', error);
                this.accountsFetchPromise = null;
                throw error;
            } finally {
                setTimeout(() => {
                    this.accountsFetchPromise = null;
                }, 100);
            }
        })();

        return this.accountsFetchPromise;
    }

    static async fetchOTPWebSocketURL(accessToken: string, accountId: string): Promise<string> {
        const cacheKey = accountId;
        if (this.otpFetchPromises.has(cacheKey)) return this.otpFetchPromises.get(cacheKey)!;

        const otpPromise = (async () => {
            try {
                const baseURL = this.getDerivWSBaseURL();
                const optionsDir = brandConfig.platform.derivws.directories.options;
                const endpoint = `${baseURL}${optionsDir}accounts/${accountId}/otp`;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${accessToken}` },
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch OTP: ${response.status} ${response.statusText}`);
                }

                const otpResponse: OTPResponse = await response.json();
                const websocketURL = otpResponse.data?.url;
                if (!websocketURL) throw new Error('WebSocket URL not found in OTP response');

                this.otpCache.set(accountId, {
                    url: websocketURL,
                    expiresAt: Date.now() + this.OTP_CACHE_TTL_MS,
                });

                return websocketURL;
            } catch (error) {
                console.error('[DerivWS] Error fetching OTP:', error);
                this.otpFetchPromises.delete(cacheKey);
                throw error;
            } finally {
                setTimeout(() => {
                    this.otpFetchPromises.delete(cacheKey);
                }, 100);
            }
        })();

        this.otpFetchPromises.set(cacheKey, otpPromise);
        return otpPromise;
    }

    /**
     * Resolves an authenticated WebSocket URL for the active account, reusing
     * stored accounts and cached OTP URLs where possible.
     */
    static async getAuthenticatedWebSocketURL(accessToken: string): Promise<string> {
        let accounts = this.getStoredAccounts();
        if (!accounts || accounts.length === 0) {
            accounts = await this.fetchAccountsList(accessToken);
            if (!accounts || accounts.length === 0) throw new Error('No accounts available');
        }

        const activeLoginId = localStorage.getItem('active_loginid');
        const targetAccount = (activeLoginId && accounts.find(a => a.account_id === activeLoginId)) || accounts[0];

        const cachedURL = this.getCachedOTPUrl(targetAccount.account_id);
        if (cachedURL) return cachedURL;

        return this.fetchOTPWebSocketURL(accessToken, targetAccount.account_id);
    }
}
