// 山頂の天気予報（Open-Meteo）の取得と、日ごとの集計。
// アプリと定期計算（GitHub Actions）の両方で使うため、ブラウザ専用の機能には依存しない

export const FORECAST_DAYS = 7

/** 登山する時間帯（この時間の天気でおすすめ度を判断する） */
export const CLIMB_HOURS = { from: 6, to: 15 }
/** 雲海を見る時間帯（早朝） */
export const UNKAI_HOURS = { from: 5, to: 8 }
/** 霧氷ができる時間帯（夜〜朝） */
export const RIME_HOURS = { from: 0, to: 9 }

export type HourlyForecast = {
  time: string[]
  temperature_2m: number[]
  relative_humidity_2m: number[]
  precipitation: number[]
  precipitation_probability: (number | null)[]
  weather_code: number[]
  wind_speed_10m: number[]
  wind_gusts_10m: number[]
  cloud_cover: number[]
  cloud_cover_low: number[]
  cloud_cover_mid: number[]
  cloud_cover_high: number[]
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
  'relative_humidity_2m',
  'precipitation',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'snow_depth',
]
const DAILY_VARS = ['temperature_2m_max', 'temperature_2m_min']

/** 予報の問い合わせで取る変数の数（Open-Meteo は変数が10個を超えると問い合わせ回数を多く数える） */
export const FORECAST_VARIABLE_COUNT = HOURLY_VARS.length + DAILY_VARS.length

export type ForecastPoint = { lat: number; lon: number; elevation?: number }

/** Open-Meteo がエラーを返したとき。混雑（429）の再試行の判断に使う */
export class OpenMeteoError extends Error {
  readonly status: number
  readonly reason: string
  /** 何秒待ってから再試行すればよいか（サーバーが指定したとき） */
  readonly retryAfterSec: number | null

  constructor(status: number, reason: string, retryAfterSec: number | null) {
    super(`天気の取得に失敗しました（${status}${reason ? `：${reason}` : ''}）`)
    this.status = status
    this.reason = reason
    this.retryAfterSec = retryAfterSec
  }

  /** 1日の上限に達した（その日はもう待っても取れない） */
  get isDailyLimit(): boolean {
    return this.status === 429 && /daily/i.test(this.reason)
  }
}

/** 日ごとの気温（見どころの推定に使う） */
export type DailyTemp = { date: string; tmin: number; tmean: number }

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
  if (!res.ok) {
    const reason = await res
      .json()
      .then((b: { reason?: string }) => b.reason ?? '')
      .catch(() => '')
    const retryAfter = Number(res.headers.get('retry-after'))
    throw new OpenMeteoError(res.status, reason, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null)
  }
  const json = await res.json()
  return points.length === 1 && !Array.isArray(json) ? [json] : json
}

/** 7日間の予報（1時間ごと）を地点ごとに取得する */
export function fetchForecasts(points: ForecastPoint[]): Promise<Forecast[]> {
  return requestOpenMeteo<Forecast>(points, {
    hourly: HOURLY_VARS.join(','),
    daily: DAILY_VARS.join(','),
    forecast_days: String(FORECAST_DAYS),
    wind_speed_unit: 'ms',
  })
}

export async function fetchForecast(point: ForecastPoint): Promise<Forecast> {
  return (await fetchForecasts([point]))[0]
}

/** 過去 pastDays 日〜7日先の、日ごとの最低・平均気温（紅葉・新緑・高山植物の推定に使う） */
export async function fetchDailyTemps(points: ForecastPoint[], pastDays: number): Promise<DailyTemp[][]> {
  type Daily = { time: string[]; temperature_2m_min: (number | null)[]; temperature_2m_mean: (number | null)[] }
  const results = await requestOpenMeteo<{ daily: Daily }>(points, {
    daily: 'temperature_2m_min,temperature_2m_mean',
    past_days: String(pastDays),
    forecast_days: String(FORECAST_DAYS),
  })
  return results.map((r) =>
    r.daily.time.flatMap((date, i) => {
      const tmin = r.daily.temperature_2m_min[i]
      const tmean = r.daily.temperature_2m_mean[i]
      return tmin === null || tmean === null ? [] : [{ date, tmin, tmean }]
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
  /** 早朝（雲海の時間帯）の平均雲量（%）。低い雲・中くらいの雲・高い雲 */
  dawnCloudLow: number
  dawnCloudMid: number
  dawnCloudHigh: number
  /** 早朝の合計降水量（mm） */
  dawnPrecip: number
  /** 早朝の山頂の平均湿度（%）。100% 近いと山頂が雲（霧）の中 */
  dawnHumidity: number
  /** 夜〜朝（霧氷の時間帯）の最低気温（℃）・平均湿度（%）・平均風速（m/s） */
  rimeMinTemp: number
  rimeHumidity: number
  rimeWind: number
}

const max = (values: number[]) => values.reduce((a, b) => Math.max(a, b), -Infinity)
const min = (values: number[]) => values.reduce((a, b) => Math.min(a, b), Infinity)
const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1)

export function summarizeDays(forecast: Forecast): DaySummary[] {
  const h = forecast.hourly
  return forecast.daily.time.map((date, i) => {
    /** その日の from〜to 時の値を取り出す関数 */
    const hours = (from: number, to: number) => {
      const idx: number[] = []
      h.time.forEach((t, j) => {
        const hour = Number(t.slice(11, 13))
        if (t.startsWith(date) && hour >= from && hour <= to) idx.push(j)
      })
      return <T>(arr: T[]) => idx.map((j) => arr[j])
    }
    const climb = hours(CLIMB_HOURS.from, CLIMB_HOURS.to)
    const dawn = hours(UNKAI_HOURS.from, UNKAI_HOURS.to)
    const rime = hours(RIME_HOURS.from, RIME_HOURS.to)

    const probs = climb(h.precipitation_probability).filter((v): v is number => v !== null)
    const precip = climb(h.precipitation)
    const codes = climb(h.weather_code)
    const noon = h.time.indexOf(`${date}T12:00`)
    const snow = noon >= 0 ? h.snow_depth[noon] : null
    return {
      date,
      weatherCode: max(codes),
      tempMax: forecast.daily.temperature_2m_max[i],
      tempMin: forecast.daily.temperature_2m_min[i],
      windMax: max(climb(h.wind_speed_10m)),
      gustMax: max(climb(h.wind_gusts_10m)),
      precipProbMax: probs.length ? max(probs) : null,
      precipSum: precip.reduce((a, b) => a + b, 0),
      precipMaxHourly: max(precip),
      cloudCoverAvg: avg(climb(h.cloud_cover)),
      thunder: codes.some((c) => c >= 95),
      snowDepthCm: snow === null || snow === undefined ? null : Math.round(snow * 100),
      dawnCloudLow: avg(dawn(h.cloud_cover_low)),
      dawnCloudMid: avg(dawn(h.cloud_cover_mid)),
      dawnCloudHigh: avg(dawn(h.cloud_cover_high)),
      dawnPrecip: dawn(h.precipitation).reduce((a, b) => a + b, 0),
      dawnHumidity: avg(dawn(h.relative_humidity_2m)),
      rimeMinTemp: min(rime(h.temperature_2m)),
      rimeHumidity: avg(rime(h.relative_humidity_2m)),
      rimeWind: avg(rime(h.wind_speed_10m)),
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
