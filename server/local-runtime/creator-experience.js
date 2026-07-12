/* Stable user-facing projection. It deliberately never exposes pipeline logs. */
var STAGES = {
  queued: { title: '准备开始', message: '城堡正在接住你的想法。' },
  understanding: { title: '理解点子', message: '正在整理玩法和世界方向。' },
  directing: { title: '安排体验', message: '正在确定这局游戏最重要的感觉。' },
  compiling: { title: '组合规则', message: '正在把想法变成可执行的游戏结构。' },
  building: { title: '搭建世界', message: '正在组合场景、资产与交互。' },
  runtime: { title: '准备试玩', message: '正在接通可玩的运行时。' },
  packaging: { title: '整理版本', message: '正在保存一个可回退的本地版本。' },
  playtesting: { title: '试玩检查', message: '正在检查第一次游玩是否成立。' },
  complete: { title: '可以玩了', message: '新版本已经准备好。' },
  cancelling: { title: '正在停止', message: '会回到上一个可玩的版本。' }
};

function recovery(code) {
  if (code === 'CONTINUE_STATE_MISSING') return { kind: 'start-first-version', title: '先做出一个可玩版本', message: '这个项目还没有可继续修改的版本。', actions: ['create'] };
  if (code === 'RUN_BUSY') return { kind: 'build-in-progress', title: '这个项目正在制作', message: '等当前制作完成，或停止后回到上一个版本。', actions: ['cancel', 'wait'] };
  if (code === 'RUN_CANCELLED') return { kind: 'cancelled', title: '已回到上一个版本', message: '这次制作已停止，之前可玩的版本没有改变。', actions: ['continue', 'create'] };
  if (code === 'PROVIDER_BUDGET_EXHAUSTED' || code === 'MODEL_BUDGET_EXHAUSTED') return { kind: 'provider-budget', title: '这次自动处理到达上限', message: '已有版本保持不变。你可以换一种描述，或先用本地素材继续。', actions: ['continue', 'open-assets'] };
  if (code === 'ASSET_WEAVE_REJECTED' || code === 'ASSET_CLOUD_UNAVAILABLE') return { kind: 'asset-debt', title: '有一项素材还没准备好', message: '已有版本保持不变。可以使用本地素材，或换一种描述再试。', actions: ['open-assets', 'continue'] };
  return { kind: 'build-debt', title: '这次没有做出新版本', message: '之前可玩的版本仍然安全。换一句更具体的描述再试即可。', actions: ['continue', 'rollback'] };
}

function projectVersionCard(version) {
  return { versionId: version.versionId, parentVersionId: version.parentVersionId || null, semanticHash: version.semanticHash, assetSemanticHash: version.assetSemanticHash, createdAt: version.createdAt, releaseCandidateId: version.releaseCandidateId || null };
}

module.exports = { STAGES: STAGES, recovery: recovery, projectVersionCard: projectVersionCard };
