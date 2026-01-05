// Annotation type enum
export enum AnnotationType {
  Text = 'text',
  Arrow = 'arrow',
  Highlight = 'highlight',
  Blur = 'blur',
  Redaction = 'redaction'
}

// Annotation style definition
export interface AnnotationStyle {
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textDecoration?: 'none' | 'underline';
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number | { top: number; right: number; bottom: number; left: number };
  opacity?: number;
  shadowIntensity?: number;
  strokeWidth?: number;
  arrowHeadSize?: number;
  /** Redaction-only: number of mosaic cells across (lower = chunkier). */
  mosaicDetail?: number;
}

export interface AnnotationData {
  type?: AnnotationType;
  /** Position in 0-100% of canvas (top-left for text/highlight/keyboard, start point for arrows) */
  position?: { x: number; y: number };
  content?: string;
  style?: AnnotationStyle;
  // Fade timing (in milliseconds)
  introFadeMs?: number;
  outroFadeMs?: number;
  // Optional discriminator for advanced behaviors (e.g., 'screen3d', 'scrollCinematic')
  kind?: string;
  // Additional properties for specific annotation types
  /** End position for arrows (0-100% of canvas) */
  endPosition?: { x: number; y: number };
  /** Width in percentage of canvas (for highlights) */
  width?: number;
  /** Height in percentage of canvas (for highlights) */
  height?: number;
  keys?: string[]; // For keyboard annotations
  /** Smoothing factor for scrollCinematic annotations */
  smoothing?: number;
  /** Rotation in degrees (clockwise positive, 0-360) */
  rotation?: number;
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  startTime: number;
  endTime: number;
  position: { x: number; y: number };
  data: unknown;  // Type-specific data
}
