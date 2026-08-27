const mongoose = require('mongoose');

mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log('[db] MongoDB connected'))
    .catch(err => console.error('[db] MongoDB connection error:', err.message));

module.exports = mongoose;
