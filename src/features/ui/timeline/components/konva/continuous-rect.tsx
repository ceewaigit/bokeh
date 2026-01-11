import React from 'react'
import { Shape } from 'react-konva'
import Konva from 'konva'
import { drawSquircleRectPath } from '@/features/ui/timeline/utils/corners'

export type ContinuousRectProps = Omit<Konva.ShapeConfig, 'sceneFunc'> & {
  cornerRadius?:
    | number
    | {
        topLeft?: number
        topRight?: number
        bottomRight?: number
        bottomLeft?: number
      }
}

export const ContinuousRect = React.forwardRef<Konva.Shape, ContinuousRectProps>(
  ({ x = 0, y = 0, width = 0, height = 0, cornerRadius = 0, ...props }, ref) => {
    return (
      <Shape
        ref={ref}
        x={x}
        y={y}
        width={width}
        height={height}
        cornerRadius={cornerRadius}
        {...props}
        sceneFunc={(ctx, shape) => {
          drawSquircleRectPath(
            ctx as unknown as CanvasRenderingContext2D,
            0,
            0,
            shape.width(),
            shape.height(),
            shape.getAttr('cornerRadius') ?? 0
          )
          ctx.fillStrokeShape(shape)
        }}
        hitFunc={(ctx, shape) => {
          drawSquircleRectPath(
            ctx as unknown as CanvasRenderingContext2D,
            0,
            0,
            shape.width(),
            shape.height(),
            shape.getAttr('cornerRadius') ?? 0
          )
          ctx.fillStrokeShape(shape)
        }}
      />
    )
  }
)
ContinuousRect.displayName = 'ContinuousRect'
