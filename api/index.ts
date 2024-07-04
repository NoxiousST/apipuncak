require('dotenv').config();

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import parser, {HTMLElement} from "node-html-parser";

const app = express();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(express.static('public'));

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

app.use(cors())

app.use(function (req, res, next) {
    const allowedOrigins = ['https://puncakdonasi.vercel.app', 'http://127.0.0.1:5173', 'http://localhost:5173'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.get("/publishkey", function (req, res) {
    res.json({publishable_key: process.env.STRIPE_PUBLISHABLE_KEY})
})

app.post("/create-payment-intent", async (req, res) => {
    let {name, email, amount, note} = req.body
    let customer

    const customers = await stripe.customers.search({
        query: `email: '${email}'`,
    })

    if (customers.data.length > 0) customer = customers.data.at(0)
    else customer = await stripe.customers.create({name, email})

    const paymentIntent = await stripe.paymentIntents.create({
        customer: customer.id,
        receipt_email: email,
        amount,
        metadata: {
            "Pesan/Catatan Donatur": note,
        },
        currency: "idr",
    })

    return res.json({client_secret: paymentIntent.client_secret})
})

app.get("/informasi-letusan", async (req, res) => {
    const data = await axios.get('https://magma.esdm.go.id/v1/gunung-api/informasi-letusan', {responseType: 'document'})
        .then(r => parser.parse(r.data))
        .then(r => informasiLetusan(r))

    return res.json({data})
})

app.get("/laporan", async (req, res) => {
    const data = await axios.get('https://magma.esdm.go.id/v1/gunung-api/laporan', {responseType: 'document'})
        .then(r => parser.parse(r.data))
        .then(r => laporan(r))

    return res.json({data})
})

app.get("/laporan-harian", async (req, res) => {
    const data = await axios.get('https://magma.esdm.go.id/v1/gunung-api/laporan-harian', {responseType: 'document'})
        .then(r => parser.parse(r.data))
        .then(r => laporanHarian(r))

    return res.json({data})
})

app.get("/tingkat-aktivitas", async (req, res) => {
    const data = await axios.get('https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas', {responseType: 'document'})
        .then(r => parser.parse(r.data))
        .then(r => htmlTableToJson(r))

    return res.json({data})
})

function informasiLetusan(root: HTMLElement) {
    const group = root.querySelector('.timeline-group');
    const result = [];
    let currentDay = null;

    if (group) {
        const items = group.querySelectorAll('.timeline-item');

        items.forEach(item => {
            if (item.classList.contains('timeline-day')) {
                if (currentDay) {
                    result.push(currentDay);
                }
                const date = item.querySelector(".timeline-date").text
                currentDay = {type: 'timeline-day', date, children: []};
            } else if (currentDay) {
                const time = item.querySelector(".timeline-time").text
                const author = item.querySelector(".timeline-author").lastChild.innerText
                const title = item.querySelector(".timeline-title").text
                const text = item.querySelector(".timeline-text").innerText.trim()
                const image = item.querySelector(".img-fluid").getAttribute("src")

                currentDay.children.push({type: 'timeline-item', time, author, title, text, image});
            }
        });

        if (currentDay) {
            result.push(currentDay);
        }
    }

    return result;
}

function laporan(root: HTMLElement) {
    const group = root.querySelector('.timeline-group');
    const result = [];
    let currentDay = null;

    if (group) {
        const items = group.querySelectorAll('.timeline-item');

        items.forEach(item => {
            if (item.classList.contains('timeline-day')) {
                if (currentDay) {
                    result.push(currentDay);
                }
                const date = item.querySelector(".timeline-date").text
                currentDay = {type: 'timeline-day', date, children: []};
            } else if (currentDay) {
                const time = item.querySelector(".timeline-time").text.trim()
                const date = item.querySelector(".timeline-author").lastChild.innerText
                const author = item.querySelector(".timeline-author").childNodes[1].innerText
                const title = item.querySelector(".timeline-title").firstChild.text
                const text = item.querySelector(".col-xs-12.col-md-12").childNodes[1].text
                const url = item.querySelector(".col-xs-12.col-md-12").childNodes[3].childNodes[0].parentNode.getAttribute("href")
                const status = item.querySelector(".badge").text
                currentDay.children.push({type: 'timeline-item', time, author, date, status, title, text, url});
            }
        });

        if (currentDay) {
            result.push(currentDay);
        }
    }

    return result;
}

function laporanHarian(root: HTMLElement) {
    const thead = root.querySelector('thead');
    const tbody = root.querySelector('tbody');

    const headers = thead.querySelectorAll('th').map(header => header.text.toLowerCase().trim().replace(` `, "_"));

    return tbody.querySelectorAll('tr').map(row => {
        const cells = row.querySelectorAll('td');
        const rowData = {};

        cells.forEach((cell, index) => {
            const cellContent = Array.from(cell.childNodes)
                .filter(child => child.text.trim() !== "")
                .map(child => {
                    if (child.parentNode.outerHTML.includes("ul") || child.parentNode.outerHTML.includes("ul"))
                        return Array.from(child.parentNode.querySelectorAll('li'))
                            .map(li => li.text.replace(/\d+\.\s/g, "").trim());
                    return child.text.trim();
                })
                .flat();

            rowData[headers[index]] = Array.isArray(cellContent) && cellContent.length === 1 ? cellContent[0] : cellContent;
        });

        return rowData;
    });
}

function htmlTableToJson(root: HTMLElement) {
    const tbody = root.querySelector('tbody');

    const rows = tbody.querySelectorAll('tr');
    const tableData = [];
    let mounts = [];

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
            const status = cells[0].querySelector('a').text.trim()
            const description = cells[0].querySelector('span').text.trim()
            const count = Number(cells[1].text.trim())

            tableData.push({
                status,
                description,
                count,
                mounts
            });
            mounts = [];

        } else {
            tableData.at(tableData.length - 1).mounts.push({
                name: cells[0].firstChild.text.trim(),
                link: cells[0].querySelector('a').getAttribute('href')
            })
        }
    });

    return tableData;
}

app.listen(3000, () => console.log('Server ready on port 3000.'));

module.exports = app;
