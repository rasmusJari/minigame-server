const Player = require("../models/Player");
const Reward = require("../models/Reward");
const pusher = require("../config/pusher");
const Game = require("../models/Game");
const GameRound = require("../models/GameRound");

// ---------------------
// In-memory rounds store
// ---------------------
const rounds = {};
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

async function getOrCreateActiveRound(minigame) {
    let round = await GameRound.findOne({ minigame, isActive: true });

    if (round) return round;

    // Find latest round number
    const lastRound = await GameRound
        .findOne({ minigame })
        .sort({ roundId: -1 });

    const nextRoundNumber = lastRound ? lastRound.roundNumber + 1 : 1;

    round = new GameRound({
        roundId: nextRoundNumber,
        minigame,
        isActive: true,
        endsAt: new Date(Date.now() + 60 * 60 * 1000),
        scores: {},
        numberOfPlayers: 0
    });

    await round.save();

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
        type: "GOLD",
        amount: 1000,
        game: round.minigame
    });

    await reward.save();

    const player = await Player.findOne({ playerId: winnerId });
    if (player) {
        player.currencies["GOLD"] =
            (player.currencies["GOLD"] || 0) + 1000;

        await player.save();
        await sendInventoryUpdate(player);
    }

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


// ---------------------
// Public API
// ---------------------

// 1️⃣ Player submits score
exports.submitScore = async (req, res) => {
    const { playerId, minigame, score } = req.body;

    if (!playerId || !minigame || typeof score !== "number") {
        return res.status(400).json({
            error: "Missing or invalid playerId/minigame/score"
        });
    }

    // 1️⃣ Get or create active round
    let round = await GameRound.findOne({ minigame, isActive: true });

    if (!round) {
        const lastRound = await GameRound
            .findOne({ minigame })
            .sort({ roundId: -1 });

        const nextRoundNumber = lastRound ? lastRound.roundNumber + 1 : 1;

        round = await GameRound.create({
            roundId: nextRoundNumber,
            minigame: minigame,
            isActive: true,
            endsAt: new Date(Date.now() + 60 * 60 * 1000),
            scores: {},
            numberOfPlayers: 0
        });
        
        round.scores.add(playerId, score);
        await round.save();

        await pusher.trigger("public-channel", "round-started", {
            roundId: round.roundId,
            endsAt: round.endsAt
        });
    }

    // 2️⃣ Atomic score update
    const updateResult = await GameRound.updateOne(
        { _id: round._id },
        {
            $max: { [`scores.${playerId}`]: score }
        }
    );

    // 3️⃣ If this player didn't exist before, increment player count
    const updatedRound = await GameRound.findById(round._id);

    const playerAlreadyExists =
        updatedRound.scores.has(playerId);

    if (!playerAlreadyExists) {
        await GameRound.updateOne(
            { _id: round._id },
            { $inc: { numberOfPlayers: 1 } }
        );
    }

    // Re-fetch fresh state
    const freshRound = await GameRound.findById(round._id);

    await pusher.trigger(
        `private-player.${playerId}`,
        "score-submitted",
        { minigame, score }
    );

    const gameSettings = await Game
        .findOne({ identifier: minigame })
        .lean();

    if (!gameSettings) {
        return res.status(400).json({
            error: "Missing or invalid game configuration"
        });
    }

    const maxPlayers = gameSettings.maxPlayers ?? 1;

    // 4️⃣ End round if limit reached
    if (freshRound.numberOfPlayers >= maxPlayers) {
        await endRound(freshRound);
        return res.json({ message: "Round ended" });
    }

    // 5️⃣ Compute leaderboard safely
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
