/**
 * Test fixtures for feature specifications and common test data
 */

export const testFeatureSpec = `# Test Feature

## Overview
A simple test feature for validating the worktree agent.

## Requirements
- Create a test component
- Add basic functionality
- Include unit tests

## Acceptance Criteria
- [ ] Component renders correctly
- [ ] Functions work as expected
- [ ] Tests pass
`

export const testPaths = {
  projectRoot: '/test/project',
  featureFile: 'features/test-feature.md',
  worktreePath: '/test/project/.worktrees/test-feature',
  branchName: 'feature/test-feature'
}

export const mockGitResponses = {
  branchList: {
    all: ['main', 'feature/test-feature'],
    current: 'main'
  },
  status: {
    files: []
  },
  log: {
    total: 1,
    all: [{
      hash: 'abc1234567890',
      message: 'feat: initial implementation',
      date: '2024-01-01'
    }],
    latest: {
      hash: 'abc1234567890',
      message: 'feat: initial implementation',
      date: '2024-01-01'
    }
  }
}

export const mockCommandResults = {
  success: { stdout: 'success', stderr: '', exitCode: 0 },
  notFound: { stdout: '', stderr: 'command not found', exitCode: 127 },
  gitVersion: { stdout: 'git version 2.49.0', stderr: '', exitCode: 0 },
  ghVersion: { stdout: 'gh version 2.74.0', stderr: '', exitCode: 0 },
  pnpmVersion: { stdout: '9.0.0', stderr: '', exitCode: 0 }
} 