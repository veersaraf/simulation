# Plan.md — AI Civilization Simulation Build Plan

> Work through each phase completely before moving to the next. Each checkbox is a discrete, testable deliverable.

---

## Phase 1 — Project Scaffold & Core Infrastructure

Get the bare bones of the server running with no agents yet. Just the event bus, WebSocket server, and a Three.js client that connects and renders a static zone graph.

- [ ] Initialize Node.js project with TypeScript (or plain JS with JSDoc)
- [ ] Install dependencies: `anthropic`, `openai`, `ws`, `chokidar`, `fs-extra`
- [ ] Create `/agents`, `/world`, `/engine` directory structure
- [ ] Implement `EventBus.js` — thin wrapper around Node EventEmitter with typed event names
- [ ] Implement `WebSocketServer.js` — accepts one client connection, can broadcast JSON messages
- [ ] Create static `world/state.json` with 6–8 hand-authored zones and adjacency graph
- [ ] Implement `StateBroadcaster.js` — watches `state.json` for changes, computes diff, broadcasts to WebSocket client
- [ ] Set up Three.js client — connects to WebSocket, renders zone graph as low-poly terrain tiles
- [ ] Implement `ZONE_POSITIONS` lookup in Three.js — zone names → 3D coordinates
- [ ] Verify: browser shows static world, zone tiles render correctly

---

## Phase 2 — World Agent Foundation

Build the World Agent as a standalone class that can read the zone graph and generate perception packets. No character agents yet.

- [ ] Create `world/claude.md` — world agent system prompt (narrator role, spatial authority, world rules)
- [ ] Create `world/civilization.md` — empty ledger stub
- [ ] Create `world/actions.json` — define 8–10 core actions (chop_wood, gather_fruit, eat, dig_hole, build_wall, build_shelter, plant_crop, harvest_crop)
- [ ] Create `world/tech.json` — define initial unlocked tech (empty, all basic actions available by default)
- [ ] Implement `WorldAgent.js` class — loads world files, wraps Anthropic SDK
- [ ] Implement `generatePerceptionPacket(agentId)` — reads `state.json`, renders zone context into natural language for a given agent
- [ ] Implement `querySpace(from, direction)` — graph traversal returning prose description of what agent would find
- [ ] Implement `narrateEvent(event)` — takes a structured event, returns World Agent prose narration
- [ ] Write `world/state.json` world event to `civilization.md` on major events
- [ ] Verify: call `generatePerceptionPacket("alice")` manually and get sensible prose output

---

## Phase 3 — Character Class & Agent Harness

Build the reusable `Character` class. Load two agents from disk with distinct personalities. No waking yet — just harness construction and manual prompt testing.

- [ ] Create `agents/alice/` folder with `claude.md`, `personality.md`, `memory.md`, `beliefs.md`, `goals.md`
- [ ] Create `agents/bob/` folder with same structure, distinct personality
- [ ] Implement `Character.js` class — loads all harness files on instantiation
- [ ] Implement system prompt composer — interpolates all harness files in correct order with perception packet injection
- [ ] Implement rolling message history — sliding window of last 20 messages
- [ ] Implement `wake(event)` — triggers LLM call with composed prompt + event context
- [ ] Implement tool definitions: `act`, `speak_to`, `query_space`, `write_memory`, `set_state`, `set_disposition`, `propose_plan`
- [ ] Implement tool call parser — extracts tool calls from LLM response and routes them
- [ ] Implement `write_memory` handler — appends to `memory.md` with loop guard (shows last 5 entries first)
- [ ] Implement `set_state` / `set_disposition` handlers — updates agent state object, emits state change event to bus
- [ ] Verify: manually call `alice.wake(testEvent)` and get a valid tool call response back

---

## Phase 4 — Action Resolution & World Mutation

Wire agent actions into the world. When an agent calls `act()`, the world validates and mutates `state.json`.

