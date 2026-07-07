import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Game, Category, GenerationStep, GeneratedGame } from '../types/game'
import { mockGames } from '../data/mockGames'

interface GameContextType {
  games: Game[]
  currentIndex: number
  favorites: Set<string>
  activeCategory: Category
  generationStep: GenerationStep
  generatedGame: GeneratedGame | null

  setCurrentIndex: (i: number) => void
  nextGame: () => void
  prevGame: () => void
  toggleFavorite: (id: string) => void
  isFavorite: (id: string) => boolean
  setActiveCategory: (c: Category) => void
  filteredGames: Game[]
  startGeneration: (prompt: string) => void
}

const GameContext = createContext<GameContextType | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [games] = useState<Game[]>(mockGames)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [activeCategory, setActiveCategory] = useState<Category>('推荐')
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle')
  const [generatedGame, setGeneratedGame] = useState<GeneratedGame | null>(null)

  const nextGame = useCallback(() => setCurrentIndex((i) => (i + 1) % games.length), [games.length])
  const prevGame = useCallback(() => setCurrentIndex((i) => (i - 1 + games.length) % games.length), [games.length])

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }, [])

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites])

  const filteredGames = activeCategory === '推荐'
    ? games
    : activeCategory === '热门' ? games.filter((g) => g.isHot)
    : activeCategory === '最新' ? games.filter((g) => g.isNew)
    : games.filter((g) => g.category === activeCategory)

  const startGeneration = useCallback((_prompt: string) => {
    setGenerationStep('understanding')
    setGeneratedGame(null)

    // Simulate 6-step pipeline with increasing delays
    const steps: Array<{ step: GenerationStep; delay: number }> = [
      { step: 'understanding', delay: 800 },
      { step: 'designing', delay: 1200 },
      { step: 'levels', delay: 1500 },
      { step: 'enemies', delay: 1500 },
      { step: 'assets', delay: 2000 },
      { step: 'complete', delay: 0 },
    ]

    let totalDelay = 0
    steps.forEach(({ step, delay }) => {
      totalDelay += delay
      setTimeout(() => {
        setGenerationStep(step)
        if (step === 'complete') {
          setGeneratedGame({
            title: '狐狸特工：博物馆潜入',
            description: '扮演狐狸特工，潜入重重守卫的博物馆，避开激光和巡逻守卫，盗取神秘宝石后安全撤离',
            tags: ['潜行', '冒险', '策略'],
            coverEmoji: '🦊',
            coverColor: '#1a2d3d',
            modules: {
              character: '狐狸特工',
              gameplay: '潜行冒险',
              levels: '3 个关卡',
              enemies: '巡逻守卫、无人机、激光门',
              items: '烟雾弹、磁力手套、隐身斗篷',
              rules: '警报系统、钥匙卡、宝石收集、撤离点',
              stats: '生命值 3、得分倍率 1x',
              assets: '2D 像素 + 赛博朋克风格',
            },
          })
        }
      }, totalDelay)
    })
  }, [])

  return (
    <GameContext.Provider value={{
      games, currentIndex, favorites, activeCategory, generationStep, generatedGame,
      setCurrentIndex, nextGame, prevGame, toggleFavorite, isFavorite, setActiveCategory, filteredGames, startGeneration,
    }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be inside GameProvider')
  return ctx
}
