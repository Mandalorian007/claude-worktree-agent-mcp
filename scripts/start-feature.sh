#!/bin/bash

# Feature Development Script
# Usage: ./start-feature.sh <feature-file.md>

set -e

# Check if feature file is provided
if [ $# -eq 0 ]; then
    echo "❌ Usage: $0 <feature-file.md>"
    echo "   Example: $0 specs/feature-sync-tool.md"
    exit 1
fi

FEATURE_FILE="$1"

# Check if feature file exists
if [ ! -f "$FEATURE_FILE" ]; then
    echo "❌ Feature file '$FEATURE_FILE' not found"
    exit 1
fi

# Extract feature name from file path
FEATURE_NAME=$(basename "$FEATURE_FILE" .md | tr '[:upper:]' '[:lower:]' | sed 's/[^a-zA-Z0-9-]/-/g')
BRANCH_NAME="feature/$FEATURE_NAME"
WORKTREE_PATH=".worktrees/$FEATURE_NAME"

echo "🚀 Starting feature development..."
echo "📄 Feature file: $FEATURE_FILE"
echo "🌿 Branch: $BRANCH_NAME"
echo "📁 Worktree: $WORKTREE_PATH"

# Check if feature already exists (worktree or branch)
feature_exists=false

if [ -d "$WORKTREE_PATH" ]; then
    echo "❌ Worktree '$WORKTREE_PATH' already exists"
    feature_exists=true
fi

if git show-ref --verify --quiet refs/heads/$BRANCH_NAME; then
    echo "❌ Branch '$BRANCH_NAME' already exists"
    feature_exists=true
fi

if [ "$feature_exists" = true ]; then
    echo "💡 Clean up first: ./scripts/cleanup-feature.sh $FEATURE_NAME"
    exit 1
fi

# Create worktree directory
mkdir -p $(dirname "$WORKTREE_PATH")

# Create worktree and branch in one command
echo "🔧 Creating worktree and branch..."
if ! git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" 2>/dev/null; then
    echo "❌ Failed to create worktree and branch"
    echo "💡 Try running: ./scripts/cleanup-feature.sh $FEATURE_NAME"
    echo "💡 Then retry this command"
    exit 1
fi

# Copy feature file to worktree for easy access
echo "📋 Setting up feature specification..."
cp "$FEATURE_FILE" "$WORKTREE_PATH/FEATURE.md"

# Also copy with original path/name in case someone is iterating on the spec
ORIGINAL_DIR=$(dirname "$FEATURE_FILE")
if [ "$ORIGINAL_DIR" != "." ]; then
    echo "📋 Preserving original feature file location..."
    mkdir -p "$WORKTREE_PATH/$ORIGINAL_DIR"
    cp "$FEATURE_FILE" "$WORKTREE_PATH/$FEATURE_FILE"
fi

# Create comprehensive instructions for Claude Code
INSTRUCTIONS="I need you to implement the feature described in FEATURE.md.

## Development Environment
- Isolated git worktree: $WORKTREE_PATH
- Working on branch: $BRANCH_NAME
- Base branch: main

## Your Task
1. **Read FEATURE.md carefully** - understand all requirements and acceptance criteria
2. **Analyze the existing codebase** - understand the project structure and patterns
3. **Implement the feature** following existing conventions and best practices
4. **Write tests** if the project has a testing setup
5. **Commit your work** with clear, descriptive commit messages
6. **Create a Pull Request** when ready: \`gh pr create --fill\`

## Guidelines
- Follow the existing code style and patterns
- Add proper error handling and validation
- Include TypeScript types if this is a TypeScript project
- Update documentation if needed
- Test your implementation thoroughly

Work autonomously and systematically. The feature specification in FEATURE.md is your primary guide.

Ready to begin implementation!"

# Change to worktree directory
cd "$WORKTREE_PATH"

echo "✅ Environment ready!"
echo ""
echo "🖥️  Opening Claude Code in interactive mode..."
echo "📍 Working directory: $(pwd)"
echo ""

# Launch Claude Code with context and instructions
echo "$INSTRUCTIONS" | claude --dangerously-skip-permissions FEATURE.md

echo ""
echo "🎉 Feature development session complete!"
echo "📁 Worktree: $WORKTREE_PATH"
echo "🌿 Branch: $BRANCH_NAME" 