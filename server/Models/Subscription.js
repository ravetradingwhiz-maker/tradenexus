const mongoose = require('mongoose');

// One row per purchase. `loginids` holds every Deriv login on the account
// (real + demo), so access follows whichever account is active — a single
// document instead of one per loginid.
const SubscriptionSchema = new mongoose.Schema(
    {
        loginids: { type: [String], required: true, index: true },
        email: { type: String, default: '' },
        startedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true, index: true },
        status: { type: String, enum: ['active', 'expired'], default: 'active' },
        paymentId: { type: String, default: '' },
    },
    { timestamps: true }
);

SubscriptionSchema.index({ loginids: 1, expiresAt: -1 });

module.exports = mongoose.model('Subscription', SubscriptionSchema);
