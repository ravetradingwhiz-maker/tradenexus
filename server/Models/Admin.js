const mongoose = require('mongoose');

// Allow-list of admin users, keyed by Deriv account loginid (e.g. CR123456).
const AdminSchema = new mongoose.Schema(
    {
        loginid: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
        role: { type: String, enum: ['admin'], default: 'admin' },
    },
    { timestamps: true }
);

/** Loginids seeded on boot so admin auto-detection works out of the box. */
AdminSchema.statics.SEED_LOGINIDS = [
    'ROT90364524',
    'ROT90587273',
    'ROT90321676',
    'ROT90673664',
    'ROT92013946',
];

/** Idempotently ensure the seed loginids exist. Safe to call on every start. */
AdminSchema.statics.seedDefaults = async function () {
    await Promise.all(
        this.SEED_LOGINIDS.map(loginid =>
            this.updateOne({ loginid }, { $setOnInsert: { loginid, role: 'admin' } }, { upsert: true })
        )
    );
};

module.exports = mongoose.model('Admin', AdminSchema);
