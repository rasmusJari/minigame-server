const express = require("express");
const router = express.Router();
const roundService = require("../services/round.service");

router.post("/submit-score", roundService.submitScore);
router.post("/submit-score-to-round", roundService.submitScoreToRound);
router.get("/round/:minigame", roundService.getRound);
router.get("/wake-up", roundService.wakeUp);
router.post("/join", roundService.joinRound);

module.exports = router;
