/**
 * Lazy metadata loading hook for Remotion compositions
 *
 * DESIGN PRINCIPLES:
 * 1. NEVER THROW - always return gracefully with empty metadata if loading fails
 * 2. CAPABILITIES-FIRST - check recording.capabilities before inferring from fields
 * 3. FAIL-SAFE - any error results in empty metadata, not a crash
 *
 * Handles both preview (local file access) and export (HTTP URLs) environments.
 * Uses MetadataLoader for actual loading and ProjectStorage for caching.
 */

import { useState, useEffect, useRef } from 'react';
import { getRemotionEnvironment, delayRender, continueRender } from 'remotion';
import { ProjectStorage } from '@/features/core/storage/project-storage';
import { metadataLoader } from '@/features/core/export/metadata-loader';
import type { Recording, RecordingMetadata } from '@/types/project';
import type { UseRecordingMetadataOptions, UseRecordingMetadataResult } from '@/types';
import { logger } from '@/shared/utils/logger';

// ============================================================================
// Constants
// ============================================================================

/**
 * Empty metadata to return when no data is available.
 * This is the safe fallback for all error cases.
 */
const EMPTY_METADATA: RecordingMetadata = {
  mouseEvents: [],
  keyboardEvents: [],
  clickEvents: [],
  scrollEvents: [],
  screenEvents: [],
};

// ============================================================================
// Decision Logic
// ============================================================================

/**
 * Determine if we should skip loading metadata for this recording.
 * 
 * Returns true if:
 * - Recording is external (imported from file)
 * - Capabilities explicitly say no cursor data
 * - No metadata inputs are available
 */
function shouldSkipLoading(options: UseRecordingMetadataOptions): boolean {
  const { recordingId, isExternal, capabilities, inlineMetadata, folderPath, metadataChunks, metadataUrls } = options;

  // No recording ID means nothing to load
  if (!recordingId) {
    return true;
  }

  // External recordings never have metadata
  if (isExternal) {
    return true;
  }

  // Explicit capabilities: skip if no cursor data
  if (capabilities?.hasCursorData === false) {
    return true;
  }

  // Already have inline metadata - no need to load
  if (inlineMetadata) {
    return false; // Don't skip - we'll use the inline data
  }

  const hasMetadataUrls = Boolean(metadataUrls && metadataUrls[recordingId]);

  // No paths to load from
  if (!folderPath && !metadataChunks && !hasMetadataUrls) {
    return true;
  }

  return false;
}

/**
 * Check if we have enough information to attempt loading.
 */
