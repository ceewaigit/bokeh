/**
 * Entry point for Remotion bundler
 * Used by renderMedia to build the composition
 */

import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);