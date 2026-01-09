import React from 'react';
import ReactDOM from 'react-dom/client';
import { RecordButtonDock } from './components/record-button-dock';
import { WorkspaceManager } from './components/workspace/workspace-manager';
import AreaSelectionPage from './app/area-selection/page';
import TeleprompterPage from './app/teleprompter/page';
import WebcamPreviewPage from './app/webcam-preview/page';
import { ThemeProvider } from './shared/contexts/theme-context';
import { ErrorBoundary } from './components/error-boundary';
import { PermissionGuard } from './components/permission-guard';
import { WindowSurfaceProvider } from './components/window-surface-provider';
import { SettingsDialog } from '@/features/core/settings/components/settings-dialog';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import './app/globals.css';


// Check route based on URL hash
const hash = window.location.hash;
const isRecordButton = hash === '#/record-button';
const isAreaSelection = hash === '#/area-selection';
const isTeleprompter = hash === '#/teleprompter';
const isWebcamPreview = hash === '#/webcam-preview';

const App = () => {
  if (isRecordButton) {
    // Record button needs ThemeProvider to access design tokens
    return (
      <ThemeProvider>
        <WindowSurfaceProvider>
          <RecordButtonDock />
        </WindowSurfaceProvider>
      </ThemeProvider>
    );
  }

  if (isAreaSelection) {
    // Area selection is a fullscreen transparent overlay
    // No ThemeProvider needed as it uses inline styles
    return <AreaSelectionPage />;
  }

  if (isTeleprompter) {
    // Teleprompter floating notes window
    return (
      <ThemeProvider>
        <TeleprompterPage />
      </ThemeProvider>
    );
  }

  if (isWebcamPreview) {
    // Webcam preview floating window during recording
    return (
      <ThemeProvider>
        <WebcamPreviewPage />
      </ThemeProvider>
    );
  }

  // Main app UI needs ThemeProvider
  return (
    <ThemeProvider>
      <WindowSurfaceProvider>
        <TooltipProvider>
          <ErrorBoundary>
            <PermissionGuard>
              <WorkspaceManager />
            </PermissionGuard>
            <SettingsDialog />
            <Toaster />
          </ErrorBoundary>
        </TooltipProvider>
      </WindowSurfaceProvider>
    </ThemeProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
