import { mountainBadge, type Mountain } from '../data/mountains'

export function MountainBadge({ mountain }: { mountain: Mountain }) {
  const badge = mountainBadge(mountain)
  return badge && <span className={badge.className}>{badge.label}</span>
}
