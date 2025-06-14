# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Build the project
pnpm build

# Start the MCP server
pnpm start

# Run tests
pnpm test

# Package management
pnpm install      # Use pnpm (preferred) over npm
```

## Project Architecture

This is an MCP (Model Context Protocol) server that enables autonomous Claude Code feature development in isolated git worktrees.

### Core Components

- **MCP Server** (`src/index.ts`): Main entry point registering 5 tools with the MCP SDK
- **Tool implementations** (`src/tools/`): Each tool is a separate module with specific functionality
- **TypeScript ESM**: Modern ES modules with TypeScript compilation to `dist/`

### Key Tools Architecture

1. **verify-setup**: Validates all prerequisites (git, GitHub CLI, Claude Code, etc.)
2. **feature-start**: Creates isolated git worktrees and launches Claude Code autonomously
3. **feature-status**: Monitors active development sessions across worktrees
4. **feature-cleanup**: Safely removes completed/abandoned worktrees
5. **feature-revision**: AI-driven analysis of PR feedback with intelligent implementation

### Dependencies

- `@modelcontextprotocol/sdk`: Core MCP protocol implementation
- `simple-git`: Git operations in Node.js
- `execa`: Process execution for shell commands
- `@types/node`: TypeScript definitions

### Environment Requirements

- **PROJECT_ROOT**: Required environment variable for Cursor MCP integration
- **CLAUDE_COMMAND**: Optional custom Claude Code command path 
- **CLAUDE_ARGS**: Optional custom Claude Code arguments

## Claude Code Tools Available

Claude Code has access to the following tools in this environment:

### ✅ Full Access (No Permissions Required in project directory)
- **Agent** - Run sub-agents for complex tasks
- **Glob** - Find files with pattern matching  
- **Grep** - Search file contents for patterns
- **LS** - List directories and files
- **Read** - Read file contents
- **NotebookRead** - Read Jupyter notebooks
- **TodoRead/TodoWrite** - Manage session task lists

### ✅ Permitted Operations (Pre-approved)
- **Bash** - Execute shell commands (git, pnpm, node, etc.)
- **Edit** - Make targeted file edits
- **MultiEdit** - Multiple edits on single files
- **Write** - Create or overwrite files
- **NotebookEdit** - Modify Jupyter notebooks
- **Fetch** - Web requests (HTTPS)
- **WebSearch** - Web searches

### 🎯 Capabilities Summary
Claude can autonomously:
- Read and analyze codebases
- Run git operations (status, commit, push, etc.)
- Execute pnpm/npm commands (test, build, install, etc.)
- Run Node.js scripts and tools
- Create, edit, and delete files
- Search web for information
- Use text processing tools (sed, awk, grep, etc.)
- Manage development processes

### ⚠️ Limitations
- Cannot sudo or run system admin commands
- Cannot delete system directories (/, /*, etc.)
- Cannot set overly permissive file permissions
- All operations are scoped to the project directory

## Testing

Uses Vitest with Node.js environment. Tests focus on:
- Tool import validation
- Environment setup verification
- Basic parameter validation
- Mock-based unit testing

Test utilities provide factories for git, filesystem, and process mocks.

## Build Process

TypeScript compilation from `src/` to `dist/` with:
- ES2020 target
- ESNext modules
- Source maps and declarations
- Strict type checking

The compiled output in `dist/index.js` serves as both the main entry point and CLI binary.


# Development tips
- use pnpm over npm
- use `eza -T --git-ignore` to get a project file overview
- changes should be verified and covered with tests. Validate with `pnpm test`