require('dotenv').config();

const express = require('express');
const cors = require('cors')
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

app.use(express.static('public'));
app.use(cors())

app.get("/publishkey", function (req, res) {
    res.json({publishable_key: process.env.STRIPE_PUBLISHABLE_KEY})
})

app.post("/create-payment-intent", async (req, res) => {
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
        amount,
        metadata: {
            "Pesan/Catatan Donatur": note,
        },
        currency: "idr",
    })

    return res.json({ client_secret: paymentIntent.client_secret })
})

app.listen(3000, () => console.log('Server ready on port 3000.'));

module.exports = app;
