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
  let mockMainGit: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup default git mocks
    mockGit = {
      checkIsRepo: vi.fn().mockResolvedValue(true),
      checkout: vi.fn().mockResolvedValue(undefined),
      rebase: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({ 
        conflicted: [],
        ahead: 2
      })
    }

    mockMainGit = {
      fetch: vi.fn().mockResolvedValue(undefined),
      log: vi.fn().mockResolvedValue({ all: [{ hash: 'abc123' }, { hash: 'def456' }] }),
      checkout: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue(undefined)
    }

    mockedSimpleGit.mockImplementation((path: string) => {
      if (path.includes('.worktrees')) {
        return mockGit
      }
      return mockMainGit
    })

    // Setup default fs mocks
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.writeFileSync.mockImplementation(() => {})
  })

  it('should successfully sync feature without conflicts', async () => {
    const result = await featureSync({ featureName: 'test-feature' })
    
    expect(result.content[0].text).toContain('✅ Feature synced successfully!')
    expect(result.content[0].text).toContain('Your branch is now 2 commits ahead of main.')
    
    // Verify git operations were called in correct order
    expect(mockMainGit.fetch).toHaveBeenCalledWith('origin', 'main')
    expect(mockMainGit.checkout).toHaveBeenCalledWith('main')
    expect(mockMainGit.pull).toHaveBeenCalledWith('origin', 'main')
    expect(mockGit.checkout).toHaveBeenCalledWith('feature/test-feature')
    expect(mockGit.rebase).toHaveBeenCalledWith(['main'])
  })

  it('should handle conflicts and launch Claude Code', async () => {
    // Mock rebase failure with conflicts
    mockGit.rebase.mockRejectedValueOnce(new Error('rebase failed'))
    mockGit.status
      .mockResolvedValueOnce({ conflicted: ['src/file1.ts', 'src/file2.ts'] })
      .mockResolvedValueOnce({ conflicted: [] }) // After Claude Code resolution

    mockedExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

    const result = await featureSync({ featureName: 'test-feature' })
    
    expect(result.content[0].text).toContain('⚠️  2 conflicts detected in src/file1.ts, src/file2.ts')
    expect(result.content[0].text).toContain('🤖 Launching Claude Code for conflict resolution...')
    expect(result.content[0].text).toContain('✅ Claude Code resolved conflicts (main-first strategy)')
    expect(result.content[0].text).toContain('✅ Feature synced successfully!')
    
    // Verify Claude Code was launched with correct arguments
    expect(mockedExeca).toHaveBeenCalledWith(
      'claude',
      ['--dangerously-skip-permissions'],
      expect.objectContaining({
        input: expect.stringContaining('I need you to resolve merge conflicts'),
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: '/test/project/.worktrees/test-feature'
      })
    )
  })

  it('should handle Claude Code failure and save conflict details', async () => {
    // Mock rebase failure with conflicts
    mockGit.rebase.mockRejectedValueOnce(new Error('rebase failed'))
    mockGit.status.mockResolvedValue({ conflicted: ['src/file1.ts'] })

    // Mock Claude Code failure
    mockedExeca.mockRejectedValueOnce(new Error('Claude Code failed'))

    const result = await featureSync({ featureName: 'test-feature' })
    
    expect(result.content[0].text).toContain('🤖 Claude Code could not complete conflict resolution')
    expect(result.content[0].text).toContain('📋 Conflict details saved to .worktrees/test-feature/CONFLICTS.md')
    expect(result.content[0].text).toContain('Next steps: Review conflicts manually, then run feature_sync again')
    
    // Verify conflict report was saved
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      '/test/project/.worktrees/test-feature/CONFLICTS.md',
      expect.stringContaining('# Conflict Resolution Required')
    )
  })

  it('should fail when PROJECT_ROOT is not set', async () => {
    delete process.env.PROJECT_ROOT
    
    await expect(featureSync({ featureName: 'test-feature' })).rejects.toThrow(
      'PROJECT_ROOT environment variable not set'
    )
  })

  it('should fail when feature worktree does not exist', async () => {
    mockedFs.existsSync.mockReturnValue(false)
    
    await expect(featureSync({ featureName: 'nonexistent-feature' })).rejects.toThrow(
      'Feature \'nonexistent-feature\' not found. Expected worktree at \'/test/project/.worktrees/nonexistent-feature\''
    )
  })

  it('should fail when not in a git repository', async () => {
    mockGit.checkIsRepo.mockResolvedValue(false)
    
    await expect(featureSync({ featureName: 'test-feature' })).rejects.toThrow(
      'Not in a git repository'
    )
  })

  it('should abort rebase on failure', async () => {
    mockGit.rebase.mockRejectedValueOnce(new Error('unexpected rebase error'))
    mockGit.status.mockResolvedValue({ conflicted: [] }) // No conflicts, just generic error

    await expect(featureSync({ featureName: 'test-feature' })).rejects.toThrow('unexpected rebase error')
    
    // Verify rebase abort was called
    expect(mockGit.rebase).toHaveBeenCalledWith(['--abort'])
  })

  it('should use custom Claude Code command and args', async () => {
    process.env.CLAUDE_COMMAND = 'custom-claude'
    process.env.CLAUDE_ARGS = '--verbose --custom-flag'

    mockGit.rebase.mockRejectedValueOnce(new Error('rebase failed'))
    mockGit.status
      .mockResolvedValueOnce({ conflicted: ['src/file1.ts'] })
      .mockResolvedValueOnce({ conflicted: [] })

    mockedExeca.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })

    await featureSync({ featureName: 'test-feature' })
    
    expect(mockedExeca).toHaveBeenCalledWith(
      'custom-claude',
      ['--verbose', '--custom-flag'],
      expect.any(Object)
    )
  })
})