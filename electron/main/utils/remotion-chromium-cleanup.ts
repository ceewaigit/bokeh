import { execSync } from 'child_process'

type KillStats = {
  matched: number
  terminated: number
  killed: number
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Attempt to terminate orphaned Remotion/Puppeteer Chromium processes.
 *
 * Remotion launches `chrome-headless-shell` with a temporary profile dir like:
 *   /var/folders/.../T/puppeteer_dev_chrome_profile-XXXXXX
 *
 * If the app crashes or a worker is force-killed, Chromium can sometimes linger.
 * We only target processes that reference that temp profile dir to avoid killing
 * the user's regular Chrome or unrelated Chromium instances.
 */
export function killRemotionChromiumProcesses(opts?: { graceMs?: number }): KillStats {
  const graceMs = Math.max(0, Math.floor(opts?.graceMs ?? 1500))

  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return { matched: 0, terminated: 0, killed: 0 }
  }

  let out = ''
  try {
    out = execSync('ps -axo pid=,command=', { encoding: 'utf8' })
  } catch {
    return { matched: 0, terminated: 0, killed: 0 }
  }

  const pids: number[] = []
  for (const line of out.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const firstSpace = trimmed.indexOf(' ')
    if (firstSpace <= 0) continue
    const pidStr = trimmed.slice(0, firstSpace).trim()
    const cmd = trimmed.slice(firstSpace + 1)
    const pid = Number(pidStr)
    if (!Number.isFinite(pid) || pid <= 1) continue

    const looksLikeRemotionChrome =
      (cmd.includes('chrome-headless-shell') || cmd.includes('Chromium') || cmd.includes('chrome-for-testing')) &&
      cmd.includes('puppeteer_dev_chrome_profile-')

    if (looksLikeRemotionChrome) {
      pids.push(pid)
    }
  }

  let terminated = 0
  let killed = 0

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM')
      terminated += 1
    } catch {
      // ignore
    }
  }

  if (pids.length > 0 && graceMs > 0) {
    const start = Date.now()
    while (Date.now() - start < graceMs) {
      const anyAlive = pids.some((pid) => isProcessAlive(pid))
      if (!anyAlive) break
    }
  }

  for (const pid of pids) {
    if (!isProcessAlive(pid)) continue
    try {
      process.kill(pid, 'SIGKILL')
      killed += 1
    } catch {
      // ignore
    }
  }

  return { matched: pids.length, terminated, killed }
}

