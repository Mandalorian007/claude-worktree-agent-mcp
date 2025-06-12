# Claude Worktree Agent MCP

A lightweight MCP server for autonomous Claude Code feature development in isolated git worktrees.

## Overview

This MCP server transforms the original bash-based Claude Code parallel feature development system into clean, typed tools that any Claude client can use. It provides four core tools:

- **`verify_setup`** - Verify all prerequisites are met (Git, Claude Code, GitHub CLI, authentication, etc.)
- **`feature_start`** - Start Claude Code development on a feature in isolated git worktree
- **`feature_status`** - Check status of all active feature development sessions  
- **`feature_cleanup`** - Clean up completed or abandoned feature development worktrees
- **`feature_revision`** - Apply revisions using AI-driven analysis of ALL PR feedback (resolved & unresolved) and updated feature specs

Each feature gets its own isolated environment (git worktree) where Claude Code can work autonomously without affecting your main codebase.

## Prerequisites

- **Node.js** 18+ 
- **Claude Code CLI** installed and configured
- **GitHub CLI** (`gh`) installed and authenticated
- **Git** with worktree support
- A git repository with a `main` branch

## Installation

### Option 1: NPM Package (Recommended)

Install globally for use across all your projects:

```bash
# Install globally
npm install -g claude-worktree-agent-mcp

# Or install in a specific project
npm install claude-worktree-agent-mcp
```

**Add to your MCP configuration:**

Create or update your Claude MCP configuration file:

```json
{
  "mcpServers": {
    "worktree-agent": {
      "command": "claude-worktree-mcp"
    }
  }
}
```

**Configuration file locations:**
- **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
- **Claude CLI**: `~/.config/claude/mcp.json`
- **Project-specific**: `.claude/mcp.json` in your project root

### Option 2: Clone Locally (For Development/Customization)

```bash
# Clone the repository
git clone https://github.com/your-username/claude-worktree-agent-mcp.git
cd claude-worktree-agent-mcp

# Install dependencies and build
npm install
npm run build

# Test the MCP server
npm start
```

**Add to your MCP configuration:**

```json
{
  "mcpServers": {
    "worktree-agent": {
      "command": "node",
      "args": ["/path/to/claude-worktree-agent-mcp/dist/index.js"]
    }
  }
}
```

## Environment Setup

### GitHub Authentication

The MCP server uses GitHub CLI for all GitHub operations (no API token required):

1. **Install GitHub CLI:**
   ```bash
   # macOS
   brew install gh
   
   # Other platforms: https://cli.github.com/
   ```

2. **Authenticate with GitHub:**
   ```bash
   gh auth login
   ```
   
   Follow the prompts to authenticate via web browser or token.

3. **Verify authentication:**
   ```bash
   gh auth status
   ```

### Project Setup

In your development project:

```bash
# Add .worktrees to .gitignore
echo ".worktrees/" >> .gitignore

# Create features directory (optional)
mkdir -p features
```

## Usage

### 1. Verify Setup (Recommended First Step)

```
verify_setup({
  "verbose": true,           // optional: show detailed output
  "claudeCommand": "claude"  // optional: custom Claude Code command
})
```

**What it checks:**
- ✅ **Git Repository**: Valid git repo and worktree support (Git 2.5+)
- ✅ **Claude Code**: Availability and basic authentication
- ✅ **GitHub CLI**: Installation and authentication status (`gh auth status`)
- ✅ **Environment Variables**: CLAUDE_COMMAND, CLAUDE_ARGS (optional)
- ✅ **Package Manager**: pnpm (preferred) or npm availability
- ✅ **Project Structure**: package.json and common config files

**Example output:**
```
# Claude Worktree Agent Setup Verification

✅ 7 passed  ⚠️ 2 warnings  ❌ 0 failed

## ✅ Git Repository
Valid git repository found

## ✅ Claude Code  
Claude Code available

## ❌ GitHub CLI
GitHub CLI (gh) not found
```

**Troubleshooting integration:** Run this first to identify and fix any setup issues before starting feature development.

### 2. Start Feature Development

```
feature_start({
  "featureFile": "features/user-dashboard.md",
  "branchPrefix": "feature/",
  "baseBranch": "main"
})
```

**What it does:**
- Creates isolated git worktree
- Copies feature spec and project files
- Installs dependencies
- Starts Claude Code agent autonomously

### 3. Check Status

```
feature_status({
  "featureName": "user-dashboard"  // optional
})
```

**Shows:**
- Active worktrees and branches
- Git status and commit history
- PR status and links
- Claude Code agent status

### 4. Apply Revisions with AI Analysis

```
// Fully automatic - AI analyzes ALL PR feedback
feature_revision({
  "featureFile": "features/user-dashboard.md"
})

// With additional manual instructions 
feature_revision({
  "featureFile": "features/user-dashboard.md",
  "revisionInstructions": "Also add dark mode support"
})

// With context to help AI analysis
feature_revision({
  "featureFile": "features/user-dashboard.md",
  "userContext": "This is a high-priority feature for the Q1 release. Focus on performance and accessibility concerns first.",
  "revisionInstructions": "Address all critical feedback before nice-to-haves"
})

// Force revision even if Claude is running
feature_revision({
  "featureFile": "features/user-dashboard.md",
  "force": true
})
```

