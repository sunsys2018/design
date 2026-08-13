import express from 'express'
import dotenv from 'dotenv'

import weather from './routes/weather.js'
import news from './routes/news.js'
import trends from './routes/trends.js'
import stocks from './routes/stocks.js'
import fx from './routes/fx.js'
import rates from './routes/rates.js'

dotenv.config({ path: '.env.local', quiet: true })

const app = express()
// Render (and most PaaS hosts) inject PORT; SERVER_PORT remains the local-dev override.
const port = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 3001)

// This API is intentionally public and credential-free. The static frontend
// runs on a separate origin in production, so every response must opt in to
// cross-origin reads. OPTIONS support keeps future non-simple requests safe.
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

// `?refresh=1` is handled per-route via wantsRefresh(), which bypasses that
// one key's TTL. It deliberately is NOT a global cache clear: refreshing one
// panel must not discard the fallback data every other panel would need if its
// upstream happened to be down.
app.use('/api/weather', weather)
app.use('/api/news', news)
app.use('/api/trends', trends)
app.use('/api/stocks', stocks)
app.use('/api/fx', fx)
app.use('/api/rates', rates)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

app.listen(port, () => {
  console.log(`[server] dashboard API listening on http://localhost:${port}`)
})
