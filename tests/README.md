# Testing

Simple Vitest setup for the Claude Worktree Agent MCP tools.

## Running Tests

```bash
pnpm test           # Run once and exit
pnpm test:watch     # Watch mode  
pnpm test:ui        # Browser UI
```

## What's Tested

- ✅ **Tool imports** - All 5 MCP tools load correctly
- ✅ **Environment** - PROJECT_ROOT validation for Cursor MCP
- ✅ **verify-setup** - Comprehensive testing (5 scenarios)
- ✅ **Error handling** - Basic parameter validation

## Structure

```
tests/
├── tools/
│   ├── verify-setup.test.ts      # Main tool test
│   └── simple-integration.test.ts # Basic imports/validation  
└── utils/                         # Test helpers & mocks
```

**Total: 9 tests, ~300ms runtime**

## Test Utilities

- `setupTestEnv()` - Handles PROJECT_ROOT setup
- `createGitMock()`, `createFsMock()`, `createExecaMock()` - Mock factories
- Basic fixtures in `utils/fixtures.ts`

---

**Note**: These tests focus on infrastructure validation. Core workflows (feature creation, git operations, etc.) still require manual testing. 