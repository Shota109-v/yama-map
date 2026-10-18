import { useEffect, useState } from 'react'
import { TabBar, type TabId } from './components/TabBar'
import { requestPersistentStorage, toMountainRef } from './data/db'
import type { Mountain } from './data/mountains'
import { loadRecommendations, type SightFilter } from './data/recommendations'
import { loadJson, saveJson } from './lib/storage'
import { nextSaturday } from './logic/date'
import { sightsInSeason } from './logic/sights'
import type { RecommendationsFile } from './logic/recommendationsFile'
import type { BaseMapType } from './map/baseMap'
import { MapView, type MapFocusRequest } from './map/MapView'
import { RecommendPage } from './pages/RecommendPage'
import { RecordEditor, type EditorRequest } from './pages/RecordEditor'
import { RecordsPage } from './pages/RecordsPage'
import { SettingsPage } from './pages/SettingsPage'

type Settings = { baseMapType: BaseMapType }

const SETTINGS_KEY = 'yama-map:settings'
const DEFAULT_SETTINGS: Settings = { baseMapType: 'std' }

function App() {
  const [tab, setTab] = useState<TabId>('map')
  const [settings, setSettings] = useState(() => loadJson(SETTINGS_KEY, DEFAULT_SETTINGS))
  // 地図とおすすめ一覧で共通の条件。最初は次の土曜日
  const [targetDate, setTargetDate] = useState(() => nextSaturday())
  const [sightChoice, setSight] = useState<SightFilter>('all')
  // 日付を変えて、選んでいた見どころが時期外になったら「すべて」に戻す
  const sight: SightFilter =
    sightChoice !== 'all' && !sightsInSeason(targetDate).includes(sightChoice) ? 'all' : sightChoice
  const [recommendations, setRecommendations] = useState<RecommendationsFile | null>(null)
  const [focus, setFocus] = useState<MapFocusRequest | null>(null)
  const [editor, setEditor] = useState<EditorRequest | null>(null)

  useEffect(() => {
    loadRecommendations().then(setRecommendations)
    // 記録が自動で消されにくくなるよう、ブラウザに保存の継続を頼んでおく
    requestPersistentStorage()
  }, [])

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveJson(SETTINGS_KEY, next)
  }

  const showOnMap = (mountain: Mountain) => {
    setTab('map')
    setFocus((f) => ({ mountain, seq: (f?.seq ?? 0) + 1 }))
  }

  return (
    <div className="app">
      <main className="content">
        {/* 地図は他のタブを開いている間も残し、表示位置などを保つ */}
        <div className="tab-panel" hidden={tab !== 'map'}>
          <MapView
            baseMapType={settings.baseMapType}
            active={tab === 'map'}
            targetDate={targetDate}
            onTargetDateChange={setTargetDate}
            sight={sight}
            onSightChange={setSight}
            recommendations={recommendations}
            focus={focus}
            onRecord={(m) => setEditor({ mountain: toMountainRef(m) })}
            onEditRecord={(record) => setEditor({ record })}
          />
        </div>
        {tab === 'recommend' && (
          <RecommendPage
            targetDate={targetDate}
            onTargetDateChange={setTargetDate}
            sight={sight}
            onSightChange={setSight}
            recommendations={recommendations}
            onSelect={showOnMap}
          />
        )}
        {tab === 'records' && (
          <RecordsPage
            onNewRecord={() => setEditor({})}
            onEditRecord={(record) => setEditor({ record })}
            onShowOnMap={showOnMap}
            onOpenSettings={() => setTab('settings')}
          />
        )}
        {tab === 'settings' && (
          <SettingsPage
            baseMapType={settings.baseMapType}
            onBaseMapTypeChange={(baseMapType) => updateSettings({ baseMapType })}
          />
        )}
      </main>
      <TabBar current={tab} onChange={setTab} />
      {editor && <RecordEditor {...editor} onClose={() => setEditor(null)} />}
    </div>
  )
}

export default App
