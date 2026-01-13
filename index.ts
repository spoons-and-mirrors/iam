import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import {
  ANNOUNCE_DESCRIPTION,
  BROADCAST_DESCRIPTION,
  BROADCAST_MISSING_MESSAGE,
  announceResult,
  broadcastUnknownRecipient,
  broadcastResult,
  SYSTEM_PROMPT,
  urgentNotification,
} from "./prompt"
import { log, LOG } from "./logger"

// ============================================================================
// In-memory message store
// ============================================================================

interface Message {
  id: string
  from: string
  to: string
  body: string
  timestamp: number
  read: boolean
}

// Messages indexed by recipient session ID
const inboxes = new Map<string, Message[]>()

// Track ALL active sessions (simpler approach - register on first iam use)
const activeSessions = new Set<string>()

// Alias mappings: sessionId <-> alias (e.g., "agentA", "agentB")
const sessionToAlias = new Map<string, string>()
const aliasToSession = new Map<string, string>()
const agentDescriptions = new Map<string, string>() // alias -> description
let nextAgentIndex = 0

// Track which sessions have received IAM instructions
const instructedSessions = new Set<string>()

// Cache for parentID lookups
const sessionParentCache = new Map<string, string | null>()

function getNextAlias(): string {
  const letter = String.fromCharCode(65 + (nextAgentIndex % 26)) // A-Z
  const suffix = nextAgentIndex >= 26 ? Math.floor(nextAgentIndex / 26).toString() : ""
  nextAgentIndex++
  return `agent${letter}${suffix}`
}

function getAlias(sessionId: string): string {
  return sessionToAlias.get(sessionId) || sessionId
}

function setDescription(sessionId: string, description: string): void {
  const alias = getAlias(sessionId)
  agentDescriptions.set(alias, description)
  log.info(LOG.SESSION, `Agent announced`, { alias, description })
}

function getDescription(alias: string): string | undefined {
  return agentDescriptions.get(alias)
}

function hasAnnounced(sessionId: string): boolean {
  const alias = getAlias(sessionId)
  return agentDescriptions.has(alias)
}

