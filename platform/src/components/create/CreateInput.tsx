import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import PromptChips from './PromptChips'

export default function CreateInput() {
  const { startGeneration, generationStep } = useGame()
  const [prompt, setPrompt] = useState('')
  const handleSubmit = () => { const t = prompt.trim(); if (!t) return; startGeneration(t) }
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }
  const isGenerating = generationStep !== 'idle' && generationStep !== 'complete'

  return (
    <div className="pb-2">
      {!isGenerating && generationStep === 'idle' && <PromptChips onSelect={setPrompt} />}
      <div className="comic-box p-2 flex items-center gap-2">
        <input
          value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="说出你想玩的游戏，比如：做一个狐狸特工潜入博物馆的小游戏"
          disabled={isGenerating}
          className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-dim outline-none min-w-0 font-body py-1"
        />
        <button onClick={handleSubmit} disabled={!prompt.trim() || isGenerating}
          className="flex-shrink-0 px-5 py-2 bg-orange rounded-sm font-comic text-xs text-white font-bold disabled:opacity-15 disabled:cursor-not-allowed active:animate-bounce-pop transition-all shadow-[0_0_10px_rgba(240,118,59,0.2)]">
          生成
        </button>
      </div>
      <p className="text-center text-[9px] text-ink-dim mt-1.5 font-comic">⚡ 越详细，生成效果越好</p>
    </div>
  )
}
