import { BaseOverlayConfig } from '@/types/overlays';
import { type AnnotationData } from './annotation/types'
import { type BackgroundEffectData } from './background/types'
import { type CropEffectData } from './crop/types'
import { type CursorEffectData } from './cursor/types'
import { type KeystrokeEffectData } from './keystroke/types'
import { type ScreenEffectData } from './screen/types';

// Enum for all effect types - single source of truth
export enum EffectType {
  Zoom = 'zoom',
  Cursor = 'cursor',
  Keystroke = 'keystroke',
  Background = 'background',
  Annotation = 'annotation',
  Screen = 'screen',
  Plugin = 'plugin',
  Crop = 'crop',
  Subtitle = 'subtitle'
}

// Enum for effect layer types (subset of effects that appear in the sidebar/timeline lanes)
export enum EffectLayerType {
  Zoom = 'zoom',
  Cursor = 'cursor',
  Background = 'background',
  Screen = 'screen',
  Keystroke = 'keystroke',
  Plugin = 'plugin',
  Crop = 'crop',
  Annotation = 'annotation',
  Frame = 'frame',
  Video = 'video',
  Subtitle = 'subtitle'
}

export type SelectedEffectLayer = { type: EffectLayerType; id?: string } | null;

// Effect entity - timing in source space (recording timestamps)
export type Effect =
  | ZoomEffect
  | CursorEffect
  | KeystrokeEffect
  | BackgroundEffect
  | AnnotationEffect
  | ScreenEffect
  | PluginEffect
  | CropEffect
  | SubtitleEffect;

export interface BaseEffect {
  id: string;
  // Timing in source space (relative to recording start)
  startTime: number;
  endTime: number;
  enabled: boolean;
  locked?: boolean;
  // Explicit clip ID binding for clip-scoped effects (Crop, etc.)
  clipId?: string;
}

export interface ZoomEffect extends BaseEffect {
  type: EffectType.Zoom;
  data: ZoomEffectData;
}

export interface CursorEffect extends BaseEffect {
  type: EffectType.Cursor;
  data: CursorEffectData;
}

export interface KeystrokeEffect extends BaseEffect {
  type: EffectType.Keystroke;
  data: KeystrokeEffectData;
}

export interface BackgroundEffect extends BaseEffect {
  type: EffectType.Background;
  data: BackgroundEffectData;
}

export interface AnnotationEffect extends BaseEffect {
  type: EffectType.Annotation;
  data: AnnotationData;
}

export interface ScreenEffect extends BaseEffect {
  type: EffectType.Screen;
  data: ScreenEffectData;
}

export interface PluginEffect extends BaseEffect {
  type: EffectType.Plugin;
  data: PluginEffectData;
}

export interface CropEffect extends BaseEffect {
  type: EffectType.Crop;
  data: CropEffectData;
}

export interface SubtitleEffect extends BaseEffect {
  type: EffectType.Subtitle;
  data: SubtitleEffectData;
}

export type SubtitleHighlightStyle = 'color' | 'background' | 'underline' | 'scale';

export interface SubtitleEffectData extends BaseOverlayConfig {
  recordingId: string;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  highlightColor: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  wordsPerLine: number;
  lineHeight: number;
  maxWidth: number;
  highlightStyle: SubtitleHighlightStyle;
  transitionMs: number;
  padding?: number;
  borderRadius?: number;
}

// Plugin Effect Data
export interface PluginEffectData {
  /** Plugin ID from registry */
  pluginId: string;
  /** Plugin-specific parameters */
  params: Record<string, unknown>;
  /** Position for positionable plugins (0-100% of canvas) */
  position?: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  /** Z-index override (default based on category) */
  zIndex?: number;
}

// Zoom Types
export type ZoomBlockOrigin = 'auto' | 'manual';

export enum ZoomFollowStrategy {
  Mouse = 'mouse',
  Center = 'center',
  Manual = 'manual'
}

export interface ZoomBlockBase {
  id: string;
  startTime: number;
  endTime: number;
  scale: number;
  targetX?: number;        // Screen pixel coordinates
  targetY?: number;        // Screen pixel coordinates
  screenWidth?: number;    // Screen dimensions for normalization (fixes Retina display issues)
  screenHeight?: number;   // Screen dimensions for normalization (fixes Retina display issues)
  introMs?: number;        // Duration of zoom in animation
  outroMs?: number;        // Duration of zoom out animation
  importance?: number;     // Action importance score (0-1) for 3D effect decisions
  followStrategy?: ZoomFollowStrategy;
  autoScale?: 'fill';
  smoothing?: number;
  mouseIdlePx?: number;
}

export interface AutoZoomBlock extends ZoomBlockBase {
  origin: 'auto';
}

export interface ManualZoomBlock extends ZoomBlockBase {
  origin: 'manual';
}

export type ZoomBlock = AutoZoomBlock | ManualZoomBlock;

export interface ZoomEffectData {
  origin: ZoomBlockOrigin;
  scale: number;
  targetX?: number;          // Screen pixel coordinates
  targetY?: number;          // Screen pixel coordinates
  screenWidth?: number;      // Screen dimensions for normalization (fixes Retina display issues)
  screenHeight?: number;     // Screen dimensions for normalization (fixes Retina display issues)
  introMs: number;
  outroMs: number;
  smoothing: number;
  // Follow strategy: mouse or center lock
  followStrategy?: ZoomFollowStrategy;
  autoScale?: 'fill';
  // Mouse idle threshold in pixels (physical) to consider idle within the velocity window
  mouseIdlePx?: number;
}
