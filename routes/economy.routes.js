const express = require("express");
const router = express.Router();
const controller = require("../controllers/economy.controller");

router.get("/purchases", controller.getPurchases);
router.post("/try-purchase", controller.tryPurchase);
router.post("/get-pending-rewards", controller.getPendingRewards);
router.post("/add", controller.addCurrency);
router.post("/remove", controller.removeCurrency);

module.exports = router;
