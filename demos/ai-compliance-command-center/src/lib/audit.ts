// Azure Blob Immutable Audit Store (WORM). Every material event is appended as
// a hash-chained record so tampering with any entry breaks every hash after it.
// In production the same records are written to a Blob container with an
// immutability (legal hold / time-based) policy.

import type { AuditAction, AuditEntry } from './types'
import { id } from './random'

/** Tiny non-cryptographic hash (FNV-1a) — stands in for SHA-256 in the demo. */
function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function appendAudit(
  log: AuditEntry[],
  action: AuditAction,
  actor: string,
  subjectId: string,
  detail: string,
  timestamp: string,
): AuditEntry {
  const prevHash = log.length ? log[log.length - 1].hash : '0'.repeat(8)
  const base = `${action}|${actor}|${subjectId}|${detail}|${timestamp}|${prevHash}`
  return {
    id: id('aud'),
    timestamp,
    action,
    actor,
    subjectId,
    detail,
    prevHash,
    hash: fnv1a(base),
  }
}

/** Recompute the chain to confirm nothing was tampered with. */
export function verifyChain(log: AuditEntry[]): boolean {
  let prev = '0'.repeat(8)
  for (const e of log) {
    const base = `${e.action}|${e.actor}|${e.subjectId}|${e.detail}|${e.timestamp}|${prev}`
    if (e.prevHash !== prev || e.hash !== fnv1a(base)) return false
    prev = e.hash
  }
  return true
}
