# Testing Infrastructure

This directory contains the complete testing infrastructure for the Claude Worktree Agent MCP Server.

## Current Status

✅ **Working Test Infrastructure** - All tests passing
- ✅ Vitest configuration with TypeScript support
- ✅ Test utilities and helpers
- ✅ Environment setup for PROJECT_ROOT handling
- ✅ Integration tests for tool imports and basic functionality
- ✅ Comprehensive test for verify-setup tool

## Test Structure

```
tests/
├── utils/
│   ├── test-env.ts          # Environment setup utilities
│   ├── mock-helpers.ts      # Mock factory functions for testing
│   └── fixtures.ts          # Test data and common responses
├── tools/
│   ├── verify-setup.test.ts      # ✅ Working: 5 test scenarios
│   └── simple-integration.test.ts # ✅ Working: 5 integration tests
└── README.md                # This file
```

## Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode  
npm run test:run

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

## Test Categories

### 1. Integration Tests (`simple-integration.test.ts`)
- ✅ Tool import validation
- ✅ MCP server structure verification
- ✅ PROJECT_ROOT requirement validation
- ✅ Test utilities functionality
- ✅ Parameter validation

### 2. Unit Tests (`verify-setup.test.ts`)
- ✅ Success case with all tools available
- ✅ Missing PROJECT_ROOT handling
- ✅ Git CLI not available
- ✅ Git repository not found
- ✅ GitHub CLI authentication issues

## Testing Utilities

### Mock Helpers (`mock-helpers.ts`)
- `createGitMock()` - Mock simple-git operations
- `createFsMock()` - Mock file system operations  
- `createExecaMock()` - Mock command execution
- `createPathMock()` - Mock path operations

### Test Environment (`test-env.ts`)
- Automatic PROJECT_ROOT setup
- Environment isolation
- Clean state between tests

### Fixtures (`fixtures.ts`)
- Sample feature specifications
- Common test data
- Mock responses

## Implementation Notes

### Cursor MCP Compatibility
All tools are designed to work with Cursor's MCP implementation using the PROJECT_ROOT environment variable approach, avoiding process.cwd() dependencies.

### Test Isolation
Each test file is completely self-contained and doesn't impact others. Tests use proper mocking to avoid external dependencies.

### Future Development
The testing infrastructure is ready for additional comprehensive tests when needed. The foundation includes:
- Proper mocking patterns
- TypeScript configuration
- Environment setup
- Test utilities

## Example Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestEnv } from '../utils/test-env'
import { createGitMock, createFsMock } from '../utils/mock-helpers'

describe('My Tool', () => {
  setupTestEnv()

  beforeEach(() => {
    // Setup test-specific mocks
  })

  it('should handle success case', async () => {
    // Test implementation
  })
})
```

This testing infrastructure provides a solid foundation for ensuring the Claude Worktree Agent remains reliable and functional. 