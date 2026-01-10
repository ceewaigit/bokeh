import { OverlayAnchor } from '@/types/overlays';
import { BaseOverlayConfig } from '@/types/overlays';

// Keystroke position enum
export enum KeystrokePosition {
  BottomCenter = 'bottom-center',
  BottomRight = 'bottom-right',
  TopCenter = 'top-center'
}

export interface KeystrokeEffectData extends Partial<BaseOverlayConfig> {
  /** @deprecated Use anchor instead. */
  position?: KeystrokePosition;
  anchor?: OverlayAnchor;
  fontSize?: number;
  fontFamily?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  borderRadius?: number;
  padding?: number;
  fadeOutDuration?: number;
  maxWidth?: number;
  // Extended options
  displayDuration?: number;      // How long text stays visible (ms)
  stylePreset?: 'default' | 'glass' | 'minimal' | 'terminal' | 'outline';
  showModifierSymbols?: boolean; // Show ⌘⌥⌃⇧ vs Cmd+Alt+Ctrl+Shift
  showShortcuts?: boolean;       // Show shortcut combos like ⌘C
  scale?: number;                // Overall scale multiplier

  /**
   * Internal: cluster tombstones for auto-generated keystroke blocks.
   * Stored on the global keystroke style effect so deleted blocks don't reappear after re-sync.
   * Format: `${recordingId}::${clusterIndex}`.
   */
  suppressedClusters?: string[];
}
