import * as net from 'net'

// Get Next.js port for development
export function getNextJsPort(): number {
  // In production, Next.js is bundled - no port needed
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
    throw new Error('Next.js port detection not needed in production')
  }
  
  // For development, use environment variable or default
  const port = process.env.NEXT_PORT ? parseInt(process.env.NEXT_PORT, 10) : 3000
  console.log(`🔍 Development mode - using Next.js port: ${port}`)
  return port
}

// Check if a port is available
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    
    server.once('error', () => {
      resolve(false)
    })
    
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    
    server.listen(port, '127.0.0.1')
  })
}

// Find the first available port starting from a base port
export async function findAvailablePort(startPort: number = 3000, maxAttempts: number = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i
    if (await isPortAvailable(port)) {
      return port
    }
  }
  throw new Error(`No available port found between ${startPort} and ${startPort + maxAttempts}`)
}

