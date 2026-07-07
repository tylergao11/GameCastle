export interface GameAuthor {
  name: string
  avatar: string
}

export interface GameStats {
  plays: number
  likes: number
  highScore: number
  onlinePlayers?: number
  rating?: number
}

export interface Game {
  id: string
  title: string
  description: string
  coverColor: string
  coverEmoji: string
  category: string
  tags: string[]
  author: GameAuthor
  stats: GameStats
  isNew?: boolean
  isFeatured?: boolean
  isHot?: boolean
}

export type Category = '推荐' | '热门' | '最新' | '动作' | '冒险' | '策略' | '解谜' | '模拟' | '更多'

export type GenerationStep = 'idle' | 'understanding' | 'designing' | 'levels' | 'enemies' | 'assets' | 'complete'

export interface GeneratedGame {
  title: string
  description: string
  tags: string[]
  coverEmoji: string
  coverColor: string
  modules?: {
    character?: string
    gameplay?: string
    levels?: string
    enemies?: string
    items?: string
    rules?: string
    stats?: string
    assets?: string
  }
}
