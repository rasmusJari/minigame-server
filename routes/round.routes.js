const express = require("express");
const router = express.Router();
const roundService = require("../services/round.service");

router.post("/submit-score", roundService.submitScore);
router.get("/round/:minigame", roundService.getRound);
router.get("/wake-up", roundService.wakeUp);

module.exports = router;
