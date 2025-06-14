#!/bin/bash

# Feature Status Script
# Shows active worktrees, PR status, and Claude Code processes

echo "📊 Feature Status"
echo "================"

# Show active features
if [ -d ".worktrees" ] && [ "$(ls -A .worktrees 2>/dev/null)" ]; then
    echo ""
    for feature in .worktrees/*/; do
        if [ -d "$feature" ]; then
            feature_name=$(basename "$feature")
            branch_name="feature/$feature_name"
            
            echo "$feature_name:"
            
            # Check Claude process status (look for process with cwd in this feature directory)
            feature_path=$(realpath "$feature" 2>/dev/null || echo "$feature")
            claude_pid=""
            
            # Find processes that have this feature directory as their working directory
            for pid in $(ps aux | grep -E "(claude|node)" | grep -v grep | awk '{print $2}'); do
                if [ -n "$pid" ]; then
                    cwd=$(lsof -p "$pid" 2>/dev/null | awk '/cwd/ {print $NF}' | head -1)
                    if [ "$cwd" = "$feature_path" ]; then
                        claude_pid="$pid"
                        break
                    fi
                fi
            done
            
            if [ -n "$claude_pid" ]; then
                etime=$(ps -p "$claude_pid" -o etime= 2>/dev/null | tr -d ' ' || echo "unknown")
                echo "- claude running (PID $claude_pid, $etime)"
            else
                echo "- claude not running"
            fi
            
            # Check git status
            cd "$feature" >/dev/null 2>&1
            if ! git diff-index --quiet HEAD -- 2>/dev/null; then
                echo "- git: work in progress"
            elif [ -n "$(git status --porcelain 2>/dev/null)" ]; then
                echo "- git: work in progress"
            else
                echo "- git: committed"
            fi
            
            # Check GitHub PR status and get URL
            if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
                pr_url=$(gh pr list --head "$branch_name" --json url --jq '.[0].url' 2>/dev/null || echo "")
                if [ -n "$pr_url" ] && [ "$pr_url" != "null" ]; then
                    echo "- $pr_url"
                else
                    echo "- PR: none"
                fi
            else
                echo "- PR: none (GitHub CLI not available/authenticated)"
            fi
            
            cd - >/dev/null 2>&1
            echo ""
        fi
    done
else
    echo ""
    echo "No active features"
fi

echo "💡 Commands:"
echo "   ./scripts/start-feature.sh <spec.md>  # Start new feature"
echo "   ./scripts/cleanup-feature.sh <name>   # Remove feature"
echo "   ./scripts/status-features.sh          # Show this status" 