#!/usr/bin/env node
import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const isDev = process.env.OPENCODE_POCKET_UNIVERSE_DEV === "1";
const outdir = isDev
  ? `${process.env.HOME}/.config/opencode/plugin/pocket-universe/dist`
  : "./dist";

if (!existsSync(outdir)) {
  mkdirSync(dirname(outdir), { recursive: true });
}

const buildCmd = `bun build ./src/index.ts --outdir ${outdir} --target node --format esm --external '@opencode-ai/plugin'`;
const tscCmd = `tsc --emitDeclarationOnly --outDir ${outdir}`;

console.log(`Building to: ${outdir}`);

try {
  execSync(buildCmd, { stdio: "inherit" });
  execSync(tscCmd, { stdio: "inherit" });
  console.log("✅ Build complete");
} catch (err) {
  console.error("❌ Build failed");
  process.exit(1);
}
