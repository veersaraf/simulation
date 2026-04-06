import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export interface LLMConfig {
  provider: "xai" | "openai";
  apiKey: string;
  baseURL?: string;
  model: string;
}

const ENV_LINE_PATTERN = /^([\w.-]+)\s*(=|:)\s*(.*)$/;

function normalizeEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function firstPresent(
  env: NodeJS.ProcessEnv,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeProvider(value?: string): "xai" | "openai" | null {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "xai" || normalized === "x") {
    return "xai";
  }

  if (normalized === "openai") {
    return "openai";
  }

  return null;
}

export function loadProjectEnv(baseDir: string): string | null {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(baseDir, ".env"),
    resolve(baseDir, "../.env"),
  ];

  const seen = new Set<string>();

  for (const filePath of candidates) {
    if (seen.has(filePath) || !existsSync(filePath)) {
      continue;
    }
    seen.add(filePath);

    const raw = readFileSync(filePath, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const candidate = trimmed.startsWith("export ")
        ? trimmed.slice("export ".length).trim()
        : trimmed;

      const match = candidate.match(ENV_LINE_PATTERN);
      if (!match) {
        continue;
      }

      const [, key, , value] = match;
      process.env[key] = normalizeEnvValue(value);
    }

    return filePath;
  }

  return null;
}

function buildXAIConfig(env: NodeJS.ProcessEnv, apiKey: string): LLMConfig {
  return {
    provider: "xai",
    apiKey,
    baseURL:
      firstPresent(env, ["LLM_BASE_URL", "XAI_BASE_URL"]) ??
      "https://api.x.ai/v1",
    model:
      firstPresent(env, ["LLM_MODEL", "XAI_MODEL"]) ??
      "grok-4-1-fast-reasoning",
  };
}

function buildOpenAIConfig(env: NodeJS.ProcessEnv, apiKey: string): LLMConfig {
  return {
    provider: "openai",
    apiKey,
    baseURL:
      firstPresent(env, ["LLM_BASE_URL", "OPENAI_BASE_URL"]) ??
      "https://api.openai.com/v1",
    model: firstPresent(env, ["LLM_MODEL", "OPENAI_MODEL"]) ?? "gpt-4o",
  };
}

export function resolveLLMConfig(
  env: NodeJS.ProcessEnv = process.env
): LLMConfig | null {
  const requestedProvider = normalizeProvider(
    firstPresent(env, ["LLM_PROVIDER", "AI_PROVIDER"])
  );

  const xaiKey = firstPresent(env, [
    "XAI_API_KEY",
    "X_API_KEY",
    "X-API-KEY",
  ]);
  const openaiKey = firstPresent(env, ["OPENAI_API_KEY"]);

  if (requestedProvider === "xai" && xaiKey) {
    return buildXAIConfig(env, xaiKey);
  }

  if (requestedProvider === "openai" && openaiKey) {
    return buildOpenAIConfig(env, openaiKey);
  }

  if (xaiKey) {
    return buildXAIConfig(env, xaiKey);
  }

  if (openaiKey) {
    return buildOpenAIConfig(env, openaiKey);
  }

  return null;
}
