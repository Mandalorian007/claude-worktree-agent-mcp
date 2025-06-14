import { describe, it, expect, vi, beforeEach } from 'vitest'
import { featureSync } from '../../src/tools/feature-sync'
import { setupTestEnv } from '../utils/test-env'
import { execa } from 'execa'
import * as fs from 'fs'
import * as path from 'path'
import simpleGit from 'simple-git'

// Mock external dependencies
vi.mock('execa')
vi.mock('simple-git')
vi.mock('fs')

const mockedExeca = vi.mocked(execa) as any
const mockedSimpleGit = vi.mocked(simpleGit) as any
const mockedFs = vi.mocked(fs)

describe('feature-sync', () => {
  setupTestEnv()

  const mockGit = {
    checkIsRepo: vi.fn(),
    fetch: vi.fn(),
    status: vi.fn(),
    checkout: vi.fn(),
    rebase: vi.fn(),
    diff: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup default mocks
    mockedSimpleGit.mockReturnValue(mockGit as any)
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.writeFileSync.mockReturnValue(undefined)
    
    // Reset all git mock methods
    Object.keys(mockGit).forEach(key => {
      if (typeof mockGit[key as keyof typeof mockGit] === 'function') {
        mockGit[key as keyof typeof mockGit].mockReset()
      }
    })
    
    // Default git mock setup
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.fetch.mockResolvedValue(undefined)
    mockGit.status.mockResolvedValue({ ahead: 2, conflicted: [] })
    mockGit.checkout.mockResolvedValue(undefined)
    mockGit.rebase.mockResolvedValue(undefined)
  })

  it('should successfully sync feature with no conflicts', async () => {
    const result = await featureSync({ featureName: 'test-feature' })
    
    expect(result.content[0].text).toContain('Feature \'test-feature\' synced successfully!')
    expect(result.content[0].text).toContain('No conflicts detected')
    expect(result.content[0].text).toContain('Your branch is now 2 commits ahead of main')
    
    expect(mockGit.fetch).toHaveBeenCalledWith(['origin', 'main'])
    expect(mockGit.checkout).toHaveBeenCalledWith('feature/test-feature')
    expect(mockGit.rebase).toHaveBeenCalledWith(['main'])
  })

  it('should fail when PROJECT_ROOT is not set', async () => {
    delete process.env.PROJECT_ROOT
    
    await expect(featureSync({ featureName: 'test-feature' }))
      .rejects.toThrow('PROJECT_ROOT environment variable not set')
  })

  it('should fail when worktree does not exist', async () => {
    mockedFs.existsSync.mockReturnValue(false)
    
    await expect(featureSync({ featureName: 'test-feature' }))
      .rejects.toThrow('Feature worktree \'test-feature\' not found')
  })

  it('should fail when not in a git repository', async () => {
    mockGit.checkIsRepo.mockResolvedValue(false)
    
    await expect(featureSync({ featureName: 'test-feature' }))
      .rejects.toThrow('Not in a git repository')
  })

  it('should handle conflicts and attempt Claude Code resolution', async () => {
    // Mock rebase conflict on first call, success on second (continue)
    mockGit.rebase
      .mockRejectedValueOnce(new Error('Rebase conflict'))
      .mockResolvedValueOnce(undefined)
    
    // Reset the status mock to ensure it's properly set for this test
    mockGit.status.mockReset()
    
    // Mock status calls: first for conflict detection, second for final status
    mockGit.status
      .mockResolvedValueOnce({ conflicted: ['src/test.ts', 'package.json'] })
      .mockResolvedValueOnce({ ahead: 3 })
    
    // Mock successful Claude Code resolution
    mockedExeca.mockResolvedValueOnce({ stdout: 'Conflicts resolved', stderr: '', exitCode: 0 })

    const result = await featureSync({ featureName: 'test-feature' })
    
    expect(result.content[0].text).toContain('Feature \'test-feature\' synced successfully!')
    expect(result.content[0].text).toContain('2 conflicts detected in src/test.ts, package.json')
    expect(result.content[0].text).toContain('Claude Code resolved conflicts')
    expect(result.content[0].text).toContain('Your branch is now 3 commits ahead of main')
    
    expect(mockedExeca).toHaveBeenCalledWith(
      'claude',
      ['--dangerously-skip-permissions'],
      expect.objectContaining({
        input: expect.stringContaining('Conflict Resolution Task'),
        timeout: 300000
      })
    )
    
    expect(mockGit.rebase).toHaveBeenCalledWith(['--continue'])
  })

  it('should handle Claude Code failure and provide manual intervention guidance', async () => {
    // Mock rebase conflict on first call, success on abort
    mockGit.rebase
      .mockRejectedValueOnce(new Error('Rebase conflict'))
      .mockResolvedValueOnce(undefined) // abort call
    
    // Reset the status mock to ensure it's properly set for this test
    mockGit.status.mockReset()
    mockGit.status.mockResolvedValueOnce({ conflicted: ['src/test.ts'] })
    
    // Mock Claude Code failure
    mockedExeca.mockRejectedValueOnce(new Error('Claude Code failed'))

    const result = await featureSync({ featureName: 'test-feature' })
    
    expect(result.content[0].text).toContain('Conflicts detected in src/test.ts')
    expect(result.content[0].text).toContain('Claude Code could not complete conflict resolution')
    expect(result.content[0].text).toContain('Conflict details saved to .worktrees/test-feature/CONFLICTS.md')
    expect(result.content[0].text).toContain('Manual Intervention Required')
    
    expect(mockGit.rebase).toHaveBeenCalledWith(['--abort'])
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('CONFLICTS.md'),
      expect.stringContaining('Merge Conflicts - Manual Resolution Required')
    )
  })

  it('should handle non-conflict rebase errors', async () => {
    mockGit.rebase.mockRejectedValueOnce(new Error('Network error'))
    mockGit.status.mockResolvedValueOnce({ conflicted: [] })
    
    await expect(featureSync({ featureName: 'test-feature' }))
      .rejects.toThrow('Feature sync failed: Network error')
  })

  it('should use custom Claude command and args from environment', async () => {
    process.env.CLAUDE_COMMAND = 'custom-claude'
    process.env.CLAUDE_ARGS = '--verbose --debug'
    
    // Mock rebase conflict on first call, success on continue
    mockGit.rebase
      .mockRejectedValueOnce(new Error('Rebase conflict'))
      .mockResolvedValueOnce(undefined)
    
    // Reset the status mock to ensure it's properly set for this test
    mockGit.status.mockReset()
    
    // Mock status calls
    mockGit.status
      .mockResolvedValueOnce({ conflicted: ['src/test.ts'] })
      .mockResolvedValueOnce({ ahead: 1 })
    
    // Mock successful Claude Code resolution
    mockedExeca.mockResolvedValueOnce({ stdout: 'Conflicts resolved', stderr: '', exitCode: 0 })

    await featureSync({ featureName: 'test-feature' })
    
    expect(mockedExeca).toHaveBeenCalledWith(
      'custom-claude',
      ['--verbose', '--debug'],
      expect.objectContaining({
        input: expect.stringContaining('Conflict Resolution Task')
      })
    )
    
    // Cleanup
    delete process.env.CLAUDE_COMMAND
    delete process.env.CLAUDE_ARGS
  })
})