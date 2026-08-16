import path from 'node:path'
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

// Unknown /api/* routes should return JSON 404, not HTML
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

// In production the same Express process serves the built client, so the
// React app's relative /api/* calls hit this server with no extra config.
const distDir = path.resolve('dist')
app.use(express.static(distDir))
// SPA fallback: any non-API GET that isn't a static file gets index.html.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distDir, 'index.html'))
})

// Global error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server error]', err)
  res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
})

app.listen(port, () => {
  console.log(`[server] dashboard API listening on http://localhost:${port}`)
})
