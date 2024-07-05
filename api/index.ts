require('dotenv').config();

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import parser, {HTMLElement} from "node-html-parser";

import {createClient} from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
        .then(r => tingkatAktivitas(r))

    return res.json({data})
})

app.get("/data-laporan", async (req, res) => {
    const link = req.query.url
    const data = await axios.get(link, {responseType: 'document'})
        .then(r => parser.parse(r.data))
        .then(r => dataLaporan(r))

    return res.json({data})
})

type Mount = {
    name: string;
    location: string;
    link: string;
    status: string;
    latitude: number;
    longitude: number;

    visual: string,
    gempa: string,
    rekomendasi: string

};

type TingkatAktivitas = {
    status: string;
    description: string;
    count: number;
    mounts: Mount[];
};

app.get("/mapbox", async (req, res) => {
    const response = await supabase.from("mountains").select("id, type, name, latitude, longitude, region");
    const respo = await axios.get('http://localhost:3000/tingkat-aktivitas', {responseType: 'json'});
    const aktivitas: TingkatAktivitas[] = respo.data.data;

    const promises = [];

    aktivitas.forEach(act => {
        act.mounts.forEach(mount => {
            promises.push(
                axios.get(`http://localhost:3000/data-laporan?url=${mount.link}`, {responseType: 'json'})
                    .then(resp => {
                        const laporan = resp.data.data
                        const coord = response.data.find(c => c.name.toLowerCase().replace(/\s/g, '').trim() === mount.name.toLowerCase().replace(/\s/g, '').trim());
                        if (coord) {
                            mount.visual = laporan.visual
                            mount.gempa = laporan.gempa
                            mount.rekomendasi = laporan.rekomendasi
                            mount.status = act.status
                            mount.latitude = coord.latitude
                            mount.longitude = coord.longitude
                        }
                    })
            );
        });
    });

    await Promise.all(promises);
    return res.json({aktivitas});
});

function dataLaporan(root: HTMLElement) {
    const cardGroup = root.querySelector('.card-columns');
    const cards = cardGroup.querySelectorAll(".card");

    const visual = cards[0].querySelector(".media-body").querySelector("p").text.trim()
    const gempa = cards[2].querySelector(".media-body").querySelectorAll("p").map(it => it.text.trim()).join("\n")
    const rekomendasi = cards[3].querySelector(".media-body").querySelector("p").text.replace(/\d+\.\s/g, "").trim()

    return {visual, gempa, rekomendasi};
}

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
                const time = item.querySelector(".timeline-time").text.trim()
                const author = item.querySelector(".timeline-author").lastChild.innerText
                const title = item.querySelector(".timeline-title").text.trim()
                const text = item.querySelector(".timeline-text").text.trim().replace(/\s+/g, ' ');
                const image = item.querySelector(".img-fluid").getAttribute("src")
                const url = item.querySelectorAll(".row.mg-b-15").at(1).querySelector("a").getAttribute("href")

                currentDay.children.push({type: 'timeline-item', time, author, title, text, image, url});
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

function tingkatAktivitas(root: HTMLElement) {
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
            const [name, location] = cells[0].firstChild.text.split(" - ")
            tableData.at(tableData.length - 1).mounts.push({
                name: name.trim(),
                location: location.trim(),
                link: cells[0].querySelector('a').getAttribute('href')
            })
        }
    });

    return tableData;
}

app.listen(3000, () => console.log('Server ready on port 3000.'));

module.exports = app;
