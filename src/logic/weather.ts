// 山頂の天気予報（Open-Meteo）の取得と、日ごとの集計。
// アプリと定期計算（GitHub Actions）の両方で使うため、ブラウザ専用の機能には依存しない

import type { DailyMin } from './koyo'

export const FORECAST_DAYS = 7

/** 登山する時間帯（この時間の天気でおすすめ度を判断する） */
export const CLIMB_HOURS = { from: 6, to: 15 }

export type HourlyForecast = {
  time: string[]
  temperature_2m: number[]
  precipitation: number[]
  precipitation_probability: (number | null)[]
  weather_code: number[]
  wind_speed_10m: number[]
  wind_gusts_10m: number[]
  cloud_cover: number[]
  snow_depth: (number | null)[]
}

export type Forecast = {
  /** 予報を計算した標高（m） */
  elevation: number
  hourly: HourlyForecast
  daily: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
  }
}

const HOURLY_VARS = [
  'temperature_2m',
  'precipitation',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'snow_depth',
]

export type ForecastPoint = { lat: number; lon: number; elevation?: number }

/** 複数の地点をまとめて問い合わせる（Open-Meteo は地点をカンマ区切りで受け付ける） */
async function requestOpenMeteo<T>(points: ForecastPoint[], params: Record<string, string>): Promise<T[]> {
  const search = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    timezone: 'Asia/Tokyo',
    ...params,
  })
  // 標高を渡すと、山頂の高さに合わせて気温などを補正してくれる。
  // 渡さなければ Open-Meteo が地形データの標高を使う。複数地点で一部だけ分からない場合は
  // nan（補正なし）になるため、標高の分からない山は1地点ずつ問い合わせるのが望ましい
  if (points.some((p) => p.elevation !== undefined)) {
    search.set('elevation', points.map((p) => (p.elevation === undefined ? 'nan' : String(p.elevation))).join(','))
  }
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${search}`)
  if (!res.ok) throw new Error(`天気の取得に失敗しました（${res.status}）`)
  const json = await res.json()
  return points.length === 1 && !Array.isArray(json) ? [json] : json
}

/** 7日間の予報（1時間ごと）を地点ごとに取得する */
export function fetchForecasts(points: ForecastPoint[]): Promise<Forecast[]> {
  return requestOpenMeteo<Forecast>(points, {
    hourly: HOURLY_VARS.join(','),
    daily: 'temperature_2m_max,temperature_2m_min',
    forecast_days: String(FORECAST_DAYS),
    wind_speed_unit: 'ms',
  })
}

export async function fetchForecast(point: ForecastPoint): Promise<Forecast> {
  return (await fetchForecasts([point]))[0]
}

/** 過去 pastDays 日〜7日先の、日ごとの最低気温（紅葉の推定に使う） */
export async function fetchDailyMins(points: ForecastPoint[], pastDays: number): Promise<DailyMin[][]> {
  const results = await requestOpenMeteo<{ daily: { time: string[]; temperature_2m_min: (number | null)[] } }>(
    points,
    {
      daily: 'temperature_2m_min',
      past_days: String(pastDays),
      forecast_days: String(FORECAST_DAYS),
    },
  )
  return results.map((r) =>
    r.daily.time.flatMap((date, i) => {
      const tmin = r.daily.temperature_2m_min[i]
      return tmin === null ? [] : [{ date, tmin }]
    }),
  )
}

export type DaySummary = {
  date: string
  /** 登山時間帯でいちばん悪い天気 */
  weatherCode: number
  tempMax: number
  tempMin: number
  /** 登山時間帯の最大風速・最大瞬間風速（m/s） */
  windMax: number
  gustMax: number
  /** 登山時間帯の最大降水確率（%）。予報がない日は null */
  precipProbMax: number | null
  /** 登山時間帯の合計降水量・1時間の最大降水量（mm） */
  precipSum: number
  precipMaxHourly: number
  /** 登山時間帯の平均雲量（%） */
  cloudCoverAvg: number
  thunder: boolean
  /** 正午の推定積雪深（cm）。不明なら null */
  snowDepthCm: number | null
}

const max = (values: number[]) => values.reduce((a, b) => Math.max(a, b), -Infinity)

export function summarizeDays(forecast: Forecast): DaySummary[] {
  const h = forecast.hourly
  return forecast.daily.time.map((date, i) => {
    const idx: number[] = []
    h.time.forEach((t, j) => {
      const hour = Number(t.slice(11, 13))
      if (t.startsWith(date) && hour >= CLIMB_HOURS.from && hour <= CLIMB_HOURS.to) idx.push(j)
    })
    const pick = <T>(arr: T[]) => idx.map((j) => arr[j])
    const probs = pick(h.precipitation_probability).filter((v): v is number => v !== null)
    const precip = pick(h.precipitation)
    const codes = pick(h.weather_code)
    const noon = h.time.indexOf(`${date}T12:00`)
    const snow = noon >= 0 ? h.snow_depth[noon] : null
    return {
      date,
      weatherCode: max(codes),
      tempMax: forecast.daily.temperature_2m_max[i],
      tempMin: forecast.daily.temperature_2m_min[i],
      windMax: max(pick(h.wind_speed_10m)),
      gustMax: max(pick(h.wind_gusts_10m)),
      precipProbMax: probs.length ? max(probs) : null,
      precipSum: precip.reduce((a, b) => a + b, 0),
      precipMaxHourly: max(precip),
      cloudCoverAvg: pick(h.cloud_cover).reduce((a, b) => a + b, 0) / Math.max(idx.length, 1),
      thunder: codes.some((c) => c >= 95),
      snowDepthCm: snow === null || snow === undefined ? null : Math.round(snow * 100),
    }
  })
}

/** WMO の天気コードを表示用の記号と言葉にする */
export function describeWeather(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: '快晴' }
  if (code === 1) return { icon: '☀️', label: '晴れ' }
  if (code === 2) return { icon: '🌤️', label: '晴れ時々曇り' }
  if (code === 3) return { icon: '☁️', label: '曇り' }
  if (code === 45 || code === 48) return { icon: '🌫️', label: '霧' }
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: '霧雨' }
  if (code >= 61 && code <= 67) return { icon: '🌧️', label: '雨' }
  if (code >= 71 && code <= 77) return { icon: '🌨️', label: '雪' }
  if (code >= 80 && code <= 82) return { icon: '🌦️', label: 'にわか雨' }
  if (code === 85 || code === 86) return { icon: '🌨️', label: 'にわか雪' }
  if (code >= 95) return { icon: '⛈️', label: '雷雨' }
  return { icon: '❔', label: '不明' }
}
