import React from 'react'
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { createVideoStreamUrl } from '@/features/media/recording/components/library/utils/recording-paths'
import { useProjectStore } from '@/features/core/stores/project-store'
import { cn } from '@/shared/utils/utils'
import { DEFAULT_BOKEH_ICON_PATH, WATERMARK_Z_INDEX, normalizeWatermarkEffectData } from '../config'
import { WatermarkLayout } from '../types'
import { calculateWatermarkAnimations } from '../utils/watermark-animations'
import { DefaultBokehIcon } from './DefaultBokehIcon'

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function uniq<T>(items: T[]): T[] {
  const out: T[] = []
  for (const item of items) {
    if (!out.includes(item)) out.push(item)
  }
  return out
}

function _getDefaultIconCandidates(): string[] {
  // Support data URIs directly
  if (DEFAULT_BOKEH_ICON_PATH && DEFAULT_BOKEH_ICON_PATH.startsWith('data:')) {
    return [DEFAULT_BOKEH_ICON_PATH]
  }

  const isElectron =
    typeof navigator !== 'undefined' &&
    typeof navigator.userAgent === 'string' &&
    navigator.userAgent.includes('Electron')

  const direct = DEFAULT_BOKEH_ICON_PATH && DEFAULT_BOKEH_ICON_PATH.startsWith('/')
    ? DEFAULT_BOKEH_ICON_PATH
    : `/${DEFAULT_BOKEH_ICON_PATH}`

  const withoutLeadingSlash = direct.slice(1)
  const videoStream = `video-stream://assets/${withoutLeadingSlash}`
  const remotionStatic = staticFile(withoutLeadingSlash)
  const mainWindowDirect = `/main_window${direct}`

  return isElectron
    ? uniq([remotionStatic, videoStream, direct, mainWindowDirect])
    : uniq([remotionStatic, direct, mainWindowDirect, videoStream])
}

function resolveIconSrc(iconPath: string | null): string {
  if (!iconPath) return ''
  return createVideoStreamUrl(iconPath) || iconPath
}

