const express = require("express");
const router = express.Router();
const Player = require("../models/Player");
const pusher = require("../config/pusher");

exports.authenticate = async (req, res) => {
    try {
        console.log("=== PUSHER AUTH CALLED ===");
        console.log("BODY:", req.body);
        console.log("ENV:", {
            appId: process.env.PUSHER_APP_ID,
            key: process.env.PUSHER_KEY,
            cluster: process.env.PUSHER_CLUSTER
        });

        const { socket_id, channel_name } = req.body;

        if (!socket_id || !channel_name) {
            console.log("Missing required fields");
            return res.status(400).send("Invalid request");
        }

        if (!channel_name.startsWith("private-player."))
            return res.status(403).send("Invalid channel");

        // Extract playerId from channel name
        const playerId = channel_name.replace("private-player.", "");

        const player = await Player.findOne({ playerId });
        if (!player)
            return res.status(403).send("Invalid player");

        const auth = pusher.authorizeChannel(socket_id, channel_name);

        console.log("Auth success");
        res.send(auth);

    } catch (err) {
        console.error("🔥 PUSHER AUTH ERROR:");
        console.error(err);
        res.status(500).send("Auth failed");
    }
};
