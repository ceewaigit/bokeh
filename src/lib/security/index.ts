/**
 * Security and Validation
 * Data validation, memory management, and security utilities
 */

export { BlobURLManager, globalBlobManager } from './blob-url-manager'
export { 
  validateProject, 
  parseProjectData, 
  validateRecordingSettings,
  sanitizeProjectName,
  validateTimelineClip
} from './data-validation'