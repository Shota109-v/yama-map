import { searchName, type Mountain } from '../data/mountains'
import { isKoyoSeason } from '../logic/koyo'

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
        「{searchName(mountain.name)} {keyword}」で検索します。iPhone ではアプリが入っていればアプリで開きます。
      </p>
    </section>
  )
}
