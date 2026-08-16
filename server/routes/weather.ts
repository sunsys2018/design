import { Router } from 'express'
import { getOrFetch, wantsRefresh } from '../services/cache.js'
import { fetchJson } from '../services/fetchUpstream.js'
import type { GeoResult, Weather, WeatherCondition } from '../../src/types/dashboard.js'

const router = Router()

const TTL = 10 * 60 * 1000 // Open-Meteo model steps are hourly
const SOURCE = 'Open-Meteo'

/** WMO weather interpretation codes -> label + icon. */
const WMO: Record<number, [string, string]> = {
  0: ['Clear sky', '☀️'],
  1: ['Mainly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Dense drizzle', '🌦️'],
  56: ['Freezing drizzle', '🌧️'],
  57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'],
  67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Snow', '🌨️'],
  75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '🌨️'],
  80: ['Light showers', '🌦️'],
  81: ['Showers', '🌧️'],
  82: ['Violent showers', '⛈️'],
  85: ['Snow showers', '🌨️'],
  86: ['Snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Thunderstorm, hail', '⛈️'],
  99: ['Thunderstorm, hail', '⛈️'],
}

function condition(code: number): WeatherCondition {
  const [label, icon] = WMO[code] ?? ['Unknown', '❓']
  return { code, label, icon }
}

type OpenMeteoResponse = {
  latitude: number
  longitude: number
  timezone: string
  current_units: { temperature_2m: string; wind_speed_10m: string }
  current: {
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    wind_speed_10m: number
    is_day: number
    weather_code: number
  }
  hourly: { time: string[]; temperature_2m: number[] }
  daily: {
    time: string[]
    temperature_2m_min: number[]
    temperature_2m_max: number[]
    weather_code: number[]
    precipitation_probability_max: (number | null)[]
  }
}

/** GET /api/weather?lat=&lon=&name= */
router.get('/', async (req, res) => {
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'lat and lon are required numbers' })
    return
  }
  const name = typeof req.query.name === 'string' && req.query.name ? req.query.name : 'Current location'

  // Round the key so tiny GPS jitter doesn't blow the cache on every poll.
  const key = `weather:${lat.toFixed(2)}:${lon.toFixed(2)}`

  const envelope = await getOrFetch<Weather>({ key, ttl: TTL, source: SOURCE, force: wantsRefresh(req.query) }, async () => {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,is_day,weather_code' +
      '&hourly=temperature_2m&forecast_hours=24' +
      '&daily=temperature_2m_min,temperature_2m_max,weather_code,precipitation_probability_max' +
      '&forecast_days=7&timezone=auto'

    const raw = await fetchJson<OpenMeteoResponse>(url)

    return {
      location: {
        name,
        latitude: raw.latitude,
        longitude: raw.longitude,
        timezone: raw.timezone,
      },
      current: {
        temperature: raw.current.temperature_2m,
        apparentTemperature: raw.current.apparent_temperature,
        humidity: raw.current.relative_humidity_2m,
        windSpeed: raw.current.wind_speed_10m,
        isDay: raw.current.is_day === 1,
        condition: condition(raw.current.weather_code),
      },
      hourly: raw.hourly.time.map((time, i) => ({
        time,
        temperature: raw.hourly.temperature_2m[i]!,
      })),
      daily: raw.daily.time.map((date, i) => ({
        date,
        min: raw.daily.temperature_2m_min[i]!,
        max: raw.daily.temperature_2m_max[i]!,
        condition: condition(raw.daily.weather_code[i]!),
        precipitationChance: raw.daily.precipitation_probability_max[i] ?? 0,
      })),
      units: {
        temperature: raw.current_units.temperature_2m,
        wind: raw.current_units.wind_speed_10m,
      },
    }
  })

  // The cached payload carries whatever name was current when it was fetched;
  // clone the object with the requested location name so we don't mutate the in-memory cache.
  const responseData = envelope.data
    ? {
        ...envelope.data,
        location: {
          ...envelope.data.location,
          name,
        },
      }
    : null

  res.json({ ...envelope, data: responseData })
})

type GeocodingResponse = {
  results?: {
    name: string
    latitude: number
    longitude: number
    country: string
    admin1?: string
  }[]
}

/** GET /api/weather/search?q= — city autocomplete. */
router.get('/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (q.length < 2) {
    res.json({ data: [], fetchedAt: new Date().toISOString(), stale: false, source: SOURCE })
    return
  }

  const envelope = await getOrFetch<GeoResult[]>(
    { key: `geo:${q.toLowerCase()}`, ttl: 24 * 60 * 60 * 1000, source: SOURCE },
    async () => {
      const url =
        'https://geocoding-api.open-meteo.com/v1/search' +
        `?name=${encodeURIComponent(q)}&count=6&language=en&format=json`
      const raw = await fetchJson<GeocodingResponse>(url)
      return (raw.results ?? []).map((r) => ({
        name: r.name,
        latitude: r.latitude,
        longitude: r.longitude,
        country: r.country,
        admin1: r.admin1,
      }))
    },
  )

  res.json(envelope)
})

export default router
