require('dotenv').config()

const morgan = require('morgan')
const express = require('express')
const bodyParser = require('body-parser')
const models = require('./models')
const api = require('./api')(
  process.env.SIMPLEX_SANDBOX === 'true',
  process.env.SIMPLEX_PARTNER_ID,
  process.env.SIMPLEX_API_KEY)
const Ajv = require('ajv')

// Added request header to logging
morgan.token('x-forwarded-for', function (req, res) {
  return req.headers['x-forwarded-for']
})
const logFormat = ':x-forwarded-for [:date[clf]] ":method :url HTTP/:http-version" :status'

/* Setup json-schema parser */
const ajv = new Ajv()
const quoteSchema = require('./schemas/quote.json')
const partnerDataSchema = require('./schemas/partner-data.json')
ajv.addSchema(quoteSchema, 'quote')
ajv.addSchema(partnerDataSchema, 'partner-data')

const clientIp = (req) => {
  return process.env.IP_ADDRESS_OVERRIDE
    || req.headers['x-forwarded-for']
    || req.connection.remoteAddress
}

const app = express()
app.use(morgan(logFormat))
app.use(bodyParser.json())
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE')
  next()
})
app.get('/redirect', function (req, res) {
  res.redirect('edge-ret://plugins/simplex')
})
app.post('/quote', async function (req, res) {
  if (!ajv.validate('quote', req.body)) {
    return res.status(403).json({res:null, err:ajv.errors})
  }
  try {
    const response = await api.getQuote(
      req.body.digital_currency,
      req.body.fiat_currency,
      req.body.requested_currency,
      req.body.requested_amount,
      req.body.client_id,
      clientIp(req)
    )
    res.json({res:response, err:null})
  } catch (e) {
    console.log(e.message)
    res.status(403).json({res:null, err:e.message})
  }
})

app.post('/partner/data', async function (req, res) {
  if (!ajv.validate('partner-data', req.body)) {
    return res.status(403).json({res:null, err:ajv.errors})
  }
  const client_ip = process.env.IP_ADDRESS_OVERRIDE
                 || req.headers['x-forwarded-for']
                 || req.connection.remoteAddress
  try {
    const response = await api.getPartnerData(
      req.body, clientIp(req))
    await models.requestCreate(
      req.body.account_details.app_end_user_id,
      req.body.transaction_details.payment_details)
    res.json({res:response, err:null})
  } catch (e) {
    console.log(e.message)
    res.status(403).json({res:null, err:e.message})
  }
})

app.get('/payments/:userId/', async function (req, res) {
  try {
    const response = await models.payments(req.params.userId)
    res.json({res:response, err:null})
  } catch (e) {
    console.log(e.message)
    res.status(403).json({res:null, err:e.message})
  }
})

app.get('/payments/:userId/:paymentId/', async function (req, res) {
  try {
    const response = await models.events(req.params.userId, req.params.paymentId)
    res.json({res:response, err:null})
  } catch (e) {
    console.log(e.message)
    res.status(403).json({res:null, err:e.message})
  }
})

app.listen(process.env.PORT)
