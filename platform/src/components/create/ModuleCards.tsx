import { useGame } from '../../context/GameContext'

const cfg: Array<{ key: string; label: string; emoji: string }> = [
  { key: 'character', label: '角色', emoji: '🦸' },
  { key: 'gameplay', label: '玩法', emoji: '🎯' },
  { key: 'levels', label: '关卡', emoji: '🗺️' },
  { key: 'enemies', label: '敌人', emoji: '👾' },
  { key: 'items', label: '道具', emoji: '🎒' },
  { key: 'rules', label: '规则', emoji: '📋' },
  { key: 'stats', label: '数值', emoji: '📊' },
  { key: 'assets', label: '素材', emoji: '🖼️' },
]

export default function ModuleCards() {
  const { generatedGame, generationStep } = useGame()
  const modules = generatedGame?.modules
  const loading = generationStep !== 'complete' && generationStep !== 'idle'

  if (!modules && !loading) return null

  return (
    <div className="mt-1.5">
      <h3 className="font-comic text-[9px] text-ink-dim mb-1 flex items-center gap-1 font-bold">
        <span className="w-1 h-2.5 bg-orange inline-block rounded-full shadow-[0_0_4px_rgba(240,118,59,0.4)]" /> AI 生成内容
      </h3>
      <div className="grid grid-cols-4 gap-1">
        {cfg.map(({ key, label, emoji }) => {
          const val = modules?.[key as keyof typeof modules]
          const wait = loading && !val
          return (
            <div key={key} className={`p-1.5 rounded-sm border transition-all ${wait ? 'bg-white/[0.01] border-transparent opacity-30' : 'comic-box-sm'}`}>
              <div className="text-[10px]">{emoji}</div>
              <div className="text-[7px] font-comic text-ink-dim">{label}</div>
              <div className={`text-[9px] font-comic leading-tight font-bold ${wait ? 'text-ink-dim/30' : 'text-ink'}`}>
                {wait ? '...' : val || '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
