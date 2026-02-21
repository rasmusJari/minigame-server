const Player = require("../models/Player");
const Reward = require("../models/Reward");
const pusher = require("../config/pusher");

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

function startNewRound(minigame) {
    rounds[minigame] = {
        roundId: `${minigame}_${Date.now()}`,
        isActive: true,
        endsAt: Date.now() + 60 * 60 * 1000,
        scores: {},
        winner: null
    };

    pusher.trigger("game-round", "round-started", {
        roundId: rounds[minigame].roundId,
        endsAt: rounds[minigame].endsAt
    });
}

async function endRound(round, minigame) {
    const entries = Object.entries(round.scores);
    if (entries.length === 0) return null;

    const [winnerId, winnerScore] =
        entries.sort((a, b) => b[1] - a[1])[0];

    round.winner = winnerId;
    round.isActive = false;

    // Save reward in DB
    const reward = new Reward({
        playerId: winnerId,
        type: "GOLD",
        amount: 1000,
        game: minigame
    });

    await reward.save();

    // Update player inventory immediately
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
        scores: round.scores,
        endedAt: Date.now()
    };

    pusher.trigger("game-round", "round-ended", payload);

    // Start fresh round
    startNewRound(minigame);

    return payload;
}


// ---------------------
// Public API
// ---------------------

exports.submitScore = async (req, res) => {
    console.log("score submit called");
    
    const { playerId, minigame, score } = req.body;

    if (!playerId || !minigame || typeof score !== "number") {
        return res.status(400).json({
            error: "Missing or invalid playerId/minigame/score"
        });
    }

    // Create round if none exists
    if (!rounds[minigame]) {
        console.log("new game round started")
        startNewRound(minigame);
    }
    console.log("rounds[minigame]", rounds[minigame]);

    const round = rounds[minigame];

    // Update best score
    const previous = round.scores[playerId] || 0;
    round.scores[playerId] = Math.max(previous, score);
    
    console.log("sending pusher event for score submission", { playerId, minigame, score });
    // private pusher event for this player in order to close the webview
    await pusher.trigger(`private-player.${playerId}`, "score-submitted", {
        minigame,
        score
    });

    // For testing: end round after first submission
    if (Object.keys(round.scores).length >= 1) {
        await endRound(round, minigame);
        return res.json({ message: "Round ended" });
    }

    res.json(formatRoundTopPlayer(round));

    // Push live update
    const topEntry = Object.entries(round.scores)
        .sort((a, b) => b[1] - a[1])[0];

    pusher.trigger("game-round", "round-updated", {
        game: minigame,
        roundId: round.roundId,
        topPlayer: topEntry?.[0] ?? null,
        topScore: topEntry?.[1] ?? null,
        scores: Object.entries(round.scores).map(([id, s]) => ({
            playerId: id,
            score: s
        }))
    });
};

exports.getRound = (req, res) => {
    const { minigame } = req.params;
    const round = rounds[minigame];

    if (!round)
        return res.status(404).json({ error: "Round not found" });

    res.json(formatRoundTopPlayer(round));
};

exports.setRound = (req, res) => {
    const { minigame, isActive, endsAt, scores, winner } = req.body;

    if (!minigame)
        return res.status(400).json({ error: "Missing minigame" });

    const scoresDict = {};
    if (Array.isArray(scores)) {
        for (const s of scores) {
            if (s.playerId && typeof s.score === "number") {
                scoresDict[s.playerId] = s.score;
            }
        }
    }

    rounds[minigame] = {
        roundId: `${minigame}_${Date.now()}`,
        isActive: isActive ?? true,
        endsAt: endsAt ?? Date.now() + 24 * 60 * 60 * 1000,
        scores: scoresDict,
        winner: winner ?? null
    };

    res.json({
        message: `Round for ${minigame} set`,
        round: formatRoundTopPlayer(rounds[minigame])
    });
};

exports.wakeUp = (req, res) => {
    pusher.trigger("server-status", "wake-up", {
        message: "Server is awake!"
    });

    res.json({ message: "Server is awake!" });
};