function resolveAlias(aliasOrSessionId: string, parentId?: string | null): string | undefined {
  // Handle special "parent" alias
  if (aliasOrSessionId === "parent" && parentId) {
    return parentId
  }
  // Try alias first, then assume it's a session ID
  return aliasToSession.get(aliasOrSessionId) || 
    (activeSessions.has(aliasOrSessionId) ? aliasOrSessionId : undefined)
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

function getInbox(sessionId: string): Message[] {
  if (!inboxes.has(sessionId)) {
    inboxes.set(sessionId, [])
  }
  return inboxes.get(sessionId)!
}

// ============================================================================
// Core messaging functions
// ============================================================================

function sendMessage(from: string, to: string, body: string): Message {
  const message: Message = {
    id: generateId(),
    from,
    to,
    body,
    timestamp: Date.now(),
    read: false,
  }
  
  getInbox(to).push(message)
  log.info(LOG.MESSAGE, `Message sent`, { id: message.id, from, to, bodyLength: body.length })
  return message
}

function getUnreadMessages(sessionId: string): Message[] {
  return getInbox(sessionId).filter(m => !m.read)
}

function getAllMessages(sessionId: string): Message[] {
  return getInbox(sessionId)
}

function markAllRead(sessionId: string): void {
  const iam = getInbox(sessionId)
  const unreadCount = iam.filter(m => !m.read).length
  for (const msg of iam) {
    msg.read = true
  }
  log.info(LOG.MESSAGE, `Marked all read`, { sessionId, count: unreadCount })
}

// Mark messages FROM a specific sender as read (when responding to them)
function markMessagesFromSenderAsRead(sessionId: string, senderSessionId: string): void {
  const inbox = getInbox(sessionId)
  let count = 0
  for (const msg of inbox) {
    // msg.from is the alias, we need to check by session ID
    // The message stores the recipient session ID, but we need sender session ID
    // Actually, messages are stored in recipient's inbox with 'from' being sender's alias
    // We need to find messages where the sender's session matches
    if (!msg.read) {
      // Check if this message came from the sender we're responding to
      const senderAlias = getAlias(senderSessionId)
      if (msg.from === senderAlias) {
        msg.read = true
        count++
      }
    }
  }
  if (count > 0) {
    log.info(LOG.MESSAGE, `Marked messages from sender as read`, { sessionId, senderSessionId, count })
  }
}

function getKnownAgents(sessionId: string): string[] {
  // Return aliases of all active sessions except self
  const agents: string[] = []
  for (const id of activeSessions) {
    if (id !== sessionId) {
      agents.push(getAlias(id))
    }
  }
  return agents
}

function getParallelAgents(sessionId: string) {
  return getKnownAgents(sessionId).map(alias => ({
    alias,
    description: getDescription(alias)
  }))
}

function registerSession(sessionId: string): void {
  if (!activeSessions.has(sessionId)) {
    activeSessions.add(sessionId)
    const alias = getNextAlias()
    sessionToAlias.set(sessionId, alias)
    aliasToSession.set(alias, sessionId)
    log.info(LOG.SESSION, `Session registered`, { sessionId, alias, totalSessions: activeSessions.size })
  }
}

// ============================================================================
// Session utils
// ============================================================================

async function getParentId(client: any, sessionId: string): Promise<string | null> {
  // Check cache first
  if (sessionParentCache.has(sessionId)) {
    return sessionParentCache.get(sessionId)!
  }
  
  try {
    const response = await client.session.get({ path: { id: sessionId } })
    const parentId = response.data?.parentID || null
    sessionParentCache.set(sessionId, parentId)
    log.debug(LOG.SESSION, `Looked up parentID`, { sessionId, parentId })
    return parentId
  } catch (e) {
    log.warn(LOG.SESSION, `Failed to get session info`, { sessionId, error: String(e) })
    sessionParentCache.set(sessionId, null)
    return null
  }
}

// ============================================================================
// Helper to create assistant message with tool part
// ============================================================================

function createAssistantMessageWithToolPart(
  sessionId: string,
  senderAlias: string,
  messageBody: string,
  messageId: string,
  timestamp: number,
  baseUserMessage: any
): any {
  const now = Date.now()
  const userInfo = baseUserMessage.info
  
  const assistantMessageId = `msg_iam_${now}_${messageId}`
  const partId = `prt_iam_${now}_${messageId}`
  const callId = `call_iam_${now}_${messageId}`
  
  log.debug(LOG.MESSAGE, `Creating assistant message with tool part`, {
    sessionId,
    senderAlias,
    messageId: assistantMessageId,
    partId,
    callId,
  })
  
  return {
    info: {
      id: assistantMessageId,
      sessionID: sessionId,
      role: "assistant",
      agent: userInfo.agent || "code",
      parentID: userInfo.id,
      modelID: userInfo.model?.modelID || "gpt-4o-2024-08-06",
      providerID: userInfo.model?.providerID || "openai",
      mode: "default",
      path: {
        cwd: "/",
        root: "/",
      },
      time: { created: now, completed: now },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      ...(userInfo.variant !== undefined && { variant: userInfo.variant }),
    },
    parts: [
      {
        id: partId,
        sessionID: sessionId,
        messageID: assistantMessageId,
        type: "tool",
        callID: callId,
        tool: "iam_message",
        state: {
          status: "completed",
          input: {
            from: senderAlias,
            messageId: messageId,
            timestamp: timestamp,
          },
          output: `📨 INCOMING MESSAGE FROM ${senderAlias.toUpperCase()} 📨

${messageBody}

---
Reply using: broadcast(to="${senderAlias}", message="your response")`,
          title: `📨 Message from ${senderAlias}`,
          metadata: {
            iam_sender: senderAlias,
            iam_message_id: messageId,
            iam_timestamp: timestamp,
          },
          time: { start: now, end: now },
        },
      },
    ],
  }
}

// ============================================================================
// Plugin
// ============================================================================

const plugin: Plugin = async (ctx) => {
  log.info(LOG.HOOK, "Plugin initialized")
  const client = ctx.client
  
  return {
    tool: {
      announce: tool({
        description: ANNOUNCE_DESCRIPTION,
        args: {
          message: tool.schema.string().describe("Describe what you're working on"),
        },
        async execute(args, context) {
          const sessionId = context.sessionID
          registerSession(sessionId)
          
          const alias = getAlias(sessionId)
          
          if (!args.message) {
            log.warn(LOG.TOOL, `announce missing 'message'`, { alias })
            return `Error: 'message' parameter is required. Describe what you're working on.`
          }
          
          log.debug(LOG.TOOL, `announce called`, { sessionId, alias, message: args.message })
          
          setDescription(sessionId, args.message)
          const parallelAgents = getParallelAgents(sessionId)
          
          return announceResult(alias, parallelAgents)
        },
      }),
      
      broadcast: tool({
        description: BROADCAST_DESCRIPTION,
        args: {
          to: tool.schema.string().optional().describe("Recipient(s): 'agentA', 'agentA,agentC', or 'parent' (default: all)"),
          message: tool.schema.string().describe("Your message content"),
        },
        async execute(args, context) {
          const sessionId = context.sessionID
          registerSession(sessionId)
          
          const alias = getAlias(sessionId)
          
          if (!args.message) {
            log.warn(LOG.TOOL, `broadcast missing 'message'`, { alias })
            return BROADCAST_MISSING_MESSAGE
          }
          
          log.debug(LOG.TOOL, `broadcast called`, { sessionId, alias, to: args.to, messageLength: args.message.length })
          
          const knownAgents = getKnownAgents(sessionId)
          let targetAliases: string[]
          
          if (!args.to || args.to.toLowerCase() === "all") {
            targetAliases = knownAgents
          } else {
            targetAliases = args.to.split(",").map(s => s.trim()).filter(Boolean)
          }
          
          if (targetAliases.length === 0) {
            return `No agents to broadcast to. Use announce to see parallel agents.`
          }
          
          const parentId = await getParentId(client, sessionId)
          
          const recipientSessions: string[] = []
          for (const targetAlias of targetAliases) {
            const recipientSessionId = resolveAlias(targetAlias, parentId)
            if (!recipientSessionId) {
              log.warn(LOG.TOOL, `broadcast unknown recipient`, { alias, to: targetAlias })
              return broadcastUnknownRecipient(targetAlias, knownAgents)
            }
            // Skip sending to yourself
            if (recipientSessionId === sessionId) {
              log.warn(LOG.TOOL, `Skipping self-message`, { alias, targetAlias })
              continue
            }
            recipientSessions.push(recipientSessionId)
          }
          
          if (recipientSessions.length === 0) {
            return `No valid recipients. You cannot message yourself. Use announce to see parallel agents.`
          }
          
          // Check if we're broadcasting to parent (to send notification)
          const isTargetingParent = parentId && recipientSessions.includes(parentId)
          
          let messageId = ""
          for (const recipientSessionId of recipientSessions) {
            const msg = sendMessage(alias, recipientSessionId, args.message)
            messageId = msg.id
            
            log.info(LOG.MESSAGE, `Message queued for recipient`, { 
              senderAlias: alias, 
              senderSessionId: sessionId,
              recipientSessionId,
              messageId: msg.id,
              messageLength: args.message.length,
              isParent: recipientSessionId === parentId
            })
          }
          
          // Only notify parent session (not siblings)
          if (isTargetingParent) {
            log.info(LOG.MESSAGE, `Broadcasting to parent session, calling notify_once`, { sessionId, parentId })
            try {
              const internalClient = (client as any)._client
              if (internalClient?.post) {
                await internalClient.post({
                  url: `/session/${parentId}/notify_once`,
                  body: { text: `[IAM] Message from ${alias}: ${args.message}` },
                })
                log.info(LOG.MESSAGE, `Parent session notified successfully`, { parentId })
              } else {
                log.warn(LOG.MESSAGE, `Could not access SDK client for notify_once`, { parentId })
              }
            } catch (e) {
              log.warn(LOG.MESSAGE, `Failed to notify parent session`, { parentId, error: String(e) })
            }
          }
          
          return broadcastResult(targetAliases, messageId)
        },
      }),
    },
    
    // Register subagents when task tool completes
    "tool.execute.after": async (input, output) => {
      log.debug(LOG.HOOK, `tool.execute.after fired`, { tool: input.tool, sessionID: input.sessionID, hasMetadata: !!output.metadata })
      
      if (input.tool === "task") {
        log.debug(LOG.HOOK, `task metadata`, { metadata: output.metadata, output: output.output?.substring?.(0, 200) })
        
        const newSessionId = (output.metadata?.sessionId || output.metadata?.session_id) as string | undefined
        if (newSessionId) {
          log.info(LOG.HOOK, `task completed, registering session`, { newSessionId })
          registerSession(newSessionId)
        } else {
          log.warn(LOG.HOOK, `task completed but no session_id in metadata`)
        }
      }
    },
    
    // Inject IAM instructions into system prompt for child sessions only
    "experimental.chat.system.transform": async (input, output) => {
      const sessionId = (input as any).sessionID as string | undefined
      if (!sessionId) {
        log.debug(LOG.INJECT, `No sessionID in system.transform input, skipping`)
        return
      }
      
      // Inject IAM instructions for all sessions
      output.system.push(SYSTEM_PROMPT)
      log.info(LOG.INJECT, `Injected IAM system prompt`, { sessionId })
    },
    
    // NOTE: No longer injecting synthetic user messages for unread notifications
    // Messages are now injected directly into recipient sessions as assistant messages with tool parts
    // when broadcast is called
    
    // Inject assistant messages with tool parts for unread IAM messages
    "experimental.chat.messages.transform": async (_input, output) => {
      const lastUserMsg = [...output.messages].reverse().find(m => m.info.role === "user")
      if (!lastUserMsg) {
        log.debug(LOG.INJECT, `No user message found in transform, skipping IAM injection`)
        return
      }
      
      const sessionId = lastUserMsg.info.sessionID
      const unread = getUnreadMessages(sessionId)
      
      log.debug(LOG.INJECT, `Checking for unread messages in transform`, { sessionId, unreadCount: unread.length })
      
      if (unread.length === 0) {
        return
      }
      
      log.info(LOG.INJECT, `Injecting ${unread.length} assistant message(s) with tool parts`, { 
        sessionId, 
        unreadCount: unread.length,
        messageIds: unread.map(m => m.id)
      })
      
      // Inject one assistant message with tool part for each unread message
      for (const msg of unread) {
        const assistantMsg = createAssistantMessageWithToolPart(
          sessionId,
          msg.from,
          msg.body,
          msg.id,
          msg.timestamp,
          lastUserMsg
        )
        
        output.messages.push(assistantMsg)
        
        log.info(LOG.INJECT, `Injected assistant message with tool part`, { 
          sessionId,
          senderAlias: msg.from,
          messageId: assistantMsg.info.id,
          partId: assistantMsg.parts[0].id
        })
        
        // Mark as read after injection
        msg.read = true
      }
      
      log.info(LOG.INJECT, `Marked ${unread.length} messages as read after injection`, { sessionId })
    },
    
    // Add announce and broadcast to subagent_tools
    config: async (opencodeConfig) => {
      const experimental = opencodeConfig.experimental as any ?? {}
      const existingSubagentTools = experimental.subagent_tools ?? []
      opencodeConfig.experimental = {
        ...experimental,
        subagent_tools: [...existingSubagentTools, "announce", "broadcast"],
      } as typeof opencodeConfig.experimental
      log.info(LOG.HOOK, `Added 'announce' and 'broadcast' to experimental.subagent_tools`)
    },
  }
}

export default plugin
