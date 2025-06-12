import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifySetup } from '../../src/tools/verify-setup'
import { setupTestEnv } from '../utils/test-env'
import { execa } from 'execa'

// Mock external dependencies
vi.mock('execa')

const mockedExeca = vi.mocked(execa) as any

describe('verify-setup', () => {
  setupTestEnv()

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup default successful mocks
    mockedExeca.mockImplementation(async (command: string, args?: readonly string[]) => {
      // Mock different commands
      if (command === 'git' && args?.[0] === '--version') {
        return { stdout: 'git version 2.49.0', stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args?.[0] === 'rev-parse') {
        return { stdout: 'true', stderr: '', exitCode: 0 }
      }
      if (command === 'gh' && args?.[0] === '--version') {
        return { stdout: 'gh version 2.74.0', stderr: '', exitCode: 0 }
      }
      if (command === 'gh' && args?.[0] === 'auth') {
        return { stdout: 'github.com user: test', stderr: '', exitCode: 0 }
      }
      if (command === 'which') {
        return { stdout: '/usr/bin/claude', stderr: '', exitCode: 0 }
      }
      if (command === 'pnpm' && args?.[0] === '--version') {
        return { stdout: '9.0.0', stderr: '', exitCode: 0 }
      }
      
      return { stdout: '', stderr: '', exitCode: 0 }
    })
  })

  it('should pass all checks when environment is properly configured', async () => {
    const result = await verifySetup({ verbose: true })
    
    expect(result.content[0].text).toContain('7 passed')
    expect(result.content[0].text).toContain('0 failed')
    expect(result.content[0].text).toContain('Ready to use!')
  })

  it('should fail when PROJECT_ROOT is not set', async () => {
    delete process.env.PROJECT_ROOT
    
    await expect(verifySetup()).rejects.toThrow('PROJECT_ROOT environment variable not set')
  })

  it('should fail when git repository check fails', async () => {
    mockedExeca.mockImplementation(async (command: string, args?: readonly string[]) => {
      if (command === 'git' && args?.[0] === 'rev-parse') {
        throw new Error('fatal: not a git repository')
      }
      // Return success for other commands
      return { stdout: 'success', stderr: '', exitCode: 0 }
    })

    const result = await verifySetup({ verbose: true })
    
    expect(result.content[0].text).toContain('1 failed')
    expect(result.content[0].text).toContain('Git repository check failed')
  })

  it('should handle missing GitHub CLI', async () => {
    mockedExeca.mockImplementation(async (command: string, args?: readonly string[]) => {
      if (command === 'gh') {
        throw new Error('command not found: gh')
      }
      // Return success for other commands
      if (command === 'git' && args?.[0] === 'rev-parse') {
        return { stdout: 'true', stderr: '', exitCode: 0 }
      }
      return { stdout: 'success', stderr: '', exitCode: 0 }
    })

    const result = await verifySetup({ verbose: true })
    
    expect(result.content[0].text).toContain('1 failed')
    expect(result.content[0].text).toContain('GitHub CLI (gh) not found')
  })

  it('should handle missing Claude Code', async () => {
    mockedExeca.mockImplementation(async (command: string, args?: readonly string[]) => {
      if (command === 'which' && args?.[0] === 'claude') {
        throw new Error('command not found')
      }
      // Return success for other commands
      if (command === 'git' && args?.[0] === 'rev-parse') {
        return { stdout: 'true', stderr: '', exitCode: 0 }
      }
      return { stdout: 'success', stderr: '', exitCode: 0 }
    })

    const result = await verifySetup({ verbose: true })
    
    expect(result.content[0].text).toContain('1 failed')
    expect(result.content[0].text).toContain('Claude Code not found')
  })
}) 