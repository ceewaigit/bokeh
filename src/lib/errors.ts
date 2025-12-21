/**
 * Custom error classes for better error handling
 * Replaces string-based error prefixes
 */

export enum RecordingErrorCode {
  PERMISSION_REQUIRED = 'PERMISSION_REQUIRED',
  PERMISSION_WAITING = 'PERMISSION_WAITING',
  PERMISSION_TIMEOUT = 'PERMISSION_TIMEOUT',
  ELECTRON_NOT_AVAILABLE = 'ELECTRON_NOT_AVAILABLE',
  RECORDING_FAILED = 'RECORDING_FAILED',
  INVALID_SETTINGS = 'INVALID_SETTINGS',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export class RecordingError extends Error {
  constructor(message: string, public code: RecordingErrorCode = RecordingErrorCode.UNKNOWN_ERROR) {
    super(message)
    this.name = 'RecordingError'
  }
}

export class PermissionError extends RecordingError {
  constructor(
    message: string,
    public permissionType: 'screen' | 'microphone' | 'camera' = 'screen',
    public requiresSystemSettings = false
  ) {
    super(message, RecordingErrorCode.PERMISSION_REQUIRED)
    this.name = 'PermissionError'
  }

  static waiting(message: string): PermissionError {
    const error = new PermissionError(message)
    error.code = RecordingErrorCode.PERMISSION_WAITING
    return error
  }

  static timeout(message: string): PermissionError {
    const error = new PermissionError(message)
    error.code = RecordingErrorCode.PERMISSION_TIMEOUT
    return error
  }
}

export class ElectronError extends RecordingError {
  constructor(message: string, public electronAPIMethod?: string) {
    super(message, RecordingErrorCode.ELECTRON_NOT_AVAILABLE)
    this.name = 'ElectronError'
  }
}

export class MemoryError extends Error {
  constructor(message: string, public memoryUsage?: number) {
    super(message)
    this.name = 'MemoryError'
  }
}

