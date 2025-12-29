/**
 * Shared/Contexts Module
 * 
 * This directory contains globally-shared context providers and utilities.
 * Feature-specific contexts should remain with their respective features.
 */
export { ThemeProvider, useTheme } from './theme-context';
export { getSharedAudioContext, closeSharedAudioContext } from './audio-context';
