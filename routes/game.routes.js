const express = require('express');
const router = express.Router();
const controller = require("../controllers/game.controller");

router.get('/list', controller.getGames);

module.exports = router;