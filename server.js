const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require('dotenv').config({ path: '.env' });
console.log("Loaded ENV:", process.env);
const debugPlayerId = 'sk6oUJZbuy73Hb9K1ci7XtOM8KIm';

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


// ---------------------
// In-memory storage
// ---------------------
const rounds = {}; // { minigame: { isActive, endsAt, scores, winner } }

//***************************** DATABASE SETUP (MONGODB) *****************************
require('dotenv').config();
const mongoose = require('mongoose');
const Player = require('./models/Player');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("MongoDB connected");

        app.listen(process.env.PORT || 3000, () => {
            console.log(`Server running at http://localhost:${process.env.PORT || 3000}`);
        });

    } catch (err) {
        console.error("Mongo connection failed:", err);
        process.exit(1);
    }
}

startServer();


// --- Get player state ---
app.get('/player/:playerId', async (req, res) => {
    const { playerId } = req.params;
    let player = await Player.findOne({ playerId });
    if (!player) {
        return res.status(404).json({ error: 'Player not found' });
    }
    res.json(player);
});

// --- Create / ensure player ---
app.post("/player", async (req, res) => {
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
            {
                new: true,
                upsert: true
            }
        );

        res.json({
            success: true,
            player
        });

    } catch (error) {
        console.error("Create player error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});


// --- Add pending reward ---
app.post('/player/:playerId/reward', async (req, res) => {
    const { playerId } = req.params;
    const { type, amount } = req.body;
    const player = await Player.findOne({ playerId });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    player.pendingRewards.push({ type, amount });
    await player.save();
    res.json(player.pendingRewards);
});

// --- Apply rewards (consume) ---
app.post('/player/:playerId/claim', async (req, res) => {
    const { playerId } = req.params;
    const player = await Player.findOne({ playerId });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    player.pendingRewards.forEach(r => {
        if (player.currencies[r.type] != null) {
            player.currencies[r.type] += r.amount;
        } else {
            player.currencies[r.type] = r.amount;
        }
    });

    player.pendingRewards = []; // Clear after claiming
    await player.save();
    res.json(player.currencies);
});

/**********************************************************************/
//****************** END DATABASE SETUP *******************************
/**********************************************************************/




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
function endRound(round, minigame) {
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

    // Clear round
    delete entries[minigame];

    // Start new round
    startNewRound(minigame);
    
    return payload;
}

function startNewRound(minigame) {
    rounds[minigame] = {
        roundId: minigame + "_" + Date.now(),
        isActive: true,
        endsAt: Date.now() + 3600000, // 60 minutes
        scores: {},
        winner: null
    };

    console.log("New round started:", rounds[minigame].roundId);

    pusher.trigger("game-round", "round-started", {
        roundId: rounds[minigame].roundId,
        endsAt: rounds[minigame].endsAt
    });
}


// ---------------------
// Submit score endpoint
// ---------------------
app.post("/submit-score", (req, res) => {
    
    console.log("submit-score called with body");
    const { playerId, playerToken, minigame, score } = req.body;

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
    
    if(submittedEntries > 2){
        // end game round and 
        console.log("game round ended for minigame", minigame);
        
        // evaluate winner and prepare payload
        const winnerEntry = Object.entries(round.scores)
            .sort((a, b) => b[1] - a[1])[0];
        round.winner = winnerEntry ? winnerEntry[0] : null;

        // 🔥 PUSH EVENT
        const data = {
            roundId: round.roundId,
            endedAt: Date.now(),
            winner: winnerEntry ? winnerEntry[0] : null,

            scores: Object.entries(round.scores).map(([playerId, score]) => ({
                playerId,
                score
            }))
        };

        pusher.trigger("game-round", "round-ended", data);
        endRound(round, minigame);
        return;
    }

    res.json(formatRoundTopPlayer(round));
    
    console.log("sending game round updated event for minigame", minigame);

     // 🔥 PUSH EVENT
    const topEntry = Object.entries(round.scores)
        .sort((a, b) => b[1] - a[1])[0];
    const topPlayer = topEntry ? topEntry[0] : null;
    const topScore = topEntry ? topEntry[1] : null;
     const data = {
         game: minigame,
        roundId: round.roundId,
        endedAt: Date.now(),
        topPlayer: topPlayer,
         topScore: topScore,
        scores: Object.entries(round.scores).map(([playerId, score]) => ({
            playerId,
            playerToken,
            score
        }))
    };
    pusher.trigger("game-round", "round-updated", data);
    console.log("round-updated event sent", data);

    
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
// app.listen(process.env.PORT, () => {
//     console.log(`Game server running at http://localhost:${process.env.PORT}`);
//    
//
//     console.log("Pusher server started");
// });
