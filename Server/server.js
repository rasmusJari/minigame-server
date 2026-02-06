// =====================
// Minimal Game Server
// =====================

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

function formatRoundTopPlayer(minigameRound) {
    // Determine top scorer
    let topPlayer = null;
    if (minigameRound.scores && Object.keys(minigameRound.scores).length > 0) {
        const sorted = Object.entries(minigameRound.scores).sort((a, b) => b[1] - a[1]);
        const [playerId, score] = sorted[0];
        topPlayer = {playerId, score};
    }
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
            isActive: true,
            endsAt: Date.now() + 24 * 60 * 60 * 1000, // 24h round
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
        // Determine winner
        const winnerEntry = Object.entries(round.scores)
            .sort((a, b) => b[1] - a[1])[0];

        if (winnerEntry) {
            round.winner = winnerEntry[0];
        }

        round.isActive = false;
    }

    // Return the updated round (with scores as array)
    const response = {
        roundId: minigame + "_current",
        isActive: round.isActive,
        endsAt: round.endsAt,
        scores: Object.entries(round.scores).map(([pid, s]) => ({
            playerId: pid,
            score: s
        })),
        winner: round.winner || null
    };

    res.json(response);
});

// ---------------------
// Get round data (top scorer only)
// ---------------------
app.get("/round_top/:minigame", (req, res) => {
    const minigame = req.params.minigame;
    const round = rounds[minigame];

    if (!round) return res.status(404).json({ error: "Round not found" });

    res.json(formatRoundTopPlayer(round));
});

// ---------------------
// Get round data endpoint
// ---------------------
app.get("/round_all/:minigame", (req, res) => {
    const minigame = req.params.minigame;
    const round = rounds[minigame];

    if (!round) {
        return res.status(404).json({ error: "Round not found" });
    }

    // Convert scores dictionary to array
    const response = {
        roundId: minigame + "_current",
        isActive: round.isActive,
        endsAt: round.endsAt,
        scores: Object.entries(round.scores).map(([pid, s]) => ({
            playerId: pid,
            score: s
        })),
        winner: round.winner || null
    };

    res.json(response);
});

// ---------------------
// Start server
// ---------------------
app.listen(port, () => {
    console.log(`Game server running at http://localhost:${port}`);
});


