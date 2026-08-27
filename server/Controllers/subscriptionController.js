const Subscription = require('../Models/Subscription');

module.exports = {
    // GET /api/subscription?loginids=CR123,VRTC456
    // Active if ANY of the supplied loginids has a live subscription, so access
    // follows the user rather than whichever account they happen to be on.
    check: async (req, res, next) => {
        try {
            const raw = String(req.query.loginids || '').trim();
            if (!raw) return res.json({ active: false });

            const loginids = raw
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
                .slice(0, 50);
            if (!loginids.length) return res.json({ active: false });

            const subs = await Subscription.find({
                loginids: { $in: loginids },
                status: 'active',
                expiresAt: { $gt: new Date() },
            });
            if (!subs.length) return res.json({ active: false });

            // Stacked purchases extend rather than overlap, so report the
            // furthest expiry the user actually holds.
            const expiresAt = subs.reduce((max, s) => (s.expiresAt > max ? s.expiresAt : max), subs[0].expiresAt);
            res.json({ active: true, expiresAt });
        } catch (error) {
            next(error);
        }
    },
};
