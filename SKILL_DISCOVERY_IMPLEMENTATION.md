# Dynamic Skill Discovery Implementation

This document describes the implementation of dynamic HTTP-based skill discovery in OpenCode.

## Overview

Skills can now be discovered dynamically via an HTTP API endpoint, allowing for context-aware skill recommendations based on the current conversation task. This feature enables:

- Dynamic skill discovery based on conversation context
- Centralized skill management
- Integration with semantic search, LLMs, or custom logic
- Session-specific skill caching

## Feature Status

✅ **Complete** - All core functionality implemented and type-checked

## Implementation Details

### New Files

1. **`packages/opencode/src/skill/task-description.ts`**
   - Generates concise task descriptions from conversation history
   - Uses the configured `small_model` for efficient LLM calls
   - Caches descriptions per-session with configurable TTL
   - Falls back to "General development task" on errors

2. **`packages/opencode/src/skill/session-skills.ts`**
   - Manages session-specific skill discovery via HTTP
   - Handles both inline skill content and file path responses
   - Implements caching with TTL
   - Supports fallback to filesystem discovery (optional)

3. **`packages/opencode/src/tool/update-skill-context.ts`**
   - New tool for agents to update task descriptions
   - Triggers re-discovery of skills
   - Only available when `skill_discovery.enabled` is true

### Modified Files

1. **`packages/opencode/src/config/config.ts`**
   - Added `skill_discovery` configuration schema:
     - `enabled`: Enable HTTP-based discovery
     - `endpoint`: HTTP API endpoint URL
     - `description_prompt`: Custom LLM prompt template
     - `cache_ttl`: Cache duration in ms (default: 5 minutes)
     - `headers`: Custom HTTP headers with env var support
     - `timeout`: Request timeout in ms (default: 5 seconds)
     - `fallback_to_filesystem`: Graceful degradation on errors

2. **`packages/opencode/src/skill/skill.ts`**
   - Added optional `content` field to `Info` type for inline skills
   - Updated `get()` and `all()` to accept optional `sessionID`
   - Checks session-specific skills before falling back to filesystem

3. **`packages/opencode/src/tool/tool.ts`**
   - Added `sessionID` to `InitContext` interface

4. **`packages/opencode/src/tool/skill.ts`**
   - Updated to use `sessionID` from `InitContext`
   - Handles both inline content and filesystem-based skills
   - Distinguishes remote skills in base directory display

5. **`packages/opencode/src/tool/registry.ts`**
   - Added `sessionID` parameter to `tools()` function
   - Passes `sessionID` to tool init
   - Conditionally registers `UpdateSkillContextTool`

6. **`packages/opencode/src/session/prompt.ts`**
   - Calls `SessionSkills.ensure()` before building tools
   - Passes `sessionID` to `ToolRegistry.tools()`

### Documentation

1. **`SKILL_SERVER.md`**
   - Complete API specification for skill discovery servers
   - Implementation examples in multiple languages
   - Best practices and troubleshooting guide

## Configuration Example

```jsonc
{
  "skill_discovery": {
    "enabled": true,
    "endpoint": "https://api.example.com/skills/discover",
    "description_prompt": "Based on: {conversation}\nDescribe the task in 1-2 sentences.",
    "cache_ttl": 300000,
    "headers": {
      "Authorization": "Bearer {env:SKILL_API_TOKEN}",
      "X-Custom-Header": "value",
    },
    "timeout": 10000,
    "fallback_to_filesystem": false,
  },
}
```

## API Contract

### Request

```json
{
  "task": "Implement JWT authentication for a Node.js Express API with refresh tokens"
}
```

### Response (Inline Content - Recommended)

```json
{
  "skills": [
    {
      "name": "jwt-auth",
      "description": "JWT authentication implementation guide",
      "content": "## JWT Authentication\n\n..."
    }
  ]
}
```

### Response (File Paths)

```json
{
  "skills": ["/path/to/skills/jwt-auth/SKILL.md", "/path/to/skills/security/SKILL.md"]
}
```

## Flow