- [ ] Implement `ActionResolver.js` — loads `actions.json`, exposes `validate(action, agentState)` and `resolve(action, agentId)`
- [ ] Write deterministic mutation functions for all 8–10 initial actions
- [ ] Implement inventory system on agent state — tracks what each agent is carrying
- [ ] Implement object presence checks — action validation reads `state.json` to confirm requirements (tool in inventory, object in zone, etc.)
- [ ] Implement pending actions queue — multi-tick actions register here with start/complete tick counts
- [ ] Implement action completion handler — fires `ACTION_COMPLETE` event, runs mutation, updates `state.json`, triggers World Agent narration
- [ ] Implement production chain linkage — action outputs become inventory items usable as inputs to subsequent actions
- [ ] Connect `StateBroadcaster` — any mutation to `state.json` triggers diff broadcast to Three.js
- [ ] Three.js: render objects in zones (logs on ground, structures as meshes) based on `state.json`
- [ ] Verify: manually trigger `chop_wood` for alice, confirm tree removed from state, logs added to inventory, Three.js updates

---

## Phase 5 — Event Bus Routing & Agent Waking

Connect everything through the Event Bus. Agents wake on relevant events. The world narrates and routes.

- [ ] Define all event types as constants: `WORLD_EVENT`, `AGENT_ACTION`, `AGENT_MESSAGE`, `POSITION_UPDATE`, `ACTION_COMPLETE`, `USER_INJECT`, `PRIORITY_EVENT`
- [ ] Implement event routing rules — check agent state before delivering event
- [ ] Implement p2p message queue — messages to non-listening agents are held, optionally narrated by World Agent
- [ ] Implement `speak_to` handler — emits `AGENT_MESSAGE` event targeted at another agent
- [ ] Implement movement handler — `act({ action: "move", target: "forest_edge" })` updates `state.json`, emits `POSITION_UPDATE`, Three.js lerps character mesh
- [ ] Implement World Agent as event bus subscriber — receives all `AGENT_ACTION` and `POSITION_UPDATE` events, updates `civilization.md` on significant ones
- [ ] Implement passive World Agent narration — on significant events, World Agent generates prose and emits `WORLD_EVENT` to all listening agents
- [ ] Implement anti-loop detector — if N consecutive events are all `AGENT_MESSAGE` with no `ACTION`, World Agent fires a forcing `WORLD_EVENT`
- [ ] Three.js: render agent meshes at zone positions, lerp on `POSITION_UPDATE`
- [ ] Verify: alice speaks to bob, bob wakes, bob responds, alice receives response — full p2p loop works

---

## Phase 6 — Passive World Engine & Scarcity

Make the world alive independent of agent actions. Add pressure and stakes.

- [ ] Implement `PassiveWorldEngine.js` — event-driven passive mutation layer (fires on world clock events, not fixed interval)
- [ ] Implement time-of-day system — `DAWN`, `DAY`, `DUSK`, `NIGHT` world events on a configurable cycle
- [ ] Implement season system — `SPRING`, `SUMMER`, `AUTUMN`, `WINTER` transitions
- [ ] Implement crop growth — planted crops advance growth stages passively over time
- [ ] Implement food spoilage — stored food degrades over time if not in a proper structure
- [ ] Implement structure decay — unrepaired structures degrade health over time
- [ ] Implement weather events — rain, storm, drought as World Agent injected events with gameplay effects
- [ ] Implement energy/hunger system per agent — agents need food periodically; starvation forces `alert` disposition
- [ ] Implement winter scarcity — food production reduced in winter, creates urgency to prepare
- [ ] Time-of-day disposition nudges — World Agent emits nudge events at dusk encouraging agents to consider `resting` disposition
- [ ] Verify: plant a crop, wait, harvest it. Starve an agent by removing all food. Watch disposition shift to `alert`.

---

## Phase 7 — Civilization Layer

Add the macro layer — shared goals, tech progression, specialization tracking, and the civilization ledger.

