import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const CLI = resolve(join(import.meta.dirname ?? __dirname, 'cli.ts'))
// Resolve tsx's CLI entry via module resolution — with node-linker=hoisted the
// .bin shim's directory depends on workspace-wide hoisting, so a fixed path breaks.
const TSX_CLI = createRequire(import.meta.url).resolve('tsx/cli')

function runCLI(args: string): string {
  try {
    return execSync(`"${process.execPath}" "${TSX_CLI}" "${CLI}" ${args}`, {
      encoding: 'utf-8',
      timeout: 15_000,
      env: { ...process.env, NO_COLOR: '1' },
    })
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string }
    return (execErr.stdout ?? '') + (execErr.stderr ?? '')
  }
}

describe('CLI entry point', () => {
  it('--version outputs the version string', () => {
    const output = runCLI('--version')
    expect(output.trim()).toBe('0.0.1')
  })

  it('--help lists all commands', () => {
    const output = runCLI('--help')
    expect(output).toContain('channel')
    expect(output).toContain('site')
    expect(output).toContain('url')
    expect(output).toContain('review')
    expect(output).toContain('commit')
    expect(output).toContain('list')
  })

  it('--help includes the program description', () => {
    const output = runCLI('--help')
    expect(output).toContain('Ingest competitive 40K content')
  })
})
