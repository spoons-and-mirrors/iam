# IAM Plugin for OpenCode

Lets parallel subagents talk to each other. No configuration needed — just install and it works.

## What It Does

When you spawn multiple agents with the `task` tool, they can:
- **Announce** what they're working on (and re-announce to update status)
- **Discover** other agents and see what they're doing
- **Broadcast** messages to one, some, or all agents
- Get **notified** when new messages arrive

## How It Works

Agents get friendly names (agentA, agentB, ...) and automatically discover each other. Every response reminds agents who they are and shows parallel agents.

When an agent announces, the response immediately shows all other parallel agents — whether they've announced yet or not. This gives agents instant awareness of who's working alongside them.

Agents who haven't announced yet get a gentle nudge to do so.

When an agent completes their task, they're encouraged to broadcast a completion message so others know.

## Actions

| Action | Description |
|--------|-------------|
| `announce` | Declare what you're working on. Can be called again to update. |
| `sessions` | List all parallel agents and their status. |
| `read` | Read your inbox (marks messages as read). |
| `broadcast` | Send a message. Use `to` for specific agent(s), or omit for all. |

## Examples

```
# Announce what you're doing
action="announce", message="Refactoring the auth module"

# See who else is running
action="sessions"

# Message everyone
action="broadcast", message="Found a bug in config.ts, heads up"

# Message specific agent(s)
action="broadcast", to="agentA", message="Can you check auth.ts?"
action="broadcast", to="agentA,agentC", message="Sync up on API changes"
```

## Debug Logs

For troubleshooting, check `.logs/iam.log` (clears on restart).
