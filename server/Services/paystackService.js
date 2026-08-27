// Paystack integration for card + M-Pesa payments. Like tronChainService, it
// only talks to Paystack — activation and subscription logic stay in the
// payment controller.
//
// Docs: https://paystack.com/docs/api/
const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_BASE = 'https://api.paystack.co';

const secret = () => {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) throw new Error('PAYSTACK_SECRET_KEY not configured');
    return key;
};

const client = () =>
    axios.create({
        baseURL: PAYSTACK_BASE,
        headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
        timeout: 15000,
    });

/**
 * Opens a hosted checkout. `amountSubunit` is in the currency's smallest unit
 * (cents for USD, kobo for NGN). Returns { authorization_url, access_code, reference }.
 */
const initTransaction = async ({ email, amountSubunit, currency, reference, callbackUrl, metadata, channels }) => {
    const { data } = await client().post('/transaction/initialize', {
        email,
        amount: amountSubunit,
        currency,
        reference,
        callback_url: callbackUrl,
        metadata,
        // Restrict which payment channels the hosted page offers (e.g.
        // ['mobile_money'] for M-Pesa). Omit to show all enabled channels.
        ...(channels ? { channels } : {}),
    });
    if (!data || !data.status) throw new Error((data && data.message) || 'Paystack init failed');
    return data.data;
};

/**
 * Server-side truth for an order. Returns Paystack's transaction record
 * ({ status: 'success' | 'failed' | 'abandoned' | ..., amount, currency, id }).
 */
const verifyTransaction = async reference => {
    const { data } = await client().get(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (!data || !data.status) throw new Error((data && data.message) || 'Paystack verify failed');
    return data.data;
};

/**
 * Paystack signs webhooks with HMAC-SHA512 of the raw request body using the
 * secret key. Compare in constant time against the x-paystack-signature header.
 */
const verifyWebhookSignature = (rawBody, signature) => {
    if (!rawBody || !signature) return false;
    const hash = crypto.createHmac('sha512', secret()).update(rawBody).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
    } catch {
        return false;
    }
};

module.exports = { initTransaction, verifyTransaction, verifyWebhookSignature };
