// 天気と見どころを合わせた、山ごと・日ごとの見通し

import { estimateKoyo, type KoyoEstimate } from './koyo'
import { bestLevel, isHighlighted, judgeWeather, recommendScore, type WeatherJudgement } from './recommend'
import { evaluateSights, type SightId, type SightLevel, type SightResult } from './sights'
import { summarizeDays, type DailyTemp, type DaySummary, type Forecast } from './weather'

export type DayOutlook = {
  date: string
  weather: DaySummary
  judgement: WeatherJudgement
  /** 時期に当てはまる見どころ */
  sights: SightResult[]
  /** 紅葉の詳しい推定（山頂付近） */
  koyo: KoyoEstimate
  score: number
  highlighted: boolean
}

export function sightLevels(sights: SightResult[]): Partial<Record<SightId, SightLevel>> {
  return Object.fromEntries(sights.map((s) => [s.id, s.level]))
}

export function buildOutlook(forecast: Forecast, temps: DailyTemp[]): DayOutlook[] {
  return summarizeDays(forecast).map((day) => {
    const judgement = judgeWeather(day)
    const sights = evaluateSights({ day, temps, elevation: forecast.elevation })
    const best = bestLevel(sightLevels(sights), 'all')
    return {
      date: day.date,
      weather: day,
      judgement,
      sights,
      koyo: estimateKoyo(temps, day.date),
      score: recommendScore(judgement.cls, best),
      highlighted: isHighlighted(judgement.cls, best),
    }
  })
}
