// Enum for all effect types - single source of truth
export enum EffectType {
  Zoom = 'zoom',
  Cursor = 'cursor',
  Keystroke = 'keystroke',
  Background = 'background',
  Annotation = 'annotation',
  Screen = 'screen',
  Plugin = 'plugin',
  Crop = 'crop'
}

// Enum for effect layer types (subset of effects that appear in the sidebar)
export enum EffectLayerType {
  Zoom = 'zoom',
  Cursor = 'cursor',
  Background = 'background',
  Screen = 'screen',
  Keystroke = 'keystroke',
  Plugin = 'plugin',
  Crop = 'crop',
}

export type SelectedEffectLayer = { type: EffectLayerType; id?: string } | null
