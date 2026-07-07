import Avatar from './Avatar'

interface GameCardProps {
  game: {
    id: string; title: string; description: string;
    coverColor: string; coverEmoji: string; category: string;
    tags: string[]; author: { name: string; avatar: string };
    stats: { plays: number; likes: number; highScore: number; onlinePlayers?: number; rating?: number };
  }
  size?: 'sm' | 'poster'
  onClick?: () => void
  index?: number
}

export default function GameCard({ game, size = 'sm', onClick, index = 0 }: GameCardProps) {
  const delayClass = index > 0 ? `animate-card-enter-delay-${Math.min(index, 5)}` : ''

  // POSTER — cinematic hero card for Discover
  if (size === 'poster') {
    return (
      <div onClick={onClick} className={`relative w-full aspect-[4/3] cursor-pointer group animate-card-enter ${delayClass}`}>
        <div className="absolute inset-0 comic-box overflow-hidden">
          {/* Full-bleed cover art */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: `linear-gradient(160deg, ${game.coverColor} 0%, ${game.coverColor}66 45%, #0B0E17 100%)` }}
          >
            <span className="text-8xl drop-shadow-[4px_8px_12px_rgba(0,0,0,0.5)] group-hover:scale-105 transition-transform duration-500">
              {game.coverEmoji}
            </span>
          </div>

          {/* Diagonal accent strip */}
          <div className="absolute top-0 right-0 w-1/3 h-full opacity-[0.03] bg-white diagonal-clip pointer-events-none" />

          {/* Bottom gradient overlay */}
          <div className="absolute bottom-0 left-0 right-0 h-[50%] bg-gradient-to-t from-black/95 via-black/60 to-transparent" />

          {/* Info layer */}
          <div className="absolute bottom-0 left-0 right-0 p-4 pt-16">
            {/* Tags */}
            <div className="flex gap-1.5 mb-2">
              {game.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="px-2 py-0.5 bg-orange/90 text-[9px] font-comic text-white rounded-sm font-bold tracking-wide">
                  {tag}
                </span>
              ))}
            </div>

            {/* Title */}
            <h2 className="font-display text-2xl text-white mb-1 drop-shadow-[2px_4px_6px_rgba(0,0,0,0.6)] tracking-wide">
              {game.title}
            </h2>

            {/* Description */}
            <p className="text-xs text-white/60 line-clamp-2 mb-2 leading-snug">{game.description}</p>

            {/* Author + Stats */}
            <div className="flex items-center justify-between">
              <Avatar emoji={game.author.avatar} name={game.author.name} size="sm" invert />
              <div className="flex gap-3 text-[10px] font-comic text-white/50">
                {game.stats.rating && <span>⭐ {game.stats.rating}</span>}
                {game.stats.onlinePlayers && <span>👥 {game.stats.onlinePlayers}</span>}
                <span>❤️ {game.stats.likes.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Category badge */}
        <div
          className="absolute top-3 right-3 bg-red text-white px-3 py-0.5 font-comic text-[10px] rounded-sm z-10 font-bold tracking-wider shadow-lg"
          style={{ transform: 'rotate(1deg)' }}
        >
          {game.category}
        </div>

        {/* Hot badge */}
        {game.stats.onlinePlayers && game.stats.onlinePlayers > 100 && (
          <div
            className="absolute top-3 left-3 bg-orange text-white px-2.5 py-0.5 font-comic text-[9px] rounded-sm z-10 flex items-center gap-1 font-bold shadow-lg"
            style={{ transform: 'rotate(-0.5deg)' }}
          >
            🔥 热门
          </div>
        )}
      </div>
    )
  }

  // SMALL — grid card
  return (
    <div onClick={onClick} className="w-[47%] flex-shrink-0 cursor-pointer group active:scale-[0.96] transition-transform">
      <div className="comic-box-sm overflow-hidden h-full flex flex-col hover:border-orange/30 transition-colors">
        <div
          className="w-full aspect-[4/3] flex items-center justify-center text-4xl"
          style={{ background: `linear-gradient(135deg, ${game.coverColor}, ${game.coverColor}44, #111522)` }}
        >
          <span className="drop-shadow-[2px_4px_6px_rgba(0,0,0,0.3)] group-hover:scale-110 transition-transform">
            {game.coverEmoji}
          </span>
        </div>
        <div className="p-2 flex-1 flex flex-col justify-between">
          <div>
            <h4 className="font-comic text-[13px] text-ink truncate font-bold">{game.title}</h4>
            <p className="text-[10px] text-ink-soft line-clamp-1 mt-0.5">{game.description}</p>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-ink-dim font-comic">{game.category}</span>
            <span className="text-[10px] text-ink-dim">❤️{game.stats.likes}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
