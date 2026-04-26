import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const CLI = resolve(join(import.meta.dirname ?? __dirname, 'cli.ts'))
const TSX = resolve(join(import.meta.dirname ?? __dirname, '..', 'node_modules', '.bin', 'tsx'))

function runCLI(args: string): string {
  try {
    return execSync(`"${TSX}" "${CLI}" ${args}`, {
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
