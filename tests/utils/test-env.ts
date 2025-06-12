import { beforeEach, afterEach } from 'vitest'

/**
 * Sets up a clean test environment with PROJECT_ROOT
 */
export function setupTestEnv(projectRoot = '/test/project') {
  beforeEach(() => {
    process.env.PROJECT_ROOT = projectRoot
  })

  afterEach(() => {
    delete process.env.PROJECT_ROOT
  })
}

/**
 * Creates a temporary directory path for testing
 */
export function createTestPath(path: string): string {
  return `/test/project/${path}`
}

/**
 * Mock environment variables for testing
 */
export const mockEnv = {
  withProjectRoot: (path: string) => {
    process.env.PROJECT_ROOT = path
  },
  withClaudeCommand: (command: string) => {
    process.env.CLAUDE_COMMAND = command
  },
  withClaudeArgs: (args: string) => {
    process.env.CLAUDE_ARGS = args
  },
  clear: () => {
    delete process.env.PROJECT_ROOT
    delete process.env.CLAUDE_COMMAND
    delete process.env.CLAUDE_ARGS
  }
} 