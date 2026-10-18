// 天気と見どころを合わせた、山ごと・日ごとの見通し

import { estimateKoyo, type DailyMin, type KoyoEstimate } from './koyo'
import {
  isHighlighted,
  judgeWeather,
  koyoScore,
  recommendScore,
  type WeatherJudgement,
} from './recommend'
import { summarizeDays, type DaySummary, type Forecast } from './weather'

export type DayOutlook = {
  date: string
  weather: DaySummary
  judgement: WeatherJudgement
  koyo: KoyoEstimate
  score: number
  highlighted: boolean
}

export function buildOutlook(forecast: Forecast, mins: DailyMin[]): DayOutlook[] {
  return summarizeDays(forecast).map((day) => {
    const judgement = judgeWeather(day)
    const koyo = estimateKoyo(mins, day.date)
    return {
      date: day.date,
      weather: day,
      judgement,
      koyo,
      score: recommendScore(judgement.cls, koyoScore(koyo.stage, koyo.progress)),
      highlighted: isHighlighted(judgement.cls, koyo.stage),
    }
  })
}
