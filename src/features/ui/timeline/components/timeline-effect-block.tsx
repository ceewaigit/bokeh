import React, { useState, useRef, useEffect } from 'react'
import { Rect, Text, Transformer, Line, Group } from 'react-konva'
import { TimelineConfig } from '@/features/ui/timeline/config'
import { TimeConverter } from '@/features/ui/timeline/time/time-space-converter'
import { useTimelineColors, withAlpha } from '@/features/ui/timeline/utils/colors'
import { getNearestAvailableDragX, validatePosition } from '@/features/ui/timeline/utils/drag-positioning'
import { EffectType } from '@/types/project'
import Konva from 'konva'
import { useTimelineScroll } from './timeline-layout-provider'
import { ContinuousRect } from './konva/continuous-rect'

interface TimelineTimeBlock {
  id: string
  startTime: number
  endTime: number
}

interface TimelineEffectBlockProps {
  x: number
  y: number
  width: number
  height: number
  startTime: number
  endTime: number
  // Visuals
  label?: string
  metaLabel?: string
  effectType?: EffectType
  fillColor?: string
  // Zoom visuals (optional)
  scale?: number
  introMs?: number
  outroMs?: number
  // State
  isSelected: boolean
  isEnabled?: boolean
  isCompact?: boolean // When true, show simplified view (no curve, just label)
  allBlocks: TimelineTimeBlock[]
  blockId: string
  pixelsPerMs: number
  // Events
  onSelect: () => void
  onUpdate: (updates: { startTime: number; endTime: number }) => void
  onHover?: () => void
}

