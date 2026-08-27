require('dotenv').config();

const express = require('express');
const createError = require('http-errors');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

require('./Middlewares/dbConnection');

const app = express();

app.use(helmet());
// Behind one proxy (Render/Vercel/nginx) — needed for correct client IPs, which
// the rate limiters key on.
app.set('trust proxy', 1);

const allowedOrigins = [
    process.env.ALLOWED_ORIGIN_1,
    process.env.ALLOWED_ORIGIN_2,
    process.env.ALLOWED_ORIGIN_3,
].filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            // No Origin header: server-to-server (provider webhooks), so allow.
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);

            // Say which origin was refused and where to add it. Browsers send
            // Origin on same-origin POST/PUT too, so a dev server on the wrong
            // port fails only on writes — a genuinely baffling symptom without
            // this message.
            const err = new Error(
                `Origin ${origin} is not allowed. Add it to ALLOWED_ORIGIN_1/2/3 in the server environment.`
            );
            err.status = 403;
            callback(err);
        },
        credentials: true,
        methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        allowedHeaders: 'Content-Type, Authorization',
    })
);

// Keep the raw body so the Paystack webhook can verify its HMAC signature.
app.use(
    express.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf;
        },
    })
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/', (req, res) => res.send('TradeNexus API is running'));
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use('/api/payments', require('./Routes/payments'));
app.use('/api/subscription', require('./Routes/subscription'));
app.use('/api/admin', require('./Routes/admin'));

// Background sweep so on-chain and hosted orders still confirm when the payer
// closed the checkout tab before the network caught up.
const { pollPendingOrders } = require('./Controllers/paymentController');
const SWEEP_MS = 30000;
setInterval(() => {
    pollPendingOrders().catch(e => console.error('[sweep] failed:', e.message));
}, SWEEP_MS).unref();

// 404 + error handler
app.use((req, res, next) => next(createError(404, 'Not Found')));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error('[error]', err.message);
    res.status(status).json({
        success: false,
        error: { message: err.message || 'Internal Server Error', status },
    });
});

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => console.log(`[server] TradeNexus API listening on port ${PORT}`));
