const Game = require("../models/Game");

exports.getGames = async (req, res) => {
    try {
        const games = await Game.find({});
        res.status(200).json({games: games});
    } catch (err) {
        console.error("Get games error:", err);
        res.status(500).json({ error: 'Server error' });
    }
}