export const TimelineEffectBlock = React.memo(({
  x,
  y,
  width,
  height,
  startTime,
  endTime,
  label,
  metaLabel,
  effectType,
  fillColor,
  scale,
  introMs = 500,
  outroMs = 500,
  isSelected,
  isEnabled = true,
  isCompact = false,
  allBlocks,
  blockId,
  pixelsPerMs,
  onSelect,
  onUpdate,
  onHover
}: TimelineEffectBlockProps) => {
  const { scrollLeftRef } = useTimelineScroll()
  // Determine if block is in expanded track for enhanced styling
  const isExpanded = !isCompact
  // Prevent rendering if collapsed/invalid bounds to avoid invalid shape errors

  // Prevent rendering if collapsed/invalid bounds to avoid invalid shape errors

  const EFFECT_TRACK_ANIMATION_DURATION = 0.15

  const colors = useTimelineColors()
  const isDarkMode = colors.isDark
  const [isDragging, setIsDragging] = useState(false)
  const [isTransforming, setIsTransforming] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [currentWidth, setCurrentWidth] = useState(width)
  const groupRef = useRef<Konva.Group>(null)
  const rectRef = useRef<Konva.Shape>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const hasMountedRef = useRef(false)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // PERFORMANCE: Store tween ref to cancel before creating new one
  const hoverTweenRef = useRef<Konva.Tween | null>(null)
  // Use token color if no custom fill is provided (use rgba fallback for Konva)
  const baseColor = fillColor || colors.muted || 'rgba(128, 100, 200, 1)'
  const handleWidth = 4
  const handleHeight = 14

  // OUTLINED style - subtle fill with prominent border
  const blockFillOpacity = isExpanded ? 0.12 : 0.08

  // Border is the main visual - high contrast
  const borderOpacity = isDarkMode ? 0.9 : 0.8

  // Typography - with safe fallbacks (use rgba for Konva compatibility)
  const foregroundColor = colors.foreground || 'rgba(250, 250, 250, 1)'
  const labelFill = isEnabled ? foregroundColor : (colors.glassSecondaryForeground || 'rgba(200, 200, 200, 1)')
  const labelShadowColor = colors.effectLabelShadow || 'rgba(0, 0, 0, 0.8)'

  // Curve stroke - with fallback
  const curveStroke = withAlpha(foregroundColor, isEnabled ? 0.5 : 0.25) || 'rgba(255, 255, 255, 0.5)'

  const handleFill = foregroundColor || 'rgba(255, 255, 255, 0.9)'

  const safeWidth = Math.max(1, currentWidth)
  const safeHeight = Math.max(1, height)
  // Only show full metadata if block is wide AND tall enough
  const showMetadata = Boolean(metaLabel) && Boolean(effectType) && !isCompact && safeWidth >= 72 && safeHeight >= 28

  // Debounced hover handlers to prevent flickering when moving between Group and Transformer
  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsHovering(true)
    onHover?.()
  }

  const handleMouseLeave = () => {
    // Small delay to allow moving to Transformer anchor without flickering
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovering(false)
    }, 50)
  }

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setCurrentWidth(width)
  }, [width])

  useEffect(() => {
    const node = groupRef.current
    if (!node) return
    if (!hasMountedRef.current) {
      node.y(y)
      hasMountedRef.current = true
      return
    }
    if (isDragging || isTransforming) {
      node.y(y)
      return
    }
    if (Math.abs(node.y() - y) < 0.5) return
    node.to({
      y,
      duration: EFFECT_TRACK_ANIMATION_DURATION,
      easing: Konva.Easings.EaseOut
    })
  }, [y, isDragging, isTransforming])

  // Attach transformer when selected OR hovering for immediate resize access
  useEffect(() => {
    if ((isSelected || isHovering) && rectRef.current && trRef.current) {
      trRef.current.nodes([rectRef.current])
      trRef.current.forceUpdate()
      if (groupRef.current && isSelected) {
        groupRef.current.moveToTop()
        groupRef.current.getLayer()?.batchDraw()
      }
    } else if (trRef.current) {
      trRef.current.nodes([])
      trRef.current.forceUpdate()
    }
  }, [isSelected, isHovering])

  // Hover animation - simple opacity change
  useEffect(() => {
    const node = rectRef.current
    if (!node) return

    // Cancel any existing tween
    if (hoverTweenRef.current) {
      hoverTweenRef.current.destroy()
      hoverTweenRef.current = null
    }

    // No animation needed - just ensure proper state
  }, [isHovering, isDragging, isTransforming])

  const generateZoomCurve = () => {
    if (!scale) return [] as number[]

    const points: number[] = []
    // Use currentWidth for real-time updates during transform
    const w = safeWidth
    const h = safeHeight

    if (!w || !h || isNaN(w) || isNaN(h)) {
      return points
    }

    const curveHeight = h - 16 // Slightly more padding
    const curveY = h / 2

    const introWidth = Math.min(TimeConverter.msToPixels(introMs, pixelsPerMs), w * 0.4)
    const outroWidth = Math.min(TimeConverter.msToPixels(outroMs, pixelsPerMs), w * 0.4)
    const plateauWidth = Math.max(0, w - introWidth - outroWidth)

    if (isNaN(introWidth) || isNaN(outroWidth) || isNaN(plateauWidth)) {
      return points
    }

    const scaleHeight = Math.min((scale - 1) * 0.3, 0.8)

    // Generate smoother curve using more points and a better easing function
    // Intro
    const steps = 40 // Increased steps for smoothness

    // Start point
    points.push(0, curveY)

    // Intro curve (ease-in-out)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      // Cubic ease in-out
      const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      const px = introWidth * t
      const py = curveY - (curveHeight / 2) * easeT * scaleHeight
      points.push(px, py)
    }

    // Plateau
    if (plateauWidth > 0) {
      points.push(introWidth + plateauWidth, curveY - (curveHeight / 2) * scaleHeight)
    }

    // Outro curve
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      // Cubic ease in-out reversed
      const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      const px = introWidth + plateauWidth + outroWidth * t
      const py = curveY - (curveHeight / 2) * (1 - easeT) * scaleHeight
      points.push(px, py)
    }

    return points
  }

  const curvePoints = generateZoomCurve()
  const durationMs = Math.max(0, endTime - startTime)

  if (width <= 0 || height <= 0 || safeHeight < 4) {
    return null
  }

  return (
    <>
      <Group
        ref={groupRef}
        x={x}
        y={y}
        draggable={!isTransforming}
        dragBoundFunc={(pos) => {
          const currentScroll = scrollLeftRef.current
          const proposedTimelineX = pos.x + currentScroll
          const constrainedX = Math.max(TimelineConfig.TRACK_LABEL_WIDTH, proposedTimelineX)
          const snappedX = getNearestAvailableDragX({
            proposedX: constrainedX,
            blockWidthPx: safeWidth,
            durationMs,
            blocks: allBlocks,
            pixelsPerMs,
            excludeId: blockId
          })
          return {
            x: snappedX - currentScroll,
            y: y
          }
        }}
        onDragStart={() => {
          setIsDragging(true)
          onSelect()
        }}
        onDragEnd={(e) => {
          setIsDragging(false)
          const draggedX = e.target.x()
          const snappedX = getNearestAvailableDragX({
            proposedX: draggedX,
            blockWidthPx: safeWidth,
            durationMs,
            blocks: allBlocks,
            pixelsPerMs,
            excludeId: blockId
          })
          const newStartTime = TimeConverter.pixelsToMs(snappedX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
          const newEndTime = newStartTime + durationMs
          onUpdate({
            startTime: Math.max(0, newStartTime),
            endTime: Math.max(0, newEndTime)
          })
        }}
        onClick={(e) => {
          e.cancelBubble = true
          if (!isDragging) {
            onSelect()
          }
        }}
        onMouseDown={(e) => {
          e.cancelBubble = true
        }}

        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        listening={true}
      >
        {/* Main block - OUTLINED style with subtle inner fill */}
        <ContinuousRect
          ref={rectRef}
          x={0}
          y={0}
          width={safeWidth}
          height={safeHeight}
          cornerRadius={isExpanded ? 10 : 8}
          fill={withAlpha(baseColor, blockFillOpacity) || 'rgba(128, 128, 128, 0.1)'}
          // Border is the main visual element
          stroke={isSelected
            ? (isDarkMode ? 'rgba(255, 255, 255, 0.95)' : (colors.primary || 'rgba(128, 128, 255, 0.9)'))
            : (withAlpha(baseColor, borderOpacity) || 'rgba(128, 128, 128, 0.8)')
          }
          strokeWidth={isSelected ? 2 : 1.5}
          opacity={!isEnabled ? 0.5 : (isDragging ? 0.85 : 1)}
          listening={true}
        />



        {/* Resize handles - Minimal pill shape */}
        {(isHovering || isSelected) && (
          <>
            <Rect
              x={4}
              y={safeHeight / 2 - handleHeight / 2}
              width={handleWidth}
              height={handleHeight}
              fill={handleFill}
              cornerRadius={handleWidth / 2}
              opacity={0.7}
              listening={false}
            />
            <Rect
              x={safeWidth - handleWidth - 4}
              y={safeHeight / 2 - handleHeight / 2}
              width={handleWidth}
              height={handleHeight}
              fill={handleFill}
              cornerRadius={handleWidth / 2}
              opacity={0.7}
              listening={false}
            />
          </>
        )}

        {/* Zoom curve visualization - subtle waveform-like texture */}
        {!isCompact && curvePoints.length > 0 && (
          <Line
            points={curvePoints}
            stroke={curveStroke}
            strokeWidth={1.5}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        )}

        {/* Label - Split into muted type and primary metadata */}
        {(label || metaLabel) && (
          <Group
            clipFunc={(ctx) => {
              ctx.rect(0, 0, safeWidth, safeHeight)
            }}
          >
            {/* Type label - muted (top half) */}
            <Text
              x={0}
              y={0}
              width={safeWidth}
              height={showMetadata ? safeHeight * 0.5 : safeHeight}
              text={(metaLabel ?? label ?? '').toUpperCase()}
              fontSize={9}
              fontFamily="'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              fontStyle="500"
              fill={labelFill}
              opacity={0.5}
              align="center"
              verticalAlign={showMetadata ? 'bottom' : 'middle'}
              wrap="none"
              listening={false}
              shadowColor={labelShadowColor}
              shadowBlur={2}
              shadowOpacity={0.5}
              shadowOffsetY={1}
            />
            {/* Metadata value - primary (bottom half) */}
            {showMetadata && label && (
              <Text
                x={0}
                y={safeHeight * 0.5 + 1}
                width={safeWidth}
                height={safeHeight * 0.5 - 1}
                text={label}
                fontSize={11}
                fontFamily="'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                fontStyle="600"
                fill={labelFill}
                opacity={0.95}
                align="center"
                verticalAlign="top"
                wrap="none"
                listening={false}
                shadowColor={labelShadowColor}
                shadowBlur={2}
                shadowOpacity={0.5}
                shadowOffsetY={1}
              />
            )}
          </Group>
        )}
      </Group>

      {/* Transformer always rendered - attachment controlled by useEffect based on hover/selection */}
      <Transformer
        key={`transformer-${blockId}`}
        ref={trRef}
        rotateEnabled={false}
        enabledAnchors={['middle-left', 'middle-right']}
        boundBoxFunc={(oldBox, newBox) => {
          const minWidthPx = TimeConverter.msToPixels(TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS, pixelsPerMs)
          // Enforce minimum width while preserving the dragged edge.
          // Konva's Transformer will mutate both x and width when resizing from the left.
          // If we clamp width without compensating x, the right edge can "creep" outward.
          if (newBox.width < minWidthPx) {
            const rightEdge = newBox.x + newBox.width
            newBox.width = minWidthPx
            // If x moved, assume we're resizing from the left and keep the right edge fixed.
            if (newBox.x !== oldBox.x) {
              newBox.x = rightEdge - minWidthPx
            }
          }
          const groupX = groupRef.current ? groupRef.current.x() : x
          const minX = TimelineConfig.TRACK_LABEL_WIDTH - groupX
          if (newBox.x < minX) {
            // Clamp the left edge to the track label boundary while keeping the right edge fixed.
            // Without adjusting width, dragging the left handle into the boundary expands the right side.
            const rightEdge = newBox.x + newBox.width
            newBox.x = minX
            newBox.width = Math.max(minWidthPx, rightEdge - minX)
          }
          newBox.height = oldBox.height
          newBox.y = oldBox.y
          return newBox
        }}
        borderEnabled={false}
        anchorFill="transparent"
        anchorStroke="transparent"
        anchorStrokeWidth={0}
        anchorSize={36} // Increased from 28 for easier grabbing
        anchorCornerRadius={0}
        keepRatio={false}
        ignoreStroke={true}
        shouldOverdrawWholeArea={false}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTransformStart={() => {
          setIsTransforming(true)
          onSelect() // Auto-select when starting to resize
        }}
        onTransform={() => {
          if (rectRef.current && groupRef.current) {
            const rect = rectRef.current
            const group = groupRef.current
            const scaleX = rect.scaleX()
            const scaleY = rect.scaleY()

            // Calculate new width
            const newWidth = rect.width() * scaleX

            // When dragging left handle, rect.x() changes - move that offset to group
            const rectXOffset = rect.x()
            if (rectXOffset !== 0) {
              group.x(group.x() + rectXOffset)
              rect.x(0) // Reset rect to origin within group
            }

            // Update dimensions
            rect.width(newWidth)
            rect.height(rect.height() * scaleY)
            rect.scaleX(1)
            rect.scaleY(1)

            // Update local state for real-time UI updates
            setCurrentWidth(newWidth)
          }
        }}
        onTransformEnd={() => {
          setIsTransforming(false)

          if (!rectRef.current || !groupRef.current || !trRef.current) return

          const rect = rectRef.current
          const group = groupRef.current

          // Capture the accumulated transform state
          const rectX = rect.x()
          const newWidth = rect.width() * rect.scaleX()

          // Reset scale immediately to prevent accumulation
          rect.scaleX(1)
          rect.scaleY(1)

          // Calculate new group position (group.x + rect offset from transform)
          const newGroupX = group.x() + rectX

          const minWidthPx = TimeConverter.msToPixels(TimelineConfig.ZOOM_EFFECT_MIN_DURATION_MS, pixelsPerMs)
          const finalWidth = Math.max(minWidthPx, newWidth)
          const finalX = Math.max(TimelineConfig.TRACK_LABEL_WIDTH, newGroupX)
          const adjustedX = finalX - TimelineConfig.TRACK_LABEL_WIDTH
          const newStartTime = Math.max(0, TimeConverter.pixelsToMs(adjustedX, pixelsPerMs))
          const duration = TimeConverter.pixelsToMs(finalWidth, pixelsPerMs)
          const newEndTime = newStartTime + duration


          const validation = validatePosition(
            newStartTime,
            duration,
            allBlocks,
            blockId,
            { allowOverlap: false }
          )

          const wouldOverlap = !validation.isValid

          // Always reset rect position to origin within the group
          rect.x(0)
          rect.y(0)

          if (wouldOverlap) {
            // Revert to original state
            rect.width(width)
            rect.height(height)
            group.x(x)
            setCurrentWidth(width)
          } else {
            // Apply the new dimensions and position
            rect.width(finalWidth)
            group.x(finalX)
            setCurrentWidth(finalWidth)
            onUpdate({
              startTime: newStartTime,
              endTime: newEndTime
            })
          }

          // Force redraw to sync all visuals
          group.getLayer()?.batchDraw()
        }}
      />
    </>
  )
})

TimelineEffectBlock.displayName = 'TimelineEffectBlock'