function canAttemptLoading(options: UseRecordingMetadataOptions, isRendering: boolean): boolean {
  const { folderPath, metadataChunks, metadataUrls, recordingId } = options;

  if (isRendering) {
    // Export mode: need metadata URLs
    return !!(metadataUrls && recordingId && metadataUrls[recordingId]);
  } else {
    // Preview mode: prefer local files, but allow URL-backed metadata as a fallback (some recordings lack chunk manifests).
    return Boolean((folderPath && metadataChunks) || (metadataUrls && recordingId && metadataUrls[recordingId]));
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for lazy loading recording metadata.
 * 
 * GUARANTEED BEHAVIOR:
 * - Never throws
 * - Returns empty metadata if loading fails
 * - Uses cache when available
 * - Handles preview and export modes
 *
 * @example
 * const { metadata, isLoading, error } = useRecordingMetadata({
 *   recordingId: recording.id,
 *   folderPath: recording.folderPath,
 *   metadataChunks: recording.metadataChunks,
 *   inlineMetadata: recording.metadata,
 *   isExternal: recording.isExternal,
 *   capabilities: recording.capabilities,
 * });
 */
export function useRecordingMetadata(options: UseRecordingMetadataOptions): UseRecordingMetadataResult {
  const {
    recordingId,
    folderPath,
    metadataChunks,
    metadataUrls,
    inlineMetadata,
    isExternal,
    capabilities
  } = options;

  const { isRendering } = getRemotionEnvironment();
  const [metadata, setMetadata] = useState<RecordingMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track render delay handle for export mode
  const delayHandleRef = useRef<number | null>(null);

  // Track applied metadata to prevent redundant updates/loops
  const lastMetadataRef = useRef<RecordingMetadata | null>(null);

  // Helper to safely update metadata only if changed
  const safeSetMetadata = (newMetadata: RecordingMetadata) => {
    try {
      const current = lastMetadataRef.current;

      // Lightweight equality check using array lengths
      const hasChanged = !current || (
        (newMetadata.mouseEvents?.length ?? 0) !== (current.mouseEvents?.length ?? 0) ||
        (newMetadata.keyboardEvents?.length ?? 0) !== (current.keyboardEvents?.length ?? 0) ||
        (newMetadata.clickEvents?.length ?? 0) !== (current.clickEvents?.length ?? 0) ||
        (newMetadata.scrollEvents?.length ?? 0) !== (current.scrollEvents?.length ?? 0) ||
        (newMetadata.screenEvents?.length ?? 0) !== (current.screenEvents?.length ?? 0)
      );

      if (hasChanged) {
        lastMetadataRef.current = newMetadata;
        setMetadata(newMetadata);
      }
    } catch (err) {
      logger.warn('Failed to apply recording metadata, using empty fallback:', err);
      lastMetadataRef.current = EMPTY_METADATA;
      setMetadata(EMPTY_METADATA);
    }
  };

  useEffect(() => {
    // ========================================================================
    // FAST PATH: Skip loading for recordings without metadata
    // ========================================================================

    if (shouldSkipLoading({ recordingId, isExternal, capabilities, inlineMetadata, folderPath, metadataChunks })) {
      safeSetMetadata(EMPTY_METADATA);
      setIsLoading(false);
      setError(null);
      return;
    }

    // ========================================================================
    // PRIORITY 1: Check cache first
    // ========================================================================

    if (recordingId) {
      const cached = ProjectStorage.getMetadata(recordingId);
      if (cached) {
        safeSetMetadata(cached);
        setIsLoading(false);
        setError(null);
        return;
      }
    }

    // ========================================================================
    // PRIORITY 2: Use inline metadata if provided
    // ========================================================================

    if (inlineMetadata) {
      safeSetMetadata(inlineMetadata);

      // Cache for future use
      if (recordingId) {
        ProjectStorage.setMetadata(recordingId, inlineMetadata);
      }

      setIsLoading(false);
      setError(null);
      return;
    }

    // ========================================================================
    // PRIORITY 3: Load from disk/network
    // ========================================================================

    // Check if we have enough information to load
    if (!canAttemptLoading({ folderPath, metadataChunks, metadataUrls, recordingId }, isRendering)) {
      // Not enough information - return empty quietly
      // logger.debug(`Skipping metadata load for ${recordingId}: insufficient inputs`);
      if (lastMetadataRef.current !== EMPTY_METADATA) {
        safeSetMetadata(EMPTY_METADATA);
      }
      setIsLoading(false);
      setError(null);
      return;
    }

    // For export mode, use delayRender to pause frame rendering until metadata is ready
    if (isRendering) {
      delayHandleRef.current = delayRender(`Loading metadata for ${recordingId}`);
    }

    setIsLoading(true);
    setError(null);

    const loadMetadata = async () => {
      try {
        let loadedMetadata: RecordingMetadata | null = null;

        if (metadataUrls && recordingId) {
          // Export mode uses URLs; preview may also use URLs if local chunk inputs are missing.
          const urlSet = metadataUrls[recordingId];
          if (urlSet) loadedMetadata = await metadataLoader.loadMetadataFromUrls(recordingId, urlSet);
        } else if (folderPath && metadataChunks && recordingId) {
          // Preview mode: load from local files via electronAPI
          const partialRecording = {
            id: recordingId,
            folderPath,
            metadataChunks,
          } as Recording;

          loadedMetadata = await metadataLoader.loadRecordingMetadata(partialRecording);
        }

        // Set whatever we got, or empty if null
        const finalMetadata = loadedMetadata ?? EMPTY_METADATA;
        safeSetMetadata(finalMetadata);

        // Cache successful loads
        if (loadedMetadata && recordingId) {
          ProjectStorage.setMetadata(recordingId, loadedMetadata);
        }
      } catch (err) {
        // NEVER THROW - log and return empty metadata
        const loadError = err instanceof Error ? err : new Error(String(err));
        logger.warn(`Failed to load metadata for recording ${recordingId}, using empty:`, loadError.message);
        setError(loadError);
        safeSetMetadata(EMPTY_METADATA); // Always provide fallback
      } finally {
        setIsLoading(false);

        // Continue render in export mode
        if (delayHandleRef.current !== null) {
          continueRender(delayHandleRef.current);
          delayHandleRef.current = null;
        }
      }
    };

    loadMetadata();

    // Cleanup function
    return () => {
      // If component unmounts while loading in export mode, continue render to prevent hang
      if (delayHandleRef.current !== null) {
        continueRender(delayHandleRef.current);
        delayHandleRef.current = null;
      }
    };
  }, [recordingId, folderPath, metadataChunks, metadataUrls, inlineMetadata, isExternal, capabilities, isRendering]);

  return { metadata, isLoading, error };
}
