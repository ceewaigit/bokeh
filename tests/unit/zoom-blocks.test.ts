import { parseZoomBlocks } from '@/features/editor/logic/viewport/logic/orchestrator'
import { EffectType, ZoomFollowStrategy } from '@/types/project'

describe('zoom-blocks validation', () => {
  const baseEffect = {
    id: 'z1',
    type: EffectType.Zoom,
    enabled: true,
    startTime: 0,
    endTime: 1000,
  }

  test('throws when zoom data is missing', () => {
    expect(() => parseZoomBlocks([{ ...baseEffect, data: undefined } as any])).toThrow(
      /Missing data/
    )
  })

  test('throws when origin is invalid', () => {
    expect(() => parseZoomBlocks([
      {
        ...baseEffect,
        data: { origin: 'bad', scale: 2, introMs: 300, outroMs: 300, smoothing: 50 }
      } as any
    ])).toThrow(/Invalid zoom origin/)
  })

  test('throws when timing is invalid', () => {
    expect(() => parseZoomBlocks([
      {
        ...baseEffect,
        startTime: 1000,
        endTime: 1000,
        data: { origin: 'manual', scale: 2, introMs: 300, outroMs: 300, smoothing: 50 }
      } as any
    ])).toThrow(/non-positive duration/)
  })

  test('throws when scale is invalid', () => {
    expect(() => parseZoomBlocks([
      {
        ...baseEffect,
        data: { origin: 'manual', scale: 0, introMs: 300, outroMs: 300, smoothing: 50 }
      } as any
    ])).toThrow(/invalid scale/)
  })

  test('throws when followStrategy is invalid', () => {
    expect(() => parseZoomBlocks([
      {
        ...baseEffect,
        data: { origin: 'manual', scale: 2, introMs: 300, outroMs: 300, smoothing: 50, followStrategy: 'wrong' }
      } as any
    ])).toThrow(/Invalid followStrategy/)
  })

  test('parses valid zoom effects', () => {
    const blocks = parseZoomBlocks([
      {
        ...baseEffect,
        data: {
          origin: 'manual',
          scale: 2,
          introMs: 300,
          outroMs: 300,
          smoothing: 50,
          followStrategy: ZoomFollowStrategy.Mouse
        }
      } as any
    ])

    expect(blocks).toHaveLength(1)
    expect(blocks[0].origin).toBe('manual')
    expect(blocks[0].scale).toBe(2)
  })
})
