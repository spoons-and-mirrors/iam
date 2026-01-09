/**
 * Inbox Plugin for OpenCode
 * 
 * Enables inter-session messaging with threads between subagents.
 * 
 * Features:
 * - Subagents can start threads by writing files with mail frontmatter
 * - Recipients get notified and can reply in the same file
 * - Multi-turn conversations are tracked as threads
 * - Parallel subagents are aware of their siblings via task injection
 * 
 * Usage:
 * To start a thread, write a file with this format:
 * ```
 * ---
 * mail: true
 * to: <recipient_session_id>
 * subject: Optional subject line
 * ---
 * Your message body here
 * ```
 * 
 * To reply, use Edit to APPEND to the thread file.
 */

import type { Plugin } from '@opencode-ai/plugin'
import {
  trackExternalThread,
  notifyThreadUpdate,
  getThreadByPath,
  getPendingUpdates,
  markThreadRead,
  registerSubagent,
  getSiblings,
  formatSiblingInfo
} from './lib/inbox'
import { parseFrontmatter, hasFrontmatterPrefix, isValidMail } from './lib/frontmatter'
import * as fs from 'fs/promises'
import * as path from 'path'

/**
 * Initialize the inbox directory
 */
async function initInbox(directory: string): Promise<void> {
  const inboxDir = path.join(directory, '.inbox')
  try {
    await fs.mkdir(inboxDir, { recursive: true })
  } catch {
    // Directory may already exist
  }
}

