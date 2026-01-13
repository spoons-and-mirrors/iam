# Plan: Session Resumption via Broadcast

## Problem

When Agent A broadcasts a question to Agent B, and Agent A's session goes idle (completes), Agent B's response broadcast currently has no way to "wake up" Agent A's session. The response gets stored in the inbox but Agent A never sees it.

## Desired Behavior

1. Agent A (session S1) broadcasts a question to Agent B
2. Agent A completes its task, session S1 goes idle
3. Agent B processes the question, broadcasts back an answer
4. Agent B's broadcast **resumes session S1** with the answer injected as a user message
5. Agent A wakes up and sees the response

## How OpenCode's Task Tool Does Session Resumption

From `/home/spoon/code/opencode/packages/opencode/src/tool/task.ts`:

```typescript
// 1. Schema accepts optional session_id (line 19)
session_id: z.string().describe("Existing Task session to continue").optional()

// 2. Look up existing session (lines 60-63)
if (params.session_id) {
  const found = await Session.get(params.session_id)
  if (found) session = found
}

// 3. Send prompt to existing session (line 138+)
const result = await SessionPrompt.prompt({
  sessionID: session.id,  // Uses existing session ID
  ...
})

// 4. Return session_id in output for future resumption (line 169)
<task_metadata>
session_id: ${session.id}
</task_metadata>
```

**Key insight**: Calling `client.session.prompt()` on an existing session ID resumes that session.

## Current IAM Plugin State

The plugin already tracks:

- `sessionToAlias: Map<sessionId, alias>` - maps session IDs to agent names
- `aliasToSession: Map<alias, sessionId>` - maps agent names to session IDs
- `messageInboxes: Map<alias, Message[]>` - messages waiting for each agent

## Implementation Steps

### Step 1: Track Session State (Idle vs Active)

Add tracking for whether a session is currently active or idle:

```typescript
interface SessionState {
  sessionId: string;
  alias: string;
  status: "active" | "idle";
  lastActivity: number;
}

const sessionStates = new Map<string, SessionState>();
```

Update on:

- `tool.execute.before` for task tool → mark session as "active"
- `session.idle` hook → mark session as "idle"

### Step 2: Modify Broadcast to Support Resume

When broadcast is called:

```typescript
// In broadcast execute:
const recipientAlias = args.to; // if targeted broadcast
const recipientSessionId = aliasToSession.get(recipientAlias);
const recipientState = sessionStates.get(recipientSessionId);

if (recipientState?.status === "idle") {
  // Resume the idle session with the broadcast message
  await resumeSessionWithMessage(client, recipientSessionId, broadcastMessage);
} else {
  // Session is active, store in inbox for injection via messages.transform
  storeInInbox(recipientAlias, broadcastMessage);
}
```

### Step 3: Implement `resumeSessionWithMessage()`

```typescript
async function resumeSessionWithMessage(
  client: OpenCodeSessionClient,
  sessionId: string,
  message: string,
): Promise<void> {
  log.info(LOG.TOOL, `Resuming session with broadcast message`, {
    sessionId,
    messageLength: message.length,
  });

  // Use promptAsync to resume the session (fire-and-forget)
  await client.session.promptAsync({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text", text: message }],
    },
  });
}
```

### Step 4: Handle Session Idle Hook

Track when sessions become idle:

```typescript
// In session.idle hook:
ctx.on("session.idle", ({ sessionID }) => {
  const alias = sessionToAlias.get(sessionID);
  if (alias) {
    sessionStates.set(sessionID, {
      sessionId: sessionID,
      alias,
      status: "idle",
      lastActivity: Date.now(),
    });
    log.info(LOG.SESSION, `Session went idle`, { sessionID, alias });
  }
});
```

### Step 5: Update Broadcast Tool Schema (Optional)

Add explicit `resume` option:

```typescript
parameters: z.object({
  message: z.string().describe("Message to broadcast"),
  to: z.string().optional().describe("Target agent alias (optional)"),
  resume: z.boolean().optional().describe("If true, resume idle recipient session"),
}),
```

Or make resume automatic when recipient is idle.

## Flow Diagram

```
Agent A (S1)                    Agent B (S2)
    |                               |
    |-- broadcast("question") ---->|
    |                               |
    |   [S1 goes idle]              |-- receives in inbox
    |                               |
    |                               |-- processes question
    |                               |
    |<-- broadcast("answer") -------|
    |                               |
    |   [resumeSession(S1, answer)] |
    |                               |
    |-- wakes up, sees answer       |
    |                               |
```

## Edge Cases to Handle

1. **Session no longer exists** - Check if session is still valid before resuming
2. **Session is active** - Don't resume, just store in inbox
3. **Multiple pending messages** - Batch or queue them
4. **Circular broadcasts** - Prevent infinite resume loops
5. **Parent session resumption** - Should we also resume parent sessions?

## Questions to Investigate

1. **Does `client.session.promptAsync` work on idle sessions?**
   - Need to verify this actually resumes the session

2. **What happens if we call prompt on a completed task session?**
   - Does it continue or error?

3. **Should we use `prompt` (blocking) or `promptAsync` (fire-and-forget)?**
   - Probably `promptAsync` since broadcast shouldn't wait

4. **How to format the resume message?**
   - Include sender info, original context?

## Files to Modify

- `/home/spoon/.config/opencode/plugin/iam/index.ts`
  - Add `sessionStates` tracking
  - Add `resumeSessionWithMessage()` function
  - Modify broadcast execute to check idle state and resume
  - Update session.idle hook to track state

## Testing Scenarios

1. Agent A asks question, goes idle, Agent B answers → A should resume
2. Agent A asks question, stays active, Agent B answers → A sees in inbox
3. Agent A session no longer exists → graceful failure
4. Multiple agents broadcast to idle Agent A → all messages delivered
5. Agent A broadcasts, Agent B broadcasts back immediately → timing edge case

## Dependencies

- Need to verify `client.session.promptAsync` works for resumption
- May need to test with actual OpenCode to confirm behavior