1. **Session Start**: User sends first message
2. **Tool Resolution**: `resolveTools()` is called in `session/prompt.ts`
3. **Skill Discovery**: `SessionSkills.ensure()` checks if discovery is enabled
4. **Task Description**: LLM generates task description from conversation
5. **HTTP Request**: POST to configured endpoint with task description
6. **Caching**: Skills cached per-session with TTL
7. **Tool Description**: Skills appear in agent's `skill` tool description
8. **Agent Usage**: Agent can load skills or update task description

## Agent Tools

### `skill` (existing, enhanced)

- Now uses session-specific skills when HTTP discovery is enabled
- Falls back to filesystem skills otherwise
- Lists available skills in tool description

### `update_skill_context` (new)

- Only available when `skill_discovery.enabled` is true
- Allows agent to refine task description
- Triggers immediate re-discovery of skills
- Example usage:
  ```
  update_skill_context(description="Building a real-time chat application with WebSockets")
  ```

## Caching Strategy

- **Per-session cache**: Each session has its own skill set
- **TTL-based**: Cache expires after `cache_ttl` milliseconds
- **Manual invalidation**: `update_skill_context` tool clears cache
- **Lazy generation**: Task description generated on first tool resolution

## Error Handling

- **HTTP errors**: Returns empty skills or falls back to filesystem (configurable)
- **LLM errors**: Task description falls back to "General development task"
- **Parse errors**: Logged but don't crash; invalid skills are skipped
- **Timeout**: Configurable per-request timeout

## Testing

The feature has been type-checked and compiles successfully. Integration testing requires:

1. Running OpenCode with a test skill discovery server
2. Verifying skills appear in tool descriptions
3. Testing the `update_skill_context` tool
4. Verifying cache behavior and TTL

## Future Enhancements

Potential improvements for future iterations:

1. **Skill dependencies**: Allow skills to reference other skills
2. **Skill versioning**: Support multiple versions of the same skill
3. **Context enrichment**: Send more context to the API (files, language, framework)
4. **Progressive loading**: Load skill content on-demand rather than at discovery
5. **Skill analytics**: Track which skills are most useful
6. **Multi-endpoint support**: Query multiple skill sources and merge results

## Backward Compatibility

- **No breaking changes**: Existing filesystem-based skills work as before
- **Opt-in**: HTTP discovery only activates when `skill_discovery.enabled` is true
- **Graceful fallback**: Errors don't prevent filesystem skills from loading (when configured)

## Performance Considerations

- **LLM call**: One small model call per session start (~100 tokens)
- **HTTP request**: One request per session or cache invalidation
- **Caching**: 5-minute cache reduces API calls significantly
- **Async loading**: Skill discovery doesn't block session start

## Security

- **Environment variables**: Headers support `{env:VAR}` substitution
- **HTTPS**: Endpoint URL should use HTTPS in production
- **Authentication**: Configure API keys via headers
- **Content validation**: Skill content is parsed and validated

## Monitoring

Logs are emitted at various stages:

- `skill.task-description`: Task description generation
- `skill.session`: HTTP discovery attempts and results
- `skill`: General skill loading (filesystem)

Use `logLevel: "debug"` in config for detailed logging.

## Documentation

- **`SKILL_SERVER.md`**: Complete guide for implementing a skill discovery server
- **Config schema**: Full JSDoc descriptions in `config.ts`
- **Tool descriptions**: Self-documenting via tool descriptions in UI

## Commit Message

```
feat: add dynamic skill discovery via HTTP API

Implements dynamic skill discovery allowing skills to be fetched from
an HTTP API endpoint based on conversation context. This enables:

- Context-aware skill recommendations using LLM-generated task descriptions
- Centralized skill management across OpenCode instances
- Integration with semantic search, RAG, or custom logic
- Session-specific caching with configurable TTL

New features:
- HTTP skill discovery with configurable endpoint
- Task description generation from conversation history
- update_skill_context tool for agents to refine context
- Support for inline skill content or file path references
- Graceful fallback to filesystem discovery (optional)

See SKILL_SERVER.md for API specification and implementation examples.
```
