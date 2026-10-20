// 主要な山（約1,000山）のおすすめ度を計算して public/data/recommendations.json に書き出す。
// GitHub Actions で毎朝実行する。アプリと同じ計算コード（src/logic）を使う。
//
// 使い方:  npx tsx scripts/build-recommendations.ts
//   RECOMMENDATIONS_LIMIT=100 を付けると、名山から順に100山だけ計算する（手元での確認用）
//
// GitHub のサーバーは多くの人と共用なので、Open-Meteo から混雑（429）を返されやすい。
// 途中で時間切れや失敗になっても計算できた分は残るよう、
// 名山から順に計算し、ひとまとまりごとにファイルへ書き出す。
//
// 見どころの推定には過去（最大92日）の日別気温が要るが、過去の気温は一度取れば変わらない。
// そこで取った分を public/data/temps-history.json に残し（公開中のものを次の朝に使い回す）、
// 毎朝は前回以降の数日分だけを取り足す。これで問い合わせの量が4分の1ほどになる。

import { existsSync, renameSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { MountainCollection } from '../src/data/mountains'
import { addDays, toDateKey } from '../src/logic/date'
import { buildOutlook } from '../src/logic/outlook'
import {
  encodeCloud,
  encodeLevel,
  encodeWeather,
  type RecommendationsFile,
} from '../src/logic/recommendationsFile'
import { pastDaysNeeded, type SightId } from '../src/logic/sights'
import {
  FORECAST_DAYS,
  FORECAST_VARIABLE_COUNT,
  fetchDailyTemps,
  fetchForecasts,
  OpenMeteoError,
  type DailyTemp,
  type ForecastPoint,
} from '../src/logic/weather'

const DATA_DIR = fileURLToPath(new URL('../public/data/', import.meta.url))
const OUT_PATH = `${DATA_DIR}recommendations.json`
const HISTORY_PATH = `${DATA_DIR}temps-history.json`
/** 1回の問い合わせでまとめる地点の数 */
const CHUNK_SIZE = 50
/**
 * 1分あたりに使う問い合わせ回数の目安。Open-Meteo の無料枠は1分600回・1時間5,000回・1日1万回で、
 * 1地点ごとに「変数10個まで・2週間まで」を1回として、それを超えると割合に応じて多く数えられる。
 * 共用のサーバーでは他の人の分も数えられるので、上限の半分に抑える
 */
const CALLS_PER_MIN = 300
/** 取り足すとき、前回取った最後の数日も取り直す（前日分は後から少し直ることがあるため） */
const REFETCH_DAYS = 2
/** 計算にかける時間の上限（分）。超えたら、そこまでの結果で終える */
const BUDGET_MIN = Number(process.env.RECOMMENDATIONS_BUDGET_MIN ?? 70)
const LIMIT = Number(process.env.RECOMMENDATIONS_LIMIT ?? Infinity)
const deadline = Date.now() + BUDGET_MIN * 60_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const stats = { requests: 0, calls: 0, rateLimited: 0, failedGroups: 0, fullPastGroups: 0 }

class DailyLimitError extends Error {}

/** Open-Meteo での問い合わせ回数の数え方（地点ごとに、変数10個・2週間を超えた分だけ多く数える） */
function callWeight(points: number, variables: number, days: number): number {
  return points * Math.max(1, variables / 10) * Math.max(1, days / 14)
}

/** 次に問い合わせてよい時刻。使った回数に応じて間を空ける */
let nextRequestAt = 0

async function pace(weight: number) {
  const wait = nextRequestAt - Date.now()
  if (wait > 0) await sleep(wait)
  nextRequestAt = Date.now() + (weight / CALLS_PER_MIN) * 60_000
  stats.calls += weight
}

/** 混雑（429）や一時的なエラーのときは待って再試行する。1日の上限に達したら諦める */
async function withRetry<T>(weight: number, fn: () => Promise<T>): Promise<T> {
  let wait = 60_000
  for (let attempt = 0; ; attempt++) {
    try {
      await pace(weight)
      stats.requests++
      return await fn()
    } catch (e) {
      if (e instanceof OpenMeteoError && e.isDailyLimit) throw new DailyLimitError(e.message)
      if (e instanceof OpenMeteoError && e.status === 429) stats.rateLimited++
      if (attempt >= 4) throw e
      // サーバーが待ち時間を指定していればそれに従う
      const ms = e instanceof OpenMeteoError && e.retryAfterSec ? e.retryAfterSec * 1000 + 1000 : wait
      if (Date.now() + ms > deadline) throw e
      console.log(`  失敗（${(e as Error).message}）、${Math.round(ms / 1000)}秒待って再試行`)
      await sleep(ms)
      wait *= 2
    }
  }
}

type Target = { id: string; rank: number } & ForecastPoint

function chunks(targets: Target[]): Target[][] {
  // 名山 → その他の順に計算する（途中で止まっても名山の分は残るように）
  const sorted = [...targets].sort((a, b) => a.rank - b.rank)
  // 標高の分からない山は、地形データの標高を使ってもらうため1地点ずつ問い合わせる
  const withEle = sorted.filter((t) => t.elevation !== undefined)
  const withoutEle = sorted.filter((t) => t.elevation === undefined)
  const result: Target[][] = []
  for (let i = 0; i < withEle.length; i += CHUNK_SIZE) result.push(withEle.slice(i, i + CHUNK_SIZE))
  for (const t of withoutEle) result.push([t])
  return result
}

/**
 * 過去の日別気温のファイル（public/data/temps-history.json）。
 * 山ごとに、from の日から1日ずつの値を並べる（取れなかった日は null）
 */
type TempsHistoryFile = {
  generatedAt: string
  items: Record<string, { from: string; tmin: (number | null)[]; tmean: (number | null)[] }>
}

function loadHistory(): Map<string, DailyTemp[]> {
  const history = new Map<string, DailyTemp[]>()
  if (!existsSync(HISTORY_PATH)) return history
  try {
    const file: TempsHistoryFile = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'))
    for (const [id, { from, tmin, tmean }] of Object.entries(file.items)) {
      history.set(
        id,
        tmin.flatMap((min, i) => {
          const mean = tmean[i]
          return min === null || mean === null ? [] : [{ date: addDays(from, i), tmin: min, tmean: mean }]
        }),
      )
    }
  } catch (e) {
    console.log(`過去の気温のファイルを読めないので、使わずに計算する：${(e as Error).message}`)
  }
  return history
}

function encodeHistory(history: Map<string, DailyTemp[]>): TempsHistoryFile {
  const items: TempsHistoryFile['items'] = {}
  for (const [id, temps] of history) {
    if (!temps.length) continue
    const from = temps[0].date
    const days = Math.round((Date.parse(temps[temps.length - 1].date) - Date.parse(from)) / 86400000) + 1
    const tmin: (number | null)[] = Array(days).fill(null)
    const tmean: (number | null)[] = Array(days).fill(null)
    for (const t of temps) {
      const i = Math.round((Date.parse(t.date) - Date.parse(from)) / 86400000)
      tmin[i] = t.tmin
      tmean[i] = t.tmean
    }
    items[id] = { from, tmin, tmean }
  }
  return { generatedAt: new Date().toISOString(), items }
}

/** 途中で止められても壊れたファイルが残らないよう、別名で書いてから置き換える */
function writeJson(path: string, data: unknown) {
  writeFileSync(`${path}.tmp`, JSON.stringify(data))
  renameSync(`${path}.tmp`, path)
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

/**
 * このまとまりで取り直す過去の日数。全山の過去データが手元にあれば前回以降の数日分だけ、
 * なければ（初回や新しく加わった山）必要な日数をすべて
 */
function pastDaysToFetch(group: Target[], history: Map<string, DailyTemp[]>, today: string, pastDays: number) {
  const start = addDays(today, -pastDays)
  let days = 0
  for (const t of group) {
    const temps = history.get(t.id)
    if (!temps?.length || temps[0].date > start) return pastDays
    days = Math.max(days, daysBetween(temps[temps.length - 1].date, today) - 1 + REFETCH_DAYS)
  }
  return Math.min(pastDays, days)
}

async function main() {
  const startedAt = Date.now()
  const major: MountainCollection = JSON.parse(readFileSync(`${DATA_DIR}mountains-major.geojson`, 'utf-8'))
  const targets: Target[] = major.features
    .map((f) => ({
      id: f.properties.id,
      rank: f.properties.rank ?? 3,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      elevation: f.properties.ele,
    }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, LIMIT)

  const today = toDateKey(new Date())
  const pastDays = pastDaysNeeded(today)
  const start = addDays(today, -pastDays)
  // 過去の気温は、見どころの推定に要る分（最大92日）だけ残す
  const keepFrom = addDays(today, -92)
  const history = loadHistory()
  for (const [id, temps] of history) history.set(id, temps.filter((d) => d.date >= keepFrom && d.date < today))
  console.log(
    `${targets.length}山の予報を取得（見どころ用の過去データ: ${pastDays}日分、` +
      `前回までの過去データ: ${history.size}山分、上限 ${BUDGET_MIN}分）`,
  )

  const file: RecommendationsFile = { generatedAt: new Date().toISOString(), dates: [], items: {} }
  const groups = chunks(targets)
  let stoppedReason: string | null = null

  for (const [n, group] of groups.entries()) {
    if (Date.now() > deadline) {
      stoppedReason = `時間切れ（${BUDGET_MIN}分）`
      break
    }
    try {
      const forecasts = await withRetry(callWeight(group.length, FORECAST_VARIABLE_COUNT, FORECAST_DAYS), () =>
        fetchForecasts(group),
      )
      let temps: DailyTemp[][] = group.map(() => [])
      if (pastDays > 0) {
        const fetchDays = pastDaysToFetch(group, history, today, pastDays)
        if (fetchDays === pastDays) stats.fullPastGroups++
        const fresh = await withRetry(callWeight(group.length, 2, fetchDays + FORECAST_DAYS), () =>
          fetchDailyTemps(group, fetchDays),
        )
        // 手元の過去データのうち、今回取り直した日より前の分をつなげる
        const freshFrom = addDays(today, -fetchDays)
        temps = group.map((t, i) => [
          ...(history.get(t.id) ?? []).filter((d) => d.date >= start && d.date < freshFrom),
          ...fresh[i],
        ])
        group.forEach((t, i) => history.set(t.id, temps[i].filter((d) => d.date < today)))
      }

      group.forEach((t, i) => {
        const outlook = buildOutlook(forecasts[i], temps[i])
        if (!file.dates.length) file.dates = outlook.map((d) => d.date)
        // 見どころごとに、日付順の状態を1文字ずつ並べる（その日に時期外なら -）
        const g: Partial<Record<SightId, string>> = {}
        const ids = new Set(outlook.flatMap((d) => d.sights.map((s) => s.id)))
        for (const id of ids) {
          g[id] = outlook.map((d) => encodeLevel(d.sights.find((s) => s.id === id)?.level ?? 'none')).join('')
        }
        file.items[t.id] = {
          w: outlook.map((d) => encodeWeather(d.judgement.cls)).join(''),
          c: outlook.map((d) => d.weather.weatherCode),
          // 景色の良さ（雲の少なさ）を「すべて」の並び順に使う
          v: outlook.map((d) => encodeCloud(d.weather.cloudCoverAvg)).join(''),
          g,
        }
      })
      writeJson(OUT_PATH, file)
      // 計算できなかった山の分も、前回までの過去データは残す
      writeJson(HISTORY_PATH, encodeHistory(history))
    } catch (e) {
      if (e instanceof DailyLimitError) {
        stoppedReason = `Open-Meteo の1日の上限に達した（${e.message}）`
        break
      }
      // このまとまりは諦めて次へ進む（計算できた山の分は残す）
      stats.failedGroups++
      console.log(`  ${n + 1}番目のまとまりを取得できませんでした：${(e as Error).message}`)
    }
    if ((n + 1) % 5 === 0 || n === groups.length - 1) {
      console.log(`  ${n + 1}/${groups.length}（${Math.round((Date.now() - startedAt) / 60000)}分）`)
    }
  }

  const count = Object.keys(file.items).length
  const minutes = Math.round((Date.now() - startedAt) / 60000)
  console.log(
    `完了：${count}/${targets.length}山、${minutes}分、問い合わせ ${stats.requests}回` +
      `（Open-Meteo の数え方で約${Math.round(stats.calls)}回）、` +
      `過去データをすべて取り直したまとまり ${stats.fullPastGroups}個、` +
      `混雑 ${stats.rateLimited}回、取得できなかったまとまり ${stats.failedGroups}個` +
      (stoppedReason ? `、途中で終了：${stoppedReason}` : ''),
  )
  if (count === 0) {
    console.error('1山も計算できませんでした')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
