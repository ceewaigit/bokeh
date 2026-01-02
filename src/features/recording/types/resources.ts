
import type { Recording, RecordingMetadata } from '@/types/project';
import type { MetadataUrlSet } from '@/features/export/metadata-loader';

export type VideoUrlMap = Record<string, string>;
export type MetadataUrlMap = Record<string, MetadataUrlSet>;

export interface VideoResources {
    videoUrls?: VideoUrlMap;
    videoUrlsHighRes?: VideoUrlMap;
    videoFilePaths?: VideoUrlMap;
    metadataUrls?: MetadataUrlMap;
}

export interface UseRecordingMetadataOptions {
    /** Recording ID to load metadata for */
    recordingId: string;
    /** Folder path for local file loading (preview mode) */
    folderPath?: string;
    /** Metadata chunk filenames (preview mode) */
    metadataChunks?: Recording['metadataChunks'];
    /** HTTP URLs for metadata chunks (export mode) - keyed by recordingId */
    metadataUrls?: MetadataUrlMap;
    /** Already-loaded metadata to use as fallback */
    inlineMetadata?: RecordingMetadata;
}

export interface UseRecordingMetadataResult {
    /** Loaded metadata (null while loading) */
    metadata: RecordingMetadata | null;
    /** Whether metadata is currently being loaded */
    isLoading: boolean;
    /** Error if loading failed */
    error: Error | null;
}

export interface UseVideoUrlProps {
    recording: Recording | null | undefined;
    resources: VideoResources;
    /** Clip ID for URL lock invalidation when clips change */
    clipId?: string;
    preferOffthreadVideo?: boolean;
    targetWidth?: number;
    targetHeight?: number;
    maxZoomScale?: number;
    currentZoomScale?: number;
    isPlaying?: boolean;
    isGlowMode?: boolean;
    forceProxy?: boolean;
    isHighQualityPlaybackEnabled?: boolean;
}
