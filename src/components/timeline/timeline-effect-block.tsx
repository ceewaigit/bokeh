import React, { useState, useRef, useEffect } from 'react'
import { Rect, Text, Transformer, Line, Group, Circle } from 'react-konva'
import { TimelineConfig } from '@/lib/timeline/config'
import { TimeConverter } from '@/lib/timeline/time-space-converter'
import { useTimelineColors } from '@/lib/timeline/colors'
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
}

export const TimelineEffectBlock = React.memo(({
  x,
  y,
  width,
  height,
  startTime,
  endTime,
  label,
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
  onUpdate
}: TimelineEffectBlockProps) => {
  const colors = useTimelineColors()
  const isDarkMode = colors.isDark
  const [isDragging, setIsDragging] = useState(false)
  const [isTransforming, setIsTransforming] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [currentWidth, setCurrentWidth] = useState(width)
  const groupRef = useRef<Konva.Group>(null)
  const rectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const baseStroke = fillColor || colors.zoomBlock
  const handleWidth = 6
  const handleHeight = 14

  // Helper to apply alpha to token colors (which might be simple strings or hsl(a))
  const withAlpha = (color: string, alpha: number): string => {
    if (!color) return ''
    if (color.startsWith('hsla') || color.startsWith('rgba')) return color

    // Handle HSL format
    if (color.startsWith('hsl(')) {
      // Remove 'hsl(' and ')'
      let content = color.substring(4, color.length - 1)

      // If modern space-separated syntax, convert to comma-separated
      if (!content.includes(',')) {
        content = content.replace(/\s+/g, ', ')
      }

      return `hsla(${content}, ${alpha})`
    }

    // Handle RGB format
    if (color.startsWith('rgb(')) {
      let content = color.substring(4, color.length - 1)
      // If modern space-separated syntax, convert to comma-separated
      if (!content.includes(',')) {
        content = content.replace(/\s+/g, ', ')
      }
      return `rgba(${content}, ${alpha})`
    }

    return color
  }

  // Define colors using tokens
  const lightFill = withAlpha(baseStroke, isSelected ? 0.16 : 0.08)
  const darkFill = withAlpha(baseStroke, isSelected ? 0.25 : 0.15)
  const blockFill = isDarkMode ? darkFill : lightFill

  const labelFill = isEnabled
    ? colors.foreground
    : withAlpha(colors.foreground, 0.5)

  const curveStroke = withAlpha(colors.foreground, isEnabled ? (isDarkMode ? 0.9 : 0.7) : 0.35)

  const handleFill = colors.foreground // handles usually contrast well against block fill or bg
  const labelShadowColor = isDarkMode ? colors.background : colors.background // Shadow usually opposite or bg color

  // Debounced hover handlers to prevent flickering when moving between Group and Transformer
  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsHovering(true)
  }

  const handleMouseLeave = () => {
    // Small delay to allow moving to Transformer anchor without flickering
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovering(false)
    }, 50)
  }

  useEffect(() => {
    setCurrentWidth(width)
  }, [width])

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
  useEffect(() => {
    const node = rectRef.current
    if (!node) return

    if (isHovering && !isDragging && !isTransforming) {
      new Konva.Tween({
        node,
        duration: 0.1,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        shadowBlur: 10,
        shadowOpacity: 0.28,
        easing: Konva.Easings.EaseOut
      }).play()
    } else {
      new Konva.Tween({
        node,
        duration: 0.1,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        shadowBlur: isSelected ? 8 : 0,
        shadowOpacity: isSelected ? 0.25 : 0,
        easing: Konva.Easings.EaseOut
      }).play()
    }
  }, [isHovering, isDragging, isTransforming, isSelected, currentWidth, height])

  const getValidDragPosition = (proposedX: number, currentWidth: number): number => {
    const snapThreshold = Number(TimelineConfig.SNAP_THRESHOLD_PX)
    const blocks = allBlocks
      .filter(b => b.id !== blockId)
      .map(b => ({
        x: TimeConverter.msToPixels(b.startTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH,
        endX: TimeConverter.msToPixels(b.endTime, pixelsPerMs) + TimelineConfig.TRACK_LABEL_WIDTH
      }))
      .sort((a, b) => a.x - b.x)

    const blockWidth = currentWidth

    let bestSnapX = proposedX
    let minSnapDistance = snapThreshold

    for (const block of blocks) {
      const leftToLeftDistance = Math.abs(proposedX - block.x)
      if (leftToLeftDistance < minSnapDistance) {
        minSnapDistance = leftToLeftDistance
        bestSnapX = block.x
      }

      const leftToRightDistance = Math.abs(proposedX - block.endX)
      if (leftToRightDistance < minSnapDistance) {
        minSnapDistance = leftToRightDistance
        bestSnapX = block.endX
      }

      const rightToLeftDistance = Math.abs((proposedX + blockWidth) - block.x)
      if (rightToLeftDistance < minSnapDistance) {
        minSnapDistance = rightToLeftDistance
        bestSnapX = block.x - blockWidth
      }

      const rightToRightDistance = Math.abs((proposedX + blockWidth) - block.endX)
      if (rightToRightDistance < minSnapDistance) {
        minSnapDistance = rightToRightDistance
        bestSnapX = block.endX - blockWidth
      }
    }

    return Math.max(TimelineConfig.TRACK_LABEL_WIDTH, bestSnapX)
  }

  const generateZoomCurve = () => {
    if (!scale) return [] as number[]

    const points: number[] = []
    // Use currentWidth for real-time updates during transform
    const w = currentWidth

    if (!w || !height || isNaN(w) || isNaN(height)) {
      return points
    }

    const curveHeight = height - 16 // Slightly more padding
    const curveY = height / 2

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

  return (
    <>
      <Group
        ref={groupRef}
        x={x}
        y={y}
        draggable={!isTransforming}
        dragBoundFunc={(pos) => {
          const constrainedX = Math.max(TimelineConfig.TRACK_LABEL_WIDTH, pos.x)
          return {
            x: constrainedX,
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

          const snappedX = getValidDragPosition(draggedX, width)

          const newStartTime = TimeConverter.pixelsToMs(snappedX - TimelineConfig.TRACK_LABEL_WIDTH, pixelsPerMs)
          const duration = endTime - startTime
          const newEndTime = newStartTime + duration

          const wouldOverlap = allBlocks
            .filter(b => b.id !== blockId)
            .some(block => (newStartTime < block.endTime && newEndTime > block.startTime))

          if (wouldOverlap) {
            if (groupRef.current) {
              groupRef.current.x(x)
              groupRef.current.getLayer()?.batchDraw()
            }
            onSelect()
          } else {
            onUpdate({
              startTime: Math.max(0, newStartTime),
              endTime: Math.max(0, newEndTime)
            })
          }
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
        {/* Main block */}
        <Rect
          ref={rectRef}
          x={0}
          y={0}
          width={currentWidth}
          height={height}
          fill={blockFill}
          stroke={baseStroke}
          strokeWidth={isSelected ? 2.5 : 2}
          cornerRadius={10}
          opacity={!isEnabled ? 0.35 : (isDragging ? 0.85 : 1)}
          shadowColor={isSelected ? baseStroke : undefined}
          shadowBlur={isSelected ? 8 : 0}
          shadowOpacity={isSelected ? 0.25 : 0}
          listening={true}
        />

        {/* Subtle glassmorphism overlay on select */}
        {isSelected && (
          <>
            {/* Subtle top highlight */}
            <Rect
              x={2}
              y={2}
              width={currentWidth - 4}
              height={(height - 4) / 2}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: 0, y: (height - 4) / 2 }}
              fillLinearGradientColorStops={[
                0,
                withAlpha(colors.foreground, 0.1),
                1,
                withAlpha(colors.foreground, 0)
              ]}
              cornerRadius={[8, 8, 0, 0]}
              listening={false}
            />
          </>
        )}

        {/* Resize handles - pill dots like reference */}
        {(isHovering || isSelected) && (
          <>
            <Rect
              x={-handleWidth / 2}
              y={height / 2 - handleHeight / 2}
              width={handleWidth}
              height={handleHeight}
              fill={handleFill}
              cornerRadius={Math.min(handleWidth / 2, 3)}
              listening={false}
            />
            <Rect
              x={currentWidth - handleWidth / 2}
              y={height / 2 - handleHeight / 2}
              width={handleWidth}
              height={handleHeight}
              fill={handleFill}
              cornerRadius={Math.min(handleWidth / 2, 3)}
              listening={false}
            />
          </>
        )}

        {/* Only show curve in non-compact mode */}
        {!isCompact && curvePoints.length > 0 && (
          <>
            <Line
              points={curvePoints}
              stroke={curveStroke}
              strokeWidth={2}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          </>
        )}

        {/* Label - centered in compact mode, top-left otherwise */}
        {label && (
          <Text
            x={isCompact ? currentWidth / 2 : 10}
            y={isCompact ? height / 2 - 5 : 8}
            text={label}
            fontSize={isCompact ? 10 : 11}
            fill={labelFill}
            fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display'"
            fontStyle="600"
            align={isCompact ? "center" : "left"}
            offsetX={isCompact ? (label.length * 3) : 0}
            shadowColor={labelShadowColor}
            shadowBlur={isDarkMode ? 4 : 2}
            shadowOpacity={isDarkMode ? 0.4 : 0.2}
            listening={false}
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
