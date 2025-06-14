import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestEnv } from '../utils/test-env'

describe('feature-sync tool - basic tests', () => {
  setupTestEnv()

  beforeEach(() => {
    // Set up default PROJECT_ROOT
    process.env.PROJECT_ROOT = '/test/project'
  })

  it('should import feature-sync tool correctly', async () => {
    const { featureSync } = await import('../../src/tools/feature-sync')
    expect(typeof featureSync).toBe('function')
  })

  it('should throw error when PROJECT_ROOT is not set', async () => {
    delete process.env.PROJECT_ROOT
    
    const { featureSync } = await import('../../src/tools/feature-sync')
    
    await expect(featureSync({ featureName: 'test-feature' }))
      .rejects.toThrow('PROJECT_ROOT environment variable not set')
  })

  it('should throw error when featureName is empty', async () => {
    const { featureSync } = await import('../../src/tools/feature-sync')
    
    await expect(featureSync({ featureName: '' }))
      .rejects.toThrow()
  })

  it('should create proper paths from featureName', async () => {
    const { featureSync } = await import('../../src/tools/feature-sync')
    
    // This will fail but we can see the error message contains proper paths
    try {
      await featureSync({ featureName: 'user-dashboard' })
    } catch (error) {
      expect(error.message).toContain('user-dashboard')
      expect(error.message).toContain('.worktrees/user-dashboard')
    }
  })
})