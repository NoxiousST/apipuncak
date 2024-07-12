import {LaporanAktivitas, LaporanLetusan, Payments, TingkatAktivitas} from "./type";

require('dotenv').config();

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import parser, {HTMLElement} from "node-html-parser";
import {createClient} from '@supabase/supabase-js'
import Stripe from 'stripe';


const app = express();
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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


/*  <-- Stripe API -->  */

app.get("/publishkey", function (_, res) {
    res.json({publishable_key: process.env.STRIPE_PUBLISHABLE_KEY})
})

app.post("/create-payment-intent", async (req, res) => {
    let {name, email, amount, note} = req.body
    let customer: Stripe.Customer

    if (!amount || !email) return res.json({client_secret: ""})

    const customers = await stripe.customers.search({
        query: `email:'${email}'`,
    })

    if (customers.data.length > 0) customer = customers.data.at(0)
    else customer = await stripe.customers.create({name, email})

    const paymentIntent = await stripe.paymentIntents.create({
        customer: customer.id,
        receipt_email: email,
        amount,
        metadata: {
            note,
            display: name
        },
        currency: "idr",
    })

    return res.json({client_secret: paymentIntent.client_secret})
})

app.get("/payments", async function (_, res) {
    let paymentList: Payments = {count: 0, total: 0, intents: []};

    try {
        const resp = await stripe.paymentIntents.list({limit: 1000});
        const payments = resp.data.filter(intent => intent.status === 'succeeded');

        for (const intent of payments) {
            const customer = await stripe.customers.retrieve(intent.customer as string) as Stripe.Customer

            paymentList.intents.push({
                created: intent.created,
                amount: intent.amount,
                email: customer.email,
                name: customer.name,
                note: intent.metadata.note,
                display: intent.metadata.display
            });
        }

        const totalAmount = payments.reduce((sum, intent) => sum + intent.amount, 0);
        paymentList.count = payments.length;
        paymentList.total = totalAmount;

        res.json({paymentList});
    } catch (error) {
        console.error('Error retrieving payments:', error);
        res.status(500).json({error: 'Internal Server Error'});
    }
});



/*  <-- MAGMA Indonesia -->  */

app.get("/informasi-letusan", async (req, res) => {
    const {page} = req.query
    const data = await axios.get(`https://magma.esdm.go.id/v1/gunung-api/informasi-letusan?page=${page}`, {responseType: 'document'})
        .then(r => parser.parse(r.data))
        .then(r => informasiLetusan(r))

    return res.json({data})
})

app.get("/laporan", async (req, res) => {
    const {page} = req.query
    const data = await axios.get(`https://magma.esdm.go.id/v1/gunung-api/laporan?page=${page}`, {responseType: 'document'})
        .then(r => parser.parse(r.data))
        .then(r => laporanAktivitas(r))

    return res.json({data})
})

app.get("/laporan-harian", async (_, res) => {
    const data = await axios.get('https://magma.esdm.go.id/v1/gunung-api/laporan-harian', {responseType: 'document'})
        .then(r => parser.parse(r.data))
        .then(r => laporanHarian(r))

    return res.json({data})
})

app.get("/tingkat-aktivitas", async (_, res) => {
    const data = await axios.get('https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas', {responseType: 'document'})
        .then(r => parser.parse(r.data))
        .then(r => tingkatAktivitas(r))

    return res.json({data})
})

app.get("/data-laporan-aktivitas", async (req, res) => {
    const {url, map} = req.query

    const data = await axios.get(url.toString(), {responseType: 'document'})
        .then(r => parser.parse(r.data))
        .then(r => dataLaporanAktivitas(r, map == "true"))


    const database = await supabase.from("mountains").select("id, name, latitude, longitude, code").eq('name', data.name).single();
    if (database.data) {
        data.latitude = database.data.latitude;
        data.longitude = database.data.longitude;
        data.code = database.data.code
    }

    return res.json({data})
})

app.get("/data-laporan-letusan", async (req, res) => {
    const {url} = req.query
    const data = await axios.get(url.toString(), {responseType: 'document'})
        .then(r => parser.parse(r.data))
        .then(r => dataLaporanLetusan(r))

    const database = await supabase.from("mountains").select("id, name, latitude, longitude").eq('name', data.title).single();
    if (database.data) {
        data.latitude = database.data.latitude;
        data.longitude = database.data.longitude;
    }

    return res.json({data})
})

