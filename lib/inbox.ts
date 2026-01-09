/**
 * Inbox state management with thread support
 * 
 * Tracks:
 * - Active threads between sessions
 * - Thread updates for notifications
 * - Sibling session relationships
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { generateFrontmatter, MailFrontmatter } from './frontmatter'

// Thread represents an ongoing conversation
export interface Thread {
  id: string
  filePath: string
  participants: string[]  // All session IDs involved
  subject?: string
  createdAt: number
  updatedAt: number
  lastAuthor: string      // Who wrote last
}

// Notification for a thread update
export interface ThreadUpdate {
  threadId: string
  filePath: string
  from: string           // Who sent the update
  to: string             // Recipient session ID
  subject?: string
  timestamp: number
  read: boolean          // Has recipient read the thread file?
}

// State
let inboxDir = '.inbox'
const threads = new Map<string, Thread>()                    // threadId -> Thread
const pendingUpdates = new Map<string, ThreadUpdate[]>()     // sessionId -> updates to notify
const sessionThreads = new Map<string, Set<string>>()        // sessionId -> thread IDs they're in
const siblingRegistry = new Map<string, Set<string>>()       // parentId -> child session IDs
const sessionParents = new Map<string, string>()             // sessionId -> parentId

/**
 * Initialize inbox directory
 */
export async function initInbox(projectDir: string): Promise<void> {
  inboxDir = path.join(projectDir, '.inbox')
  try {
    await fs.mkdir(inboxDir, { recursive: true })
  } catch {
    // Directory might already exist
  }
}

/**
 * Generate a thread ID
 */
function generateThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Create or update a thread
 */
export async function createOrUpdateThread(
  from: string,
  to: string,
  body: string,
  subject?: string,
  existingFilePath?: string,
  existingThreadId?: string
): Promise<Thread> {
  const now = Date.now()
  const participants = [from, to].filter(Boolean)
  
  // Check if this is an update to existing thread
  let thread: Thread | undefined
  
  if (existingThreadId && threads.has(existingThreadId)) {
    thread = threads.get(existingThreadId)!
    thread.updatedAt = now
    thread.lastAuthor = from
    // Ensure all participants are tracked
    participants.forEach(p => {
      if (!thread!.participants.includes(p)) {
        thread!.participants.push(p)
      }
    })
  } else if (existingFilePath) {
    // Check if we know this file as a thread
    for (const t of threads.values()) {
      if (t.filePath === existingFilePath) {
        thread = t
        thread.updatedAt = now
        thread.lastAuthor = from
        break
      }
    }
  }
  
  // Create new thread if needed
  if (!thread) {
    const threadId = existingThreadId || generateThreadId()
    const fileName = `${threadId}.md`
    const filePath = existingFilePath || path.join(inboxDir, fileName)
    
    thread = {
      id: threadId,
      filePath,
      participants,
      subject,
      createdAt: now,
      updatedAt: now,
      lastAuthor: from
    }
    
    threads.set(threadId, thread)
    
    // If no existing file, create it with proper frontmatter
    if (!existingFilePath) {
      const frontmatter: MailFrontmatter = {
        mail: true,
        to,
        from,
        subject,
        thread: threadId,
        participants
      }
      const content = generateFrontmatter(frontmatter) + '\n\n' + body
      await fs.writeFile(filePath, content, 'utf-8')
    }
  }
  
  // Track which sessions are in this thread
  for (const p of thread.participants) {
    if (!sessionThreads.has(p)) {
      sessionThreads.set(p, new Set())
    }
    sessionThreads.get(p)!.add(thread.id)
  }
  
  // Queue updates for all participants except the author
  for (const participant of thread.participants) {
    if (participant === from) continue
    
    if (!pendingUpdates.has(participant)) {
      pendingUpdates.set(participant, [])
    }
    
    // Check if we already have a pending update for this thread
    const existing = pendingUpdates.get(participant)!
    const existingIdx = existing.findIndex(u => u.threadId === thread!.id)
    
    const update: ThreadUpdate = {
      threadId: thread.id,
      filePath: thread.filePath,
      from,
      to: participant,
      subject: thread.subject,
      timestamp: now,
      read: false
    }
    
    if (existingIdx >= 0) {
      // Replace with newer update
      existing[existingIdx] = update
    } else {
      existing.push(update)
    }
  }
  
  return thread
}

/**
 * Track an external file as a thread (when we detect mail frontmatter in user's file)
 */
