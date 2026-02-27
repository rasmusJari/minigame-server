const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    gameRound: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRound', required: true },
    playerId: { type: String, required: true },
    type: String,
    amount: Number,
    date: { type: Date, default: Date.now },
    game: String,
    score: Number
});

module.exports = mongoose.model('Reward', rewardSchema);