- [ ] Implement `propose_plan` tool — agent proposes a shared goal with assignee; other agent can accept/counter via `AGENT_MESSAGE`
- [ ] Implement shared `goals.md` in `/world/` — civilization-level goals both agents read and contribute to
- [ ] Implement skill tracking per agent — count of each action type performed, stored in agent state
- [ ] Surface skills in perception packet — *"Bob has performed build_wall 6 times. You have performed gather_fruit 12 times."*
- [ ] Implement tech unlock system — completing certain milestones (e.g. 3 walls built) unlocks entries in `tech.json`
- [ ] Gate actions behind tech requirements — `ActionResolver` checks `tech.json` before validating
- [ ] Implement built structure effects — sawmill increases wood action speed, farm produces food passively each passive tick
- [ ] Implement `civilization.md` ledger writes — World Agent appends on: first structure built, new tech unlocked, agent death, season survived
- [ ] Implement `beliefs.md` regeneration — every N events, summarize `memory.md` into updated `beliefs.md` via LLM call
- [ ] Verify: agents coordinate on building a farm, tech unlocks from it, food starts generating passively

---

## Phase 8 — User Monitoring Panel

Give the user visibility and intervention capability.

- [ ] Build monitoring panel UI (can be overlaid on Three.js or a separate browser tab)
- [ ] Display live agent state: activity, reachability, disposition, current goals, last memory entry
- [ ] Display live world state: zone occupancy, civilization.md ledger, current season/time
- [ ] Implement user event injection — text input that fires a `USER_INJECT → PRIORITY_EVENT` to all listening agents
- [ ] Implement world pause/resume — halts passive world engine and stops routing new events
- [ ] Implement manual World Agent trigger — user can fire a specific environmental event from a dropdown
- [ ] Display pending actions queue — show multi-tick actions in progress with progress indication
- [ ] Verify: user injects an event, all listening agents wake and respond to it

---

## Phase 9 — Three.js World Polish

Make the rendered world actually reflect civilization growth.

- [ ] Implement structure mesh spawning — when `state.json` gains a structure in a zone, Three.js spawns its mesh
- [ ] Implement structure mesh removal — on destruction, mesh is removed (with optional collapse animation)
- [ ] Implement object rendering — logs, crops, holes, stumps rendered as small zone objects
- [ ] Implement zone terrain mutation — dug holes change terrain appearance, cleared forest changes zone texture
- [ ] Implement agent character meshes — low-poly humanoid or abstract shape, one per agent, distinct color
- [ ] Implement disposition visual indicator — subtle aura or idle animation variation per disposition
- [ ] Implement event log overlay — recent World Agent narration text displayed in scene
- [ ] Implement camera — free-roam or follow-agent modes
- [ ] Verify: build a house from scratch, watch the world visually grow step by step

---

## Phase 10 — Hardening & Simulation Quality

Final pass to make the simulation actually feel alive and stable for long runs.

- [ ] Audit all `claude.md` agent instructions — tighten action vocabulary, disposition contracts, memory write guidelines
- [ ] Run a 30-minute unsupervised simulation, log all events, identify loop patterns
- [ ] Tune anti-loop parameters — adjust N threshold for World Agent forcing event
- [ ] Tune action durations — make multi-tick actions feel appropriately weighted
- [ ] Tune passive world timing — ensure scarcity pressure is real but not immediately fatal
- [ ] Add agent death handling — `non-active/non-listening` state, mesh grays out, World Agent narrates, civilization ledger records
- [ ] Implement session resume — on server restart, reload `state.json` + all agent harness files, simulation continues
- [ ] Implement basic error handling — failed LLM calls don't crash the world, agent retries or goes non-active
- [ ] Add logging layer — structured event log to disk for debugging long runs
- [ ] Final end-to-end test: cold start → civilization survives one full season cycle → user can monitor and intervene throughout
