/**
 * Entry point for Remotion bundler
 * Used by renderMedia to build the composition
 */

import './remotion-globals.css';
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
