const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const port = 3000;

// ---------------------
// Middleware
// ---------------------
app.use(cors());
app.use(bodyParser.json());

// ---------------------
// In-memory storage
// ---------------------
const rounds = {}; // { minigame: { isActive, endsAt, scores, winner } }

// ---------------------
// Helper to format round
// ---------------------
function formatRoundTopPlayer(minigameRound) {
    // Determine top scorer
    let topPlayer = null;
    if (minigameRound.scores && Object.keys(minigameRound.scores).length > 0) {
        const sorted = Object.entries(minigameRound.scores).sort((a, b) => b[1] - a[1]);
        const [playerId, score] = sorted[0];
        topPlayer = { playerId, score };
    }

    return {
        roundId: minigameRound.roundId || "unknown",
        isActive: minigameRound.isActive,
        endsAt: minigameRound.endsAt,
        scores: topPlayer ? [topPlayer] : [],
        winner: minigameRound.winner || null
    };
}

// ---------------------
// Submit score endpoint
// ---------------------
app.post("/submit-score", (req, res) => {
    const { playerId, minigame, score } = req.body;

    if (!playerId || !minigame || typeof score !== "number") {
        return res.status(400).json({ error: "Missing or invalid playerId/minigame/score" });
    }

    // Create round if not exists
    if (!rounds[minigame]) {
        rounds[minigame] = {
            roundId: minigame + "_current",
            isActive: true,
            endsAt: Date.now() + 24 * 60 * 60 * 1000,
            scores: {},
            winner: null
        };
    }

    const round = rounds[minigame];

    // Update player's best score
    const prevScore = round.scores[playerId] || 0;
    round.scores[playerId] = Math.max(prevScore, score);

    // Check if round ended
    if (Date.now() >= round.endsAt && round.isActive) {
        const winnerEntry = Object.entries(round.scores)
            .sort((a, b) => b[1] - a[1])[0];
        round.winner = winnerEntry ? winnerEntry[0] : null;
        round.isActive = false;
    }

    res.json(formatRoundTopPlayer(round));
});

// ---------------------
// Get round data (top scorer only)
// ---------------------
app.get("/round/:minigame", (req, res) => {
    const minigame = req.params.minigame;
    const round = rounds[minigame];

    if (!round) return res.status(404).json({ error: "Round not found" });

    res.json(formatRoundTopPlayer(round));
});

// ---------------------
// Set round data manually
// ---------------------
app.post("/set-round", (req, res) => {
    const { minigame, isActive, endsAt, scores, winner } = req.body;

    if (!minigame) return res.status(400).json({ error: "Missing minigame" });

    // Convert scores array to dictionary
    const scoresDict = {};
    if (Array.isArray(scores)) {
        for (const s of scores) {
            if (s.playerId && typeof s.score === "number") {
                scoresDict[s.playerId] = s.score;
            }
        }
    }

    rounds[minigame] = {
        roundId: minigame + "_current",
        isActive: isActive !== undefined ? isActive : true,
        endsAt: endsAt || (Date.now() + 24 * 60 * 60 * 1000),
        scores: scoresDict,
        winner: winner || null
    };

    res.json({ message: `Round for ${minigame} set successfully`, round: formatRoundTopPlayer(rounds[minigame]) });
});

// ---------------------
// Start server
// ---------------------
app.listen(port, () => {
    console.log(`Game server running at http://localhost:${port}`);
});
