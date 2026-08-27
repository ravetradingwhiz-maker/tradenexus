const express = require('express');
const rateLimit = require('express-rate-limit');
const subscriptionController = require('../Controllers/subscriptionController');

const router = express.Router();

const checkLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

router.get('/', checkLimiter, subscriptionController.check);

module.exports = router;
