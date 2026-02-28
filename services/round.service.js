const Player = require("../models/Player");
const Reward = require("../models/Reward");
const pusher = require("../config/pusher");
const Game = require("../models/Game");
const GameRound = require("../models/GameRound");

// ---------------------
// In-memory rounds store
// ---------------------
const rounds = {};
let roundCounter = 1;
// { minigame: { roundId, isActive, endsAt, scores, winner } }


// ---------------------
// Helpers
// ---------------------

function formatRoundTopPlayer(minigameRound) {
    let topPlayer = null;

    if (minigameRound.scores) {
        for (const [playerId, score] of Object.entries(minigameRound.scores)) {
            if (!topPlayer || score > topPlayer.score) {
                topPlayer = { playerId, score };
            }
        }
    }

    return {
        roundId: minigameRound.roundId,
        isActive: minigameRound.isActive,
        endsAt: minigameRound.endsAt,
        scores: topPlayer ? [topPlayer] : [],
        winner: minigameRound.winner ?? null
    };
}

async function sendInventoryUpdate(player) {
    await pusher.trigger(
        `private-player.${player.playerId}`,
        "inventory-updated",
        { inventory: player.currencies }
    );
}


// ---------------------
// Round Lifecycle
// ---------------------

async function getOrCreateGameRound(minigame, playerId) {

    // Find active round where player has NOT submitted
    let round = await GameRound.findOne({
        minigame,
        isActive: true,
        [`scores.${playerId}`]: { $exists: false }
    });

    if (round) return round;

    // No eligible round → create new one
    const lastRound = await GameRound
        .findOne({ minigame })
        .sort({ roundId: -1 });

    const nextRoundNumber = lastRound ? lastRound.roundId + 1 : 1;

    round = await GameRound.create({
        roundId: nextRoundNumber,
        minigame,
        isActive: true,
        endsAt: new Date(Date.now() + 60 * 60 * 1000),
        scores: {},
        numberOfPlayers: 0
    });

    await pusher.trigger("public-channel", "round-started", {
        roundId: round.roundId,
        endsAt: round.endsAt
    });

    return round;
}

async function endRound(round) {
    const scoresObj = Object.fromEntries(round.scores);

    const entries = Object.entries(scoresObj);
    if (entries.length === 0) return null;

    const [winnerId, winnerScore] =
        entries.sort((a, b) => b[1] - a[1])[0];

    round.winner = winnerId;
    round.isActive = false;

    await round.save();

    // Reward logic (unchanged)
    const reward = new Reward({
        playerId: winnerId,
        gameRound: round,
        type: "GOLD",
        amount: 1000,
        game: round.minigame,
        score: winnerScore
    });

    await reward.save();

    // const player = await Player.findOne({ playerId: winnerId });
    // if (player) {
    //     //Todo: remove immediate reward booking and wait for reward shown in client
    //     player.currencies["GOLD"] =
    //         (player.currencies["GOLD"] || 0) + 1000;
    //
    //     await player.save();
    //     await sendInventoryUpdate(player);
    // }

    const payload = {
        roundId: round.roundId,
        winnerId,
        winnerScore,
        scores: scoresObj,
        endedAt: Date.now()
    };
    
    await pusher.trigger("public-channel", "round-ended", payload);

    return payload;
}

function generateSeed() {
    return Math.floor(Math.random() * 1_000_000_000);
}

// ---------------------
// Public API
// ---------------------

// Join game round
exports.joinRound = async (req, res) => {
    try {
        const { playerId, minigame} = req.body;

        if (!playerId) {
            console.error("playerId missing in joinRound");
            return res.status(400).json({error: "playerId required"});
        }
        
        if (!minigame) {
            console.error("minigame missing in joinRound");
            return res.status(400).json({error: "minigame required"});
        }

        const game = await Game.findOne({ identifier: minigame }).exec();
        
        if (!game) {
            console.error("Game not found for identifier:", minigame);
            return res.status(404).json({error: "Game not found"});
        }
        
        const maxPlayers = game.maxPlayers ?? 2;
        console.log("Max players:", maxPlayers);
        // Try to join existing open round atomically
        let round = await GameRound.findOneAndUpdate(
            {
                minigame: minigame,
                status: "open",
                players: { $ne: playerId },
                $expr: { $lt: [{ $size: "$players" }, maxPlayers] }
            },
            {
                $push: { players: playerId }
            }
        );

        // If no round available → create one
        if (!round) {
            console.log("create new round for minigame:", minigame);
            const nextRoundId = roundCounter + 1
            round = await GameRound.create({
                minigame: minigame,
                seed: generateSeed(),
                players: [playerId],
                maxPlayers: maxPlayers,
                status: "open"
            });
        }

        console.log(`Player ${playerId} joined round ${round.roundId} (players: ${round.players.length}/${round.maxPlayers})`);
        return res.status(200).json({
            roundId: round._id,
            seed: round.seed
        });

    } catch (err) {
        console.error("Join round error:", err);
        res.status(500).json({ error: "Server error" });
    }
};


