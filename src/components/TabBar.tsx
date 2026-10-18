export type TabId = 'map' | 'recommend' | 'records' | 'settings'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'map', label: '地図', icon: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15' },
  { id: 'recommend', label: 'おすすめ', icon: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z' },
  { id: 'records', label: '記録', icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7' },
  { id: 'settings', label: '設定', icon: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4' },
]

type Props = { current: TabId; onChange: (tab: TabId) => void }

export function TabBar({ current, onChange }: Props) {
  return (
    <nav className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="tab"
          aria-current={tab.id === current ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={tab.icon} />
          </svg>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
