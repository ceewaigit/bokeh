// Get Next.js port for development
export function getNextJsPort(): number {
  // Use environment variable or default.
  // Do not throw here: in some Electron Forge / webpack dev flows, NODE_ENV may
  // be unset or not reflect the renderer dev server.
  const port = process.env.NEXT_PORT ? parseInt(process.env.NEXT_PORT, 10) : 3000
  console.log(`🔍 Development mode - using Next.js port: ${port}`)
  return port
}
