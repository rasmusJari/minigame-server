const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
    playerId: { type: String, required: true },
    type: String,
    amount: Number,
    date: { type: Date, default: Date.now },
    game: String
});

module.exports = mongoose.model('Reward', rewardSchema);