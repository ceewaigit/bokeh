/**
 * Effect Inheritance Utility
 *
 * Handles inheritance of effects from video clips to generated/image clips.
 */

import { type PersistedVideoState } from '@/features/ui/timeline/utils/frame-layout'
import type { ActiveClipDataAtFrame } from '@/types'
import type { Effect, Recording } from '@/types/project'
import type { FrameLayoutItem } from '@/features/ui/timeline/utils/frame-layout'
import { resolveClipDataForLayoutItem } from '@/features/rendering/renderer/utils/get-active-clip-data-at-frame'
import { EffectType } from '@/types/project'

export type { PersistedVideoState } from '@/features/ui/timeline/utils/frame-layout'

interface ApplyInheritanceArgs {
  clipData: ActiveClipDataAtFrame
  persistedState: PersistedVideoState
  currentFrame: number
  frameLayout: FrameLayoutItem[]
  fps: number
  effects: Effect[]
  getRecording: (id: string) => Recording | null | undefined
}

export function applyInheritance({
  clipData,
  persistedState,
  currentFrame,
  frameLayout,
  fps,
  effects,
  getRecording,
}: ApplyInheritanceArgs): ActiveClipDataAtFrame {
  const bgStart = persistedState.layoutItem.startFrame
  const bgEnd = persistedState.layoutItem.endFrame

  let videoFrame = currentFrame
  if (currentFrame >= bgEnd) videoFrame = bgEnd - 1
  else if (currentFrame < bgStart) videoFrame = bgStart

  const videoData = resolveClipDataForLayoutItem({
    frame: videoFrame,
    layoutItem: persistedState.layoutItem,
    frameLayout,
    fps,
    effects,
    getRecording,
  })
  if (!videoData) return clipData

  const hasOwnZoom = clipData.effects.find(e => e.type === EffectType.Zoom && e.startTime <= clipData.sourceTimeMs && e.endTime > clipData.sourceTimeMs)
  const hasOwnScreen = clipData.effects.find(e => e.type === EffectType.Screen && e.startTime <= clipData.sourceTimeMs && e.endTime > clipData.sourceTimeMs)
  const hasOwnCrop = clipData.effects.find(e => e.type === EffectType.Crop && e.startTime <= clipData.sourceTimeMs && e.endTime > clipData.sourceTimeMs)
  const hasOwnBackground = clipData.effects.find(e => e.type === EffectType.Background && e.startTime <= clipData.sourceTimeMs && e.endTime > clipData.sourceTimeMs)

  const inheritedEffects = videoData.effects
    .filter(e => {
      if (e.type === EffectType.Crop && hasOwnCrop) return false
      if (e.type === EffectType.Background && hasOwnBackground) return false
      return e.type === EffectType.Crop || e.type === EffectType.Background
    })
    .map(e => ({ ...e, startTime: -Infinity, endTime: Infinity }))

  const inheritedZoom = hasOwnZoom
    ? clipData.effects.filter(e => e.type === EffectType.Zoom)
    : videoData.effects.filter(e => e.type === EffectType.Zoom).map(e => ({ ...e, startTime: -Infinity, endTime: Infinity }))

  const inheritedScreen = hasOwnScreen
    ? clipData.effects.filter(e => e.type === EffectType.Screen)
    : videoData.effects.filter(e => e.type === EffectType.Screen).map(e => ({ ...e, startTime: -Infinity, endTime: Infinity }))

  const ownEffects = clipData.effects.filter(
    e =>
      e.type !== EffectType.Zoom &&
      e.type !== EffectType.Screen &&
      (hasOwnCrop || e.type !== EffectType.Crop) &&
      (hasOwnBackground || e.type !== EffectType.Background)
  )

  return { ...clipData, recording: clipData.recording, effects: [...inheritedEffects, ...inheritedZoom, ...inheritedScreen, ...ownEffects] }
}

