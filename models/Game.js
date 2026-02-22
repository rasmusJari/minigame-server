const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    gameUrl: { type: String, required: true },
    maxPlayers: { type: Number, required: true },
});

module.exports = mongoose.model("Game", gameSchema);

