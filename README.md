# Inbox Plugin for OpenCode

Inter-agent messaging system that enables parallel subagents to communicate through threaded conversations.

## Overview

When you spawn multiple subagents with the `task` tool, they often work on related problems but can't communicate with each other. The inbox plugin solves this by:

1. Letting agents write messages to each other via files
2. Notifying recipients when they have new messages
3. Supporting multi-turn threaded conversations
4. Making parallel agents aware of their siblings

## Installation

The plugin lives in `~/.config/opencode/plugin/inbox/`. OpenCode will automatically load it.

## Usage

### Starting a Thread

Any agent can start a conversation by writing a file with mail frontmatter:

```markdown
---
mail: true
to: session_abc123
subject: Need input on auth approach
---
Hey, I'm working on the API endpoints and noticed you're handling
the auth middleware. What token format are you using? I want to
make sure my validation is compatible.
```

The file can be written anywhere, but `.inbox/` is recommended for organization.

### Receiving Notifications

When another agent sends you a message, you'll see a system reminder:

```
<system-reminder>
You have 1 thread update from other agents:

- Message from session_xyz789 - "Need input on auth approach"
  File: .inbox/thread_1704789123_a1b2c3.md
  To reply: Use the Edit tool to APPEND your response to this file.

Read the thread and reply to continue the conversation.
</system-reminder>
```

### Replying to a Thread

To reply, use the **Edit tool** to append your response to the thread file:

```markdown
---
mail: true
to: session_abc123
subject: Need input on auth approach
---
Hey, I'm working on the API endpoints...

---

**Reply from session_xyz789:**

I'm using JWT with this structure:
- 15 minute expiry
- RS256 signing
- Claims: sub, iat, exp, roles[]

Want me to share my validation middleware?
```

The original sender will then be notified of your reply, and can respond back. This creates a natural back-and-forth conversation.

### Sibling Awareness

When the `task` tool spawns subagents, they're automatically informed about their parallel siblings:

```
<system-reminder>
You have parallel sibling agents working on related tasks:
- Session: session_abc123
- Session: session_def456

To communicate with them, write a file with this format:
...
</system-reminder>
```

## Frontmatter Reference

| Field | Required | Description |
|-------|----------|-------------|
| `mail` | Yes | Must be `true` for the plugin to detect it |
| `to` | Yes | Recipient session ID |
| `from` | No | Sender session ID (auto-filled if omitted) |
| `subject` | No | Brief description of the thread topic |
| `thread` | No | Thread ID (auto-generated for new threads) |
| `participants` | No | Array of all session IDs in the thread |

## How It Works

### Hooks Used

1. **`experimental.chat.system.transform`** - Injects usage instructions into the system prompt
2. **`tool.execute.after` (write)** - Detects new threads when files with mail frontmatter are written
3. **`tool.execute.after` (edit)** - Detects replies when thread files are appended to
4. **`tool.execute.after` (read)** - Marks threads as read when the file is accessed
5. **`tool.execute.after` (task)** - Registers new subagents in the sibling registry
6. **`tool.execute.before` (task)** - Injects sibling session IDs into task prompts
7. **`experimental.chat.messages.transform`** - Injects thread notifications into messages

### State Management

The plugin tracks:
- **Threads**: Ongoing conversations with participants, timestamps, and file paths
- **Pending updates**: Notifications queued for each session
- **Sibling registry**: Parent-child relationships between sessions

All state is in-memory for speed. Thread files in `.inbox/` serve as persistent storage.

## File Structure

```
inbox/
├── package.json
├── index.ts              # Main plugin, hook registration
├── README.md
└── lib/
    ├── frontmatter.ts    # YAML-like frontmatter parser
    └── inbox.ts          # Thread & sibling state management
```

## Example: Two Agents Collaborating

**Agent A** (working on API):
```
I need to coordinate with the auth agent. Let me start a thread.
[Writes .inbox/api-auth-sync.md with mail frontmatter]
```

**Agent B** (working on auth) receives notification:
```
I have a message from the API agent. Let me read and reply.
[Reads .inbox/api-auth-sync.md]
[Edits file to append response]
```

**Agent A** receives notification:
```
The auth agent replied! They're using JWT with RS256.
I'll update my validation and let them know.
[Edits file to append follow-up]
```

This continues until both agents have the information they need.

## Tips

- Use descriptive subjects so agents can prioritize messages
- Keep messages focused - one topic per thread
- The `.inbox/` folder keeps messages organized and out of the main codebase
- Threads persist across the session, so agents can refer back to earlier messages
