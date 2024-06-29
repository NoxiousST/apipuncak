require('dotenv').config();

const express = require('express');
const app = express();
const path = require('path');

app.use(express.static('public'));

app.get("/publishkey", function (req, res, next) {
    res.json({publishable_key: process.env.STRIPE_PUBLISHABLE_KEY})
})



app.listen(3000, () => console.log('Server ready on port 3000.'));

module.exports = app;
