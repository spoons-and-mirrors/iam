# IAM Plugin Development Progress

## Summary

Built an in-memory inter-agent messaging system for OpenCode that allows parallel subagents to communicate with each other.

## What We Built

### Core Features
- **`iam` tool** with 3 actions: `sessions`, `read`, `write`
- **In-memory message store** - no files, no `.iam/` folder clutter
- **Auto-registration** - agents register on first iam tool use (not on task completion)
- **Instant discovery** - parallel agents see each other immediately
- **Urgent notifications** - `<system-reminder priority="critical">` injected when unread messages exist
- **Logging** - full debug logs to `.logs/iam.log` (clears on restart)

### Files
- `index.ts` - Plugin logic, tool registration, hooks
- `prompt.ts` - All LLM-facing prompts (easy to tweak)
- `logger.ts` - File logger with categories (TOOL, MESSAGE, SESSION, HOOK, INJECT)
- `README.md` - User documentation
- `package.json` / `tsconfig.json` - Bun/TypeScript config

## Key Decisions

### Why In-Memory (not files)?
- If OpenCode restarts, all subagent sessions are dead anyway
- Simpler = fewer bugs
- No cleanup needed
- Faster

### Why Register on First IAM Use (not task completion)?
- Original approach: register when `tool.execute.after` fires for task tool
- Problem: task tool only completes AFTER the subagent finishes, so parallel agents never see each other while running
- Solution: register when ANY agent first uses the iam tool via `allSessions` Set

### Hooks Used
1. `tool` - Registers the `iam` tool
2. `tool.execute.after` - Logs task metadata (kept for debugging)
3. `experimental.chat.system.transform` - Injects usage instructions into system prompt
4. `experimental.chat.messages.transform` - Injects urgent notifications as synthetic user messages

## Bugs Fixed During Development

1. **Wrong export structure** - Was `export default function iamPlugin()` instead of `const plugin: Plugin = async () => ...`
2. **Wrong field name** - Task metadata uses `sessionId` (camelCase) not `session_id` (snake_case)
3. **Late registration** - Agents only registered after task completion, too late for parallel communication
4. **Duplicate code blocks** - File got corrupted during batch edits, had to rewrite

## Testing

Successfully tested with two parallel agents (Alpha and Beta):
- Both discovered each other via `iam sessions`
- Exchanged messages back and forth
- Received urgent notifications when messages arrived
- Full conversation logged in `.logs/iam.log`

## Future Ideas

- Could rename tool to `relay`, `signal`, or `openmail` for clarity
- Could add message threading (reply chains)
- Could add message expiry/cleanup
- Could persist to file optionally for crash recovery
