import { Component, type ReactNode } from 'react'

type State = { error: Error | null }

/** 予期しないエラーで画面が真っ白にならないよう、再読み込みの案内を出す */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <section className="page error-page">
        <h1>うまく表示できませんでした</h1>
        <p className="sub">
          アプリでエラーが起きました。再読み込みで直ることがほとんどです。登山記録などのデータは消えていません。
        </p>
        <button type="button" className="research-button" onClick={() => location.reload()}>
          再読み込み
        </button>
        <p className="note">エラーの内容：{this.state.error.message}</p>
      </section>
    )
  }
}
