// AgentX Conversation Service — Sandbox Service
// Docker container-based code execution for untrusted agent tooling.
// Phase 6 — optional, requires Docker daemon access.

import { execFileSync } from 'child_process'
import { config } from '../config'

export interface SandboxRequest {
  code: string
  language?: string
  image?: string
  timeoutSec?: number
  maxMemoryMb?: number
}

export interface SandboxResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

export class SandboxService {
  private readonly defaultImage: string
  private readonly defaultTimeout: number
  private readonly defaultMemory: number

  constructor() {
    this.defaultImage = config.sandboxDockerImage
    this.defaultTimeout = config.sandboxTimeoutSec
    this.defaultMemory = config.sandboxMaxMemoryMb
  }

  async execute(req: SandboxRequest): Promise<SandboxResult> {
    const startTime = Date.now()
    const image = req.image || this.defaultImage
    const timeout = req.timeoutSec || this.defaultTimeout
    const memory = req.maxMemoryMb || this.defaultMemory
    const containerName = `agentx-sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    try {
      const interpreter = this.resolveInterpreter(req.language)

      // Run in Docker container with strict limits (execFileSync for shell-injection safety)
      const args = [
        'run', '--rm',
        '--name', containerName,
        '--network', 'none',
        '--memory', `${memory}m`,
        '--cpus', '1',
        '--read-only',
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
        '--stop-timeout', '5',
        image,
        interpreter, '-c', req.code,
      ]

      const stdout = execFileSync('docker', args, {
        timeout: timeout * 1000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf-8',
        env: { PATH: '/usr/local/bin:/usr/bin:/bin' },
      })

      return {
        stdout: stdout.slice(0, 10000),
        stderr: '',
        exitCode: 0,
        durationMs: Date.now() - startTime,
      }
    } catch (err: any) {
      return {
        stdout: (err.stdout || '').slice(0, 10000),
        stderr: (err.stderr || err.message || '').slice(0, 5000),
        exitCode: err.status || 1,
        durationMs: Date.now() - startTime,
      }
    }
  }

  private resolveInterpreter(language?: string): string {
    switch (language) {
      case 'python': return 'python3'
      case 'node':
      case 'javascript': return 'node'
      case 'bash':
      case 'shell': return '/bin/bash'
      default: return 'node'
    }
  }
}
