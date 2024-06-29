const express = require('express');
const router = express.Router();


require("dotenv").config()

/* GET users listing. */
router.get("/", function (req, res, next) {
    res.json({publishable_key: process.env.STRIPE_PUBLISHABLE_KEY})
})

module.exports = router;

