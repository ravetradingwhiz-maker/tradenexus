const express = require('express');
const rateLimit = require('express-rate-limit');
const adminController = require('../Controllers/adminController');

const router = express.Router();

const checkLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const markupLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// The frontend checks the logged-in account's loginid(s) against the allow-list.
router.get('/check', checkLimiter, adminController.check);

// Admin allow-list management. Body: { "loginid": "CR123456" }
router.get('/list', adminController.list);
router.post('/', adminController.add);
router.delete('/', adminController.remove);

// Subscriptions
router.get('/subscriptions', adminController.listSubscriptions);
router.post('/subscriptions', adminController.createSubscription);
router.patch('/subscriptions/:id', adminController.updateSubscription);
router.delete('/subscriptions/:id', adminController.deleteSubscription);

// Payments — read the ledger, and settle the ones no watcher can confirm.
router.get('/payments', adminController.listPayments);
router.post('/payments/:orderId/approve', adminController.approvePayment);
router.post('/payments/:orderId/reject', adminController.rejectPayment);

// Markup (Deriv v4 REST proxy)
router.get('/markup', markupLimiter, adminController.markup);

// Plan price + duration
router.get('/plan', adminController.getPlanConfig);
router.put('/plan', adminController.setPlanConfig);

// Payment rails + individual crypto assets
router.get('/payment-config', adminController.getPaymentConfig);
router.put('/payment-config', adminController.setPaymentConfig);

// Receiving wallet for one coin
router.put('/wallets', adminController.setWallet);

module.exports = router;