const plugin: Plugin = async (ctx) => {
  const { directory } = ctx
  
  // Initialize inbox directory
  await initInbox(directory)

  return {
      /**
       * After tool execution - detect mail/thread activity
       */
      'tool.execute.after': async (input, output) => {
        const { tool, sessionID } = input

        // Handle write tool - detect new thread
        if (tool === 'write') {
          const filePath = output.metadata?.filePath as string | undefined
          if (!filePath) return

          try {
            const content = await fs.readFile(filePath, 'utf-8')
            
            if (!hasFrontmatterPrefix(content)) return

            const parsed = parseFrontmatter(content)
            if (!isValidMail(parsed)) return

            const from = parsed.frontmatter.from || sessionID
            const to = parsed.frontmatter.to
            const subject = parsed.frontmatter.subject
            const threadId = parsed.frontmatter.thread
            const participants = parsed.frontmatter.participants

            // Track this as a thread
            const thread = trackExternalThread(filePath, from, to, threadId, subject, participants)
            
            // Notify the recipient
            notifyThreadUpdate(thread, from)

            output.output = (output.output || '') + `\n\n[Thread started with session ${to}. They can reply in this file.]`
          } catch {
            // Ignore errors
          }
          return
        }

        // Handle edit tool - detect thread reply
        if (tool === 'edit') {
          const filePath = output.metadata?.filePath as string | undefined
          if (!filePath) return

          try {
            const content = await fs.readFile(filePath, 'utf-8')
            
            if (!hasFrontmatterPrefix(content)) return

            const parsed = parseFrontmatter(content)
            if (!isValidMail(parsed)) return

            // Check if this is an existing thread
            const thread = getThreadByPath(filePath)
            if (thread) {
              // This is a reply - notify other participants
              notifyThreadUpdate(thread, sessionID)
              output.output = (output.output || '') + `\n\n[Reply sent in thread. Other participants will be notified.]`
            } else {
              // New thread via edit (rare but possible)
              const from = parsed.frontmatter.from || sessionID
              const to = parsed.frontmatter.to
              const subject = parsed.frontmatter.subject
              const threadId = parsed.frontmatter.thread
              const participants = parsed.frontmatter.participants

              const newThread = trackExternalThread(filePath, from, to, threadId, subject, participants)
              notifyThreadUpdate(newThread, from)
            }
          } catch {
            // Ignore errors
          }
          return
        }

        // Handle read tool - mark thread as read (stops injection)
        if (tool === 'read') {
          const filePath = output.metadata?.filePath as string | undefined
          if (filePath) {
            markThreadRead(sessionID, filePath)
          }
          return
        }

        // Handle task tool completion - register new subagent
        if (tool === 'task') {
          const newSessionId = output.metadata?.session_id as string | undefined
          const description = output.metadata?.description as string | undefined
          if (newSessionId) {
            registerSubagent(newSessionId, sessionID, description)
          }
        }
      },

      /**
       * Before task execution - inject sibling session info
       */
      'tool.execute.before': async (input, output) => {
        const { tool, sessionID } = input

        if (tool !== 'task') return

        const siblings = getSiblings(sessionID)
        if (siblings.length === 0) return

        const originalPrompt = (output.args?.prompt as string) || ''
        const siblingInfo = formatSiblingInfo(siblings)

        output.args = {
          ...output.args,
          prompt: originalPrompt + '\n\n' + siblingInfo
        }
      },

      /**
       * Transform messages - inject thread notifications as synthetic user message
       * Keeps injecting until agent reads the thread file
       */
      'experimental.chat.messages.transform': async (input, output) => {
        const updates = getPendingUpdates()
        if (updates.length === 0) return

        // Get last user message to base our synthetic message on
        const lastUserMsg = [...output.messages].reverse().find(m => m.info.role === 'user')
        if (!lastUserMsg) return

        // Filter updates for this session
        const sessionID = lastUserMsg.info.sessionID
        const sessionUpdates = updates.filter(u => u.to === sessionID && !u.read)
        
        if (sessionUpdates.length === 0) return

        // Build notification
        const lines = [
          '<system-reminder priority="critical">',
          `URGENT: You have ${sessionUpdates.length} unread message${sessionUpdates.length > 1 ? 's' : ''} from other agents.`,
          'You MUST read and respond to these messages NOW before continuing with any other work.',
          ''
        ]
        
        for (const update of sessionUpdates) {
          const subject = update.subject ? ` - "${update.subject}"` : ''
          lines.push(`- From: ${update.from}${subject}`)
          lines.push(`  File: ${update.filePath}`)
          lines.push('')
        }
        
        lines.push('ACTION REQUIRED: Use the Read tool to read the message file(s) above immediately.')
        lines.push('To reply: Use the Edit tool to APPEND your response to the same file.')
        lines.push('</system-reminder>')

        const notification = lines.join('\n')

        // Create synthetic user message (like DCP does)
        const syntheticMessage = {
          info: {
            id: 'msg_inbox_notification_' + Date.now(),
            sessionID: sessionID,
            role: 'user' as const,
            time: { created: Date.now() },
            agent: (lastUserMsg.info as any).agent || 'code',
            model: (lastUserMsg.info as any).model,
          },
          parts: [
            {
              id: 'prt_inbox_notification_' + Date.now(),
              sessionID: sessionID,
              messageID: 'msg_inbox_notification_' + Date.now(),
              type: 'text' as const,
              text: notification,
            }
          ]
        }

        // Push synthetic message to the end
        output.messages.push(syntheticMessage as any)
      },

      /**
       * Inject inbox system prompt
       */
      'experimental.chat.system.transform': async (_input, output) => {
        const inboxPrompt = `
# Inbox Plugin - Inter-Agent Messaging

This OpenCode environment uses the **inbox plugin** for communication between parallel agents.

## Sending Messages
To start a conversation with another agent, write a file in the \`.inbox/\` folder with this format:

\`\`\`markdown
---
mail: true
to: <recipient_session_id>
subject: Brief description
---
Your message content here...
\`\`\`

## Replying to Threads
When you receive a thread notification, read the file and use the **Edit tool to APPEND** your response to the same file. This creates a multi-turn conversation thread.

## Key Points
- Use \`.inbox/\` folder for all inter-agent messages
- Include \`mail: true\` in frontmatter for the plugin to detect it
- Reply by appending to existing thread files, don't create new files
- You'll be notified when other agents reply to your threads
`
        output.system.push(inboxPrompt)
      },

      /**
       * Listen for session events
       * Note: No session.complete event available yet, cleanup happens on process restart
       */
      'event': async (_input) => {
        // Future: clean up session state when sessions end
        // Currently, in-memory state is cleared on process restart
      }
    }
  }

export default plugin
