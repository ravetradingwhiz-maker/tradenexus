// NOWPayments integration — the route for every coin we don't watch on-chain
// ourselves (BTC, ETH, SOL, LTC, XRP, BNB, USDC, TRX, USDT-ERC20).
//
// NOWPayments issues a deposit address per order and quotes the amount in the
// payer's chosen coin, which is what makes the volatile assets workable: the
// rate is theirs to honour, not ours to guess.
//
// Docs: https://documenter.getpostman.com/view/7907941/S1a32n38
const axios = require('axios');
const crypto = require('crypto');

const BASE = 'https://api.nowpayments.io/v1';

const apiKey = () => {
    const key = process.env.NOWPAYMENTS_API_KEY;
    if (!key) throw new Error('NOWPAYMENTS_API_KEY not configured');
    return key;
};

const client = () =>
    axios.create({
        baseURL: BASE,
        headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
        timeout: 20000,
    });

/**
 * Opens an order. Returns NOWPayments' payment record, including:
 *   payment_id, pay_address, pay_amount, pay_currency, payment_status,
 *   payin_extra_id (the destination tag / memo, on chains that use one).
 */
const createPayment = async ({ priceUSD, payCurrency, orderId, description, ipnCallbackUrl }) => {
    const { data } = await client().post('/payment', {
        price_amount: priceUSD,
        price_currency: 'usd',
        pay_currency: payCurrency,
        order_id: orderId,
        order_description: description,
        ...(ipnCallbackUrl ? { ipn_callback_url: ipnCallbackUrl } : {}),
    });
    if (!data || !data.pay_address) throw new Error((data && data.message) || 'NOWPayments did not return an address');
    return data;
};

/** Server-side truth for one order. */
const getPaymentStatus = async paymentId => {
    const { data } = await client().get(`/payment/${encodeURIComponent(paymentId)}`);
    return data;
};

// NOWPayments signs the IPN body as HMAC-SHA512 over the JSON with keys sorted
// alphabetically (recursively). Reproduce that exactly to verify a webhook.
const sortObject = obj =>
    Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
            const val = obj[key];
            acc[key] = val && typeof val === 'object' && !Array.isArray(val) ? sortObject(val) : val;
            return acc;
        }, {});

const verifyIpnSignature = (payload, signature) => {
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;
    if (!secret || !signature || !payload) return false;
    const digest = crypto.createHmac('sha512', secret).update(JSON.stringify(sortObject(payload))).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(signature)));
    } catch {
        // Different lengths — timingSafeEqual throws rather than returning false.
        return false;
    }
};

// NOWPayments' lifecycle mapped onto our three terminal states.
// 'partially_paid' deliberately stays pending: the payer can top it up, and the
// order expires on its own if they never do.
const PAID_STATUSES = ['finished'];
const FAILED_STATUSES = ['failed', 'refunded', 'expired'];

module.exports = { createPayment, getPaymentStatus, verifyIpnSignature, PAID_STATUSES, FAILED_STATUSES };
