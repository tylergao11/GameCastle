interface AvatarProps {
  emoji: string; name: string
  size?: 'sm' | 'md'
  showName?: boolean
  invert?: boolean
}
export default function Avatar({ emoji, name, size = 'sm', showName = true, invert }: AvatarProps) {
  const sizes = size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-xs'
  return (
    <div className="flex items-center gap-1">
      <div className={`${sizes} rounded-full ${invert ? 'bg-white/10 text-white' : 'bg-orange text-white shadow-[0_0_8px_rgba(240,118,59,0.25)]'} flex items-center justify-center font-bold`}>
        {emoji}
      </div>
      {showName && <span className={`text-[10px] font-comic ${invert ? 'text-white/50' : 'text-ink-soft'}`}>{name}</span>}
    </div>
  )
}
