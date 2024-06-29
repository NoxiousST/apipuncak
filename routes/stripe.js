const express = require('express');
const router = express.Router();
require("dotenv").config()

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)


/* GET users listing. */
router.post('/', async function (req, res, next) {
    let { name, email, amount, note } = req.body
    let customer

    const customers = await stripe.customers.search({
        query: `email: '${email}'`,
    })

    if (customers.data.length > 0) customer = customers.data.at(0)
    else customer = await stripe.customers.create({ name, email })

    const paymentIntent = await stripe.paymentIntents.create({
        customer: customer.id,
        receipt_email: email,
        amount: amount,
        metadata: {
            "Pesan/Catatan Donatur": note,
        },
        currency: "idr",
    })

    return res.json({ client_secret: paymentIntent.client_secret })
});

module.exports = router;

