import type { Effect, Clip, WebcamLayoutData, SubtitleEffectData } from '@/types/project'
import { KeystrokePosition } from '@/types/project'
import { EffectType } from '@/types/project'
import { OverlayAnchor } from '@/types/overlays'
import { KEYSTROKE_STYLE_EFFECT_ID } from '@/features/effects/keystroke/config'

interface PositionClaim {
  effectId: string
  effectType: EffectType | 'webcam-clip' // webcam-clip is used for clips on webcam track
  priority: number
}

export class OverlayPositionRegistry {
  private claims: Map<OverlayAnchor, PositionClaim[]> = new Map()

  reset(): void {
    this.claims.clear()
  }

  canClaim(anchor: OverlayAnchor, effectId: string, priority: number): boolean {
    const existing = this.claims.get(anchor) || []
    if (existing.some(c => c.effectId === effectId)) return true
    if (existing.length === 0) return true
    return priority > Math.max(...existing.map(c => c.priority))
  }

  claim(anchor: OverlayAnchor, effectId: string, effectType: EffectType | 'webcam-clip', priority: number): void {
    const existing = this.claims.get(anchor) || []
    const remaining = existing.filter(c => c.priority >= priority || c.effectId === effectId)
    const current = remaining.find(c => c.effectId === effectId)
    if (current) {
      current.priority = priority
    } else {
      remaining.push({ effectId, effectType, priority })
    }
    this.claims.set(anchor, remaining)
  }

  getDisplacedEffects(): Set<string> {
    const displaced = new Set<string>()
    for (const claims of this.claims.values()) {
      if (claims.length <= 1) continue
      const sorted = [...claims].sort((a, b) => b.priority - a.priority)
      sorted.slice(1).forEach(c => displaced.add(c.effectId))
    }
    return displaced
  }
}

export function resolveOverlayConflicts(
  effects: Effect[],
  timeMs: number,
  options?: {
    activeRecordingId?: string
    hasActiveTranscript?: boolean
    activeWebcamClip?: Clip | null
  }
): { displacedEffectIds: Set<string>; resolvedAnchors: Map<string, OverlayAnchor> } {
  const registry = new OverlayPositionRegistry()
  const resolvedAnchors = new Map<string, OverlayAnchor>()

  const mapPositionToAnchor = (position?: KeystrokePosition): OverlayAnchor | undefined => {
    switch (position) {
      case KeystrokePosition.TopCenter:
        return OverlayAnchor.TopCenter
      case KeystrokePosition.BottomRight:
        return OverlayAnchor.BottomRight
      case KeystrokePosition.BottomCenter:
        return OverlayAnchor.BottomCenter
      default:
        return undefined
    }
  }

  const keystrokeStyleEffect = effects.find(e => e.type === EffectType.Keystroke && e.id === KEYSTROKE_STYLE_EFFECT_ID)
  const keystrokeStyleData = keystrokeStyleEffect?.data as { anchor?: OverlayAnchor; position?: KeystrokePosition } | undefined
  const defaultKeystrokeAnchor =
    keystrokeStyleData?.anchor ??
    mapPositionToAnchor(keystrokeStyleData?.position) ??
    OverlayAnchor.BottomCenter

  const allAnchors = [
    OverlayAnchor.BottomCenter,
    OverlayAnchor.BottomRight,
    OverlayAnchor.BottomLeft,
    OverlayAnchor.TopCenter,
    OverlayAnchor.TopRight,
    OverlayAnchor.TopLeft,
    OverlayAnchor.Center,
    OverlayAnchor.CenterLeft,
    OverlayAnchor.CenterRight,
  ]

  const findAvailableAnchor = (preferred: OverlayAnchor, effectId: string, priority: number): OverlayAnchor | undefined => {
    if (registry.canClaim(preferred, effectId, priority)) return preferred
    // Try other anchors in order
    for (const anchor of allAnchors) {
      if (anchor === preferred) continue
      if (registry.canClaim(anchor, effectId, priority)) return anchor
    }
    return undefined
  }

  // Register active webcam clip first (high priority)
  // NOTE: Now based on clip, not effect, so we don't use EffectType.Webcam
  if (options?.activeWebcamClip?.layout) {
    const layout = options.activeWebcamClip.layout as WebcamLayoutData
    const anchor = layout.position?.anchor
    if (anchor) {
      registry.claim(anchor, options.activeWebcamClip.id, 'webcam-clip', 200)
      resolvedAnchors.set(options.activeWebcamClip.id, anchor)
    }
  }

  // Sort effects by priority then by startTime to ensure stable resolution
  const activeEffects = effects
    .filter(effect => {
      if (effect.enabled === false) return false
      if (timeMs < effect.startTime || timeMs >= effect.endTime) return false
      // NOTE: Webcam removed from filter - now handled via clip.layout above
      if (effect.type !== EffectType.Keystroke && effect.type !== EffectType.Subtitle) return false
      if (effect.type === EffectType.Keystroke && effect.id === KEYSTROKE_STYLE_EFFECT_ID) return false

      if (effect.type === EffectType.Subtitle) {
        const subtitleData = effect.data as SubtitleEffectData | undefined
        if (options?.activeRecordingId && subtitleData?.recordingId && subtitleData.recordingId !== options.activeRecordingId) return false
        if (options?.hasActiveTranscript === false) return false
      }
      return true
    })
    .map(effect => {
      const data = effect.data as { anchor?: OverlayAnchor; priority?: number; position?: KeystrokePosition } | undefined
      const preferredAnchor =
        data?.anchor ??
        mapPositionToAnchor(data?.position) ??
        (effect.type === EffectType.Keystroke ? defaultKeystrokeAnchor : undefined)
      const priority = data?.priority ?? (effect.type === EffectType.Subtitle ? 100 : 50)
      return { effect, preferredAnchor, priority }
    })
    .sort((a, b) => b.priority - a.priority || a.effect.startTime - b.effect.startTime)

  const displaced = new Set<string>()

  for (const { effect, preferredAnchor, priority } of activeEffects) {
    if (!preferredAnchor) continue

    // Subtitles always use their explicitly selected anchor and take priority over other overlays.
    // They still claim the anchor so other overlays (keystrokes, webcam) can avoid collisions.
    if (effect.type === EffectType.Subtitle) {
      registry.claim(preferredAnchor, effect.id, effect.type, priority)
      resolvedAnchors.set(effect.id, preferredAnchor)
      continue
    }

    const actualAnchor = findAvailableAnchor(preferredAnchor, effect.id, priority)
    if (actualAnchor) {
      registry.claim(actualAnchor, effect.id, effect.type, priority)
      resolvedAnchors.set(effect.id, actualAnchor)
    } else {
      displaced.add(effect.id)
    }
  }

  return {
    displacedEffectIds: displaced,
    resolvedAnchors
  }
}
