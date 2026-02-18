# CLAUDE.md - Roblox Studio MCP Server

## Project Overview

Roblox Studio MCP Server connects AI assistants (Claude, Gemini, Codex) to Roblox Studio via the Model Context Protocol (MCP). It enables AI to explore game structure, read/edit scripts, manipulate instances, and perform bulk operations -- all locally over HTTP.

**Version**: 2.3.0
**License**: MIT
**NPM**: `robloxstudio-mcp`

## Architecture

```
AI Assistant (Claude/Gemini/Codex)
        |  stdio (MCP protocol)
        v
MCP Server (Node.js)      ← src/index.ts
  - Tool definitions       ← 40+ tools
  - Bridge service         ← src/bridge-service.ts (UUID-based request queue)
  - HTTP server            ← src/http-server.ts (Express, ports 58741-58745)
        |  HTTP polling (500ms)
        v
Roblox Studio Plugin       ← studio-plugin/
  - Polls GET /poll for pending requests
  - Processes via handler modules
  - Responds via POST /response
```

Communication is **polling-based** (not WebSocket) because the Roblox Studio plugin environment only supports HTTP requests via `HttpService.RequestAsync`.

## Quick Reference

### Build & Run

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript (src/ -> dist/)
npm run dev          # Run dev server via tsx
npm start            # Run compiled dist/index.js
npm test             # Run Jest test suite
npm run typecheck    # Type-check without emitting
npm run lint         # ESLint
npm run build:plugin # Build Roblox Studio plugin (requires rbxtsc)
npm run build:all    # Build both server and plugin
```

### Environment Variables

- `ROBLOX_STUDIO_PORT` - Base port (default: `58741`, tries up to 58745)
- `ROBLOX_STUDIO_HOST` - Host binding (default: `0.0.0.0`)

## Project Structure

```
src/
  index.ts                  # MCP server entry point, tool handler dispatch
  bridge-service.ts         # Request queue: UUID tracking, dispatch, timeout, cleanup
  http-server.ts            # Express HTTP server: /poll, /ready, /disconnect, /response, /mcp/*
  tools/
    index.ts                # RobloxStudioTools class - wraps all 40+ tool implementations
    studio-client.ts        # StudioHttpClient - sends requests through bridge
  __tests__/
    integration.test.ts     # Full connection lifecycle + request/response flow
    bridge-service.test.ts  # Bridge service unit tests
    http-server.test.ts     # HTTP endpoint tests
    smoke.test.ts           # Basic smoke tests

studio-plugin/              # Roblox Studio plugin (TypeScript -> Luau via roblox-ts)
  src/
    server/
      index.server.ts       # Plugin entry point (toolbar, UI, lifecycle)
    modules/
      Communication.ts      # Polling loop, port discovery, activate/deactivate
      State.ts              # Connection state management (ports, retry config)
      UI.ts                 # Plugin UI rendering and status indicators
      Utils.ts              # Utility functions
      handlers/
        QueryHandlers.ts    # get_file_tree, search_files, get_place_info, etc.
        PropertyHandlers.ts # set_property, mass_set_property, etc.
        InstanceHandlers.ts # create_object, delete_object, smart_duplicate, etc.
        ScriptHandlers.ts   # get_script_source, set_script_source, edit_script_lines, etc.
        MetadataHandlers.ts # attributes, tags, selection, execute_luau
        TestHandlers.ts     # start_playtest, stop_playtest, get_playtest_output
    types/
      index.d.ts            # TypeScript type definitions

scripts/
  build-plugin.mjs          # Plugin build script
```

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/index.ts` | Main entry. All 40+ MCP tool definitions and dispatch logic. |
| `src/bridge-service.ts` | Core request queue. Tracks pending/dispatched requests with UUIDs, handles timeouts (60s), prevents duplicate dispatch. |
| `src/http-server.ts` | Express server. Plugin polls `/poll`, sends responses to `/response`. Connection state tracking. |
| `studio-plugin/src/modules/Communication.ts` | Plugin-side polling loop, port discovery (58741-58745), retry with exponential backoff, response sending with retry. |
| `studio-plugin/src/modules/State.ts` | Connection configuration: poll interval (0.5s), max retry delay (5s), backoff multiplier (1.2x), failure thresholds. |

## Connection Flow

1. MCP server starts, listens on ports 58741-58745 (+ legacy 3002)
2. MCP server connects stdio transport to AI assistant
3. Plugin activates, discovers available port via `GET /status`
4. Plugin sends `POST /ready` to signal connection
5. Plugin polls `GET /poll` every 500ms for pending requests
6. AI calls MCP tool -> bridge queues request -> plugin picks up via poll
7. Plugin processes request through handler -> sends `POST /response`
8. Bridge resolves the promise -> result returned to AI

## Request Lifecycle

- Requests get a UUID and are stored in `BridgeService.pendingRequests`
- `getPendingRequest()` returns oldest undispatched request and marks it as dispatched
- Dispatched requests won't be returned again (prevents duplicate processing)
- If a dispatched request isn't resolved within 45s, it becomes re-dispatchable
- Overall timeout is 60s, after which the request is rejected
- On plugin disconnect (`/disconnect` or `/ready`), all pending requests are cleared

## Retry & Reconnection

**Plugin side** (Communication.ts):
- Normal poll interval: 500ms
- After 5+ consecutive failures: exponential backoff (1.2x multiplier, max 5s)
- After 50 failures: shows "Server unavailable" error state
- Response sending retries up to 3 times with incremental delay
- Port discovery runs before polling starts to find correct server

**Server side** (http-server.ts):
- Plugin activity timeout: 30s (plugin must poll within this window)
- MCP active state: boolean flag, set to false on transport close
- Request timeout: 60s
- Cleanup interval: 10s

## Testing

Tests use Jest with ts-jest. Run with `npm test`.

- **32 tests** across 4 test suites
- Tests cover: connection lifecycle, request/response flow, timeout handling, disconnect recovery, bridge service operations, smoke tests
- Test timeout: 30s per test (jest.config.js)
- Uses `supertest` for HTTP endpoint testing
- Uses `jest.useFakeTimers()` for timeout-related tests

## Important Implementation Details

- All server logging goes to `stderr` (not stdout) since stdout is used for MCP stdio transport
- The bridge marks requests as `dispatched` to prevent the same request being sent to the plugin multiple times during concurrent polls
- The plugin processes requests asynchronously via `task.spawn()` so polling continues during request handling
- Port discovery in the plugin prefers servers with `pluginConnected === false` and `mcpServerActive === true`, but falls back to any server with MCP active
- Legacy port 3002 is maintained for backward compatibility with older plugin versions

## Dependencies

**Runtime**: `@modelcontextprotocol/sdk`, `express`, `cors`, `uuid`, `ws`, `node-fetch`
**Dev**: `typescript`, `jest`, `ts-jest`, `supertest`, `tsx`, `eslint`
**Plugin**: `roblox-ts`, `@rbxts/types`, `@rbxts/services`
