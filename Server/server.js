const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = 3000;

const pusherConfig = {
    appId: "2112425",
    key: "522fd10a074d964fa54f",
    secret: "0f1f6e3a1a097f5b1829",
    cluster: "eu",
    useTLS: true
};

const Pusher = require("pusher");

const pusher = new Pusher({
    appId: pusherConfig.appId,
    key: pusherConfig.key,
    secret: pusherConfig.secret,
    cluster: pusherConfig.cluster,
    useTLS: pusherConfig.useTLS
});

console.log("Pusher ticker started");

// setInterval(async () => {
//     const payload = {
//         message: "debug tick",
//         timestamp: new Date().toISOString()
//     };
//
//     await pusher.trigger("server-status", "tick", payload);
//
//     console.log("Sent debug tick", payload);
// }, 10_000);

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
// Functions
// ---------------------


/// Helper to format round
function formatRoundTopPlayer(minigameRound) {
    let topPlayer = null;
    
    if (minigameRound.scores) {
        for (const [playerId, value] of Object.entries(minigameRound.scores)) {

            let bestScore = null;

            if (Array.isArray(value)) {
                if (value.length === 0) continue;
                bestScore = Math.max(...value);
            }
            else if (typeof value === "number") {
                bestScore = value;
            }
            else {
                continue; // unsupported shape
            }

            if (!topPlayer || bestScore > topPlayer.score) {
                topPlayer = {
                    playerId,
                    score: bestScore
                };
            }
        }
    }

    return {
        roundId: minigameRound.roundId || "unknown",
        isActive: minigameRound.isActive,
        endsAt: minigameRound.endsAt,
        scores: topPlayer ? [topPlayer] : [],
        winner: topPlayer?.playerId ?? minigameRound.winner ?? null
    };
}



/// Game round ends
function endRound(round) {
    const entries = Object.entries(round.scores);
    if (entries.length === 0) return null;

    const [winnerId, winnerScore] = entries.sort((a, b) => b[1] - a[1])[0];

    const payload = {
        roundId: round.roundId,
        winnerId,
        winnerScore,
        scores: round.scores,
        endedAt: Date.now()
    };

    // // 🔥 PUSH EVENT
    // pusher.trigger("game-round", "round-ended", payload);

    return payload;
}

// ---------------------
// Submit score endpoint
// ---------------------
app.post("/submit-score", (req, res) => {
    const { playerId, minigame, score } = req.body;

    if (!playerId || !minigame || typeof score !== "number") {
        return res.status(400).json({ error: "Missing or invalid playerId/minigame/score" });
    }

    console.log("Received score submission", { playerId, minigame, score });
    
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

    const submittedEntries = Object.keys(round.scores).length
    console.log("submitted scores:", submittedEntries);
    
    if(submittedEntries > 1){
        // end game round and 
        console.log("game round ended for minigame", minigame);
        // 🔥 PUSH EVENT
        pusher.trigger("game-round", "round-ended", {message: "game round ended"});
        endRound(round);
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
    
    const data = formatRoundTopPlayer(round);

    res.json(data);
});

app.get("/wake-up/", (req, res) => {
    try {
        pusher.trigger("server-status", "wake-up", {message: "PusherMessage: Server is awake!"});
        console.log("Wake-up event sent successfully");
    } catch (e) {
        console.error("Error sending wake-up event:", e);
    }
    res.json({ message: "Server is awake!" });
})

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
    

    console.log("Pusher server started");
});
