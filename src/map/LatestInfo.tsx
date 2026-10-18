import { useState } from 'react'
import { loadApiKey } from '../data/apiKey'
import {
  describeResearchError,
  loadSavedReport,
  researchLatest,
  type LatestReport,
} from '../data/latestResearch'
import { searchName, type Mountain } from '../data/mountains'
import { formatDateShort } from '../logic/date'
import { isKoyoSeason, KOYO_LABELS } from '../logic/koyo'

type SearchLink = { label: string; url: string }

function buildLinks(m: Mountain, keyword: string): SearchLink[] {
  const name = searchName(m.name)
  const q = `${name} ${keyword}`
  const enc = encodeURIComponent
  return [
    // f=live で新しい投稿順にする
    { label: 'X（新しい投稿）', url: `https://x.com/search?q=${enc(q)}&f=live` },
    { label: 'Instagram（ハッシュタグ）', url: `https://www.instagram.com/explore/tags/${enc(name)}/` },
    { label: 'Bluesky', url: `https://bsky.app/search?q=${enc(q)}` },
    // 山行記録サイトは Google の「1週間以内」で絞り込む
    {
      label: 'ヤマレコの山行記録（1週間以内）',
      url: `https://www.google.com/search?q=${enc(`site:yamareco.com ${name}`)}&tbs=qdr:w`,
    },
    {
      label: 'YAMAP の活動日記（1週間以内）',
      url: `https://www.google.com/search?q=${enc(`site:yamap.com/activities ${name}`)}&tbs=qdr:w`,
    },
  ]
}

type Props = { mountain: Mountain; targetDate: string }

/** SNS や山行記録サイトの最新情報 */
export function LatestInfoSection({ mountain, targetDate }: Props) {
  const keyword = isKoyoSeason(targetDate) ? '紅葉' : '登山'
  return (
    <section>
      <h3>みんなの最新情報</h3>
      <Research mountain={mountain} />
      <ul className="link-list">
        {buildLinks(mountain, keyword).map((l) => (
          <li key={l.label}>
            <a href={l.url} target="_blank" rel="noopener">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
      <p className="note">
        リンクは「{searchName(mountain.name)} {keyword}」で検索します。iPhone ではアプリが入っていればアプリで開きます。
      </p>
    </section>
  )
}

/** 「最新情報を調べる」ボタンと、その結果 */
function Research({ mountain }: { mountain: Mountain }) {
  const [report, setReport] = useState<LatestReport | null>(() => loadSavedReport(mountain.id))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const apiKey = loadApiKey()

  const run = async () => {
    if (!apiKey) return
    setLoading(true)
    setError(null)
    try {
      setReport(await researchLatest(apiKey, mountain))
    } catch (e) {
      setError(describeResearchError(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="research">
      {report && <ReportView report={report} />}
      {error && <p className="warn">{error}</p>}
      {apiKey ? (
        <button type="button" className="research-button" onClick={run} disabled={loading}>
          {loading ? '調べています…（30秒ほど）' : report ? 'もう一度調べる' : '🔎 最新情報を調べる（AI）'}
        </button>
      ) : (
        <p className="note">
          設定画面で Claude の API キーを入れると、Web の山行記録やお知らせから最新の状況を AI が調べてまとめます。
        </p>
      )}
    </div>
  )
}

function ReportView({ report }: { report: LatestReport }) {
  const at = new Date(report.researchedAt).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return (
    <div className="research-report">
      <div className="day-line">
        {report.status !== 'unknown' && report.status !== 'off' && (
          <span className={`koyo-tag koyo-${report.status}`}>紅葉 {KOYO_LABELS[report.status]}</span>
        )}
        <span className="sub">
          {report.observedOn ? `${formatDateShort(report.observedOn)}の情報` : '情報の日付は不明'}
        </span>
      </div>
      <p>{report.summary}</p>
      {report.notes && <p className="warn">⚠ {report.notes}</p>}
      {report.sources.length > 0 && (
        <ul className="research-sources">
          {report.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="note">
        {at}に AI が Web 検索で調べた結果です（費用の目安 約{report.costYen}円）。内容は情報源で確認してください。
      </p>
    </div>
  )
}
