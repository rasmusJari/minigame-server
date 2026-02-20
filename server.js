require('dotenv').config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const playerRoutes = require("./routes/player.routes");
const economyRoutes = require("./routes/economy.routes");
const roundRoutes = require("./routes/round.routes");
const pusherRoutes = require("./routes/pusher.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Route groups
app.use("/player", playerRoutes);
app.use("/economy", economyRoutes);
app.use("/", roundRoutes);
app.use("/pusher", pusherRoutes);

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");

        app.listen(process.env.PORT || 3000, () => {
            console.log(`Server running on port ${process.env.PORT || 3000}`);
        });
    } catch (err) {
        console.error("Mongo connection failed:", err);
        process.exit(1);
    }
}

startServer();
