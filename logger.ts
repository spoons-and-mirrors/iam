import * as fs from "fs"
import * as path from "path"

// =============================================================================
// Simple file logger for debugging the inbox plugin
// =============================================================================

const LOG_DIR = path.join(process.cwd(), ".logs")
const LOG_FILE = path.join(LOG_DIR, "iam.log")

// Ensure log directory exists and clear log file on startup
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
  // Clear log file on each restart
  fs.writeFileSync(LOG_FILE, "")
} catch {
  // Ignore errors during init
}

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

function formatTimestamp(): string {
  return new Date().toISOString()
}

function writeLog(level: LogLevel, category: string, message: string, data?: unknown): void {
  const timestamp = formatTimestamp()
  const dataStr = data !== undefined ? ` | ${JSON.stringify(data)}` : ""
  const logLine = `[${timestamp}] [${level}] [${category}] ${message}${dataStr}\n`
  
  try {
    fs.appendFileSync(LOG_FILE, logLine)
  } catch {
    // Silently fail if we can't write
  }
}

export const log = {
  debug: (category: string, message: string, data?: unknown) => 
    writeLog("DEBUG", category, message, data),
  
  info: (category: string, message: string, data?: unknown) => 
    writeLog("INFO", category, message, data),
  
  warn: (category: string, message: string, data?: unknown) => 
    writeLog("WARN", category, message, data),
  
  error: (category: string, message: string, data?: unknown) => 
    writeLog("ERROR", category, message, data),
}

// Log categories
export const LOG = {
  TOOL: "TOOL",
  MESSAGE: "MESSAGE",
  SESSION: "SESSION",
  HOOK: "HOOK",
  INJECT: "INJECT",
} as const
