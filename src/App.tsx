// ステップ0の仮画面。ステップ1で地図とタブに置き換える
function App() {
  return (
    <main
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        padding: 16,
      }}
    >
      <div>
        <h1 style={{ color: 'var(--accent)', margin: 0 }}>山マップ</h1>
        <p style={{ color: 'var(--text-sub)' }}>準備中（ステップ0）</p>
      </div>
    </main>
  )
}

export default App
