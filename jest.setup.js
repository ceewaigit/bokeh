import '@testing-library/jest-dom'

// Mock document object with essential methods
Object.defineProperty(global, 'document', {
  value: {
    body: {
      innerHTML: '',
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      children: [],
      style: { cssText: '' }
    },
    documentElement: {
      style: { cssText: '' }
    },
    createElement: jest.fn(() => ({
      setAttribute: jest.fn(),
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      id: '',
      style: {}
    })),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  },
  writable: true
})

// Ensure DOM is properly set up for React 18
beforeEach(() => {
  // Clear any existing DOM content
  if (document.body) {
    document.body.innerHTML = ''
  }
  
  // Add a root div for React Testing Library
  if (document.createElement) {
    const div = document.createElement('div')
    div.setAttribute('id', 'root')
    if (document.body) {
      document.body.appendChild(div)
    }
  }
})

// Mock window object first
Object.defineProperty(global, 'window', {
  value: {
    dispatchEvent: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    innerWidth: 1920,
    innerHeight: 1080,
    scrollX: 0,
    scrollY: 0,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout
  },
  writable: true
})

// Mock window.electronAPI for testing
global.window.electronAPI = {
  getSources: jest.fn().mockResolvedValue([]),
  showSaveDialog: jest.fn().mockResolvedValue({ canceled: false, filePath: 'test.webm' }),
  showOpenDialog: jest.fn().mockResolvedValue({ canceled: false, filePaths: [] }),
  minimize: jest.fn(),
  maximize: jest.fn(),
  quit: jest.fn(),
  onRecordingStarted: jest.fn(),
  onRecordingStopped: jest.fn(),
  onRecordingError: jest.fn(),
  removeAllListeners: jest.fn()
}

// Mock MediaRecorder
global.MediaRecorder = class MediaRecorder {
  constructor() {
    this.state = 'inactive'
    this.ondataavailable = null
    this.onstop = null
    this.onstart = null
    this.onerror = null
    this.onpause = null
    this.onresume = null
    this.listeners = new Map()
  }

  start() {
    this.state = 'recording'
    if (this.onstart) this.onstart()
  }

  stop() {
    this.state = 'inactive'
    if (this.onstop) this.onstop()
  }

  pause() {
    this.state = 'paused'
    if (this.onpause) this.onpause()
  }

  resume() {
    this.state = 'recording'
    if (this.onresume) this.onresume()
  }

  addEventListener(type, handler, options) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, [])
    }
    this.listeners.get(type).push({ handler, options })
  }

  removeEventListener(type, handler) {
    if (this.listeners.has(type)) {
      const listeners = this.listeners.get(type)
      const index = listeners.findIndex(l => l.handler === handler)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  static isTypeSupported() {
    return true
  }
}

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getDisplayMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }],
      getVideoTracks: () => [{ addEventListener: jest.fn() }]
    }),
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }],
      getVideoTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }],
      getAudioTracks: () => [{ addEventListener: jest.fn(), stop: jest.fn() }]
    })
  }
})

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-url')
global.URL.revokeObjectURL = jest.fn()

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'mock-uuid'
  }
})

// Mock File API
global.File = class File {
  constructor(bits, filename, options = {}) {
    this.bits = bits
    this.name = filename
    this.type = options.type || ''
    this.size = bits.reduce((acc, bit) => acc + bit.length, 0)
    this.lastModified = options.lastModified || Date.now()
  }
}

// Mock Blob API  
global.Blob = class Blob {
  constructor(bits = [], options = {}) {
    this.size = bits.reduce((acc, bit) => acc + (bit.length || 0), 0)
    this.type = options.type || ''
  }
}

// Mock performance API
global.performance = {
  now: jest.fn(() => Date.now())
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock DragEvent
global.DragEvent = class DragEvent extends Event {
  constructor(type, init = {}) {
    super(type, init)
    this.dataTransfer = init.dataTransfer || {
      files: [],
      dropEffect: 'none',
      effectAllowed: 'all'
    }
  }
}

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
  },
  writable: true
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock FFmpeg
jest.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: class MockFFmpeg {
    constructor() {
      this.loaded = false
    }
    
    async load() {
      this.loaded = true
    }
    
    async writeFile(name, data) {
      return Promise.resolve()
    }
    
    async readFile(name) {
      return new Uint8Array([1, 2, 3, 4])
    }
    
    async exec(args) {
      return Promise.resolve()
    }
    
    async deleteFile(name) {
      return Promise.resolve()
    }
    
    on(event, callback) {
      // Simulate progress events
      if (event === 'progress') {
        setTimeout(() => callback({ progress: 0.5, time: 1000 }), 10)
        setTimeout(() => callback({ progress: 1.0, time: 2000 }), 20)
      }
      if (event === 'log') {
        setTimeout(() => callback({ message: 'Mock log message' }), 5)
      }
    }
    
    off(event, callback) {
      // No-op for mock
    }
  }
}))

jest.mock('@ffmpeg/util', () => ({
  toBlobURL: jest.fn().mockResolvedValue('blob:mock-url'),
  fetchFile: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]))
}))