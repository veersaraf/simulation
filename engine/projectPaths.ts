import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));

function findProjectRoot(startDir: string): string {
  let current = startDir;

  while (true) {
    const hasPackageJson = existsSync(resolve(current, "package.json"));
    const hasWorldState = existsSync(resolve(current, "world/state.json"));

    if (hasPackageJson && hasWorldState) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return resolve(here, "..");
}

export const PROJECT_ROOT = findProjectRoot(here);
export const AGENTS_DIR = resolve(PROJECT_ROOT, "agents");
export const WORLD_DIR = resolve(PROJECT_ROOT, "world");
export const WORLD_STATE_PATH = resolve(WORLD_DIR, "state.json");
