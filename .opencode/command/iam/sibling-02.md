Spawn 2 parallel subagents using the Task tool:

use this exact prompt for the first agent :

DO THE FOLLOWING:

-use the announce tool

- sleep bash 2s
- use the broadcast tool to target the other agent, asking a question about the programming world
- sleep bash 1s
- use the broadcast tool to ask another question
- sleep bash 1s
- use the broadcast tool to ask another question
- yield.

DO NOT use parallel multitool for the joke and the brocadcast, do them all sequentially.

---

use this exact prompt for the second agent :

DO THE FOLLOWING:

- say a joke
- sleep bash 8s
- sleep bash 1s (sequentially, after the previous one)
- sleep bash 1s (YES SLEEP BASH MULTIPLE TIMES, NOT ONE SLEEP OF 10)
- tell the number of messages you have received, and their content.
- use the broadcast tool to respond to any question the other agent asked, use mutiple broadcasts if you have multiple questions to answer

DO NOT use parallel multitool for the joke and the brocadcast, do them all sequentially.

---
