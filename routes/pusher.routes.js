const express = require("express");
const router = express.Router();
const controller = require("../controllers/pusher.controller");

router.post("/auth", controller.authenticate);

module.exports = router;



