const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
    purchaseId: { type: String, required: true, unique: true },
    costs: [{
        type: { type: String, required: true },
        amount: { type: Number, required: true }
    }],
    rewards: [{
        type: { type: String, required: true },
        amount: { type: Number, required: true }
    }],
});

module.exports = mongoose.model('Purchase', purchaseSchema);