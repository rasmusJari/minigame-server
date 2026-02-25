const mongoose = require('mongoose');

const gameRoundSchema = new mongoose.Schema({
    roundId: { type: Number, required: true },
    minigame: { type: String, required: true },
    scores: { type: Map, of: Number, default: {} }, // playerId -> score
    isActive: { type: Boolean, default: false },
    numberOfPlayers: { type: Number, default: 0 },
    endsAt: { type: Date },
    winner: { type: String, default: null } // playerId of the winner
});

module.exports = mongoose.model("GameRound", gameRoundSchema);