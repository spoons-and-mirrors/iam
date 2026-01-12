Spawn a subagent using the Task tool with this EXACT prompt:

"IMPORTANT: You MUST complete ALL steps below. Do NOT stop early.
Step 1: Call iam tool with action='announce', message='Subagent ready'
Step 2: Call bash tool: sleep 2
Step 3: Call iam tool with action='broadcast', to='parent', message='I want to learn about standard react pattern, tell me something useful.'
Step 4: Call bash tool: sleep 3
STEP 6: DO THIS ALL OVER AGAIN, AGAIN AND AGAIN.

You MUST follow the step and have a conversation with the parent agent"

CRITICAL: While the task is running, YOU (main session) should receive an IAM notification. When you do, respond.
