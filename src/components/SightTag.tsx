import { levelLabel, SIGHTS, type SightId, type SightLevel } from '../logic/sights'

/** 見どころの状態の小さな札（例：「🍁 紅葉 見頃」） */
export function SightTag({ id, level, label }: { id: SightId; level: SightLevel; label?: string }) {
  return (
    <span className={`koyo-tag level-${level}`}>
      {SIGHTS[id].icon} {SIGHTS[id].name} {label ?? levelLabel(id, level)}
    </span>
  )
}
