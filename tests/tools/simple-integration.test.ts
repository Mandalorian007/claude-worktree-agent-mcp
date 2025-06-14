import { describe, it, expect, beforeAll } from 'vitest'
import { setupTestEnv } from '../utils/test-env'

describe('MCP Tools Integration', () => {
  setupTestEnv()

  beforeAll(() => {
    // Ensure PROJECT_ROOT is set for these tests
    if (!process.env.PROJECT_ROOT) {
      process.env.PROJECT_ROOT = '/test/project'
    }
  })

  it('should be able to import all MCP tools', async () => {
    // Test that all tools can be imported without errors
    const { verifySetup } = await import('../../src/tools/verify-setup')
    const { featureStart } = await import('../../src/tools/feature-start')
    const { featureStatus } = await import('../../src/tools/feature-status')
    const { featureCleanup } = await import('../../src/tools/feature-cleanup')
    const { featureRevision } = await import('../../src/tools/feature-revision')
    const { featureSync } = await import('../../src/tools/feature-sync')

    expect(typeof verifySetup).toBe('function')
    expect(typeof featureStart).toBe('function')
    expect(typeof featureStatus).toBe('function')
    expect(typeof featureCleanup).toBe('function')
    expect(typeof featureRevision).toBe('function')
    expect(typeof featureSync).toBe('function')
  })

  it('should validate PROJECT_ROOT requirement in tools', async () => {
    // Remove PROJECT_ROOT temporarily
    const originalProjectRoot = process.env.PROJECT_ROOT
    delete process.env.PROJECT_ROOT

    const { verifySetup } = await import('../../src/tools/verify-setup')
    
    await expect(verifySetup()).rejects.toThrow('PROJECT_ROOT environment variable not set')

    // Restore PROJECT_ROOT
    process.env.PROJECT_ROOT = originalProjectRoot
  })

  it('should have working test utilities', async () => {
    const { createGitMock, createFsMock, createExecaMock } = await import('../utils/mock-helpers')
    
    const gitMock = createGitMock()
    const fsMock = createFsMock()
    const execaMock = createExecaMock()

    expect(gitMock.checkIsRepo).toBeDefined()
    expect(fsMock.existsSync).toBeDefined()
    expect(execaMock).toBeInstanceOf(Function)
  })

  it('should validate parameter requirements', async () => {
    // Verify that tools with required parameters throw errors when missing
    const { featureStart } = await import('../../src/tools/feature-start')
    const { featureRevision } = await import('../../src/tools/feature-revision')
    const { featureSync } = await import('../../src/tools/feature-sync')

    // Test that calling with invalid params throws appropriate errors
    await expect(featureStart({ featureFile: '' })).rejects.toThrow()
    await expect(featureRevision({ featureFile: '' })).rejects.toThrow()
    await expect(featureSync({ featureName: '' })).rejects.toThrow()
  })
}) 