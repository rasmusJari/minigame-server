const express = require("express");
const router = express.Router();
const Player = require("../models/Player");
const pusher = require("../config/pusher");

exports.authenticate = async (req, res) => {
    console.log("Pusher auth request:", req.body);
    const { socket_id, channel_name, playerId } = req.body;

    const expected = `private-player.${playerId}`;
    if (channel_name !== expected)
        return res.status(403).send("Forbidden");

    const player = await Player.findOne({ playerId });
    if (!player)
        return res.status(403).send("Invalid player");

    const auth = pusher.authorizeChannel(socket_id, channel_name);
    res.send(auth);
};
