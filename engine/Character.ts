// ============================================================
// Character — Reusable AI agent class
// ============================================================

import { readFileSync, appendFileSync } from "fs";
import { resolve } from "path";
import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionToolChoiceOption,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { eventBus } from "./EventBus.js";
import { AGENTS_DIR } from "./projectPaths.js";
import type { SimEvent } from "./types.js";

// --- Agent State Types ---

export type Activity = "active" | "non-active";
export type Reachability = "listening" | "non-listening";
export type Disposition =
  | "working"
  | "socializing"
  | "exploring"
  | "resting"
  | "alert";

export interface AgentState {
  activity: Activity;
  reachability: Reachability;
  disposition: Disposition;
  energy: number; // 0-100
  inventory: Record<string, number>;
  skills: Record<string, number>;
}

export interface CharacterConfig {
  id: string;
  apiKey: string;
  model?: string;
  baseURL?: string;
}

// --- Tool Definitions ---

const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "act",
      description:
        "Perform a world action and commit world-hours to it. You will be occupied and non-responsive for that duration. Choose hours realistically: move=0.5, eat=0.25, gather=1-3h, chop_wood=2-6h, fish=2-4h, build_campfire=1-2h, build_shelter=4-8h, build_wall=2-4h, sleep=6-9h.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description:
              "Action to perform: move | chop_wood | gather_fruit | gather_stones | gather_clay | fish | eat | build_campfire | build_shelter | build_wall | plant_crop | harvest_crop | sleep",
          },
          target: {
            type: "string",
            description:
              "Target of the action (zone id for move, object name for gather, food type for eat)",
          },
          hours: {
            type: "number",
            description:
              "World-hours to commit to this task (0.25–12). You will be occupied for this duration. Output scales with hours for gathering/chopping. Builds require minimum hours. Sleep restores energy.",
          },
        },
        required: ["action", "hours"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "speak_to",
      description: "Say something to another agent",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "The agent ID to speak to",
          },
          message: {
            type: "string",
            description: "What to say",
          },
        },
        required: ["target", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_space",
      description:
        "Ask the world what lies in a direction or around you",
      parameters: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            description:
              "Direction to look (or omit for a full survey of surroundings)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_memory",
      description:
        "Record something important to your memory log. Only use for genuinely significant events.",
      parameters: {
        type: "object",
        properties: {
          entry: {
            type: "string",
            description: "The memory to record",
          },
        },
        required: ["entry"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_disposition",
      description:
        "Change your current behavioral mode (working, socializing, exploring, resting, alert)",
      parameters: {
        type: "object",
        properties: {
          disposition: {
            type: "string",
            enum: ["working", "socializing", "exploring", "resting", "alert"],
            description: "The new disposition",
          },
          reason: {
            type: "string",
            description: "Why you are changing disposition",
          },
        },
        required: ["disposition"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_plan",
      description:
        "Propose a multi-step plan to coordinate with another agent",
      parameters: {
        type: "object",
        properties: {
          plan: {
            type: "string",
            description: "Description of the plan",
          },
          target_agent: {
            type: "string",
            description: "Who should help with this plan",
          },
          steps: {
            type: "array",
            items: { type: "string" },
            description: "Ordered list of steps",
          },
        },
        required: ["plan", "target_agent", "steps"],
      },
    },
  },
];

// --- Character Class ---

export class Character {
  readonly id: string;
  private client: OpenAI;
  private model: string;
  private agentDir: string;

  // Harness files (loaded from disk)
  private claudeMd: string = "";
  private personalityMd: string = "";
  private beliefsMd: string = "";
  private goalsMd: string = "";

  // State
  state: AgentState = {
    activity: "active",
    reachability: "listening",
    disposition: "working",
    energy: 100,
    inventory: {},
    skills: {},
  };

  // Rolling message history
  private messageHistory: ChatCompletionMessageParam[] = [];
  private readonly MAX_HISTORY = 20;

  // Event counter for memory indexing
  private eventCounter = 0;

  // Wake lock — prevent concurrent wakes
  private waking = false;

  // Last speech text from LLM response (for broadcast to frontend)
  public lastSpeech: string | null = null;

  constructor(config: CharacterConfig) {
    this.id = config.id;
    this.agentDir = resolve(AGENTS_DIR, config.id);
    this.model = config.model ?? "grok-4-1-fast-reasoning";
    this.client = config.baseURL
      ? new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
        })
      : new OpenAI({
          apiKey: config.apiKey,
        });

    this.loadHarnessFiles();
    console.log(`[Character:${this.id}] Loaded and ready`);
  }

  /** Load all harness files from the agent's directory. */
  private loadHarnessFiles(): void {
    const read = (name: string) => {
      try {
        return readFileSync(resolve(this.agentDir, name), "utf-8");
      } catch {
        return "";
      }
    };

    this.claudeMd = read("claude.md");
    this.personalityMd = read("personality.md");
    this.beliefsMd = read("beliefs.md");
    this.goalsMd = read("goals.md");
  }

  /** Reload goals/beliefs from disk (they may change). */
  reloadDynamicFiles(): void {
    const read = (name: string) => {
      try {
        return readFileSync(resolve(this.agentDir, name), "utf-8");
      } catch {
        return "";
      }
    };
    this.beliefsMd = read("beliefs.md");
    this.goalsMd = read("goals.md");
  }

  /** Get the last N entries from memory.md. */
  private getRecentMemories(n = 10): string {
    try {
      const raw = readFileSync(
        resolve(this.agentDir, "memory.md"),
        "utf-8"
      );
      const lines = raw.trim().split("\n").filter((l) => l.startsWith("[event"));
      return lines.slice(-n).join("\n");
    } catch {
      return "(no memories yet)";
    }
  }

  /**
   * Compose the full system prompt from all harness files.
   */
  composeSystemPrompt(perceptionPacket: string): string {
    const stateDesc = `Activity: ${this.state.activity} | Reachability: ${this.state.reachability} | Disposition: ${this.state.disposition} | Energy: ${this.state.energy}/100`;

    const inventoryDesc =
      Object.keys(this.state.inventory).length > 0
        ? Object.entries(this.state.inventory)
            .map(([item, qty]) => `${item}: ${qty}`)
            .join(", ")
        : "empty";

    return `[WORLD RULES & ACTION VOCABULARY]
${this.claudeMd}

[YOUR PERSONALITY & BACKSTORY]
${this.personalityMd}

[YOUR LONG-TERM BELIEFS]
${this.beliefsMd}

[YOUR CURRENT GOALS]
${this.goalsMd}

[YOUR RECENT MEMORIES]
${this.getRecentMemories(10)}

[WHERE YOU ARE & WHAT YOU PERCEIVE]
${perceptionPacket}

[YOUR CURRENT STATE]
${stateDesc}
Inventory: ${inventoryDesc}

[INSTRUCTIONS]
Decide what to do next. Use your tools. Every response should end with at least one tool call — an action, a message to the other agent, or a memory write. Do not just narrate. ACT.`;
  }

  /**
   * Wake the agent with an event. This triggers an LLM call.
   * Returns the tool calls made by the agent.
   */
  async wake(
    event: SimEvent,
    perceptionPacket: string
  ): Promise<
    Array<{ tool: string; args: Record<string, unknown>; id: string }>
  > {
    if (this.waking) {
      console.log(`[Character:${this.id}] Already waking, skipping`);
      return [];
    }

    this.waking = true;
    this.eventCounter++;

    try {
      // Reload dynamic files
      this.reloadDynamicFiles();

      const systemPrompt = this.composeSystemPrompt(perceptionPacket);

      // Build the user message from the event
      const userMessage = this.formatEventAsMessage(event);

      // Add to history
      this.messageHistory.push({ role: "user", content: userMessage });

      // Trim history
      if (this.messageHistory.length > this.MAX_HISTORY) {
        this.messageHistory = this.messageHistory.slice(-this.MAX_HISTORY);
      }

      // LLM call
      let msg = await this.requestAssistantMessage(systemPrompt, "auto");
      if (!msg) {
        console.log(`[Character:${this.id}] No response from LLM`);
        return [];
      }

      // Add assistant message to history
      this.messageHistory.push(msg as ChatCompletionMessageParam);

      // Extract tool calls
      let toolCalls = this.extractToolCalls(msg);

      // Working agents should physically advance the world, not just chat.
      if (
        this.state.disposition === "working" &&
        !toolCalls.some((tc) => tc.tool === "act")
      ) {
        this.messageHistory.push({
          role: "user",
          content:
            "[SYSTEM REMINDER] You are in working mode. Conversation alone is not enough. Take one concrete physical action right now using the act tool.",
        });

        const correction = await this.requestAssistantMessage(systemPrompt, {
          type: "function",
          function: { name: "act" },
        });

        if (correction) {
          this.messageHistory.push(correction as ChatCompletionMessageParam);
          msg = correction;
          toolCalls = this.extractToolCalls(correction);
        }
      }

      // Log what happened and store for broadcast
      if (msg.content) {
        this.lastSpeech = msg.content;
        console.log(
          `[Character:${this.id}] Says: ${msg.content.slice(0, 100)}...`
        );
      }
      for (const tc of toolCalls) {
        console.log(
          `[Character:${this.id}] Tool: ${tc.tool}(${JSON.stringify(tc.args).slice(0, 80)})`
        );
      }

      // Process local tool calls (memory, state changes)
      await this.processLocalToolCalls(toolCalls);

      return toolCalls;
    } catch (err) {
      console.error(
        `[Character:${this.id}] Wake error:`,
        (err as Error).message
      );
      return [];
    } finally {
      this.waking = false;
    }
  }

  private async requestAssistantMessage(
    systemPrompt: string,
    toolChoice: ChatCompletionToolChoiceOption
  ): Promise<ChatCompletionMessage | undefined> {
    const tools = this.getAvailableTools();

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...this.messageHistory,
      ],
      tools,
      tool_choice: toolChoice,
      temperature: 0.8,
      max_tokens: 800,
    });

    return response.choices[0]?.message;
  }

  private extractToolCalls(
    msg: ChatCompletionMessage
  ): Array<{ tool: string; args: Record<string, unknown>; id: string }> {
    const toolCalls: Array<{
      tool: string;
      args: Record<string, unknown>;
      id: string;
    }> = [];

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return toolCalls;
    }

    for (const tc of msg.tool_calls) {
      try {
        const fn = (tc as unknown as Record<string, unknown>).function as {
          name: string;
          arguments: string;
        };
        const args = JSON.parse(fn.arguments);
        toolCalls.push({
          tool: fn.name,
          args,
          id: tc.id,
        });
      } catch (err) {
        console.error(
          `[Character:${this.id}] Failed to parse tool call:`,
          err
        );
      }
    }

    return toolCalls;
  }

  private getAvailableTools(): ChatCompletionTool[] {
    if (this.state.disposition !== "working") {
      return AGENT_TOOLS;
    }

    return AGENT_TOOLS.filter((tool) => {
      if (tool.type !== "function") {
        return true;
      }

      const name = tool.function.name;
      return name !== "speak_to" && name !== "propose_plan";
    });
  }

  /** Format an event into a user message string. */
  private formatEventAsMessage(event: SimEvent): string {
    switch (event.type) {
      case "WORLD_EVENT":
        return `[World] ${typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload)}`;
      case "AGENT_MESSAGE": {
        const p = event.payload as {
          from: string;
          message: string;
        };
        return `[${p.from} says to you] "${p.message}"`;
      }
      case "ACTION_COMPLETE": {
        const p = event.payload as {
          action: string;
          result: string;
        };
        return `[Action Complete] Your ${p.action} finished: ${p.result}`;
      }
      case "POSITION_UPDATE":
        return `[Movement] ${JSON.stringify(event.payload)}`;
      case "USER_INJECT":
        return `[PRIORITY — Message from the Overseers] ${event.payload}`;
      case "PRIORITY_EVENT":
        return `[URGENT] ${event.payload}`;
      default:
        return `[${event.type}] ${JSON.stringify(event.payload)}`;
    }
  }

  /** Handle tool calls that are local to the character (memory, state). */
  private async processLocalToolCalls(
    toolCalls: Array<{
      tool: string;
      args: Record<string, unknown>;
      id: string;
    }>
  ): Promise<void> {
    for (const tc of toolCalls) {
      switch (tc.tool) {
        case "write_memory":
          this.handleWriteMemory(tc.args.entry as string);
          break;

        case "set_disposition":
          this.handleSetDisposition(
            tc.args.disposition as Disposition,
            tc.args.reason as string | undefined
          );
          break;
      }
    }
  }

  /** Append a memory entry with loop guard. */
  private handleWriteMemory(entry: string): void {
    const recentMemories = this.getRecentMemories(5);
    const recentLines = recentMemories.split("\n").filter(Boolean);

    // Simple loop check: if last 3 memories are very similar, skip
    const similar = recentLines.filter(
      (line) =>
        line.toLowerCase().includes(entry.toLowerCase().slice(0, 20))
    );
    if (similar.length >= 2) {
      console.log(
        `[Character:${this.id}] Memory loop detected, skipping write`
      );
      return;
    }

    const memoryLine = `[event ${this.eventCounter}] ${entry}\n`;
    appendFileSync(
      resolve(this.agentDir, "memory.md"),
      memoryLine,
      "utf-8"
    );
    console.log(`[Character:${this.id}] Memory: ${entry.slice(0, 60)}`);
  }

  /** Update disposition and emit state change event. */
  private handleSetDisposition(
    disposition: Disposition,
    reason?: string
  ): void {
    const old = this.state.disposition;
    this.state.disposition = disposition;

    console.log(
      `[Character:${this.id}] Disposition: ${old} → ${disposition}${reason ? ` (${reason})` : ""}`
    );

    eventBus.emit({
      type: "AGENT_ACTION",
      payload: {
        agent: this.id,
        action: "state_change",
        detail: { disposition, previous: old, reason },
      },
      timestamp: Date.now(),
      source: this.id,
    });
  }

  /** Add a tool result to message history (for multi-turn). */
  addToolResult(toolCallId: string, result: string): void {
    this.messageHistory.push({
      role: "tool",
      tool_call_id: toolCallId,
      content: result,
    });
  }
}
