import type { WebContents } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { normalizeCrossPlatform } from './path-normalizer'

const APPROVAL_TTL_MS = 2 * 60 * 1000

type ApprovalMap = Map<string, number>

const approvedSavePathsBySender = new Map<number, ApprovalMap>()
const approvedReadPathsBySender = new Map<number, ApprovalMap>()
const approvedReadPathsGlobal: ApprovalMap = new Map()

function now(): number {
  return Date.now()
}

function normalizeCandidate(candidatePath: string): string {
  const normalized = normalizeCrossPlatform(candidatePath)
  const resolved = path.resolve(normalized)
  try {
    return fs.realpathSync(resolved)
  } catch {
    return resolved
  }
}

function getApprovalMap(root: Map<number, ApprovalMap>, senderId: number): ApprovalMap {
  const existing = root.get(senderId)
  if (existing) return existing
  const created: ApprovalMap = new Map()
  root.set(senderId, created)
  return created
}

function pruneExpired(approvals: ApprovalMap): void {
  const current = now()
  for (const [key, approvedAt] of approvals) {
    if (current - approvedAt > APPROVAL_TTL_MS) approvals.delete(key)
  }
}

export function approveSavePath(sender: WebContents, filePath: string): void {
  if (!filePath) return
  const approvals = getApprovalMap(approvedSavePathsBySender, sender.id)
  pruneExpired(approvals)
  approvals.set(normalizeCandidate(filePath), now())
}

export function consumeApprovedSavePath(sender: WebContents, filePath: string): boolean {
  if (!filePath) return false
  const approvals = getApprovalMap(approvedSavePathsBySender, sender.id)
  pruneExpired(approvals)
  const normalized = normalizeCandidate(filePath)
  const has = approvals.has(normalized)
  if (has) approvals.delete(normalized)
  return has
}

export function approveReadPaths(sender: WebContents, filePaths: string[]): void {
  const approvals = getApprovalMap(approvedReadPathsBySender, sender.id)
  pruneExpired(approvals)
  pruneExpired(approvedReadPathsGlobal)
  for (const filePath of filePaths) {
    if (!filePath) continue
    const normalized = normalizeCandidate(filePath)
    approvals.set(normalized, now())
    approvedReadPathsGlobal.set(normalized, now())
  }
}

export function isApprovedReadPath(sender: WebContents, filePath: string): boolean {
  if (!filePath) return false
  const approvals = getApprovalMap(approvedReadPathsBySender, sender.id)
  pruneExpired(approvals)
  pruneExpired(approvedReadPathsGlobal)
  const normalized = normalizeCandidate(filePath)
  return approvals.has(normalized) || approvedReadPathsGlobal.has(normalized)
}
