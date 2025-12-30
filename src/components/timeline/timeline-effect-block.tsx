import React, { useState, useRef, useEffect } from 'react'
import { Rect, Text, Transformer, Line, Group } from 'react-konva'
import { TimelineConfig } from '@/features/timeline/config'
import { TimeConverter } from '@/features/timeline/time/time-space-converter'
import { useTimelineColors, withAlpha } from '@/features/timeline/utils/colors'
import { getNearestAvailableDragX } from '@/features/timeline/utils/drag-positioning'
import Konva from 'konva'

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
  iconKey?: 'zoom' | 'screen' | 'keys' | 'plugin' | 'note'
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
  iconKey,
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
  // Determine if block is in expanded track for enhanced styling
  const isExpanded = !isCompact
  // Prevent rendering if collapsed/invalid bounds to avoid invalid shape errors

  const EFFECT_TRACK_ANIMATION_DURATION = 0.18

  const colors = useTimelineColors()
  const isDarkMode = colors.isDark
  const [isDragging, setIsDragging] = useState(false)
  const [isTransforming, setIsTransforming] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [currentWidth, setCurrentWidth] = useState(width)
  const groupRef = useRef<Konva.Group>(null)
  const rectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const hasMountedRef = useRef(false)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // PERFORMANCE: Store tween ref to cancel before creating new one
  const hoverTweenRef = useRef<Konva.Tween | null>(null)
  // Use token color if no custom fill is provided
  const baseStroke = fillColor || colors.muted
  const handleWidth = 6
  const handleHeight = 14

  // Define colors using tokens
  // Enhanced styling for expanded state - more depth and polish
  const blockFill = baseStroke

  // Enhanced shadow configuration for expanded state
  const shadowConfig = {
    blur: isExpanded ? (isSelected ? 12 : 8) : (isSelected ? 4 : 1),
    opacity: isExpanded ? (isSelected ? 0.35 : 0.25) : (isSelected ? 0.15 : 0.05),
    offsetY: isExpanded ? 3 : 1
  }

  // Use glass-safe colors for maximum contrast on any background
  const labelFill = isEnabled
    ? colors.effectLabelColor // High-contrast text from glass-safe tokens
    : colors.glassSecondaryForeground

  const curveStroke = withAlpha(colors.foreground, isEnabled ? (isDarkMode ? 0.9 : 0.7) : 0.35)

  const handleFill = colors.foreground
  // Always use text shadow for glass mode legibility
  const labelShadowColor = colors.effectLabelShadow

  const safeWidth = Math.max(1, currentWidth)
  const safeHeight = Math.max(1, height)
  // Only show full metadata if block is wide AND tall enough
  const showMetadata = Boolean(metaLabel) && Boolean(iconKey) && !isCompact && safeWidth >= 72 && safeHeight >= 28

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

  // Animation effect on hover
  // PERFORMANCE: Cancel existing tween before creating new one to prevent accumulation
  useEffect(() => {
    const node = rectRef.current
    if (!node) return

    // Cancel any existing tween before creating new one
    if (hoverTweenRef.current) {
      hoverTweenRef.current.destroy()
      hoverTweenRef.current = null
    }

    // Enhanced depth and lift effect - more pronounced when expanded
    const baseBlur = isExpanded ? shadowConfig.blur : (isSelected ? 4 : 1)
    const baseOpacity = isExpanded ? shadowConfig.opacity : (isSelected ? 0.15 : 0.05)

    const targetShadowBlur = isHovering && !isDragging && !isTransforming
      ? (isExpanded ? 16 : 8)  // Higher lift on hover, even more when expanded
      : baseBlur
    const targetShadowOpacity = isHovering && !isDragging && !isTransforming
      ? (isExpanded ? 0.4 : 0.2)  // Deeper shadow on hover
      : baseOpacity

    hoverTweenRef.current = new Konva.Tween({
      node,
      duration: 0.18, // Slightly longer for smooth physics feel
      scaleX: 1,
      scaleY: 1,
      shadowBlur: targetShadowBlur,
      shadowOpacity: targetShadowOpacity,
      easing: Konva.Easings.EaseOut, // Snappy ease out
      onFinish: () => {
        // Clear ref when tween completes naturally
        hoverTweenRef.current = null
      }
    })
    hoverTweenRef.current.play()

    // Cleanup on unmount
    return () => {
      if (hoverTweenRef.current) {
        hoverTweenRef.current.destroy()
        hoverTweenRef.current = null
      }
    }
  }, [isHovering, isDragging, isTransforming, isSelected, isExpanded, shadowConfig.blur, shadowConfig.opacity])

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
          const constrainedX = Math.max(TimelineConfig.TRACK_LABEL_WIDTH, pos.x)
          const snappedX = getNearestAvailableDragX({
            proposedX: constrainedX,
            blockWidthPx: safeWidth,
            durationMs,
            blocks: allBlocks,
            pixelsPerMs,
            excludeId: blockId
          })
          return {
            x: snappedX,
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
        {/* Main block - Colored fill with gradient overlay for depth */}
        <Rect
          ref={rectRef}
          x={0}
          y={0}
          width={safeWidth}
          height={safeHeight}
          fill={withAlpha(blockFill, isExpanded ? 0.85 : 0.75)}
          // Enhanced border - slightly thicker and more prominent when expanded
          stroke={isSelected
            ? (isDarkMode ? 'rgba(255,255,255,0.95)' : colors.primary)
            : withAlpha(blockFill, isExpanded ? 0.7 : 0.6)
          }
          strokeWidth={isSelected ? (isExpanded ? 2 : 1.5) : (isExpanded ? 1.5 : 1)}
          // Refined corner radius
          cornerRadius={isExpanded ? 10 : 8}
          opacity={!isEnabled ? 0.4 : (isDragging ? 0.9 : 1)}
          // Enhanced shadow system for depth
          shadowColor={isDarkMode ? 'black' : 'rgba(0,0,0,0.7)'}
          shadowBlur={shadowConfig.blur}
          shadowOpacity={shadowConfig.opacity}
          shadowOffsetY={shadowConfig.offsetY}
          listening={true}
        />

        {/* Dark gradient overlay at top for cinematic depth */}
        <Rect
          x={0}
          y={0}
          width={safeWidth}
          // Full height smooth fade
          height={safeHeight}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: safeHeight }}
          fillLinearGradientColorStops={[
            0, 'rgba(0,0,0,0.15)', // Very subtle top shadow
            1, 'rgba(0,0,0,0)'
          ]}
          cornerRadius={[isExpanded ? 10 : 8, isExpanded ? 10 : 8, 0, 0]}
          listening={false}
        />

        {/* Glass highlight - Enhanced with stronger texture for expanded state */}
        <Rect
          x={1}
          y={1}
          width={Math.max(1, safeWidth - 2)}
          height={Math.max(1, (safeHeight - 2) * (isExpanded ? 0.4 : 0.5))}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: (safeHeight - 2) * (isExpanded ? 0.4 : 0.5) }}
          fillLinearGradientColorStops={
            isExpanded
              ? [
                0, withAlpha(colors.foreground, 0.18), // Slightly brighter highlight
                0.5, withAlpha(colors.foreground, 0.08),
                1, withAlpha(colors.foreground, 0)
              ]
              : [
                0, withAlpha(colors.foreground, 0.12),
                1, withAlpha(colors.foreground, 0)
              ]
          }
          cornerRadius={[isExpanded ? 9 : 7, isExpanded ? 9 : 7, 0, 0]}
          listening={false}
        />

        {/* Resize handles - Modern Pill Shape with enhanced styling */}
        {(isHovering || isSelected) && (
          <>
            {/* Left Handle */}
            <Rect
              x={-handleWidth / 2}
              y={safeHeight / 2 - (isExpanded ? handleHeight * 1.2 : handleHeight) / 2}
              width={handleWidth}
              height={isExpanded ? handleHeight * 1.2 : handleHeight}
              fill={isSelected ? (isDarkMode ? '#ffffff' : colors.primary) : handleFill}
              cornerRadius={handleWidth / 2} // Pill shape
              listening={false}
              shadowColor="black"
              shadowBlur={isExpanded ? 6 : 4}
              shadowOpacity={isExpanded ? 0.3 : 0.2}
            />
            {/* Right Handle */}
            <Rect
              x={safeWidth - handleWidth / 2}
              y={safeHeight / 2 - (isExpanded ? handleHeight * 1.2 : handleHeight) / 2}
              width={handleWidth}
              height={isExpanded ? handleHeight * 1.2 : handleHeight}
              fill={isSelected ? (isDarkMode ? '#ffffff' : colors.primary) : handleFill}
              cornerRadius={handleWidth / 2} // Pill shape
              listening={false}
              shadowColor="black"
              shadowBlur={isExpanded ? 6 : 4}
              shadowOpacity={isExpanded ? 0.3 : 0.2}
            />
          </>
        )}

        {/* Only show curve in non-compact mode */}
        {!isCompact && curvePoints.length > 0 && (
          <>
            <Line
              points={curvePoints}
              stroke={curveStroke}
              strokeWidth={1.5}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          </>
        )}

        {/* Label / Metadata - simple centered layout */}
        {(label || metaLabel) && (
          <Text
            x={0}
            y={0}
            width={safeWidth}
            height={safeHeight}
            text={showMetadata ? `${(metaLabel ?? '').toUpperCase()}\n${label || ''}` : (label || '')}
            fontSize={showMetadata ? 9 : 11}
            lineHeight={1.4}
            fontFamily="'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            fontStyle="500"
            fill={labelFill}
            opacity={0.95}
            align="center"
            verticalAlign="middle"
            wrap="none"
            listening={false}
            shadowColor={labelShadowColor}
            shadowBlur={2}
            shadowOpacity={0.5}
            shadowOffsetY={1}
          />
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
          if (newBox.width < minWidthPx) {
            newBox.width = minWidthPx
          }
          const groupX = groupRef.current ? groupRef.current.x() : x
          const absoluteX = groupX + newBox.x
          if (absoluteX < TimelineConfig.TRACK_LABEL_WIDTH) {
            newBox.x = TimelineConfig.TRACK_LABEL_WIDTH - groupX
          }
          newBox.height = oldBox.height
          newBox.y = oldBox.y
          return newBox
        }}
        borderEnabled={false}
        anchorFill="transparent"
        anchorStroke="transparent"
        anchorStrokeWidth={0}
        anchorSize={28}
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

          const wouldOverlap = allBlocks
            .filter(b => b.id !== blockId)
            .some(block =>
              (newStartTime < block.endTime && newEndTime > block.startTime)
            )

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
