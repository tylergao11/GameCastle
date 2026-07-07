interface TagProps { label: string; active?: boolean; onClick?: () => void; size?: 'sm' | 'md' }
export default function Tag({ label, active, onClick, size = 'sm' }: TagProps) {
  const base = 'font-comic font-bold transition-all active:scale-95 cursor-pointer select-none inline-block whitespace-nowrap rounded-sm'
  const sizes = size === 'sm' ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'
  if (active) return (
    <span className={`${base} ${sizes} bg-orange text-white shadow-[0_0_10px_rgba(240,118,59,0.25)]`}
      style={{ transform:'rotate(-0.3deg)' }} onClick={onClick}>{label}</span>
  )
  return (
    <span className={`${base} ${sizes} bg-white/[0.03] text-ink-soft border border-border hover:border-white/20 hover:text-ink`}
      onClick={onClick}>{label}</span>
  )
}