**🤖 AI-Driven Intelligent Analysis:**
- **Fetches ALL feedback** (resolved and unresolved) from GitHub
- **Cross-references with git history** to see what's been addressed  
- **Analyzes current code state** vs. what comments reference
- **Intelligently determines** what still needs attention vs. what's resolved
- **Documents analysis decisions** in commit messages
- **Focuses work** only on unaddressed concerns

**What it handles:**
- ✅ **General PR comments** from reviewers
- ✅ **Code review feedback** (approved/changes requested)
- ✅ **Review comments** and general feedback
- ✅ **Smart AI analysis** - determines what's been addressed vs. what needs work
- ✅ **Cross-reference with git history** - avoids duplicate work
- ✅ **Updated feature specifications** - handles evolving requirements

### 5. Clean Up

```
feature_cleanup({
  "featureName": "user-dashboard",  // optional
  "force": false,                   // force cleanup even if PR is open
  "all": false                      // clean all features (dangerous)
})
```

**Safely removes:**
- Completed features (merged/closed PRs)
- Specific features by name
- Optionally force cleanup active features

## Claude Code Integration

The MCP server integrates directly with Claude Code through command-line execution:

### How It Works

1. **Command Execution**: Spawns Claude Code process with `claude --dangerously-skip-permissions`
2. **Input Streaming**: Sends comprehensive feature instructions via stdin
3. **Autonomous Operation**: Claude Code works independently in the isolated worktree
4. **Process Management**: MCP server tracks running processes for status monitoring

### Configuration Options

**Environment Variables:**
```bash
# Custom Claude Code command (default: 'claude')
export CLAUDE_COMMAND="/path/to/claude"

# Custom arguments (default: '--dangerously-skip-permissions')
export CLAUDE_ARGS="--dangerously-skip-permissions --debug"
```

**Per-Tool Options:**
```javascript
// Use environment variables to configure Claude Code
// The tools will automatically pick up CLAUDE_COMMAND and CLAUDE_ARGS
feature_start({
  "featureFile": "features/my-feature.md"
})
```

### Prerequisites Verification

Use `verify_setup` to check Claude Code integration:

```javascript
verify_setup({
  "claudeCommand": "claude",  // test specific command
  "verbose": true            // detailed output
})
```

This verifies:
- ✅ Claude Code is installed and accessible
- ✅ Authentication is working
- ✅ Required permissions are available
- ✅ Command responds to basic operations

## AI-Driven Revision Analysis

The `feature_revision` tool uses sophisticated AI analysis to handle PR feedback intelligently:

### **How It Works:**

1. **GitHub CLI Integration**: Uses `gh pr view` and `gh pr review list` for feedback
2. **Context Analysis**: Claude analyzes recent commits and current code state
3. **Smart Filtering**: Determines what feedback has been addressed vs. what needs work
4. **Targeted Implementation**: Only implements changes for unaddressed concerns
5. **Clear Documentation**: Explains analysis decisions in commit messages

### **Example Analysis Process:**

```
Comment #1: "Add error handling to the API call" (RESOLVED)
→ AI Analysis: Recent commit abc123 added try-catch blocks, issue resolved

Comment #2: "Fix mobile responsive layout" (UNRESOLVED) 
→ AI Analysis: No commits mention responsive design, needs implementation

Comment #3: "Improve loading state UX" (UNRESOLVED)
→ AI Analysis: Loading component added but only for desktop, partially addressed

Result: Implements fixes for comments #2 and completes #3
Commit: "fix: complete mobile responsive design (comment #2) and finish loading UX for mobile (comment #3); note: error handling from comment #1 already resolved in commit abc123"
```

### **User Context Examples:**

```javascript
// Priority guidance
feature_revision({
  "featureFile": "features/checkout-flow.md",
  "userContext": "This affects revenue directly. Prioritize security and performance feedback over UI polish."
})

// Technical constraints  
feature_revision({
  "featureFile": "features/admin-panel.md", 
  "userContext": "We're locked to React 16 for this release. Any suggestions requiring React 18 should be noted for future work."
})

// Timeline pressure
feature_revision({
  "featureFile": "features/user-search.md",
  "userContext": "Need to ship by Friday. Focus on critical bugs only, defer enhancement suggestions to next iteration."
})
```

## Feature Specification Template

Create feature specifications using this template:

```markdown
# Feature: User Statistics Dashboard

## Description
Add a user statistics dashboard that shows activity metrics and engagement data.

## Requirements
- Display user activity metrics (posts, comments, likes)
- Show engagement trends over time
- Include user ranking/leaderboard
- Mobile-responsive design

## Acceptance Criteria
- [ ] Dashboard loads within 2 seconds
- [ ] All metrics display correctly
- [ ] Responsive on mobile devices
- [ ] Tests achieve 80%+ coverage

## Technical Notes
- Use existing design system components
- Follow current API patterns in /api/stats
- Integrate with analytics service
- Cache data for 5 minutes

## Example Usage
\`\`\`typescript
// Access via /dashboard/stats
// Component: <UserStatsBoard userId={currentUser.id} />
\`\`\`

## Definition of Done
- [ ] Implementation complete
- [ ] Tests written and passing
- [ ] Code reviewed (via PR)
- [ ] Documentation updated
```

