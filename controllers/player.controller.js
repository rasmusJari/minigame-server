const Player = require("../models/Player");
const pusher = require("../config/pusher");

// ---------------------
// Helpers
// ---------------------

async function sendInventoryUpdate(player) {
    await pusher.trigger(
        `private-player.${player.playerId}`,
        "inventory-updated",
        { inventory: player.currencies }
    );
}

// ---------------------
// Controllers
// ---------------------

exports.getPlayer = async (req, res) => {
    try {
        const { playerId } = req.body;

        if (!playerId)
            return res.status(400).json({ error: "playerId required" });

        const player = await Player.findOne({ playerId });
        if (!player)
            return res.status(404).json({ error: "Player not found" });

        res.json(player);
    }
    catch (err) {
        console.error("Get player error:", err);
        res.status(500).json({ error: "Server error" });
    }
};

exports.createOrEnsurePlayer = async (req, res) => {
    try {
        const { playerId } = req.body;

        if (!playerId || typeof playerId !== "string") {
            return res.status(400).json({
                success: false,
                message: "Valid playerId required"
            });
        }

        const player = await Player.findOneAndUpdate(
            { playerId },
            { $setOnInsert: { playerId } },
            { new: true, upsert: true }
        );

        res.json({ success: true, player });
    }
    catch (err) {
        console.error("Create player error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.getInventory = async (req, res) => {
    try {
        const { playerId } = req.body;

        const player = await Player.findOne({ playerId });
        if (!player)
            return res.status(404).json({ error: "Player not found" });

        res.json({ inventory: player.currencies });
    }
    catch (err) {
        console.error("Get inventory error:", err);
        res.status(500).json({ error: "Server error" });
    }
};

exports.tryConsumeCurrency = async (req, res) => {
    try {
        const { playerId, currencyId, amount } = req.body;

        if (!playerId || !currencyId || typeof amount !== "number")
            return res.status(400).json({ error: "Invalid parameters" });

        const player = await Player.findOne({ playerId });
        if (!player)
            return res.status(404).json({ error: "Player not found" });

        if (
            player.currencies[currencyId] != null &&
            player.currencies[currencyId] >= amount
        ) {
            player.currencies[currencyId] -= amount;
            await player.save();
            await sendInventoryUpdate(player);

            return res.json({ success: true });
        }

        return res.status(403).json({ error: "Insufficient currency" });
    }
    catch (err) {
        console.error("Consume currency error:", err);
        res.status(500).json({ error: "Server error" });
    }
};

exports.addCurrency = async (req, res) => {
    try {
        const { playerId, type, amount } = req.body;

        if (!playerId || !type || typeof amount !== "number")
            return res.status(400).json({ error: "Invalid parameters" });

        const player = await Player.findOne({ playerId });
        if (!player)
            return res.status(404).json({ error: "Player not found" });

        player.currencies[type] =
            (player.currencies[type] || 0) + amount;

        await player.save();
        await sendInventoryUpdate(player);

        res.json(player.currencies);
    }
    catch (err) {
        console.error("Add currency error:", err);
        res.status(500).json({ error: "Server error" });
    }
};

exports.addPendingReward = async (req, res) => {
    try {
        const { playerId } = req.params;
        const { type, amount } = req.body;

        const player = await Player.findOne({ playerId });
        if (!player)
            return res.status(404).json({ error: "Player not found" });

        player.pendingRewards.push({ type, amount });
        await player.save();

        res.json(player.pendingRewards);
    }
    catch (err) {
        console.error("Add reward error:", err);
        res.status(500).json({ error: "Server error" });
    }
};

exports.claimRewards = async (req, res) => {
    try {
        const { playerId } = req.params;

        const player = await Player.findOne({ playerId });
        if (!player)
            return res.status(404).json({ error: "Player not found" });

        player.pendingRewards.forEach(r => {
            player.currencies[r.type] =
                (player.currencies[r.type] || 0) + r.amount;
        });

        player.pendingRewards = [];
        await player.save();
        await sendInventoryUpdate(player);

        res.json(player.currencies);
    }
    catch (err) {
        console.error("Claim reward error:", err);
        res.status(500).json({ error: "Server error" });
    }
};
