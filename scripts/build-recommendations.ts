// 主要な山（約1,000山）のおすすめ度を計算して public/data/recommendations.json に書き出す。
// GitHub Actions で毎朝実行する。アプリと同じ計算コード（src/logic）を使う。
//
// 使い方:  npx tsx scripts/build-recommendations.ts

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { MountainCollection } from '../src/data/mountains'
import { toDateKey } from '../src/logic/date'
import { koyoPastDaysNeeded, type DailyMin } from '../src/logic/koyo'
import { buildOutlook } from '../src/logic/outlook'
import {
  encodeKoyo,
  encodeWeather,
  type RecommendationsFile,
} from '../src/logic/recommendationsFile'
import { fetchDailyMins, fetchForecasts, type ForecastPoint } from '../src/logic/weather'

const DATA_DIR = fileURLToPath(new URL('../public/data/', import.meta.url))
/** 1回の問い合わせでまとめる地点の数 */
const CHUNK_SIZE = 50
/**
 * 問い合わせの間隔（ms）。Open-Meteo の無料枠は1分あたり600回で、
 * 地点の数と期間（2週間ごと）に応じて回数が数えられる。
 * 過去データ付きの問い合わせは 50地点 × 約4〜7 = 200〜350回分になるので、十分に間を空ける
 */
const FORECAST_INTERVAL_MS = 6_000
const PAST_INTERVAL_MS = 40_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let wait = 60_000
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= 4) throw e
      console.log(`  失敗（${(e as Error).message}）、${wait / 1000}秒待って再試行`)
      await sleep(wait)
      wait *= 2
    }
  }
}

type Target = { id: string } & ForecastPoint

function chunks(targets: Target[]): Target[][] {
  // 標高の分からない山は、地形データの標高を使ってもらうため1地点ずつ問い合わせる
  const withEle = targets.filter((t) => t.elevation !== undefined)
  const withoutEle = targets.filter((t) => t.elevation === undefined)
  const result: Target[][] = []
  for (let i = 0; i < withEle.length; i += CHUNK_SIZE) result.push(withEle.slice(i, i + CHUNK_SIZE))
  for (const t of withoutEle) result.push([t])
  return result
}

async function main() {
  const major: MountainCollection = JSON.parse(
    readFileSync(`${DATA_DIR}mountains-major.geojson`, 'utf-8'),
  )
  const targets: Target[] = major.features.map((f) => ({
    id: f.properties.id,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    elevation: f.properties.ele,
  }))

  const today = toDateKey(new Date())
  const pastDays = koyoPastDaysNeeded(today)
  console.log(`${targets.length}山の予報を取得（紅葉用の過去データ: ${pastDays}日分）`)

  const file: RecommendationsFile = { generatedAt: new Date().toISOString(), dates: [], items: {} }
  const groups = chunks(targets)
  for (const [n, group] of groups.entries()) {
    const forecasts = await withRetry(() => fetchForecasts(group))
    await sleep(FORECAST_INTERVAL_MS)
    let mins: DailyMin[][] = group.map(() => [])
    if (pastDays > 0) {
      mins = await withRetry(() => fetchDailyMins(group, pastDays))
      await sleep(group.length > 1 ? PAST_INTERVAL_MS : FORECAST_INTERVAL_MS)
    }

    group.forEach((t, i) => {
      const outlook = buildOutlook(forecasts[i], mins[i])
      if (!file.dates.length) file.dates = outlook.map((d) => d.date)
      file.items[t.id] = {
        w: outlook.map((d) => encodeWeather(d.judgement.cls)).join(''),
        k: outlook.map((d) => encodeKoyo(d.koyo.stage)).join(''),
        s: outlook.map((d) => Math.round(d.score * 10) / 10),
        c: outlook.map((d) => d.weather.weatherCode),
      }
    })
    if ((n + 1) % 5 === 0 || n === groups.length - 1) console.log(`  ${n + 1}/${groups.length}`)
  }

  const path = `${DATA_DIR}recommendations.json`
  writeFileSync(path, JSON.stringify(file))
  console.log(`書き出し: ${path}（${Object.keys(file.items).length}山）`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
