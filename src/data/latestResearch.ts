// 「最新情報を調べる」：Claude API の Web 検索で、山の最新の紅葉・登山道の情報を集めて要約する。
// 1回あたり数円〜数十円かかるため、ボタンを押したときだけ実行し、結果は端末に保存して使い回す

import Anthropic from '@anthropic-ai/sdk'
import { loadJson, saveJson } from '../lib/storage'
import { formatDateShort, toDateKey } from '../logic/date'
import { isKoyoSeason, type KoyoStage } from '../logic/koyo'
import { searchName, type Mountain } from './mountains'

const MODEL = 'claude-opus-5-5'
/** 1回の調査で行う Web 検索の上限（1回 $0.01） */
const MAX_SEARCHES = 4
/** 費用の目安の計算に使う単価（USD）。Claude Opus 5.5：入力 $4 / 出力 $20（100万トークンあたり） */
const PRICE = { input: 4 / 1e6, output: 20 / 1e6, cacheRead: 0.2 / 1e6, search: 0.01 }
const YEN_PER_USD = 150

export type LatestStatus = KoyoStage | 'unknown'

export type LatestSource = { title: string; url: string }

export type LatestReport = {
  mountainId: string
  /** 調べた日時（ISO） */
  researchedAt: string
  /** 紅葉の状況（シーズン外は unknown） */
  status: LatestStatus
  /** 情報の日付（見つかった中で最も新しいもの） */
  observedOn: string | null
  summary: string
  notes: string | null
  sources: LatestSource[]
  /** 今回の費用の目安（円） */
  costYen: number
}

const STATUS_BY_LABEL: Record<string, LatestStatus> = {
  色づき前: 'before',
  色づき始め: 'starting',
  見頃: 'peak',
  見頃過ぎ: 'past',
  不明: 'unknown',
}

function buildPrompt(m: Mountain, today: string): string {
  const name = searchName(m.name)
  const koyo = isKoyoSeason(today)
  const topic = koyo ? '紅葉の色づき具合と登山道・積雪の状況' : '登山道・積雪の状況'
  return `今日は ${today}（${formatDateShort(today)}）です。
${m.pref}の「${name}」（${m.name}、標高 ${m.ele ?? '不明'}m）について、${topic}の最新情報を Web 検索で調べてください。

- できるだけ直近（目安として10日以内）の情報を優先してください。古い年の情報は使わないでください。
- ヤマレコや YAMAP の山行記録、山小屋・自治体・観光協会のお知らせ、ニュースなどが役に立ちます。
- 山頂付近と中腹で状況が違う場合は、標高を添えて書き分けてください。
- 見つからなかったことは「不明」と書き、推測で埋めないでください。

回答は次の形式だけで、日本語で書いてください（各項目は1行目に「項目名: 」を付ける）。
状況: ${koyo ? '色づき前 / 色づき始め / 見頃 / 見頃過ぎ / 不明 のどれか1つ（山頂付近の状況）' : '不明'}
確認日: 情報の日付（YYYY-MM-DD）。分からなければ 不明
要約: 2〜4文で、いつ・どこで・どんな状況だったか
注意: 通行止め・積雪・凍結など登山の注意点。なければ なし`
}

function pickLine(text: string, label: string): string | null {
  const m = text.match(new RegExp(`^\\s*${label}\\s*[:：]\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

/** 端末に保存した前回の調査結果 */
const STORE_KEY = 'yama-map:latest-research'

export function loadSavedReport(mountainId: string): LatestReport | null {
  const all = loadJson<Record<string, LatestReport>>(STORE_KEY, {})
  return all[mountainId] ?? null
}

function saveReport(report: LatestReport) {
  const all = loadJson<Record<string, LatestReport>>(STORE_KEY, {})
  all[report.mountainId] = report
  // 古いものから消して、保存量が増えすぎないようにする
  const entries = Object.entries(all).sort((a, b) => b[1].researchedAt.localeCompare(a[1].researchedAt))
  saveJson(STORE_KEY, Object.fromEntries(entries.slice(0, 50)))
}

export async function researchLatest(apiKey: string, m: Mountain): Promise<LatestReport> {
  // キーは利用者が設定画面で入力したもので、この端末の中にだけある
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const today = toDateKey(new Date())

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: buildPrompt(m, today) }]
  const texts: string[] = []
  const sources = new Map<string, LatestSource>()
  const cited = new Set<string>()
  const usage = { input: 0, output: 0, cacheRead: 0, searches: 0 }

  // Web 検索が長引くと pause_turn で一度止まるので、その場合は続きを頼む
  for (let round = 0; round < 4; round++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // 安全のための判定で断られたときは、別のモデルで自動的にやり直す
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: MAX_SEARCHES,
          user_location: { type: 'approximate', country: 'JP', timezone: 'Asia/Tokyo' },
        },
      ],
      messages,
    })

    usage.input += response.usage.input_tokens
    usage.output += response.usage.output_tokens
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0
    usage.searches += response.usage.server_tool_use?.web_search_requests ?? 0

    if (response.stop_reason === 'refusal') throw new Error('この内容は調べられませんでした')

    for (const block of response.content) {
      if (block.type === 'text') {
        texts.push(block.text)
        for (const c of block.citations ?? []) {
          if (c.type === 'web_search_result_location') {
            cited.add(c.url)
            sources.set(c.url, { title: c.title ?? c.url, url: c.url })
          }
        }
      } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (!sources.has(r.url)) sources.set(r.url, { title: r.title, url: r.url })
        }
      }
    }

    if (response.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: response.content })
  }

  const text = texts.join('')
  const statusLabel = pickLine(text, '状況')?.split(/[\s（(/]/)[0] ?? '不明'
  const observed = pickLine(text, '確認日')
  const notes = pickLine(text, '注意')
  const costUsd =
    usage.input * PRICE.input + usage.output * PRICE.output + usage.cacheRead * PRICE.cacheRead + usage.searches * PRICE.search

  // 回答の中で引用された情報源を先に、なければ検索で見つかったものを並べる
  const allSources = [...sources.values()]
  const ordered = [...allSources.filter((s) => cited.has(s.url)), ...allSources.filter((s) => !cited.has(s.url))]

  const report: LatestReport = {
    mountainId: m.id,
    researchedAt: new Date().toISOString(),
    status: STATUS_BY_LABEL[statusLabel] ?? 'unknown',
    observedOn: observed && /^\d{4}-\d{2}-\d{2}$/.test(observed) ? observed : null,
    summary: pickLine(text, '要約') ?? text.trim(),
    notes: notes && notes !== 'なし' ? notes : null,
    sources: ordered.slice(0, 6),
    costYen: Math.round(costUsd * YEN_PER_USD * 10) / 10,
  }
  saveReport(report)
  return report
}

/** API のエラーを、利用者に分かる言葉にする */
export function describeResearchError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'API キーが正しくありません。設定画面で確認してください。'
  if (e instanceof Anthropic.PermissionDeniedError) return 'この API キーでは利用できません（権限やお支払い設定を確認してください）。'
  if (e instanceof Anthropic.RateLimitError) return '短時間に使いすぎました。少し待ってからもう一度試してください。'
  if (e instanceof Anthropic.APIConnectionError) return '通信できませんでした。電波の良い場所でもう一度試してください。'
  if (e instanceof Anthropic.APIError) return `調べられませんでした（${e.status ?? 'エラー'}）。`
  return e instanceof Error ? e.message : '調べられませんでした。'
}
