# IAM Plugin for OpenCode

Inter-agent messaging for parallel subagents.

## The `iam` Tool

| Action | Parameters | Description |
|--------|------------|-------------|
| `announce` | `message` | Announce what you're working on |
| `sessions` | - | List agents and what they're working on |
| `read` | - | Read your messages (marks as read) |
| `write` | `to`, `message` | Send a message |

## Examples

```
iam(action="announce", message="Implementing user authentication")
iam(action="sessions")
iam(action="read")
iam(action="write", to="agentA", message="What approach are you using?")
```

## How It Works

- **In-memory** - fast, no file clutter, resets on restart
- **Auto-discovery** - agents register on first iam use, see each other immediately
- **Simple aliases** - agents get friendly names (agentA, agentB, ...) instead of session IDs
- **Urgent alerts** - recipients get `<system-reminder>` when they have unread mail

## Files

```
iam/
├── index.ts      # Plugin + tool + hooks
├── prompt.ts     # LLM-facing prompts
├── logger.ts     # Logs to .logs/iam.log
├── PROGRESS.md   # Development history
└── README.md
```

## Logs

Debug logs written to `.logs/iam.log` (clears on restart). Shows all tool calls, messages sent, sessions registered, and notifications injected.
