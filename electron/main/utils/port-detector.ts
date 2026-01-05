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
