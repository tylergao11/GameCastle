import { useGame } from '../../context/GameContext'
import Tag from '../shared/Tag'
import { Play } from 'lucide-react'

export default function GamePreview() {
  const { generatedGame, generationStep } = useGame()

  if (!generatedGame) {
    return (
      <div className="w-full aspect-[16/7] comic-box flex items-center justify-center">
        <p className="font-comic text-[11px] text-ink-dim">输入描述，AI 为你生成游戏</p>
      </div>
    )
  }

  const isGenerating = generationStep !== 'complete'

  return (
    <div className="relative w-full aspect-[16/7] comic-box overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center"
        style={{ background: `linear-gradient(160deg, ${generatedGame.coverColor}, ${generatedGame.coverColor}44, #0B0E17)` }}>
        <span className="text-4xl drop-shadow-[2px_4px_8px_rgba(0,0,0,0.4)]">{generatedGame.coverEmoji}</span>
      </div>
      <div className="absolute top-2 left-2">
        <span className={`px-2 py-0.5 text-[9px] font-comic font-bold rounded-sm ${isGenerating ? 'bg-amber text-white' : 'bg-teal text-white'}`}>
          {isGenerating ? '⚡ 生成中' : '✓ 完成'}
        </span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-panel border-t border-border p-2 flex items-end justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-comic text-xs text-ink font-bold">{generatedGame.title}</h3>
          <div className="flex gap-1 mt-1">
            {generatedGame.tags.map((tag) => (<Tag key={tag} label={tag} size="sm" />))}
          </div>
        </div>
        <button className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-orange text-white font-comic text-[10px] font-bold rounded-sm active:animate-bounce-pop shadow-[0_0_8px_rgba(240,118,59,0.2)]">
          <Play size={10} strokeWidth={3} fill="white" /> 试玩
        </button>
      </div>
    </div>
  )
}
