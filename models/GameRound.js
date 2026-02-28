const mongoose = require('mongoose');

const gameRoundSchema = new mongoose.Schema({
    // roundId: { type: Number, required: true, unique: true },
    minigame: { type: String, required: true },
    scores: { type: Map, of: Number, default: {} }, // playerId -> score
    isActive: { type: Boolean, default: false },
    status: { type: String, enum: ['open', 'closed', 'completed'], default: 'open' },
    numberOfPlayers: { type: Number, default: 0 },
    endsAt: { type: Date },
    winner: { type: String, default: null }, // playerId of the winner
    players: { type: [String], default: [] }, // playerIds
    maxPlayers: { type: Number, default: 0 },
    seed: { type: Number, default: () => Math.floor(Math.random() * 1000000) }
});

module.exports = mongoose.model("GameRound", gameRoundSchema);