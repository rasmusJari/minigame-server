const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require('dotenv').config({ path: '.env' });
console.log("ENV TEST:");
console.log(process.env.UNITY_PROJECT_ID);
console.log(process.env.UNITY_CLIENT_ID);
console.log(process.env.UNITY_CLIENT_SECRET);
console.log("Loaded ENV:", process.env);


const app = express();
const port = 3000;
const debugPlayerId = 'sk6oUJZbuy73Hb9K1ci7XtOM8KIm';
const debugPLayerToken = 'eyJhbGciOiJSUzI1NiIsImtpZCI6InB1YmxpYzo2NzQ2QjA5NC0zODNCLTRFMDYtQjA0OS04OUU4MTU1NjdBOUQiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOlsiaWRkOmZjMzM3MjFiLWZkZDItNGNmZS1hMDk0LTQxOTBmYTYxY2Y4YyIsImVudk5hbWU6ZGV2ZWxvcG1lbnQiLCJlbnZJZDphYjJhYmJkZS1kZmUxLTQ5YzEtODM5Ni00NTU2ZDVhOTY2YWMiLCJ1cGlkOjhkYjY5OTUyLTNkNDQtNGI4MC1iOGM4LWJmMzk2ZmFhNDU0MSJdLCJleHAiOjE3NzA5ODUzMjAsImlhdCI6MTc3MDk4MTcyMCwiaWRkIjoiZmMzMzcyMWItZmRkMi00Y2ZlLWEwOTQtNDE5MGZhNjFjZjhjIiwiaXNzIjoiaHR0cHM6Ly9wbGF5ZXItYXV0aC5zZXJ2aWNlcy5hcGkudW5pdHkuY29tIiwianRpIjoiNGQ4OWI1OWEtY2Y4Zi00Yzg5LThkNjQtMjg4ZGFjYzA4ZTRhIiwibmJmIjoxNzcwOTgxNzIwLCJwcm9qZWN0X2lkIjoiOGRiNjk5NTItM2Q0NC00YjgwLWI4YzgtYmYzOTZmYWE0NTQxIiwic2lnbl9pbl9wcm92aWRlciI6ImFub255bW91cyIsInN1YiI6InNrNm9VSlpidXk3M0hiOUsxY2k3WHRPTThLSW0iLCJ0b2tlbl90eXBlIjoiYXV0aGVudGljYXRpb24iLCJ2ZXJzaW9uIjoiMSJ9.VXSP6hFSyAvRwE2og4hgA-Lare5juKMLr_HqP7Mm91lIGaC1ra3Tu8mtpe5PnnE-LsjWaymstou9Pqpn-R8DUXP7QJyY99qfNw19mNar8cKqp0NYYur7gyjmZf4m4TvDeg9tyCFuzusjKRuZmZG_KnYcu-wYIPObiLz00aUwImTtfOeknY1gGPDUAckHNHBUjAO2ky1bQ0rLWSiuv30X39iVlk9SSofoN_bcrXP-DgS7IJmO_psJ2NNvMehJI-AVYDXjUvHgm5BHuCAxhT0g0kOnewZ55XHXdHHcrLDJbR3pE0b8_vFuBPv0hi2L-IXeftENnhEMR_JicsaFlzDqdQ';

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
app.listen(port, () => {
    console.log(`Game server running at http://localhost:${port}`);
    

    console.log("Pusher server started");
});
