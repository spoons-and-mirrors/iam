# Plan: Add Agent Selection to Spawn Tool

## Problem

The spawn tool currently creates sessions without specifying an agent, which results in using a default/weird model. The native Task tool allows selecting an agent type (e.g., "general", "explore", "build") which determines the model and behavior.

## Current Behavior

```typescript
// spawn currently does this:
await client.session.prompt({
  path: { id: newSessionId },
  body: {
    parts: [{ type: "text", text: fullPrompt }],
  },
});
```

No `agent` or `model` is specified, so it uses defaults.

## Desired Behavior

```typescript
// spawn should do this:
await client.session.prompt({
  path: { id: newSessionId },
  body: {
    parts: [{ type: "text", text: fullPrompt }],
    agent: agentName, // e.g., "general", "explore"
    model: {
      modelID: "...",
      providerID: "...",
    },
  },
});
```

## Reference: How Task Tool Does It

From `/home/spoon/code/opencode/packages/opencode/src/tool/task.ts`:

```typescript
// 1. Agent parameter in schema (line 18)
subagent_type: z.string().describe("The type of specialized agent to use for this task")

// 2. Agent lookup (line 57)
const agent = await Agent.get(params.subagent_type)
if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type}`)

// 3. Model selection (lines 126-129)
const model = agent.model ?? {
  modelID: msg.info.modelID,      // fallback to parent's model
  providerID: msg.info.providerID,
}

// 4. Session prompt with agent/model (lines 138-153)
const result = await SessionPrompt.prompt({
  ...
  model: {
    modelID: model.modelID,
    providerID: model.providerID,
  },
  agent: agent.name,
  ...
})
```

## Implementation Steps

### Step 1: Update Spawn Tool Schema

Add optional `agent` parameter to the spawn tool:

```typescript
// In the spawn tool definition
parameters: z.object({
  prompt: z.string().describe("The task for the spawned agent"),
  description: z.string().optional().describe("Short description"),
  alias: z.string().optional().describe("Name for the agent"),
  agent: z.string().optional().describe("Agent type: general, explore, etc. Defaults to 'general'"),
}),
```

### Step 2: Check SDK Session Prompt Types

Verify what parameters `client.session.prompt()` accepts. Check:

- Does it accept `agent` parameter?
- Does it accept `model` parameter?
- What's the type signature?

Look at: `@opencode-ai/sdk` types or the server endpoint definition.

### Step 3: Update Spawn Execute Function

```typescript
// In spawn execute:
const agentName = args.agent || "general";

// Get model info if possible (may need to query available agents)
// Option A: Just pass agent name, let server resolve model
// Option B: Query agent config and pass both agent + model

await client.session.prompt({
  path: { id: newSessionId },
  body: {
    parts: [{ type: "text", text: fullPrompt }],
    agent: agentName,
    // model: { ... } if needed
  },
});
```

### Step 4: Update Task Part Injection

Update the injected task part to show the agent type:

```typescript
const taskPart = {
  // ...
  state: {
    input: {
      description: spawn.description,
      prompt: spawn.prompt,
      subagent_type: agentName, // Show correct agent type
    },
    // ...
  },
};
```

### Step 5: Update Spawn Result Message

Include agent type in the result:

```typescript
return spawnResult(newAlias, newSessionId, description, agentName);
```

## Questions to Investigate

1. **Does the SDK expose agent/model in prompt body?**
   - Check `client.session.prompt()` type signature
   - Check server endpoint `POST /session/:id/message`

2. **How to list available agents from plugin?**
   - Task tool uses `Agent.list()` (internal)
   - Plugin might need to query via API or hardcode common ones

3. **Should we validate agent name?**
   - Task tool throws if agent not found
   - We could do the same or just pass through and let server handle it

## Testing

1. `spawn({ prompt: "count to 10", agent: "general" })` - should use general agent
2. `spawn({ prompt: "find auth files", agent: "explore" })` - should use explore agent
3. `spawn({ prompt: "something" })` - should default to "general"
4. `spawn({ prompt: "something", agent: "invalid" })` - should error gracefully

## Files to Modify

- `/home/spoon/.config/opencode/plugin/iam/index.ts`
  - Spawn tool schema (add `agent` param)
  - Spawn execute function (pass agent to prompt)
  - `injectTaskPartToParent()` (include agent in task part)
  - `markSpawnCompleted()` (include agent in completed part)

## Dependencies

- Need to verify SDK types for `client.session.prompt()` body
- May need to check if server endpoint accepts agent/model params
