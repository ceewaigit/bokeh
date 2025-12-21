/**
 * Lazy metadata loading hook for Remotion compositions
 *
 * Handles both preview (local file access) and export (HTTP URLs) environments.
 * Uses MetadataLoader for actual loading and RecordingStorage for caching.
 */

import { useState, useEffect, useRef } from 'react';
import { getRemotionEnvironment, delayRender, continueRender } from 'remotion';
import { RecordingStorage } from '@/lib/storage/recording-storage';
import { metadataLoader } from '@/lib/export/metadata-loader';
import type { Recording, RecordingMetadata } from '@/types/project';
import type { UseRecordingMetadataOptions, UseRecordingMetadataResult } from '@/types';
import { logger } from '@/lib/utils/logger';

/**
 * Empty metadata to return when no data is available
 */
const EMPTY_METADATA: RecordingMetadata = {
  mouseEvents: [],
  keyboardEvents: [],
  clickEvents: [],
  scrollEvents: [],
  screenEvents: [],
};

/**
 * Hook for lazy loading recording metadata
 *
 * In preview mode: Uses electronAPI via MetadataLoader.loadRecordingMetadata()
 * In export mode: Fetches from HTTP URLs via MetadataLoader.loadMetadataFromUrls()
 */
export function useRecordingMetadata({
  recordingId,
  folderPath,
  metadataChunks,
  metadataUrls,
  inlineMetadata,
}: UseRecordingMetadataOptions): UseRecordingMetadataResult {
  const { isRendering } = getRemotionEnvironment();
  const [metadata, setMetadata] = useState<RecordingMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track render delay handle for export mode
  const delayHandleRef = useRef<number | null>(null);

  useEffect(() => {
    // Skip if no recordingId
    if (!recordingId) {
      setMetadata(EMPTY_METADATA);
      setIsLoading(false);
      setError(null);
      return;
    }

    // PRIORITY 1: Check cache first
    const cached = RecordingStorage.getMetadata(recordingId);
    if (cached) {
      setMetadata(cached);
      return;
    }

    // PRIORITY 2: Use inline metadata if provided
    if (inlineMetadata) {
      setMetadata(inlineMetadata);
      // Also cache it for future use
      RecordingStorage.setMetadata(recordingId, inlineMetadata);
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
        let loadedMetadata: RecordingMetadata;

        if (isRendering) {
          // EXPORT MODE: Load from HTTP URLs
          const urlSet = metadataUrls?.[recordingId];
          if (urlSet) {
            loadedMetadata = await metadataLoader.loadMetadataFromUrls(recordingId, urlSet);
          } else {
            logger.warn(`No metadata URLs found for recording ${recordingId} during export`);
            loadedMetadata = EMPTY_METADATA;
          }
        } else {
          // PREVIEW MODE: Load from local files via electronAPI
          if (folderPath && metadataChunks) {
            // Create a minimal recording object for the loader
            const partialRecording = {
              id: recordingId,
              folderPath,
              metadataChunks,
            } as Recording;

            const result = await metadataLoader.loadRecordingMetadata(partialRecording);
            loadedMetadata = result || EMPTY_METADATA;
          } else {
            logger.debug(`No folderPath or metadataChunks for recording ${recordingId}, using empty metadata`);
            loadedMetadata = EMPTY_METADATA;
          }
        }

        setMetadata(loadedMetadata);
      } catch (err) {
        const loadError = err instanceof Error ? err : new Error(String(err));
        logger.error(`Failed to load metadata for recording ${recordingId}:`, loadError);
        setError(loadError);
        setMetadata(EMPTY_METADATA);
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
  }, [recordingId, folderPath, metadataChunks, metadataUrls, inlineMetadata, isRendering]);

  return { metadata, isLoading, error };
}
