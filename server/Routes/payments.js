const express = require('express');
const rateLimit = require('express-rate-limit');
const paymentController = require('../Controllers/paymentController');

const router = express.Router();

// Throttle order creation per IP — it hits paid provider APIs and price feeds.
const createLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// Static routes must stay above the '/:orderId' catch-all below.
router.get('/plan', paymentController.plan);
router.get('/options', paymentController.options);

router.post('/crypto/create', createLimiter, paymentController.createCrypto);
router.post('/card/init', createLimiter, paymentController.createCard);
router.post('/mpesa/init', createLimiter, paymentController.createMpesa);

// Provider callbacks. Both verify a signature before doing anything.
router.post('/crypto/webhook', paymentController.cryptoWebhook);
router.post('/paystack/webhook', paymentController.paystackWebhook);

// Buyer-submitted proof for chains without an automatic watcher.
router.post('/:orderId/proof', createLimiter, paymentController.submitProof);
router.get('/:orderId', paymentController.getOrder);

module.exports = router;
