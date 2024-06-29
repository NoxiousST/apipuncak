const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const indexRouter = require('./routes/index');
const stripeRouter = require('./routes/stripe');
const pkRouter = require('./routes/publishkey');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/stripe', stripeRouter);
app.use('/publishkey', pkRouter);

module.exports = app;
