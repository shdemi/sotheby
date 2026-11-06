/**
 * Curation policy (`content/curation.json`) and the two data files the app reads.
 *
 * These lists are decisions, not game data:
 *   exclude — characters the app hides (and that derived groupings must skip)
 *   collab  — collaboration characters
 */
import path from "node:path";
import { CONTENT } from "../config.mjs";
import { tryReadJson } from "../util.mjs";

function policy() {
  return tryReadJson(path.join(CONTENT, "curation.json")) || { exclude: [], collab: [] };
}

export function excludeCharacters() {
  return policy().exclude || [];
}

export function collabCharacters() {
  return policy().collab || [];
}