export function WatermarkLayer() {
  const frame = useCurrentFrame()
  const { fps, durationInFrames, width, height } = useVideoConfig()
  const projectWatermark = useProjectStore((s) => s.currentProject?.watermark)
  const data = React.useMemo(() => normalizeWatermarkEffectData(projectWatermark), [projectWatermark])

  if (!data.enabled && !data.forceEnabled) return null

  const minDim = Math.max(1, Math.min(width, height))
  const uiScale = Math.max(0.5, Math.min(2, minDim / 1080))

  const iconPx = Math.max(1, Math.round((minDim * data.iconSize) / 100))
  const { opacityMultiplier, scale } = calculateWatermarkAnimations(data, frame, fps, 0, durationInFrames)

  const baseOpacity = Math.min(1, Math.max(0, data.opacity))
  const finalOpacity = baseOpacity * opacityMultiplier

  const showIcon = data.layout !== WatermarkLayout.TextOnly
  const showText = data.layout !== WatermarkLayout.IconOnly

  const isStacked =
    data.layout === WatermarkLayout.IconTextStacked || data.layout === WatermarkLayout.TextIconStacked

  const isTextFirst =
    data.layout === WatermarkLayout.TextOnly ||
    data.layout === WatermarkLayout.TextIconHorizontal ||
    data.layout === WatermarkLayout.TextIconStacked

  const direction = isStacked ? 'column' : 'row'
  const gapPx = isStacked
    ? clampNumber(Math.round(iconPx * 0.08), 3, 12)
    : clampNumber(Math.round(iconPx * 0.1), 4, 14)

  const shadow = data.textStyle.textShadow?.enabled
    ? `${data.textStyle.textShadow.offsetX}px ${data.textStyle.textShadow.offsetY}px ${data.textStyle.textShadow.blur}px ${data.textStyle.textShadow.color}`
    : undefined

  const outline = data.textStyle.textOutline?.enabled ? data.textStyle.textOutline : undefined
  const underline = data.textStyle.textUnderline?.enabled ? data.textStyle.textUnderline : undefined
  const bg = data.containerStyle?.background?.enabled ? data.containerStyle.background : null

  const iconStyle: React.CSSProperties = {
    width: iconPx,
    height: iconPx,
    objectFit: 'contain',
    filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.45)) drop-shadow(0 0 1px rgba(0,0,0,0.35))',
    pointerEvents: 'none',
    flex: '0 0 auto',
  }

  const renderIcon = () => {
    if (data.iconPath) {
      return (
        <Img
          src={resolveIconSrc(data.iconPath)}
          style={iconStyle}
        />
      )
    }
    // Render the robust inline SVG component for the default logo
    return <DefaultBokehIcon style={iconStyle} />
  }

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        zIndex: WATERMARK_Z_INDEX,
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: Math.round(data.offsetX * uiScale),
          bottom: Math.round(data.offsetY * uiScale),
          opacity: finalOpacity,
          transform: `scale(${scale})`,
          transformOrigin: 'bottom right',
          display: 'flex',
          flexDirection: direction,
          alignItems: 'center',
          gap: gapPx,
          paddingLeft: bg ? Math.round(bg.paddingX * uiScale) : 0,
          paddingRight: bg
            ? Math.round((bg.paddingX + (!data.iconPath && !isTextFirst && showIcon ? 6 : 0)) * uiScale)
            : 0,
          paddingTop: bg ? Math.round(bg.paddingY * uiScale) : 0,
          paddingBottom: bg ? Math.round(bg.paddingY * uiScale) : 0,
          borderRadius: bg ? Math.round(bg.borderRadius * uiScale) : 0,
          backgroundColor: bg ? bg.color : undefined,
        }}
        data-watermark="true"
      >
        {isTextFirst ? (
          <>
            {showText ? (
              <div
                className={cn('select-none')}
                style={{
                  color: data.textStyle.color,
                  fontFamily: data.textStyle.fontFamily,
                  fontWeight: data.textStyle.fontWeight,
                  fontSize: Math.round(data.textStyle.fontSize * uiScale),
                  lineHeight: 1.05,
                  letterSpacing: '-0.01em',
                  textShadow: shadow,
                  WebkitTextStrokeWidth: outline ? outline.width : undefined,
                  WebkitTextStrokeColor: outline ? outline.color : undefined,
                  textDecorationLine: underline ? 'underline' : 'none',
                  textDecorationColor: underline ? underline.color : undefined,
                  textDecorationThickness: underline ? Math.max(1, Math.round(underline.thickness * uiScale)) : undefined,
                  textUnderlineOffset: underline ? Math.round(underline.offset * uiScale) : undefined,
                  whiteSpace: 'nowrap',
                }}
              >
                {data.text}
              </div>
            ) : null}

            {showIcon ? renderIcon() : null}
          </>
        ) : (
          <>
            {showIcon ? renderIcon() : null}

            {showText ? (
              <div
                className={cn('select-none')}
                style={{
                  color: data.textStyle.color,
                  fontFamily: data.textStyle.fontFamily,
                  fontWeight: data.textStyle.fontWeight,
                  fontSize: Math.round(data.textStyle.fontSize * uiScale),
                  lineHeight: 1.05,
                  letterSpacing: '-0.01em',
                  textShadow: shadow,
                  WebkitTextStrokeWidth: outline ? outline.width : undefined,
                  WebkitTextStrokeColor: outline ? outline.color : undefined,
                  textDecorationLine: underline ? 'underline' : 'none',
                  textDecorationColor: underline ? underline.color : undefined,
                  textDecorationThickness: underline ? Math.max(1, Math.round(underline.thickness * uiScale)) : undefined,
                  textUnderlineOffset: underline ? Math.round(underline.offset * uiScale) : undefined,
                  whiteSpace: 'nowrap',
                }}
              >
                {data.text}
              </div>
            ) : null}
          </>
        )}
      </div>
    </AbsoluteFill>
  )
}
