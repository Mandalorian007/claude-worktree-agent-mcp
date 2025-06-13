import { describe, it, expect, vi, beforeEach } from 'vitest'
import { featureSync } from '../../src/tools/feature-sync'
import { setupTestEnv } from '../utils/test-env'
import { execa } from 'execa'
import * as fs from 'fs'
import simpleGit from 'simple-git'

// Mock external dependencies
vi.mock('execa')
vi.mock('fs')
vi.mock('simple-git')

const mockedExeca = vi.mocked(execa) as any
const mockedFs = vi.mocked(fs) as any
const mockedSimpleGit = vi.mocked(simpleGit) as any

describe('feature-sync', () => {
  setupTestEnv()

  let mockGit: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup git mock
    mockGit = {
      checkIsRepo: vi.fn().mockResolvedValue(true),
      status: vi.fn().mockResolvedValue({
        current: 'feature/test-feature',
        conflicted: []
      }),
      checkout: vi.fn().mockResolvedValue(undefined),
      rebase: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(undefined),
      raw: vi.fn().mockResolvedValue('3'),
      log: vi.fn().mockResolvedValue({
        total: 3,
        all: [
          { hash: 'abc1234', message: 'feat: add test feature' },
          { hash: 'def5678', message: 'fix: handle edge cases' },
          { hash: 'ghi9012', message: 'docs: update documentation' }
        ]
      })
    }
    
    mockedSimpleGit.mockReturnValue(mockGit)
    
    // Setup filesystem mocks
    mockedFs.existsSync.mockImplementation((path: string) => {
      // Worktree directories exist, but not rebase directories by default
      if (path.includes('/.git/rebase-')) return false
      if (path.includes('.worktrees/test-feature')) return true
      return true
    })
    
    mockedFs.writeFileSync.mockReturnValue(undefined)
    mockedFs.unlinkSync.mockReturnValue(undefined)
    
    // Setup default successful execa mocks
    mockedExeca.mockImplementation(async (command: string, args?: readonly string[]) => {
      if (command === 'claude') {
        return { stdout: 'Conflicts resolved successfully', stderr: '', exitCode: 0 }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })
  })

  it('should successfully sync feature with main when no conflicts', async () => {
    const result = await featureSync({ featureName: 'test-feature' })
    
    expect(result.content[0].text).toContain('✅ Feature synced successfully!')
    expect(result.content[0].text).toContain('Clean rebase (no conflicts)')
    expect(result.content[0].text).toContain('3 commits ahead of main')
    
    // Verify git operations were called
    expect(mockGit.checkout).toHaveBeenCalledWith('feature/test-feature')
    expect(mockGit.rebase).toHaveBeenCalledWith(['origin/main'])
  })

  it('should fail when PROJECT_ROOT is not set', async () => {
    delete process.env.PROJECT_ROOT
    
    await expect(featureSync({ featureName: 'test-feature' }))
      .rejects.toThrow('PROJECT_ROOT environment variable not set')
  })

  it('should fail when feature worktree does not exist', async () => {
    mockedFs.existsSync.mockImplementation((path: string) => {
      if (path.includes('.worktrees/nonexistent-feature')) return false
      return true
    })
    
    await expect(featureSync({ featureName: 'nonexistent-feature' }))
      .rejects.toThrow('Feature \'nonexistent-feature\' does not exist')
  })

  it('should fail when not in a git repository', async () => {
    mockGit.checkIsRepo.mockResolvedValue(false)
    
    await expect(featureSync({ featureName: 'test-feature' }))
      .rejects.toThrow('Worktree directory is not a git repository')
  })

  it('should handle conflicts and attempt Claude Code resolution', async () => {
    // Mock rebase conflict
    mockGit.rebase.mockRejectedValueOnce(new Error('CONFLICT: Merge conflict in src/test.ts'))
    mockGit.status
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: []
      })
      .mockResolvedValueOnce({
        current: 'feature/test-feature',  
        conflicted: ['src/test.ts', 'src/utils.ts']
      })
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: []
      })

    // Mock successful Claude Code conflict resolution
    mockedExeca.mockImplementation(async (command: string) => {
      if (command === 'claude') {
        return { stdout: 'Conflicts resolved', stderr: '', exitCode: 0 }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    // Mock isRebaseInProgress to return false after resolution
    mockedFs.existsSync.mockImplementation((path: string) => {
      if (path.includes('/.git/rebase-')) return false
      if (path.includes('.worktrees/test-feature')) return true
      return true
    })

    const result = await featureSync({ featureName: 'test-feature' })
    
    expect(result.content[0].text).toContain('✅ Claude Code resolved conflicts successfully!')
    expect(result.content[0].text).toContain('Files resolved: 2')
    expect(result.content[0].text).toContain('Strategy: Main-first')
    
    // Verify Claude Code was called for conflict resolution
    expect(mockedExeca).toHaveBeenCalledWith(
      'claude',
      ['--dangerously-skip-permissions'],
      expect.objectContaining({
        input: expect.stringContaining('CONFLICT RESOLUTION TASK'),
        cwd: '/test/project/.worktrees/test-feature'
      })
    )
  })

  it('should handle Claude Code failure and provide manual resolution guidance', async () => {
    // Mock rebase conflict
    mockGit.rebase.mockRejectedValueOnce(new Error('CONFLICT: Merge conflict in src/test.ts'))
    mockGit.status
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: []
      })
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: ['src/test.ts']
      })
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: ['src/test.ts']
      })

    // Mock Claude Code failure
    mockedExeca.mockImplementation(async (command: string) => {
      if (command === 'claude') {
        throw new Error('Claude Code timeout')
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    // Mock rebase still in progress after Claude failure
    mockedFs.existsSync.mockImplementation((path: string) => {
      if (path.includes('/.git/rebase-')) return true
      if (path.includes('.worktrees/test-feature')) return true
      return true
    })

    const result = await featureSync({ featureName: 'test-feature' })
    
    expect(result.content[0].text).toContain('⚠️  Conflicts detected in test.ts')
    expect(result.content[0].text).toContain('Claude Code encountered an error')
    expect(result.content[0].text).toContain('Manual Resolution Required:')
    expect(result.content[0].text).toContain('git rebase --continue')
    
    // Verify CONFLICTS.md was created
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      '/test/project/.worktrees/test-feature/CONFLICTS.md',
      expect.stringContaining('Manual Conflict Resolution Guide')
    )
  })

  it('should handle Claude Code incomplete resolution', async () => {
    // Mock rebase conflict
    mockGit.rebase.mockRejectedValueOnce(new Error('CONFLICT: Merge conflict'))
    mockGit.status
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: []
      })
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: ['src/test.ts']
      })
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: ['src/test.ts']
      })

    // Mock Claude Code successful execution but incomplete resolution
    mockedExeca.mockImplementation(async (command: string) => {
      if (command === 'claude') {
        return { stdout: 'Partial resolution', stderr: '', exitCode: 0 }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    // Mock rebase still in progress
    mockedFs.existsSync.mockImplementation((path: string) => {
      if (path.includes('/.git/rebase-')) return true
      if (path.includes('.worktrees/test-feature')) return true
      return true
    })

    const result = await featureSync({ featureName: 'test-feature' })
    
    expect(result.content[0].text).toContain('⚠️  Conflicts detected')
    expect(result.content[0].text).toContain('Claude Code could not complete conflict resolution automatically')
    expect(result.content[0].text).toContain('Manual Resolution Required:')
  })

  it('should abort rebase on error', async () => {
    // Mock git operations failure
    mockGit.rebase.mockRejectedValueOnce(new Error('Network error'))
    
    // Mock rebase in progress when error occurs
    mockedFs.existsSync.mockImplementation((path: string) => {
      if (path.includes('/.git/rebase-')) return true
      if (path.includes('.worktrees/test-feature')) return true
      return true
    })

    await expect(featureSync({ featureName: 'test-feature' }))
      .rejects.toThrow('Network error')
      
    // Verify rebase was aborted
    expect(mockGit.rebase).toHaveBeenCalledWith(['--abort'])
  })

  it('should use custom Claude Code command and args', async () => {
    process.env.CLAUDE_COMMAND = 'custom-claude'
    process.env.CLAUDE_ARGS = '--custom-flag --another-flag'
    
    // Mock rebase conflict to trigger Claude Code
    mockGit.rebase.mockRejectedValueOnce(new Error('CONFLICT'))
    mockGit.status
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: []
      })
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: ['src/test.ts']
      })
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: []
      })

    // Mock successful resolution
    mockedFs.existsSync.mockImplementation((path: string) => {
      if (path.includes('/.git/rebase-')) return false
      if (path.includes('.worktrees/test-feature')) return true
      return true
    })

    await featureSync({ featureName: 'test-feature' })
    
    expect(mockedExeca).toHaveBeenCalledWith(
      'custom-claude',
      ['--custom-flag', '--another-flag'],
      expect.objectContaining({
        cwd: '/test/project/.worktrees/test-feature'
      })
    )
    
    // Clean up
    delete process.env.CLAUDE_COMMAND
    delete process.env.CLAUDE_ARGS
  })

  it('should clean up CONFLICTS.md after successful resolution', async () => {
    // Mock rebase conflict and successful resolution
    mockGit.rebase.mockRejectedValueOnce(new Error('CONFLICT'))
    mockGit.status
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: []
      })
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: ['src/test.ts']
      })
      .mockResolvedValueOnce({
        current: 'feature/test-feature',
        conflicted: []
      })

    // Mock successful resolution (no rebase in progress)
    mockedFs.existsSync.mockImplementation((path: string) => {
      if (path.includes('/.git/rebase-')) return false
      if (path.includes('.worktrees/test-feature')) return true
      if (path.includes('CONFLICTS.md')) return true
      return true
    })

    await featureSync({ featureName: 'test-feature' })
    
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(
      '/test/project/.worktrees/test-feature/CONFLICTS.md'
    )
  })
})