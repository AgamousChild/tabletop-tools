/**
 * Shared helpers for ops-server tools.
 *
 * `runCmd` streams a child process to a captured buffer so tool results can
 * return the exact stdout/stderr the user would see if they ran the command
 * themselves. Every ops tool that shells out uses this — never spawn directly.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const REPO_ROOT = resolve(import.meta.dirname || '.', '../../../..')

export interface RunResult {
  code: number
  stdout: string
  stderr: string
  durationMs: number
}

export interface RunOptions {
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  tailLines?: number
}

export async function runCmd(
  cmd: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  const started = Date.now()
  return await new Promise<RunResult>((resolvePromise) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? REPO_ROOT,
      env: { ...process.env, ...opts.env },
      shell: process.platform === 'win32',
    })
    let stdout = ''
    let stderr = ''
    let killed = false
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          killed = true
          child.kill()
        }, opts.timeoutMs)
      : null
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('close', (code: number | null) => {
      if (timer) clearTimeout(timer)
      const suffix = killed ? `\n[killed after ${opts.timeoutMs}ms]` : ''
      resolvePromise({
        code: code ?? -1,
        stdout: tail(stdout, opts.tailLines) + suffix,
        stderr: tail(stderr, opts.tailLines),
        durationMs: Date.now() - started,
      })
    })
    child.on('error', (err: Error) => {
      if (timer) clearTimeout(timer)
      resolvePromise({
        code: -1,
        stdout,
        stderr: stderr + `\n[spawn error: ${err.message}]`,
        durationMs: Date.now() - started,
      })
    })
  })
}

function tail(s: string, n?: number): string {
  if (!n) return s
  const lines = s.split('\n')
  if (lines.length <= n) return s
  return `[...${lines.length - n} earlier lines...]\n` + lines.slice(-n).join('\n')
}

export function loadDotenv(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  const text = readFileSync(path, 'utf-8')
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

/** Merge repo-root .env into process env, first-write-wins. */
export function ensureRepoEnv(): void {
  const envPath = join(REPO_ROOT, '.env')
  const dotenv = loadDotenv(envPath)
  for (const [k, v] of Object.entries(dotenv)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

export function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}
