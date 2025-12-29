import { useEffect, useState, useRef } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { globalBlobManager } from '@/lib/security/blob-url-manager';
import { Project } from '@/types/project';

/**
 * Manages document visibility to pause playback when the window is hidden.
 */
export function usePreviewVisibility(storeIsPlaying: boolean, storePause: () => void) {
    const isDocumentVisible = useRef(true);
    const wasPlayingBeforeHidden = useRef(false);

    useEffect(() => {
        const handleVisibilityChange = () => {
            const visible = document.visibilityState === 'visible';

            if (!visible && storeIsPlaying) {
                wasPlayingBeforeHidden.current = true;
                storePause();
            } else if (visible && wasPlayingBeforeHidden.current) {
                wasPlayingBeforeHidden.current = false;
                // Don't auto-resume - user might have switched apps intentionally
            }

            isDocumentVisible.current = visible;
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [storeIsPlaying, storePause]);

    return { isDocumentVisible };
}

/**
 * Manages the resize observer for the preview viewport.
 */
export function usePreviewResize(ref: React.RefObject<HTMLDivElement>) {
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!ref.current) return;
        let rafId: number | null = null;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;

            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                setSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            });
        });

        observer.observe(ref.current);
        return () => {
            observer.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [ref]);

    return size;
}

/**
 * Preloads videos associated with the project.
 */
export function useVideoPreloader(project: Project | null) {
    useEffect(() => {
        if (!project?.recordings) return;

        const loadVideos = async () => {
            for (const recording of project.recordings) {
                if (recording.filePath) {
                    await globalBlobManager.loadVideos({
                        id: recording.id,
                        filePath: recording.filePath,
                        folderPath: recording.folderPath
                    });
                }
            }
        };

        loadVideos();
    }, [project?.recordings]);
}
