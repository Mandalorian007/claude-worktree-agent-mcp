import { describe, it, expect, vi, beforeEach } from 'vitest'
import { featureSync } from '../../src/tools/feature-sync'
import { setupTestEnv } from '../utils/test-env'

// Mock external dependencies
vi.mock('simple-git')
vi.mock('execa')
vi.mock('fs')

describe('feature-sync', () => {
  setupTestEnv()

  const mockGit = {
    checkIsRepo: vi.fn(),
    fetch: vi.fn(),
    checkout: vi.fn(),
    status: vi.fn(),
    log: vi.fn(),
    rebase: vi.fn(),
    stash: vi.fn()
  }

  const mockFs = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  }

  const mockExeca = vi.fn()

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Setup default mocks
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.fetch.mockResolvedValue(undefined)
    mockGit.status.mockResolvedValue({ files: [] })
    mockGit.log.mockResolvedValue({ total: 0, all: [] })
    mockGit.rebase.mockResolvedValue(undefined)
    mockGit.stash.mockResolvedValue(undefined)
    
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('test content')
    mockFs.writeFileSync.mockReturnValue(undefined)
    
    mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })

    // Apply mocks
    const { default: simpleGit } = await vi.importMock<typeof import('simple-git')>('simple-git')
    simpleGit.mockReturnValue(mockGit as any)

    const fs = await vi.importMock<typeof import('fs')>('fs')
    Object.assign(fs, mockFs)

    const { execa } = await vi.importMock<typeof import('execa')>('execa')
    execa.mockImplementation(mockExeca as any)
  })

  it('should throw error when PROJECT_ROOT is not set', async () => {
    delete process.env.PROJECT_ROOT
    
    await expect(featureSync({ featureName: 'test-feature' })).rejects.toThrow(
      'PROJECT_ROOT environment variable not set'
    )
  })

  it('should throw error when feature worktree does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false)
    
    await expect(featureSync({ featureName: 'nonexistent-feature' })).rejects.toThrow(
      "Feature 'nonexistent-feature' not found"
    )
  })

  it('should throw error when not in a git repository', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockGit.checkIsRepo.mockResolvedValue(false)
    
    await expect(featureSync({ featureName: 'test-feature' })).rejects.toThrow(
      'Not in a git repository'
    )
  })

  it('should successfully sync feature when no conflicts occur', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.status.mockResolvedValue({ files: [] } as any)
    mockGit.log
      .mockResolvedValueOnce({ total: 2, all: [] } as any) // beforeLog - 2 new commits
      .mockResolvedValueOnce({ total: 3, all: [] } as any) // aheadLog - 3 commits ahead
    mockGit.rebase.mockResolvedValue(undefined as any)

    const result = await featureSync({ featureName: 'test-feature' })

    expect(result.content[0].text).toContain('Syncing feature \'test-feature\' to main')
    expect(result.content[0].text).toContain('2 new commits')
    expect(result.content[0].text).toContain('Rebase completed successfully')
    expect(result.content[0].text).toContain('Feature synced successfully')
    expect(result.content[0].text).toContain('3 commits ahead of main')
    
    expect(mockGit.fetch).toHaveBeenCalledWith('origin', 'main')
    expect(mockGit.checkout).toHaveBeenCalledWith('feature/test-feature')
    expect(mockGit.rebase).toHaveBeenCalledWith(['origin/main'])
  })

  it('should stash and restore uncommitted changes', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.status.mockResolvedValue({ files: ['modified-file.ts'] } as any)
    mockGit.log
      .mockResolvedValueOnce({ total: 0, all: [] } as any) // no new commits
      .mockResolvedValueOnce({ total: 1, all: [] } as any) // 1 commit ahead
    mockGit.rebase.mockResolvedValue(undefined as any)
    mockGit.stash.mockResolvedValue(undefined as any)

    const result = await featureSync({ featureName: 'test-feature' })

    expect(result.content[0].text).toContain('Stashing uncommitted changes')
    expect(result.content[0].text).toContain('Restored uncommitted changes')
    
    expect(mockGit.stash).toHaveBeenCalledWith(['push', '-m', 'Auto-stash before sync'])
    expect(mockGit.stash).toHaveBeenCalledWith(['pop'])
  })

  it('should handle rebase conflicts with Claude Code resolution', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.status
      .mockResolvedValueOnce({ files: [] } as any) // no uncommitted changes initially
      .mockResolvedValueOnce({ conflicted: ['src/file.ts', 'src/other.ts'] } as any) // conflicts after rebase
      .mockResolvedValueOnce({ conflicted: [] } as any) // resolved after Claude
    mockGit.log.mockResolvedValueOnce({ total: 1, all: [] } as any) // 1 new commit
    mockGit.rebase
      .mockRejectedValueOnce(new Error('Rebase failed with conflicts')) // initial rebase fails
    
    // Mock successful Claude Code execution
    mockExeca.mockImplementation(async (command: string, args?: readonly string[]) => {
      if (command === 'git' && args?.[0] === 'status') {
        return { stdout: 'UU src/file.ts\nUU src/other.ts\n', stderr: '', exitCode: 0 }
      }
      if (command === 'claude') {
        return { stdout: 'Conflicts resolved', stderr: '', exitCode: 0 }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    const result = await featureSync({ featureName: 'test-feature' })

    expect(result.content[0].text).toContain('Conflicts detected during rebase')
    expect(result.content[0].text).toContain('Conflicts in: src/file.ts, src/other.ts')
    expect(result.content[0].text).toContain('Launching Claude Code for conflict resolution')
    expect(result.content[0].text).toContain('Claude Code resolved conflicts')
    expect(result.content[0].text).toContain('Feature synced successfully after conflict resolution')
    
    // Verify conflict analysis file was created
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('CONFLICTS.md'),
      expect.stringContaining('Conflict Analysis')
    )
  })

  it('should handle Claude Code resolution failure', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.status
      .mockResolvedValueOnce({ files: [] } as any)
      .mockResolvedValueOnce({ conflicted: ['src/file.ts'] } as any) // conflicts
      .mockResolvedValueOnce({ conflicted: ['src/file.ts'] } as any) // still conflicted after Claude
    mockGit.log.mockResolvedValueOnce({ total: 0, all: [] } as any)
    mockGit.rebase.mockRejectedValueOnce(new Error('Rebase failed with conflicts'))
    
    // Mock Claude Code failure
    mockExeca.mockImplementation(async (command: string) => {
      if (command === 'claude') {
        throw new Error('Claude Code execution failed')
      }
      if (command === 'git') {
        return { stdout: 'UU src/file.ts\n', stderr: '', exitCode: 0 }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    const result = await featureSync({ featureName: 'test-feature' })

    expect(result.content[0].text).toContain('Claude Code could not complete conflict resolution')
    expect(result.content[0].text).toContain('Manual intervention required')
    expect(result.content[0].text).toContain('Conflict details saved to')
  })

  it('should abort rebase on error', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.status.mockResolvedValue({ files: [] } as any)
    mockGit.log.mockResolvedValueOnce({ total: 0, all: [] } as any)
    mockGit.rebase.mockRejectedValue(new Error('Unknown rebase error'))

    await expect(featureSync({ featureName: 'test-feature' })).rejects.toThrow()
    
    expect(mockGit.rebase).toHaveBeenCalledWith(['--abort'])
  })

  it('should handle up-to-date main branch', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.status.mockResolvedValue({ files: [] } as any)
    mockGit.log
      .mockResolvedValueOnce({ total: 0, all: [] } as any) // no new commits
      .mockResolvedValueOnce({ total: 0, all: [] } as any) // no commits ahead
    mockGit.rebase.mockResolvedValue(undefined as any)

    const result = await featureSync({ featureName: 'test-feature' })

    expect(result.content[0].text).toContain('already up to date')
    expect(result.content[0].text).toContain('Feature synced successfully')
  })

  it('should generate detailed conflict analysis', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(`
function test() {
<<<<<<< HEAD
  console.log('feature version');
=======
  console.log('main version');
>>>>>>> main
}
`)

    mockGit.checkIsRepo.mockResolvedValue(true)
    mockGit.status
      .mockResolvedValueOnce({ files: [] } as any)
      .mockResolvedValueOnce({ conflicted: ['src/test.ts'] } as any)
      .mockResolvedValueOnce({ conflicted: [] } as any) // resolved
    mockGit.log.mockResolvedValueOnce({ total: 0, all: [] } as any)
    mockGit.rebase.mockRejectedValueOnce(new Error('Conflicts'))

    mockExeca.mockImplementation(async (command: string) => {
      if (command === 'claude') {
        return { stdout: 'Resolved', stderr: '', exitCode: 0 }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    await featureSync({ featureName: 'test-feature' })

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('CONFLICTS.md'),
      expect.stringContaining('Conflict Analysis for Feature Sync')
    )
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('src/test.ts')
    )
  })
})