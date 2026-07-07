import type { Game } from '../types/game'

export const mockGames: Game[] = [
  {
    id: '1', title: '太空躲避战',
    description: '驾驶小飞船在陨石群中穿梭，收集能量护盾，挑战极限生存时间',
    coverColor: '#1a1a4e', coverEmoji: '🚀', category: '射击',
    tags: ['躲避', '太空', '生存'],
    author: { name: '星际玩家', avatar: '👾' },
    stats: { plays: 12800, likes: 3400, highScore: 9999, onlinePlayers: 128, rating: 4.7 },
    isFeatured: true,
  },
  {
    id: '2', title: '喵星人逃亡记',
    description: '帮助小猫躲避导弹机器人，在赛博城市中收集金币，坚持到最后',
    coverColor: '#3d1b3d', coverEmoji: '🐱', category: '动作',
    tags: ['躲避', '跑酷', '可爱'],
    author: { name: '猫奴一号', avatar: '😺' },
    stats: { plays: 8900, likes: 2100, highScore: 7500, onlinePlayers: 56, rating: 4.5 },
    isHot: true,
  },
  {
    id: '3', title: '像素跑酷王',
    description: '在像素城市中奔跑跳跃，躲避障碍收集金币，解锁20+角色皮肤',
    coverColor: '#1d3d2d', coverEmoji: '🏃', category: '动作',
    tags: ['跑酷', '像素', '收集'],
    author: { name: '像素大师', avatar: '🕹️' },
    stats: { plays: 15600, likes: 4200, highScore: 12000, onlinePlayers: 203, rating: 4.8 },
    isNew: true, isHot: true,
  },
  {
    id: '4', title: '森林大冒险',
    description: '像经典平台游戏一样在魔法森林中跳跃闯关，击败Boss拯救精灵',
    coverColor: '#1d3d1a', coverEmoji: '🌲', category: '冒险',
    tags: ['平台跳跃', '森林', '闯关'],
    author: { name: '冒险王', avatar: '🧝' },
    stats: { plays: 21000, likes: 5600, highScore: 15000, onlinePlayers: 312, rating: 4.9 },
    isFeatured: true, isHot: true,
  },
  {
    id: '5', title: '深海消消乐',
    description: '在海底世界匹配海洋生物，触发连锁消除，解锁深海隐藏关卡',
    coverColor: '#1a2d3d', coverEmoji: '🐠', category: '休闲',
    tags: ['消除', '海洋', '休闲'],
    author: { name: '海洋之心', avatar: '🐙' },
    stats: { plays: 32000, likes: 8900, highScore: 25000, onlinePlayers: 89, rating: 4.3 },
  },
  {
    id: '6', title: '外星人入侵',
    description: '驾驶星际战机击退外星舰队，升级武器系统，保卫地球最后防线',
    coverColor: '#2d1a1a', coverEmoji: '👽', category: '射击',
    tags: ['射击', '科幻', '街机'],
    author: { name: '地球卫士', avatar: '🦸' },
    stats: { plays: 9800, likes: 2800, highScore: 8800, onlinePlayers: 45, rating: 4.6 },
    isNew: true,
  },
  {
    id: '7', title: '迷宫寻宝者',
    description: '在随机生成的迷宫中寻找远古宝藏，避开移动陷阱和守护石像',
    coverColor: '#2d2d1a', coverEmoji: '💎', category: '解谜',
    tags: ['迷宫', '解谜', '探索'],
    author: { name: '寻宝猎人', avatar: '🧙' },
    stats: { plays: 6700, likes: 1900, highScore: 5200, onlinePlayers: 23, rating: 4.4 },
  },
  {
    id: '8', title: '僵尸围城', description: '建造防御塔阵阻挡一波波僵尸，合理搭配植物与陷阱',
    coverColor: '#1d1d1d', coverEmoji: '🧟', category: '策略',
    tags: ['塔防', '僵尸', '策略'],
    author: { name: '植物学家', avatar: '🌻' },
    stats: { plays: 18700, likes: 5100, highScore: 11000, onlinePlayers: 167, rating: 4.7 },
    isHot: true,
  },
  {
    id: '9', title: '地牢勇士', description: '探索随机地牢，击败怪物收集史诗装备，挑战最终Boss',
    coverColor: '#2d1d1d', coverEmoji: '⚔️', category: '冒险',
    tags: ['地牢', 'RPG', '冒险'],
    author: { name: '勇士之光', avatar: '🛡️' },
    stats: { plays: 14300, likes: 3900, highScore: 9600, onlinePlayers: 78, rating: 4.5 },
  },
  {
    id: '10', title: '糖果工厂', description: '经营甜蜜工厂，研发新糖果配方，满足顾客的奇妙订单',
    coverColor: '#3d1d3d', coverEmoji: '🍬', category: '模拟',
    tags: ['经营', '可爱', '模拟'],
    author: { name: '甜点师', avatar: '👩‍🍳' },
    stats: { plays: 24000, likes: 6700, highScore: 18000, onlinePlayers: 145, rating: 4.6 },
    isFeatured: true,
  },
  {
    id: '11', title: '小鸟躲柱子', description: '点击屏幕让小鸟穿过柱子间隙，经典玩法全新像素画风',
    coverColor: '#3d2d1a', coverEmoji: '🐦', category: '休闲',
    tags: ['躲避', '经典', '像素'],
    author: { name: '鸟粉一号', avatar: '🦅' },
    stats: { plays: 45000, likes: 12000, highScore: 3200, onlinePlayers: 521, rating: 4.2 },
    isHot: true,
  },
  {
    id: '12', title: '雪球大作战', description: '在雪地竞技场投掷雪球，和朋友组队打雪仗，欢乐无限',
    coverColor: '#ddeeff', coverEmoji: '❄️', category: '休闲',
    tags: ['多人', '竞技', '冬季'],
    author: { name: '雪人兄弟', avatar: '⛄' },
    stats: { plays: 11200, likes: 3100, highScore: 6700, onlinePlayers: 234, rating: 4.4 },
    isNew: true,
  },
]

export const categories = ['推荐', '热门', '最新', '动作', '冒险', '策略', '解谜', '模拟', '更多'] as const

export const promptExamples = [
  '做一个狐狸特工潜入博物馆的游戏',
  '像超级玛丽的魔法森林冒险',
  '太空射击游戏，打败外星Boss',
  '跑酷游戏，收集金币解锁角色',
  '塔防游戏，保护远古神庙',
  '经营一家猫咪咖啡馆',
]

export const remixOptions = [
  '加 Boss', '加关卡', '换主角', '加技能',
  '变难', '变简单', '换画风', '双人模式',
]
