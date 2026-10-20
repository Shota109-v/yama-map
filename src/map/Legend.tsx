import type { SightFilter } from '../data/recommendations'
import { formatDateShort } from '../logic/date'
import { filterInfo } from '../logic/recommend'
import { CLIMBED_COLOR } from './mountainLayers'

type Props = { date: string; sight: SightFilter; generatedAt: string | null; onClose: () => void }

/** 地図の点の見方 */
export function Legend({ date, sight, generatedAt, onClose }: Props) {
  return (
    <div className="legend" role="dialog" aria-label="凡例">
      <div className="legend-header">
        <strong>地図の見方</strong>
        <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </div>
      <ul>
        <li>
          <Dot color="#d64545" size={14} /> 日本百名山
        </li>
        <li>
          <Dot color="#2f8f5b" size={12} /> 日本三百名山（百名山以外）
        </li>
        <li>
          <Dot color="#7a8580" size={10} /> その他の山
        </li>
        <li>
          <Dot color={CLIMBED_COLOR} size={12} /> 登頂済み（記録した山。大きさは上のグループのまま）
        </li>
        {sight === 'all' ? (
          <li>
            <span className="legend-ring" style={{ borderColor: '#9ca3af' }}>
              <Dot color="#d64545" size={10} />
            </span>
            上の「晴れ」や見どころ（紅葉など）を選ぶと、当てはまる山に色の輪が付き、ほかの山は薄くなります
          </li>
        ) : (
          <>
            <li>
              <span className="legend-ring" style={{ borderColor: filterInfo(sight).color }}>
                <Dot color="#d64545" size={10} />
              </span>
              {sight === 'sunny' ? '天気が良い' : `${filterInfo(sight).name}が見頃`}
            </li>
            <li>
              <Dot color="#d64545" size={12} faded />
              {sight === 'sunny' ? '天気が良くない' : `${filterInfo(sight).name}は期待できない`}
            </li>
          </>
        )}
      </ul>
      <p className="note">
        {formatDateShort(date)}の予報で判定しています。拡大するほど表示する山が増えます。
        {generatedAt && (
          <>
            <br />
            おすすめの計算：
            {new Date(generatedAt).toLocaleString('ja-JP', {
              month: 'numeric',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </>
        )}
        {!generatedAt && (
          <>
            <br />
            おすすめのデータがまだありません（毎朝2時から計算し、早朝に更新されます）。
          </>
        )}
      </p>
    </div>
  )
}

function Dot({ color, size, faded }: { color: string; size: number; faded?: boolean }) {
  return (
    <span
      className="legend-dot"
      style={{ width: size, height: size, background: color, opacity: faded ? 0.3 : 1 }}
    />
  )
}
