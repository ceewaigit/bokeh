import { __testables } from '@/features/rendering/renderer/compositions/layers/AnnotationWrapper'

describe('EditableTextContent memo comparator', () => {
  const { areEditableTextContentPropsEqual } = __testables

  const baseContext = {
    videoWidth: 1920,
    videoHeight: 1080,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  }

  const baseProps = {
    data: { content: 'Hello', style: {} },
    context: baseContext,
    isEditing: false,
    constrainWidth: false,
  }

  it('re-renders when italic changes', () => {
    expect(
      areEditableTextContentPropsEqual(
        { ...baseProps, data: { ...baseProps.data, style: { fontStyle: 'normal' } } } as any,
        { ...baseProps, data: { ...baseProps.data, style: { fontStyle: 'italic' } } } as any
      )
    ).toBe(false)
  })

  it('re-renders when underline changes', () => {
    expect(
      areEditableTextContentPropsEqual(
        { ...baseProps, data: { ...baseProps.data, style: { textDecoration: 'none' } } } as any,
        { ...baseProps, data: { ...baseProps.data, style: { textDecoration: 'underline' } } } as any
      )
    ).toBe(false)
  })

  it('skips re-render when props are equal', () => {
    expect(areEditableTextContentPropsEqual(baseProps as any, baseProps as any)).toBe(true)
  })
})

