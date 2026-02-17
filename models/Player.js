const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
    type: String,
    amount: Number,
    date: { type: Date, default: Date.now }
});

const playerSchema = new mongoose.Schema({
    playerId: { type: String, required: true, unique: true },
    username: { type: String },
    currencies: {
        GOLD: { type: Number, default: 123 },
        GEMS: { type: Number, default: 3 },
        GAME_TICKET: { type: Number, default: 5 },
    },
    pendingRewards: [rewardSchema],
    lastLogin: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Player', playerSchema);