app.get("/mapbox", async (_, res) => {
    const response = await supabase.from("mountains").select("id, name, latitude, longitude");
    const respo = await axios.get('https://apipuncak.vercel.app/tingkat-aktivitas', {responseType: 'json'});
    const aktivitas: TingkatAktivitas[] = respo.data.data;

    const promises = [];

    aktivitas.forEach(act => {
        act.mounts.forEach(mount => {
            promises.push(
                axios.get(`https://apipuncak.vercel.app/data-laporan-aktivitas?url=${mount.link}&map=true`, {responseType: 'json'})
                    .then(resp => {
                        const dat = resp.data.data
                        const coord = response.data.find(c => c.name.toLowerCase().replace(/\s/g, '').trim() === mount.name.toLowerCase().replace(/\s/g, '').trim());
                        if (coord) {
                            mount.laporan = dat.laporan
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


/*  <-- Web Scrpping -->  */

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

function laporanAktivitas(root: HTMLElement) {
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

function dataLaporanAktivitas(root: HTMLElement, map: boolean): LaporanAktivitas {
    const main = root.querySelector(".card-blog")
    const content = main.querySelector(".card-body")
    const level = content.querySelector(".badge").text.trim()

    const title = content.querySelector(".card-title").text.trim()
    const regexTitle = /^(.+?),\s+(.+?),\s+(.+)$/;
    const matchTitle = title.match(regexTitle);
    const name = matchTitle[1];

    const cardGroup = root.querySelector('.card-columns');
    const cards = cardGroup.querySelectorAll(".card");

    const visual = cards[0].querySelector(".media-body").querySelector("p").text.trim()
    const image = cards[0].querySelector("img").getAttribute("src").trim()

    if (!map) {
        const date = matchTitle[2];
        const time = matchTitle[3];
        const geo = main.querySelector(".card-body").querySelector(".col-lg-6.pd-0").text.trim()

        let author = content.querySelector(".card-subtitle").text.trim()
        author = author.replace(/^Dibuat oleh,\s+/, '').trim();

        const klimatologi = cards[1].querySelector(".media-body").querySelector("p").text.trim()
        const gempa = cards[2].querySelector(".media-body").querySelectorAll("p").map(item => item.text.trim());
        const rekomendasi = cards[3].querySelector(".media-body").querySelector("p").text.replace(/\d+\.\s/g, "").split('\n\n').map(item => item.trim());

        return {level, name, date, time, author, geo, laporan: {image, visual, klimatologi, gempa, rekomendasi}};
    }

    return {level, name, laporan: {image, visual}};
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
                const image = item.querySelector(".img-fluid").getAttribute("src").trim()
                const url = item.querySelectorAll(".row.mg-b-15").at(1).querySelector("a").getAttribute("href")

                currentDay.children.push({type: 'timeline-item', time, author, title, text, image, url});
            }
        });
        if (currentDay) result.push(currentDay);
    }

    return result;
}

function dataLaporanLetusan(root: HTMLElement): LaporanLetusan {
    const main = root.querySelector(".card-blog")
    const content = main.querySelector(".card-body")
    const second = main.querySelector(".col-md-7.col-lg-6.col-xl-7")

    let image = ""
    if (content.querySelector(".img-fit-cover"))
        image = content.querySelector(".img-fit-cover").getAttribute("src").trim()
    const date = second.querySelector(".blog-category.tx-danger").text.trim()
    const title = second.querySelector(".blog-title").text.replace(/^Gunung Api\s*/, '').trim()
    const author = second.querySelector(".card-subtitle.tx-normal").text.split(', ')[1].trim()
    const description = second.querySelectorAll("p").at(2).text.trim()
    const rekomendasi = second.querySelector(".blog-text").childNodes.filter(it => it.text.trim() !== "").map(it => it.text.trim())

    return {image, date, title, author, description, rekomendasi};
}

function laporanHarian(root: HTMLElement) {
    const thead = root.querySelector('thead');
    const tbody = root.querySelector('tbody');

    const headers = thead.querySelectorAll('th').map(header => header.text.toLowerCase().trim().replace(` `, "_"));

    return tbody.querySelectorAll('tr').map(row => {
        const cells = row.querySelectorAll('td');
        const rowData = {};

        cells.forEach((cell, index) => {
            rowData[headers[index]] = Array.from(cell.childNodes)
                .filter(child => child.text.trim() !== "")
                .map(child => {
                    if (child.parentNode.outerHTML.includes("ol") || child.parentNode.outerHTML.includes("ul"))
                        return Array.from(child.parentNode.querySelectorAll('li'))
                            .map(li => li.text.replace(/\d+\.\s/g, "").trim());

                    return child.text.trim();
                })
                .flat();
        });

        return rowData;
    });
}


app.listen(3000, () => console.log('Server ready on port 3000.'));

module.exports = app;
