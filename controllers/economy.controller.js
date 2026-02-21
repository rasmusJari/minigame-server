const Player = require("../models/Player");
const Purchase = require("../models/Purchase");
const Reward = require("../models/Reward");
const pusher = require("../config/pusher");

// Helper
async function sendInventoryUpdate(player) {
    await pusher.trigger(
        `private-player.${player.playerId}`,
        "inventory-updated",
        {inventory: player.currencies}
    );
}

// ---------------------
// Controllers
// ---------------------
exports.addCurrency = async (req, res) => {
    try {
        const {playerId, currencyId, amount} = req.body;

        if (!playerId) {
            return res.status(400).json({error: "Invalid PlayerId"});
        }
        if (!currencyId) {
            return res.status(400).json({error: "Invalid Currency"});
        }
        if (!amount) {
            return res.status(400).json({error: "Invalid Amount"});
        }
        if (amount <= 0) return res.status(400).json({error: "amount must be greater than 0"});

        // find player
        const player = await Player.findOne({playerId});
        if (!player) return res.status(404).json({error: "Player not found"});

        if (!player.currencies) return res.status(404).json({error: "Player has not inventory"});

        player.currencies[currencyId] += amount;
        await player.save();
        return res.status(200).json({inventory: player.currencies});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Server error"});
    }
};

exports.removeCurrency = async (req, res) => {
    try {
        const { playerId, currencyId, amount} = req.body;
        
        if(!playerId) return res.status(400).json({error: "Missing PlayerId"});
        if(!currencyId) return res.status(400).json({error: "Missing Currency"});
        if(!amount) return res.status(400).json({error: "Missing amount"});
        if(amount <= 0) return res.status(400).json({error: "Amount must be greater than 0"});
        
        const player = await Player.findOne({playerId});
        if(!player) return res.status(404).json({error: "Player not found"});
        if(!player.currencies) return res.status(404).json({error: "Currencies not found"});
        
        const currentAmount = player.currencies[currencyId];
        if(amount > currentAmount) return res.status(400).json({error: "Insufficient balance"});
        
        player.currencies[currencyId] -= amount;
        await player.save();
        return res.status(200).json(
            {
                success: true,
                inventory: player.currencies
            });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Server error"});
    }
};

exports.getPurchases = async (req, res) => {
    try {
        const purchases = await Purchase.find({});
        res.json({purchases});
    } catch (err) {
        console.error("Get purchases error:", err);
        res.status(500).json({error: "Server error"});
    }
};

exports.tryPurchase = async (req, res) => {
    try {
        const {playerId, purchaseId} = req.body;

        if (!playerId || !purchaseId)
            return res.status(400).json({
                error: "playerId and purchaseId required"
            });

        const purchase = await Purchase.findOne({purchaseId});
        if (!purchase)
            return res.status(404).json({error: "Purchase not found"});

        const player = await Player.findOne({playerId});
        if (!player)
            return res.status(404).json({error: "Player not found"});

        const hasEnoughCurrency = purchase.costs.every(item =>
            player.currencies[item.type] != null &&
            player.currencies[item.type] >= item.amount
        );

        if (!hasEnoughCurrency)
            return res.status(403).json({
                error: "Insufficient currency"
            });

        // Deduct cost
        purchase.costs.forEach(item => {
            player.currencies[item.type] -= item.amount;
        });

        // Grant rewards
        purchase.rewards.forEach(item => {
            player.currencies[item.type] =
                (player.currencies[item.type] || 0) + item.amount;
        });

        await player.save();
        await sendInventoryUpdate(player);

        res.json({success: true, player});
    } catch (err) {
        console.error("Try purchase error:", err);
        res.status(500).json({error: "Server error"});
    }
};

exports.getPendingRewards = async (req, res) => {
    try {
        const {playerId} = req.body;

        if (!playerId)
            return res.status(400).json({error: "playerId required"});

        const rewards = await Reward.find({playerId});

        if (!rewards.length)
            return res.status(404).json({
                error: "No rewards found"
            });

        await Reward.deleteMany({playerId});

        res.json({rewards});
    } catch (err) {
        console.error("Get pending rewards error:", err);
        res.status(500).json({error: "Server error"});
    }
};
