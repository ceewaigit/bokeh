import React from 'react';
import ReactDOM from 'react-dom/client';
import { RecordButtonDock } from './components/record-button-dock';
import { WorkspaceManager } from './components/workspace/workspace-manager';
import AreaSelectionPage from './app/area-selection/page';
import { ThemeProvider } from './shared/contexts/theme-context';
import { ErrorBoundary } from './components/error-boundary';
import { PermissionGuard } from './components/permission-guard';
import { WindowAppearanceProvider } from './components/window-appearance-provider';
import { SettingsDialog } from './components/settings-dialog';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import './app/globals.css';


// Check route based on URL hash
const hash = window.location.hash;
const isRecordButton = hash === '#/record-button';
const isAreaSelection = hash === '#/area-selection';

const App = () => {
  if (isRecordButton) {
    // Record button needs ThemeProvider to access design tokens
    return (
      <WindowAppearanceProvider>
        <ThemeProvider>
          <RecordButtonDock />
        </ThemeProvider>
      </WindowAppearanceProvider>
    );
  }

  if (isAreaSelection) {
    // Area selection is a fullscreen transparent overlay
    // No ThemeProvider needed as it uses inline styles
    return <AreaSelectionPage />;
  }

  // Main app UI needs ThemeProvider
  return (
    <WindowAppearanceProvider>
      <ThemeProvider>
        <TooltipProvider>
          <ErrorBoundary>
            <PermissionGuard>
              <WorkspaceManager />
            </PermissionGuard>
            <SettingsDialog />
            <Toaster />
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </WindowAppearanceProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
