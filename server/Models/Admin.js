const mongoose = require('mongoose');

// Allow-list of admin users, keyed by Deriv account loginid (e.g. CR123456).
const AdminSchema = new mongoose.Schema(
    {
        loginid: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
        role: { type: String, enum: ['admin'], default: 'admin' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Admin', AdminSchema);
