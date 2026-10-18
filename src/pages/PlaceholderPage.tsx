type Props = { title: string; note: string }

// まだ作っていない画面の仮表示
export function PlaceholderPage({ title, note }: Props) {
  return (
    <section className="page">
      <h1>{title}</h1>
      <p className="sub">{note}</p>
    </section>
  )
}