## Complete Workflow Example

```bash
# 1. Verify setup (recommended first step)
verify_setup({
  "verbose": true
})

# 2. Create feature specification
cat > features/user-stats.md << 'EOF'
# Feature: User Statistics Command

## Description
Add a /stats slash command that shows user activity statistics.

## Requirements
- Create /stats slash command
- Show message count, join date, and rank
- Support optional user parameter
- Display in attractive embed format

## Technical Notes
- Follow existing command structure in src/commands/
- Use Discord.js v14 SlashCommandBuilder
EOF

# 3. Start feature development (via Claude)
feature_start({
  "featureFile": "features/user-stats.md"
})

# 4. Monitor progress
feature_status()

# 5. AI-driven revision - automatically analyzes ALL feedback!
feature_revision({
  "featureFile": "features/user-stats.md",
  "userContext": "This is for our gaming community - prioritize performance and rate limiting feedback"
})

# 6. Clean up when done
feature_cleanup({
  "featureName": "user-stats"
})
```

## Revision Workflow Examples

### Fully Automatic Analysis
```javascript
// Claude intelligently processes ALL PR feedback
feature_revision({
  "featureFile": "features/user-dashboard.md"
})

// Behind the scenes:
// ✅ Analyzed 8 PR comments
// ✅ Determined 3 already resolved via git history
// ✅ Implementing remaining 5 unaddressed concerns
// 📝 Documenting analysis in commit messages
```

### Guided Analysis with Context
```javascript
feature_revision({
  "featureFile": "features/payment-flow.md",
  "userContext": "PCI compliance is critical. Security feedback takes priority over UX suggestions.",
  "revisionInstructions": "Also add audit logging as discussed in standup"
})
```

### Emergency Revision Override
```javascript
// Override active development for urgent fixes
feature_revision({
  "featureFile": "features/critical-bug.md",
  "userContext": "Production hotfix needed. Focus only on the memory leak issue.",
  "force": true
})
```

## Parallel Development

Run multiple features simultaneously:

```
// Start multiple features
feature_start({"featureFile": "features/user-dashboard.md"})
feature_start({"featureFile": "features/admin-panel.md"}) 
feature_start({"featureFile": "features/api-logging.md"})

// Check status of all
feature_status()

// AI-driven revisions as feedback comes in
feature_revision({
  "featureFile": "features/user-dashboard.md",
  "userContext": "High visibility feature, prioritize accessibility feedback"
})

feature_revision({
  "featureFile": "features/admin-panel.md", 
  "userContext": "Internal tool, focus on functionality over polish"
})
```

## Troubleshooting

### Common Issues

**1. MCP Server Not Starting**
```bash
# Check if dependencies are installed
npm list @modelcontextprotocol/sdk

# Rebuild if needed
npm run build
```

**2. Git Worktree Errors**
```bash
# Ensure you're in a git repository
git status

# Check git version (needs 2.5+)
git --version
```

**3. GitHub CLI Issues**
```bash
# Check if gh is authenticated
gh auth status

# Login if needed
gh auth login
```

**4. Claude Code Not Found**
```bash
# Check if Claude Code is installed
claude --version

# Install if needed (check Claude documentation)
```

**5. Feature Revision Conflicts**
```bash
# If Claude is still running on a feature
feature_revision({
  "featureFile": "features/my-feature.md",
  "force": true  // Override active development
})
```

**6. No PR Feedback Found**
```bash
# For features without PRs
feature_revision({
  "featureFile": "features/my-feature.md",
  "revisionInstructions": "Add error handling and improve performance"
})
```

**7. AI Analysis Issues**
```bash
# Provide more context to help AI analysis
feature_revision({
  "featureFile": "features/my-feature.md",
  "userContext": "Legacy codebase with technical debt. Focus on critical bugs only, not refactoring suggestions."
})
```

### Debug Mode

Run the MCP server with debug output:

```bash
# For npm installation
DEBUG=mcp* claude-worktree-mcp

# For local development
DEBUG=mcp* npm start
```

## Development

### Local Development Setup

```bash
# Clone and setup
git clone <repo-url>
cd claude-worktree-agent-mcp
npm install

# Development with hot reload
npm run dev

# Build for production
npm run build

# Test the built version
npm start
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Project Structure

```
claude-worktree-agent-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   └── tools/
│       ├── feature-start.ts  # Start feature tool
│       ├── feature-status.ts # Status check tool
│       ├── feature-cleanup.ts # Cleanup tool
│       └── feature-revision.ts # AI-driven revision tool
├── dist/                     # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/your-username/claude-worktree-agent-mcp/issues)
- **Documentation**: This README and inline code comments
- **Claude Code**: [Official Claude Code documentation](https://claude.ai/docs) 