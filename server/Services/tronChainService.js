const axios = require('axios');

const TRONGRID = 'https://api.trongrid.io';

const headers = () => {
    const h = {};
    if (process.env.TRONGRID_API_KEY) h['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
    return h;
};

/**
 * Confirmed incoming TRC-20 transfers to `address` since `sinceMs`, for one
 * token contract. Each: { txid, from, to, amount, timestamp (ms) }.
 *
 * A small back-buffer is subtracted from `sinceMs` because a payer's clock and
 * the chain's block timestamp rarely agree to the second.
 */
const getIncomingTrc20 = async ({ address, contract, decimals = 6, sinceMs = 0 }) => {
    const { data } = await axios.get(`${TRONGRID}/v1/accounts/${address}/transactions/trc20`, {
        headers: headers(),
        timeout: 15000,
        params: {
            only_to: true,
            only_confirmed: true,
            limit: 100,
            contract_address: contract,
            min_timestamp: Math.max(0, sinceMs - 120000),
        },
    });

    const rows = Array.isArray(data && data.data) ? data.data : [];
    return rows
        .map(t => ({
            txid: t.transaction_id,
            from: t.from,
            to: t.to,
            amount: Number(t.value) / Math.pow(10, decimals),
            timestamp: Number(t.block_timestamp) || 0,
        }))
        .filter(t => t.to === address);
};

module.exports = { getIncomingTrc20 };
