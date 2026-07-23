---
description: Execute a plan file from Claude Code
agent: build
---

Read .opencode/plans/$ARGUMENTS.md in full before touching anything.

The decomposition is settled — do not re-plan or re-scope.

Follow the agent tags in the plan. Work through the steps in order and
report after each group.

If a step is wrong, or a file doesn't exist as described, stop and tell me
rather than improvising a fix.

Available plans:
!`ls .opencode/plans/`