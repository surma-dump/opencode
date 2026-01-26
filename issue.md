## Problem

When using OpenCode for automated workflows or in trusted environments, permission prompts can interrupt the flow and require manual intervention. This is particularly frustrating when you trust the agent and want it to operate autonomously.

## Proposed Solution

Add a `--dangerously-skip-permissions` flag (and corresponding `OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS` environment variable) that bypasses all `ask` permission prompts while still respecting explicit `deny` rules.

### Usage

```bash
# CLI flag
opencode --dangerously-skip-permissions

# Environment variable
OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS=true opencode

# With run command
opencode run --dangerously-skip-permissions "do something"
```

### Behavior

- Auto-allows all `ask` permission prompts
- Explicit `deny` rules are still respected
- Shows "△ YOLO mode" warning in the TUI (home screen, footer, and sidebar) to indicate the mode is active

### Why This Belongs in OpenCode

This feature improves the developer experience for trusted workflows while maintaining safety through:

1. Clear naming that indicates danger (`dangerously-skip-permissions`)
2. Visual warnings when active
3. Respect for explicit deny rules
4. Similar to Claude Code's implementation, which users find valuable

## Implementation

PR #7137 implements this feature with changes to:

- Flag system to support the environment variable
- Permission system to bypass `ask` prompts when enabled
- CLI commands to accept the flag
- TUI to show visual warnings when active
