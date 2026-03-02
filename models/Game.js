const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    gameUrl: { type: String, required: true },
    maxPlayers: { type: Number, required: true },
    // costPerPlay: { type: Number, required: true },
    costPerPlay: {
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, required: true, enum: ["GOLD", "GEMS", "GAME_TICKETS"] }
    },
     thumbnailUrl: { type: String, required: true },
     isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model("Game", gameSchema);

