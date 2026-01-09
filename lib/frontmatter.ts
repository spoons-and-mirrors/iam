/**
 * Frontmatter parser for inbox mail/thread messages
 * 
 * Supports YAML-like frontmatter with thread capabilities:
 * ---
 * mail: true
 * to: session_id
 * thread: optional_thread_id
 * ---
 */

export interface MailFrontmatter {
  mail: boolean
  to: string
  from?: string
  subject?: string
  thread?: string        // Thread ID for ongoing conversations
  participants?: string[] // All session IDs in this thread
}

export interface ParsedContent {
  frontmatter: MailFrontmatter
  body: string
  raw: string
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/**
 * Quick check if content might have frontmatter
 */
export function hasFrontmatterPrefix(content: string): boolean {
  return content.trimStart().startsWith('---')
}

/**
 * Parse frontmatter from file content
 */
export function parseFrontmatter(content: string): ParsedContent {
  const match = content.match(FRONTMATTER_REGEX)
  
  if (!match) {
    return {
      frontmatter: { mail: false, to: '' },
      body: content,
      raw: content
    }
  }

  const [, frontmatterBlock, body] = match
  const frontmatter: MailFrontmatter = { mail: false, to: '' }

  // Parse simple YAML-like key: value pairs
  for (const line of frontmatterBlock.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    
    const key = line.slice(0, colonIdx).trim()
    let value: string | boolean | string[] = line.slice(colonIdx + 1).trim()
    
    // Handle boolean
    if (value === 'true') value = true
    else if (value === 'false') value = false
    // Handle quoted strings
    else if ((value.startsWith('"') && value.endsWith('"')) ||
             (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    // Handle arrays [a, b, c]
    else if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''))
    }

    if (key === 'mail') frontmatter.mail = value as boolean
    else if (key === 'to') frontmatter.to = value as string
    else if (key === 'from') frontmatter.from = value as string
    else if (key === 'subject') frontmatter.subject = value as string
    else if (key === 'thread') frontmatter.thread = value as string
    else if (key === 'participants') frontmatter.participants = value as string[]
  }

  return { frontmatter, body: body.trim(), raw: content }
}

/**
 * Check if parsed content is valid mail
 */
export function isValidMail(parsed: ParsedContent): boolean {
  return parsed.frontmatter.mail === true && 
         typeof parsed.frontmatter.to === 'string' && 
         parsed.frontmatter.to.length > 0
}

/**
 * Generate frontmatter string for a thread
 */
export function generateFrontmatter(fm: MailFrontmatter): string {
  const lines = ['---']
  lines.push('mail: true')
  if (fm.to) lines.push(`to: ${fm.to}`)
  if (fm.from) lines.push(`from: ${fm.from}`)
  if (fm.subject) lines.push(`subject: ${fm.subject}`)
  if (fm.thread) lines.push(`thread: ${fm.thread}`)
  if (fm.participants && fm.participants.length > 0) {
    lines.push(`participants: [${fm.participants.join(', ')}]`)
  }
  lines.push('---')
  return lines.join('\n')
}

/**
 * Update frontmatter in existing content
 */
export function updateFrontmatter(content: string, updates: Partial<MailFrontmatter>): string {
  const parsed = parseFrontmatter(content)
  const newFm = { ...parsed.frontmatter, ...updates }
  return generateFrontmatter(newFm) + '\n' + parsed.body
}
