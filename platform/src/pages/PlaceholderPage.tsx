interface PlaceholderPageProps { icon: string; title: string }
export default function PlaceholderPage({ icon, title }: PlaceholderPageProps) {
  return (
    <div className="max-w-[430px] mx-auto px-4 py-32 text-center">
      <div className="inline-block p-6 comic-box">
        <span className="text-5xl">{icon}</span>
      </div>
      <h2 className="font-comic text-lg text-ink mt-4 font-bold">{title}</h2>
      <p className="text-sm text-ink-dim mt-1 font-body">即将上线</p>
    </div>
  )
}
