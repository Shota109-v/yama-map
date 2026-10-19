// 主要な山（約1,000山）のおすすめ度を計算して public/data/recommendations.json に書き出す。
// GitHub Actions で毎朝実行する。アプリと同じ計算コード（src/logic）を使う。
//
// 使い方:  npx tsx scripts/build-recommendations.ts
//
// GitHub のサーバーは多くの人と共用なので、Open-Meteo から混雑（429）を返されやすい。
// 途中で時間切れや失敗になっても計算できた分は残るよう、
// 名山から順に計算し、ひとまとまりごとにファイルへ書き出す。

import { renameSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { MountainCollection } from '../src/data/mountains'
import { toDateKey } from '../src/logic/date'
import { buildOutlook } from '../src/logic/outlook'
import {
  encodeLevel,
  encodeWeather,
  type RecommendationsFile,
} from '../src/logic/recommendationsFile'
import { pastDaysNeeded, type SightId } from '../src/logic/sights'
import {
  fetchDailyTemps,
  fetchForecasts,
  OpenMeteoError,
  type DailyTemp,
  type ForecastPoint,
} from '../src/logic/weather'

const DATA_DIR = fileURLToPath(new URL('../public/data/', import.meta.url))
const OUT_PATH = `${DATA_DIR}recommendations.json`
/** 1回の問い合わせでまとめる地点の数 */
const CHUNK_SIZE = 50
/**
 * 問い合わせの間隔（ms）。Open-Meteo の無料枠は1分あたり600回で、
 * 地点の数と期間（2週間ごと）に応じて回数が数えられる。
 * 過去データ付きの問い合わせは 50地点 × 約4〜7 = 200〜350回分になるので、十分に間を空ける
 */
const FORECAST_INTERVAL_MS = 6_000
const PAST_INTERVAL_MS = 40_000
/** 計算にかける時間の上限（分）。超えたら、そこまでの結果で終える */
const BUDGET_MIN = Number(process.env.RECOMMENDATIONS_BUDGET_MIN ?? 70)
const deadline = Date.now() + BUDGET_MIN * 60_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const stats = { requests: 0, rateLimited: 0, failedGroups: 0 }

class DailyLimitError extends Error {}

/** 混雑（429）や一時的なエラーのときは待って再試行する。1日の上限に達したら諦める */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let wait = 60_000
  for (let attempt = 0; ; attempt++) {
    try {
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

/** 途中で止められても壊れたファイルが残らないよう、別名で書いてから置き換える */
function save(file: RecommendationsFile) {
  writeFileSync(`${OUT_PATH}.tmp`, JSON.stringify(file))
  renameSync(`${OUT_PATH}.tmp`, OUT_PATH)
}

async function main() {
  const startedAt = Date.now()
  const major: MountainCollection = JSON.parse(readFileSync(`${DATA_DIR}mountains-major.geojson`, 'utf-8'))
  const targets: Target[] = major.features.map((f) => ({
    id: f.properties.id,
    rank: f.properties.rank ?? 3,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    elevation: f.properties.ele,
  }))

  const today = toDateKey(new Date())
  const pastDays = pastDaysNeeded(today)
  console.log(`${targets.length}山の予報を取得（見どころ用の過去データ: ${pastDays}日分、上限 ${BUDGET_MIN}分）`)

  const file: RecommendationsFile = { generatedAt: new Date().toISOString(), dates: [], items: {} }
  const groups = chunks(targets)
  let stoppedReason: string | null = null

  for (const [n, group] of groups.entries()) {
    if (Date.now() > deadline) {
      stoppedReason = `時間切れ（${BUDGET_MIN}分）`
      break
    }
    try {
      const forecasts = await withRetry(() => fetchForecasts(group))
      await sleep(FORECAST_INTERVAL_MS)
      let temps: DailyTemp[][] = group.map(() => [])
      if (pastDays > 0) {
        temps = await withRetry(() => fetchDailyTemps(group, pastDays))
        await sleep(group.length > 1 ? PAST_INTERVAL_MS : FORECAST_INTERVAL_MS)
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
          g,
        }
      })
      save(file)
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
    `完了：${count}/${targets.length}山、${minutes}分、問い合わせ ${stats.requests}回、` +
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
