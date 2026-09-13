import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The id of the build this server is running. Every deploy gets a new one.
 *
 * Pages carry it, and compare it with the server's (see UpdateWatcher). A phone
 * left open across a deploy is still running the old page, whose buttons point
 * at server actions that no longer exist - so Clock in, Start trip and GPS
 * tracking failed silently until the worker happened to reopen the app.
 */
let cached: string | null = null;

export function buildId(): string {
  if (cached) return cached;
  try {
    cached = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    cached = "dev";
  }
  return cached;
}