export function trackExternalThread(
  filePath: string,
  from: string,
  to: string,
  threadId?: string,
  subject?: string,
  participants?: string[]
): Thread {
  const id = threadId || generateThreadId()
  const allParticipants = participants || [from, to].filter(Boolean)
  const now = Date.now()
  
  // Check if we already track this file
  for (const t of threads.values()) {
    if (t.filePath === filePath) {
      // Update existing thread
      t.updatedAt = now
      t.lastAuthor = from
      allParticipants.forEach(p => {
        if (!t.participants.includes(p)) t.participants.push(p)
      })
      return t
    }
  }
  
  const thread: Thread = {
    id,
    filePath,
    participants: allParticipants,
    subject,
    createdAt: now,
    updatedAt: now,
    lastAuthor: from
  }
  
  threads.set(id, thread)
  
  // Track session membership
  for (const p of allParticipants) {
    if (!sessionThreads.has(p)) {
      sessionThreads.set(p, new Set())
    }
    sessionThreads.get(p)!.add(id)
  }
  
  return thread
}

/**
 * Queue a thread update notification
 */
export function notifyThreadUpdate(thread: Thread, from: string): void {
  const now = Date.now()
  
  for (const participant of thread.participants) {
    if (participant === from) continue
    
    if (!pendingUpdates.has(participant)) {
      pendingUpdates.set(participant, [])
    }
    
    const updates = pendingUpdates.get(participant)!
    const existingIdx = updates.findIndex(u => u.threadId === thread.id)
    
    const update: ThreadUpdate = {
      threadId: thread.id,
      filePath: thread.filePath,
      from,
      to: participant,
      subject: thread.subject,
      timestamp: now,
      read: false
    }
    
    if (existingIdx >= 0) {
      updates[existingIdx] = update
    } else {
      updates.push(update)
    }
  }
}

/**
 * Get all pending thread updates (for injection)
 */
export function getPendingUpdates(): ThreadUpdate[] {
  const all: ThreadUpdate[] = []
  for (const updates of pendingUpdates.values()) {
    all.push(...updates)
  }
  return all
}

/**
 * Mark thread as read for a session
 */
export function markThreadRead(sessionId: string, filePath: string): void {
  const updates = pendingUpdates.get(sessionId)
  if (!updates) return
  
  // Remove the update for this file path
  pendingUpdates.set(
    sessionId, 
    updates.filter(u => u.filePath !== filePath && !filePath.endsWith(u.filePath))
  )
}

// Removed clearNotifiedUpdates - no longer needed with read-based tracking

/**
 * Get thread by file path
 */
export function getThreadByPath(filePath: string): Thread | undefined {
  for (const thread of threads.values()) {
    if (thread.filePath === filePath || filePath.endsWith(thread.filePath)) {
      return thread
    }
  }
  return undefined
}

/**
 * Get thread by ID
 */
export function getThread(threadId: string): Thread | undefined {
  return threads.get(threadId)
}

// Notification formatting moved to index.ts for single source of truth

// ============ Sibling Registry (unchanged) ============

/**
 * Register a subagent session
 */
export function registerSubagent(
  sessionId: string,
  parentId: string,
  description?: string
): void {
  sessionParents.set(sessionId, parentId)
  
  if (!siblingRegistry.has(parentId)) {
    siblingRegistry.set(parentId, new Set())
  }
  siblingRegistry.get(parentId)!.add(sessionId)
}

/**
 * Get sibling sessions (other children of same parent)
 */
export function getSiblings(sessionId: string): string[] {
  const parentId = sessionParents.get(sessionId)
  if (!parentId) return []
  
  const siblings = siblingRegistry.get(parentId)
  if (!siblings) return []
  
  return Array.from(siblings).filter(id => id !== sessionId)
}

/**
 * Get all children of a parent session
 */
export function getChildren(parentId: string): string[] {
  const children = siblingRegistry.get(parentId)
  return children ? Array.from(children) : []
}

/**
 * Format sibling info for task injection
 */
export function formatSiblingInfo(siblingIds: string[]): string {
  if (siblingIds.length === 0) return ''
  
  return [
    '<system-reminder>',
    'You have parallel sibling agents working on related tasks:',
    ...siblingIds.map(id => `- Session: ${id}`),
    '',
    'To communicate with them, write a file with this format:',
    '```',
    '---',
    'mail: true',
    'to: <sibling_session_id>',
    'subject: Your subject here',
    '---',
    'Your message...',
    '```',
    'They can reply in the same file, creating a thread.',
    '</system-reminder>'
  ].join('\n')
}

/**
 * Clean up session state
 */
export function cleanupSession(sessionId: string): void {
  pendingUpdates.delete(sessionId)
  sessionThreads.delete(sessionId)
  
  // Remove from sibling registry
  const parentId = sessionParents.get(sessionId)
  if (parentId) {
    siblingRegistry.get(parentId)?.delete(sessionId)
  }
  sessionParents.delete(sessionId)
}
