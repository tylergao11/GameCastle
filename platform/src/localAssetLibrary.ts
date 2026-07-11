import styleDictionary from '../../shared/asset-style-dictionary.json'

const DEFAULT_STYLE_ID = styleDictionary.defaultStyleId

export type LocalAssetRecord = {
  assetId: string
  revisionId: string
  png: string
  source: 'localExplicit'
  provenance: 'sketch-pad'
  license: 'owned'
  repositoryStatus: 'local'
  styleId: string
  semanticTags: string[]
  styleTags: string[]
  createdAt: number
}

export type LocalAssetBinding = {
  binding: string
  revisionId: string
  asset: LocalAssetRecord
  assetSpec: { slotId: string; kind: string; semanticTags: string[]; styleId: string; styleTags: string[]; constraints: { transparent: boolean } }
  visualIntent: { subject: string; motion: 'float' | 'bounce' | 'shake'; anchor: string; states: string[] }
}

const KEY = 'gamecastle:local-asset-library'
const BINDINGS_KEY = 'gamecastle:local-asset-binding-index'

function read(): LocalAssetRecord[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as LocalAssetRecord[] } catch { localStorage.removeItem(KEY); return [] }
}

export function upsertLocalAsset(input: { revisionId: string; png: string; slotId: string }): LocalAssetRecord {
  const asset: LocalAssetRecord = {
    assetId: `local.${input.revisionId}`,
    revisionId: input.revisionId,
    png: input.png,
    source: 'localExplicit',
    provenance: 'sketch-pad',
    license: 'owned',
    repositoryStatus: 'local',
    styleId: DEFAULT_STYLE_ID,
    semanticTags: [input.slotId],
    styleTags: [DEFAULT_STYLE_ID],
    createdAt: Date.now(),
  }
  const entries = read().filter((entry) => entry.revisionId !== asset.revisionId)
  entries.push(asset)
  localStorage.setItem(KEY, JSON.stringify(entries))
  return asset
}

export function listLocalAssets() { return read() }

export function saveLocalAssetBinding(binding: LocalAssetBinding) {
  localStorage.setItem(`gamecastle:asset-binding:${binding.binding}`, JSON.stringify(binding))
  let index: string[] = []
  try { index = JSON.parse(localStorage.getItem(BINDINGS_KEY) || '[]') as string[] } catch { localStorage.removeItem(BINDINGS_KEY) }
  if (!index.includes(binding.binding)) localStorage.setItem(BINDINGS_KEY, JSON.stringify([...index, binding.binding]))
}

export function listLocalAssetBindings(): LocalAssetBinding[] {
  let index: string[] = []
  try { index = JSON.parse(localStorage.getItem(BINDINGS_KEY) || '[]') as string[] } catch { localStorage.removeItem(BINDINGS_KEY) }
  return index.flatMap((slot) => { try { const value = localStorage.getItem(`gamecastle:asset-binding:${slot}`); return value ? [JSON.parse(value) as LocalAssetBinding] : [] } catch { return [] } })
}
