const express = require("express");
const router = express.Router();
const controller = require("../controllers/player.controller");

router.post("/get", controller.getPlayer);
router.post("/", controller.createOrEnsurePlayer);
router.post("/inventory", controller.getInventory);
router.post("/inventory/try-consume", controller.tryConsumeCurrency);
router.post("/currency/add", controller.addCurrency);
router.post("/:playerId/reward", controller.addPendingReward);
router.post("/:playerId/claim", controller.claimRewards);

module.exports = router;
