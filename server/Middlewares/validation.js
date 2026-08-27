const Joi = require('joi');
const { ASSET_ORDER } = require('../config/cryptoAssets');

// Deriv login ids on the account (real + demo). At least one is required so a
// paid subscription can be attached to every login the buyer owns.
const loginids = Joi.array().items(Joi.string().trim().min(1).max(32)).min(1).max(50).required();

const cryptoPaymentSchema = Joi.object({
    asset: Joi.string()
        .valid(...ASSET_ORDER)
        .required(),
    email: Joi.string().email().required(),
    loginids,
});

// Hosted rails (card / M-Pesa) — same as above minus the asset.
const hostedPaymentSchema = Joi.object({
    email: Joi.string().email().required(),
    loginids,
});

// Manual proof of an on-chain payment we can't watch automatically.
const proofSchema = Joi.object({
    txHash: Joi.string().trim().min(16).max(200).required(),
});

module.exports = { cryptoPaymentSchema, hostedPaymentSchema, proofSchema };
