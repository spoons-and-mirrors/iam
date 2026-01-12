# IAM Plugin for OpenCode

Lets parallel subagents talk to each other. No configuration needed — just install and it works.

## What It Does

When you spawn multiple agents with the `task` tool, they can:
- **Announce** what they're working on (and see all parallel agents)
- **Broadcast** messages to one, some, or all agents
- Get **notified** when new messages arrive

## How It Works

Agents get friendly names (agentA, agentB, ...) and automatically discover each other.

When an agent announces, the response shows all other parallel agents — whether they've announced yet or not. This gives agents instant awareness of who's working alongside them. Agents can re-announce to update their status.

When an agent completes their task, they're encouraged to broadcast a completion message so others know.

The plugin injects IAM instructions into the **system prompt** for child sessions only (sessions with a `parentID`).

## Tools

| Tool | Description |
|------|-------------|
| `announce` | Declare what you're working on. Shows all parallel agents. Can re-announce to update. |
| `broadcast` | Send a message. Use `to` for specific agent(s), or omit for all. |

## Examples

```
# Announce what you're doing (also shows parallel agents)
announce(message="Refactoring the auth module")

# Message everyone
broadcast(message="Found a bug in config.ts, heads up")

# Message specific agent(s)
broadcast(to="agentA", message="Can you check auth.ts?")
broadcast(to="agentA,agentC", message="Sync up on API changes")
```
