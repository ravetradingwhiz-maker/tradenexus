// Per-chain deposit watchers.
//
// Each watcher answers one question: "which confirmed transfers have landed in
// MY address since this order was created?" The payment controller then matches
// one against the order's exact, unique amount.
//
// Every watcher returns the same shape:
//   [{ txid, amount /* in whole coins/tokens */, timestamp /* ms, 0 if unknown */ }]
//
// Most of these are keyless public endpoints. The EVM chains (Ethereum, BSC)
// need a free Etherscan API key; without one those assets fall back to manual
// verification, where the buyer submits a transaction hash for an admin to
// approve. Nothing silently fails to a "paid" state.
const axios = require('axios');

const TEN_MIN_MS = 10 * 60 * 1000;

/** Watchers look slightly back in time — a payer's clock is not the chain's. */
const backBuffer = sinceMs => Math.max(0, (sinceMs || 0) - 120000);

const toWhole = (raw, decimals) => Number(raw) / Math.pow(10, decimals);

// ---------------------------------------------------------------------------
// TRON — TronGrid. Covers native TRX and TRC-20 tokens (USDT).
// ---------------------------------------------------------------------------

const TRONGRID = 'https://api.trongrid.io';

const tronHeaders = () => {
    const h = {};
    if (process.env.TRONGRID_API_KEY) h['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
    return h;
};

const watchTron = async ({ address, def, sinceMs }) => {
    if (def.kind === 'token') {
        const { data } = await axios.get(`${TRONGRID}/v1/accounts/${address}/transactions/trc20`, {
            headers: tronHeaders(),
            timeout: 15000,
            params: {
                only_to: true,
                only_confirmed: true,
                limit: 100,
                contract_address: def.contract,
                min_timestamp: backBuffer(sinceMs),
            },
        });
        const rows = Array.isArray(data && data.data) ? data.data : [];
        return rows
            .filter(t => t.to === address)
            .map(t => ({
                txid: t.transaction_id,
                amount: toWhole(t.value, def.decimals),
                timestamp: Number(t.block_timestamp) || 0,
            }));
    }

    // Native TRX. `only_to` gives inbound transfers; TransferContract carries
    // the amount in SUN (6 decimals).
    const { data } = await axios.get(`${TRONGRID}/v1/accounts/${address}/transactions`, {
        headers: tronHeaders(),
        timeout: 15000,
        params: { only_to: true, only_confirmed: true, limit: 100, min_timestamp: backBuffer(sinceMs) },
    });
    const rows = Array.isArray(data && data.data) ? data.data : [];
    return rows
        .map(t => {
            const c = t.raw_data && t.raw_data.contract && t.raw_data.contract[0];
            if (!c || c.type !== 'TransferContract') return null;
            const v = c.parameter && c.parameter.value;
            if (!v || !v.amount) return null;
            return {
                txid: t.txID,
                amount: toWhole(v.amount, def.decimals),
                timestamp: Number(t.block_timestamp) || 0,
            };
        })
        .filter(Boolean);
};

// ---------------------------------------------------------------------------
// Bitcoin / Litecoin — mempool.space and its Litecoin sibling. Same API shape,
// both keyless.
// ---------------------------------------------------------------------------

const UTXO_HOSTS = {
    bitcoin: 'https://mempool.space/api',
    litecoin: 'https://litecoinspace.org/api',
};

const watchUtxo = async ({ address, def, chain }) => {
    const { data } = await axios.get(`${UTXO_HOSTS[chain]}/address/${address}/txs`, { timeout: 10000 });
    const rows = Array.isArray(data) ? data : [];

    return rows
        .filter(t => t.status && t.status.confirmed)
        .map(t => {
            // Sum every output paying our address — one tx can pay it twice.
            const received = (t.vout || [])
                .filter(o => o.scriptpubkey_address === address)
                .reduce((sum, o) => sum + Number(o.value || 0), 0);
            if (!received) return null;
            return {
                txid: t.txid,
                amount: toWhole(received, def.decimals),
                timestamp: (Number(t.status.block_time) || 0) * 1000,
            };
        })
        .filter(Boolean);
};

// ---------------------------------------------------------------------------
// Solana — public JSON-RPC. Balance delta for our address across the tx.
// ---------------------------------------------------------------------------

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const solanaRpc = async (method, params) => {
    const { data } = await axios.post(
        SOLANA_RPC,
        { jsonrpc: '2.0', id: 1, method, params },
        { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
    );
    if (data && data.error) throw new Error(data.error.message || 'Solana RPC error');
    return data && data.result;
};

const watchSolana = async ({ address, def, sinceMs }) => {
    const sigs = (await solanaRpc('getSignaturesForAddress', [address, { limit: 25 }])) || [];
    const cutoff = backBuffer(sinceMs) / 1000;

    const recent = sigs.filter(s => !s.err && (!s.blockTime || s.blockTime >= cutoff)).slice(0, 15);
    const out = [];

    for (const s of recent) {
        const tx = await solanaRpc('getTransaction', [
            s.signature,
            { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' },
        ]);
        if (!tx || !tx.meta || tx.meta.err) continue;

        const keys = (tx.transaction.message.accountKeys || []).map(k => (typeof k === 'string' ? k : k.pubkey));
        const idx = keys.indexOf(address);
        if (idx < 0) continue;

        // A deposit is a positive change in our lamport balance.
        const delta = Number(tx.meta.postBalances[idx]) - Number(tx.meta.preBalances[idx]);
        if (delta <= 0) continue;

        out.push({
            txid: s.signature,
            amount: toWhole(delta, def.decimals),
            timestamp: (Number(s.blockTime) || 0) * 1000,
        });
    }
    return out;
};

// ---------------------------------------------------------------------------
// XRP Ledger — public JSON-RPC, validated payments only.
// ---------------------------------------------------------------------------

const XRPL_RPC = process.env.XRPL_RPC_URL || 'https://s1.ripple.com:51234/';
// The XRP Ledger epoch starts on 2000-01-01, not 1970-01-01.
const RIPPLE_EPOCH_OFFSET_MS = 946684800000;

const watchXrp = async ({ address, def }) => {
    const { data } = await axios.post(
        XRPL_RPC,
        {
            method: 'account_tx',
            params: [{ account: address, ledger_index_min: -1, ledger_index_max: -1, limit: 30, binary: false }],
        },
        { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
    );

    const rows = (data && data.result && data.result.transactions) || [];
    return rows
        .map(row => {
            const tx = row.tx || row.tx_json || {};
            if (!row.validated || tx.TransactionType !== 'Payment' || tx.Destination !== address) return null;

            // A delivered amount is a string of drops for plain XRP payments;
            // an object means an issued token, which is not what we quoted.
            const delivered = (row.meta && row.meta.delivered_amount) || tx.Amount;
            if (typeof delivered !== 'string') return null;

            return {
                txid: tx.hash || row.hash,
                amount: toWhole(delivered, def.decimals),
                timestamp: tx.date ? tx.date * 1000 + RIPPLE_EPOCH_OFFSET_MS : 0,
            };
        })
        .filter(Boolean);
};

// ---------------------------------------------------------------------------
// Ethereum / BSC — Etherscan's V2 multichain API (one key covers both).
// ---------------------------------------------------------------------------

const EVM_CHAIN_IDS = { ethereum: 1, bsc: 56 };

const watchEvm = async ({ address, def, chain, sinceMs }) => {
    const key = process.env.ETHERSCAN_API_KEY;
    if (!key) throw new Error('ETHERSCAN_API_KEY is not configured');

    const lower = address.toLowerCase();
    const { data } = await axios.get('https://api.etherscan.io/v2/api', {
        timeout: 10000,
        params: {
            chainid: EVM_CHAIN_IDS[chain],
            module: 'account',
            action: def.kind === 'token' ? 'tokentx' : 'txlist',
            address,
            ...(def.kind === 'token' ? { contractaddress: def.contract } : {}),
            page: 1,
            offset: 50,
            sort: 'desc',
            apikey: key,
        },
    });

    // Etherscan answers "no transactions" as status "0" with an empty result —
    // that is a valid empty answer, not an error.
    const rows = Array.isArray(data && data.result) ? data.result : [];
    const cutoff = backBuffer(sinceMs) / 1000;

    return rows
        .filter(t => String(t.to || '').toLowerCase() === lower)
        // Native transfers can revert; token transfer logs only exist if they succeeded.
        .filter(t => def.kind === 'token' || t.isError === '0')
        .filter(t => Number(t.confirmations || 0) >= 12)
        .filter(t => Number(t.timeStamp || 0) >= cutoff)
        .map(t => ({
            txid: t.hash,
            amount: toWhole(t.value, def.kind === 'token' ? Number(t.tokenDecimal || def.decimals) : def.decimals),
            timestamp: (Number(t.timeStamp) || 0) * 1000,
        }));
};

// ---------------------------------------------------------------------------

const WATCHERS = {
    tron: watchTron,
    bitcoin: args => watchUtxo({ ...args, chain: 'bitcoin' }),
    litecoin: args => watchUtxo({ ...args, chain: 'litecoin' }),
    solana: watchSolana,
    xrp: watchXrp,
    ethereum: args => watchEvm({ ...args, chain: 'ethereum' }),
    bsc: args => watchEvm({ ...args, chain: 'bsc' }),
};

/** True when this chain can be confirmed automatically with the current config. */
const canWatch = def => {
    if (!def || !WATCHERS[def.chain]) return false;
    if (def.chain === 'ethereum' || def.chain === 'bsc') return Boolean(process.env.ETHERSCAN_API_KEY);
    return true;
};

/**
 * Confirmed inbound transfers to `address` since `sinceMs`.
 * Throws if the chain has no watcher — callers treat that as "needs manual
 * verification" rather than as a failed payment.
 */
const getIncoming = async ({ assetDef, address, sinceMs }) => {
    const watcher = WATCHERS[assetDef.chain];
    if (!watcher) throw new Error(`No watcher for chain ${assetDef.chain}`);

    const rows = await watcher({ address, def: assetDef, sinceMs });
    // Drop anything that landed well before the order existed — it belongs to
    // some earlier payment, not this one.
    const floor = (sinceMs || 0) - TEN_MIN_MS;
    return rows.filter(r => !r.timestamp || r.timestamp >= floor);
};

module.exports = { getIncoming, canWatch };
