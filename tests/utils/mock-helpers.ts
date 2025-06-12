import { vi } from 'vitest'

/**
 * Mock the execa command execution
 */
export function mockExeca() {
  return vi.fn().mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0
  })
}

/**
 * Mock file system operations
 */
export function mockFs() {
  return {
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    copyFileSync: vi.fn(),
    cpSync: vi.fn(),
    rmdirSync: vi.fn()
  }
}

/**
 * Mock simple-git operations
 */
export function mockSimpleGit() {
  const gitMock = {
    checkIsRepo: vi.fn().mockResolvedValue(true),
    checkout: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(''),
    branchLocal: vi.fn().mockResolvedValue({
      all: ['main'],
      current: 'main'
    }),
    deleteLocalBranch: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockResolvedValue({
      files: []
    }),
    log: vi.fn().mockResolvedValue({
      total: 0,
      all: [],
      latest: null
    }),
    listRemote: vi.fn().mockResolvedValue('')
  }

  return vi.fn(() => gitMock)
}

/**
 * Mock GitHub CLI responses
 */
export const mockGitHubResponses = {
  prView: {
    success: {
      stdout: JSON.stringify({
        url: 'https://github.com/test/repo/pull/1',
        title: 'Test PR',
        body: 'Test description',
        state: 'OPEN',
        number: 1
      })
    },
    notFound: {
      stdout: '',
      stderr: 'no pull requests found',
      exitCode: 1
    }
  },
  prState: {
    open: { stdout: 'OPEN' },
    merged: { stdout: 'MERGED' },
    closed: { stdout: 'CLOSED' }
  }
}

/**
 * Setup common mocks for all tools
 */
export function setupCommonMocks() {
  vi.mock('execa', () => ({
    execa: mockExeca()
  }))

  vi.mock('fs', () => mockFs())

  vi.mock('simple-git', () => ({
    default: mockSimpleGit()
  }))
}

// Git mock factory
export function createGitMock(overrides = {}) {
  return {
    checkIsRepo: vi.fn().mockResolvedValue(true),
    checkout: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(''),
    deleteLocalBranch: vi.fn().mockResolvedValue(undefined),
    branchLocal: vi.fn().mockResolvedValue({
      all: ['main', 'feature/test-feature'],
      current: 'main'
    }),
    listRemote: vi.fn().mockResolvedValue(''),
    status: vi.fn().mockResolvedValue({ files: [] }),
    log: vi.fn().mockResolvedValue({
      total: 1,
      latest: {
        hash: 'abc1234567890',
        message: 'feat: initial implementation'
      },
      all: [
        { hash: 'abc1234', message: 'feat: initial implementation' }
      ]
    }),
    ...overrides
  }
}

// Path mock factory
export function createPathMock() {
  return {
    isAbsolute: vi.fn().mockReturnValue(false),
    join: vi.fn().mockImplementation((...args) => args.join('/')),
    basename: vi.fn().mockImplementation((filePath: string, ext?: string) => {
      const base = filePath.split('/').pop() || ''
      return ext ? base.replace(ext, '') : base
    }),
    dirname: vi.fn().mockImplementation((filePath: string) => {
      const parts = filePath.split('/')
      return parts.slice(0, -1).join('/')
    })
  }
}

// FS mock factory
export function createFsMock(customBehavior = {}) {
  const defaultBehavior = {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue('default test content'),
    writeFileSync: vi.fn().mockReturnValue(undefined),
    mkdirSync: vi.fn().mockReturnValue(undefined),
    readdirSync: vi.fn().mockReturnValue([]),
    copyFileSync: vi.fn().mockReturnValue(undefined),
    cpSync: vi.fn().mockReturnValue(undefined),
    rmdirSync: vi.fn().mockReturnValue(undefined),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true })
  }
  
  return {
    ...defaultBehavior,
    ...customBehavior
  }
}

// Command mock factory
export function createExecaMock(customResponses = {}) {
  const defaultResponses = {
    'pgrep': () => { throw new Error('no matching processes') },
    'gh': () => { throw new Error('no pull requests found') },
    'git': () => ({ stdout: '', stderr: '', exitCode: 0 }),
    'claude': () => ({ stdout: 'Claude started', stderr: '', exitCode: 0 }),
    'pnpm': () => ({ stdout: 'Dependencies installed', stderr: '', exitCode: 0 }),
    'npm': () => ({ stdout: 'Dependencies installed', stderr: '', exitCode: 0 })
  }

  return vi.fn().mockImplementation(async (command: string, args?: readonly string[]) => {
    const key = command
    if (customResponses[key]) {
      return customResponses[key](args)
    }
    if (defaultResponses[key]) {
      return defaultResponses[key](args)
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  })
}

// Reset all mocks utility
export function resetAllMocks() {
  vi.clearAllMocks()
  vi.resetAllMocks()
}

// Setup complete mock environment
export function setupMockEnvironment(gitMock = null, fsMock = null, execaMock = null, pathMock = null) {
  const git = gitMock || createGitMock()
  const fs = fsMock || createFsMock()
  const execa = execaMock || createExecaMock()
  const path = pathMock || createPathMock()

  // Mock simple-git to return our git mock
  vi.doMock('simple-git', () => ({
    default: vi.fn(() => git)
  }))

  return { git, fs, execa, path }
} 