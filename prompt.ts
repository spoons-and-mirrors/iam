// =============================================================================
// All LLM-facing prompts for the iam plugin
// =============================================================================

export const ANNOUNCE_DESCRIPTION = `Announce what you're working on to other parallel agents. Use this first to let others know what you're doing and see all parallel agents. You can re-announce to update your status.`;

export const BROADCAST_DESCRIPTION = `Send a message to other parallel agents. Use 'to' for specific agent(s), or omit for all.`;

// =============================================================================
// Types
// =============================================================================

export interface ParallelAgent {
  alias: string;
  description?: string;
}

// =============================================================================
// Tool output messages
// =============================================================================

export function formatAgentList(agents: ParallelAgent[]): string[] {
  const lines: string[] = [];
  for (const agent of agents) {
    if (agent.description) {
      lines.push(`• ${agent.alias} is working on: ${agent.description}`);
    } else {
      lines.push(`• ${agent.alias} is running (hasn't announced yet)`);
    }
  }
  return lines;
}

export function announceResult(alias: string, parallelAgents: ParallelAgent[]): string {
  const lines = [
    `Announced! Other agents will see your description when they call announce.`,
    ``,
    `YOUR ALIAS IS: ${alias}`,
    `(Use this when others need to message you. Do NOT use "${alias}" as the "to" target - that's YOU!)`,
  ];

  if (parallelAgents.length > 0) {
    lines.push(``);
    lines.push(`--- Other Agents You Can Message ---`);
    for (const agent of parallelAgents) {
      if (agent.description) {
        lines.push(`• ${agent.alias}: ${agent.description}`);
      } else {
        lines.push(`• ${agent.alias}: (hasn't announced yet)`);
      }
    }
    lines.push(``);
    lines.push(`To message them, use: broadcast(to="${parallelAgents[0].alias}", message="...")`);
  } else {
    lines.push(``);
    lines.push(`No other agents running yet. They will appear when they call announce.`);
  }

  return lines.join("\n");
}

export const BROADCAST_MISSING_MESSAGE = `Error: 'message' parameter is required for action="broadcast".`;

export function broadcastUnknownRecipient(to: string, known: string[]): string {
  const list = known.length > 0 ? `Known agents: ${known.join(", ")}` : "No agents available yet.";
  return `Error: Unknown recipient "${to}". ${list}`;
}

export function broadcastResult(recipients: string[], messageId: string): string {
  const recipientStr = recipients.length === 1 ? recipients[0] : recipients.join(", ");
  return `Message sent!\n\nTo: ${recipientStr}\nMessage ID: ${messageId}\n\nRecipients will be notified.`;
}



// =============================================================================
// System prompt injection
// =============================================================================

export const SYSTEM_PROMPT = `
<instructions tool="iam">
# Inter-Agent Messaging

You have access to \`announce\` and \`broadcast\` tools for communicating with other parallel agents.

Usage:
- announce(message="...") - Announce what you're working on (do this first!)
- broadcast(message="...") - Message all agents
- broadcast(to="agentA", message="...") - Message specific agent(s)
- broadcast(to="agentA,agentC", message="...") - Message multiple agents

IMPORTANT: When other agents message you, their messages appear in your context as tool results from "iam_message". 
READ THESE CAREFULLY and respond to any questions they ask!

At the start of your task, use announce to let other agents know what you're doing.
You can re-announce to update your status as your task evolves.

When you complete your task, broadcast to all: "Done. Here's what I found/did: ..."
</instructions>
`;

// =============================================================================
// Urgent notification injection
// =============================================================================

export interface UnreadMessage {
  from: string;
  body: string;
  timestamp: number;
}

export function urgentNotification(messages: UnreadMessage[]): string {
  const lines = [
    `<system-reminder priority="critical">`,
    `URGENT: You have ${messages.length} unread message(s) from other agents.`,
    ``,
  ];
  
  for (const msg of messages) {
    lines.push(`From: ${msg.from}`);
    lines.push(`Message: ${msg.body}`);
    lines.push(``);
  }
  
  lines.push(`Respond NOW using: broadcast tool with to="<sender>", message="<your response>"`);
  lines.push(`</system-reminder>`);
  
  return lines.join("\n");
}