// ---------------------

// Submit score for current round
exports.submitScoreToRound = async (req, res) => {
    try {
        const { playerId, roundId, score } = req.body;

        if (!playerId || roundId == null || score == null)
            return res.status(400).json({ error: "Missing fields" });

        const round = await GameRound.findOne({ roundId });

        if (!round)
            return res.status(404).json({ error: "Round not found" });

        if (!round.players.includes(playerId))
            return res.status(403).json({ error: "Player not in this round" });
        
        // Save score here (your existing logic)

        // If round is full and all scores submitted → close it
        if (round.players.length >= round.maxPlayers) {
            round.status = "complete";
            await round.save();
        }

        res.status(200).json({ success: true });

    } catch (err) {
        console.error("Submit score error:", err);
        res.status(500).json({ error: "Server error" });
    }
};

// 1️⃣ Player submits score
exports.submitScore = async (req, res) => {

    const { playerId, minigame, score } = req.body;

    if (!playerId || !minigame || typeof score !== "number") {
        return res.status(400).json({
            error: "Missing or invalid playerId/minigame/score"
        });
    }

    // 1️⃣ Get eligible round (or create one)
    const round = await getOrCreateGameRound(minigame, playerId);

    if (!round) {
        return res.status(500).json({
            error: "Failed to get or create round"
        });
    }

    // 2️⃣ Double safety check (should never trigger)
    if (round.scores.has(playerId)) {
        return res.status(400).json({
            error: "Player already submitted to this round"
        });
    }

    // 3️⃣ Atomic update:
    //    - set score
    //    - increment numberOfPlayers
    await GameRound.updateOne(
        { _id: round._id },
        {
            $set: { [`scores.${playerId}`]: score },
            $inc: { numberOfPlayers: 1 }
        }
    );

    const freshRound = await GameRound.findById(round._id);

    console.log("send submit score to player channel", playerId, minigame, score);
    await pusher.trigger(
        `private-player.${playerId}`,
        "score-submitted",
        { minigame, score }
    );

    // 4️⃣ Check game settings
    const gameSettings = await Game
        .findOne({ identifier: minigame })
        .lean();

    if (!gameSettings) {
        return res.status(400).json({
            error: "Missing or invalid game configuration"
        });
    }

    const maxPlayers = gameSettings.maxPlayers ?? 1;

    // 5️⃣ End round if full
    if (freshRound.numberOfPlayers >= maxPlayers) {
        await endRound(freshRound);
        
        return res.json({ message: "Round ended" });
    }

    // 6️⃣ Compute leaderboard
    const scoresObj = Object.fromEntries(freshRound.scores);

    const topEntry = Object.entries(scoresObj)
        .sort((a, b) => b[1] - a[1])[0];

    await pusher.trigger("public-channel", "round-updated", {
        game: minigame,
        roundId: freshRound.roundId,
        topPlayer: topEntry?.[0] ?? null,
        topScore: topEntry?.[1] ?? null,
        scores: Object.entries(scoresObj).map(([id, s]) => ({
            playerId: id,
            score: s
        }))
    });

    res.json({
        roundId: freshRound.roundId,
        isActive: freshRound.isActive,
        endsAt: freshRound.endsAt,
        topPlayer: topEntry?.[0] ?? null,
        topScore: topEntry?.[1] ?? null
    });
};


// 2️⃣ Get current round state
exports.getRound = async (req, res) => {
    const { minigame } = req.params;

    const round = await GameRound.findOne({
        minigame,
        isActive: true
    });

    if (!round)
        return res.status(404).json({ error: "Round not found" });

    const scoresObj = Object.fromEntries(round.scores);

    const topEntry = Object.entries(scoresObj)
        .sort((a, b) => b[1] - a[1])[0];

    res.json({
        roundId: round.roundId,
        isActive: round.isActive,
        endsAt: round.endsAt,
        winner: round.winner,
        topPlayer: topEntry?.[0] ?? null,
        topScore: topEntry?.[1] ?? null
    });
};


exports.wakeUp = (req, res) => {
    pusher.trigger("public-channel", "wake-up", {
        message: "Server is awake!"
    });

    res.json({ message: "Server is awake!" });
};
