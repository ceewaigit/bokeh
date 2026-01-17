/**
 * CommandRegistry - Type-safe command registration and execution.
 *
 * This module provides typed interfaces for all commands, enabling:
 * - Type-safe command registration (no `as any` casts needed)
 * - Type-safe command creation via createCommand()
 * - Type-safe command execution via executeByName()
 *
 * To add a new command:
 * 1. Add its args to CommandArgsMap
 * 2. Add its result to CommandResultMap
 * 3. Add its constructor to CommandConstructorMap
 */

import type { CommandContext } from './CommandContext'
import type { Command } from './Command'
import type { Clip, Effect, ZoomBlock, TrackType } from '@/types/project'
import type { TrimSide } from '../timeline/TrimCommand'
import type { AssetDetails } from '../timeline/AddAssetCommand'

// ============================================================================
// Command Argument Types
// ============================================================================

/**
 * Maps command names to their constructor arguments (after context).
 * Used for type-safe createCommand() and executeByName() calls.
 */
export interface CommandArgsMap {
  // Timeline commands
  AddClip: [clipOrRecordingId: Clip | string, startTime?: number, options?: { trackType?: TrackType }]
  AddAsset: [payload: { asset: AssetDetails; options?: number | { startTime?: number; insertIndex?: number; trackType?: TrackType; inheritCrop?: boolean } }]
  ReorderClip: [clipId: string, insertIndex: number]
  RemoveClip: [clipId: string]
  SplitClip: [clipId: string, splitTime: number]
  DuplicateClip: [clipId: string]
  UpdateClip: [clipId: string, updates: Partial<Clip>, options?: { exact?: boolean; maintainContiguous?: boolean }]
  Trim: [clipId: string, trimPosition: number, side: TrimSide]
  ChangePlaybackRate: [clipId: string, playbackRate: number]

  // Effect commands
  AddZoomBlock: [block: ZoomBlock]
  RemoveZoomBlock: [blockId: string]
  UpdateZoomBlock: [blockId: string, updates: Partial<ZoomBlock>]
  AddEffect: [effect: Effect]
  RemoveEffect: [effectId: string]
  UpdateEffect: [effectId: string, updates: Partial<Effect>]

  // Clipboard commands
  Copy: [clipId?: string]
  Cut: [clipId?: string]
  Paste: [pasteTime?: number]
}

// ============================================================================
// Command Result Types
// ============================================================================

/**
 * Maps command names to their result data types.
 * Used for type-safe command execution results.
 */
export interface CommandResultMap {
  // Timeline commands
  AddClip: { clipId: string }
  AddAsset: { clipId: string }
  ReorderClip: { clipId: string }
  RemoveClip: { clipId: string }
  SplitClip: { originalClipId: string; leftClipId: string; rightClipId: string }
  DuplicateClip: { newClipId: string }
  UpdateClip: { clipId: string }
  Trim: { clipId: string }
  ChangePlaybackRate: { clipId: string; playbackRate: number }

  // Effect commands
  AddZoomBlock: { blockId: string }
  RemoveZoomBlock: { blockId: string }
  UpdateZoomBlock: { blockId: string }
  AddEffect: { effectId: string }
  RemoveEffect: { effectId: string }
  UpdateEffect: { effectId: string }

  // Clipboard commands
  Copy: { type: string; clipId?: string; effectType?: string; blockId?: string }
  Cut: { clipId: string }
  Paste: { type: string; clipId?: string; effectType?: string; blockId?: string }
}

// ============================================================================
// Command Constructor Types
// ============================================================================

/** Type for command class constructors */
export type CommandConstructor<K extends keyof CommandArgsMap> = new (
  context: CommandContext,
  ...args: CommandArgsMap[K]
) => Command<CommandResultMap[K]>

/**
 * Maps command names to their constructor types.
 * This enables type-safe registration without `as any` casts.
 */
export type CommandConstructorMap = {
  [K in keyof CommandArgsMap]: CommandConstructor<K>
}

// ============================================================================
// Command Names Type
// ============================================================================

/** Union type of all registered command names */
export type CommandName = keyof CommandArgsMap
