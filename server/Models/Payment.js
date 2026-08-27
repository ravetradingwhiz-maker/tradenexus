const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
    {
        orderId: { type: String, required: true, unique: true, index: true },
        // 'direct'      — paid into our own wallet, matched by exact amount
        // 'nowpayments' — provider-issued deposit address
        // 'paystack'    — hosted card / M-Pesa checkout
        provider: { type: String, enum: ['direct', 'nowpayments', 'paystack'], required: true },
        // The provider's own id, or the settling transaction hash on-chain.
        providerPaymentId: { type: String, default: '', index: true },

        priceUSD: { type: Number, required: true },

        // Crypto orders only: which asset (and therefore which chain).
        asset: { type: String, default: '' },
        // USD price of one unit at quote time. 1 for stablecoins; the locked
        // rate for everything else, kept so the ledger can be audited later.
        quoteUsdPrice: { type: Number, default: 0 },

        // What the payer actually sends: the asset id for crypto, or the fiat
        // code ('usd' / 'kes') for the hosted rails.
        payCurrency: { type: String, required: true },
        payAddress: { type: String, default: '' },
        payAmount: { type: Number, default: 0 },
        // Destination tag / memo, where the chain needs one (e.g. XRP).
        payMemo: { type: String, default: '' },

        email: { type: String, required: true },
        loginids: { type: [String], default: [] },

        status: {
            type: String,
            enum: ['pending', 'paid', 'expired', 'failed'],
            default: 'pending',
            index: true,
        },

        // Manual verification: chains we cannot watch automatically let the
        // buyer submit a transaction hash for an admin to approve.
        needsManualCheck: { type: Boolean, default: false },
        proofTxHash: { type: String, default: '' },
        proofSubmittedAt: { type: Date, default: null },
        approvedBy: { type: String, default: '' },

        // Guards against activating / emailing twice (webhook + poll + admin).
        activated: { type: Boolean, default: false },
        paidAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Payment', PaymentSchema);
