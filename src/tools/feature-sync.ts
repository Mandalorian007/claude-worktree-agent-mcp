import simpleGit from 'simple-git';
import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';

interface FeatureSyncArgs {
  featureName: string;
}

export async function featureSync(args: FeatureSyncArgs) {
  const { featureName } = args;

  // Get project root directory - require PROJECT_ROOT env var for Cursor MCP
  const projectRoot = process.env.PROJECT_ROOT;
  if (!projectRoot) {
    throw new Error('PROJECT_ROOT environment variable not set. This is required for Cursor MCP. Add "env": {"PROJECT_ROOT": "/path/to/your/project"} to your MCP configuration.');
  }

  const worktreePath = path.join(projectRoot, '.worktrees', featureName);
  const branchName = `feature/${featureName}`;

  // Check if worktree exists
  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Feature '${featureName}' not found at '${worktreePath}'. Use feature_start to create the feature first.`);
  }

  const git = simpleGit(projectRoot);
  const worktreeGit = simpleGit(worktreePath);

  try {
    let statusText = `🔄 Syncing feature '${featureName}' to main...\n\n`;

    // 1. Fetch latest main
    statusText += '📥 Fetching latest main...';
    await git.fetch('origin', 'main');
    const mainCommits = await git.log(['main..origin/main']);
    if (mainCommits.total > 0) {
      statusText += ` (${mainCommits.total} new commits)\n`;
    } else {
      statusText += ' (already up to date)\n';
    }

    // Update local main to match origin/main
    await git.checkout('main');
    await git.pull('origin', 'main');

    // Switch to the feature branch in worktree
    await worktreeGit.checkout(branchName);

    // 2. Attempt rebase
    statusText += '🔀 Rebasing ' + featureName + ' onto main...\n';
    
    try {
      await worktreeGit.rebase(['main']);
      statusText += '✅ Rebase completed successfully!\n\n';
      
      // Get updated status
      const status = await worktreeGit.status();
      const log = await worktreeGit.log(['main..HEAD']);
      
      statusText += `📊 **Sync Summary:**\n`;
      statusText += `   Feature branch is now ${log.total} commits ahead of main\n`;
      statusText += `   Working directory: ${status.files.length === 0 ? 'clean' : status.files.length + ' changed files'}\n`;
      
      return {
        content: [
          {
            type: 'text',
            text: statusText,
          },
        ],
      };

    } catch (rebaseError) {
      // Check if there are conflicts
      const status = await worktreeGit.status();
      const conflictedFiles = status.files.filter(file => file.index === 'UU' || file.working_dir === 'U');
      
      if (conflictedFiles.length > 0) {
        statusText += `⚠️  ${conflictedFiles.length} conflicts detected in:\n`;
        conflictedFiles.forEach(file => {
          statusText += `   - ${file.path}\n`;
        });
        
        // Generate conflict resolution instructions
        const conflictInstructions = generateConflictInstructions(conflictedFiles, featureName);
        
        // Save conflict details to file
        const conflictsFilePath = path.join(worktreePath, 'CONFLICTS.md');
        fs.writeFileSync(conflictsFilePath, conflictInstructions);
        
        statusText += `\n🤖 Launching Claude Code for conflict resolution...\n`;
        
        // Launch Claude Code for conflict resolution
        const claudeCommand = process.env.CLAUDE_COMMAND || 'claude';
        const claudeArgs = process.env.CLAUDE_ARGS ? process.env.CLAUDE_ARGS.split(' ') : ['--dangerously-skip-permissions'];
        
        try {
          const claudeProcess = execa(claudeCommand, claudeArgs, {
            input: conflictInstructions,
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: worktreePath,
            timeout: 300000 // 5 minute timeout
          });

          const { stdout: claudeOutput } = await claudeProcess;
          
          // Check if Claude Code resolved the conflicts
          const postStatus = await worktreeGit.status();
          const remainingConflicts = postStatus.files.filter(file => file.index === 'UU' || file.working_dir === 'U');
          
          if (remainingConflicts.length === 0) {
            // Continue the rebase
            await worktreeGit.rebase(['--continue']);
            statusText += '✅ Claude Code resolved conflicts (main-first strategy)\n';
            statusText += '✅ Feature synced successfully!\n\n';
            
            const finalLog = await worktreeGit.log(['main..HEAD']);
            statusText += `Your branch is now ${finalLog.total} commits ahead of main.\n`;
            
            return {
              content: [
                {
                  type: 'text',
                  text: statusText,
                },
              ],
            };
          } else {
            throw new Error('Claude Code could not resolve all conflicts');
          }
          
        } catch (claudeError) {
          // Abort the rebase to clean state
          try {
            await worktreeGit.rebase(['--abort']);
          } catch {
            // Ignore abort errors
          }
          
          statusText += '🤖 Claude Code could not complete conflict resolution\n';
          statusText += `📋 Conflict details saved to ${conflictsFilePath}\n\n`;
          statusText += 'Next steps: Review conflicts manually, then run feature_sync again\n';
          
          return {
            content: [
              {
                type: 'text',
                text: statusText,
              },
            ],
          };
        }
        
      } else {
        // Some other rebase error
        try {
          await worktreeGit.rebase(['--abort']);
        } catch {
          // Ignore abort errors
        }
        throw new Error(`Rebase failed: ${rebaseError instanceof Error ? rebaseError.message : String(rebaseError)}`);
      }
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to sync feature '${featureName}': ${errorMessage}`);
  }
}

function generateConflictInstructions(conflictedFiles: any[], featureName: string): string {
  return `# Conflict Resolution Instructions

You are helping resolve merge conflicts during a feature sync operation.

## Context
- **Feature:** ${featureName}
- **Operation:** Syncing feature branch with latest main
- **Strategy:** Main-first (prioritize main branch changes when in doubt)

## Conflicted Files
${conflictedFiles.map(file => `- ${file.path}`).join('\n')}

## Your Task
1. **Analyze each conflict** - understand what changed in both main and feature branches
2. **Resolve conflicts using main-first strategy:**
   - When in doubt, prefer main branch changes
   - Keep feature-specific additions that don't conflict with main's intent
   - Ensure the final result maintains feature functionality while respecting main changes
3. **Test the resolution** - make sure the code still works after resolution
4. **Complete the merge** - stage resolved files and continue the rebase

## Resolution Guidelines
- **Main wins on style/structure changes** - follow main's patterns
- **Feature wins on new functionality** - keep feature additions that don't conflict
- **Integration first** - ensure changes work together harmoniously
- **Preserve intent** - understand what each side was trying to achieve

## Commands to run after resolution:
\`\`\`bash
git add .
git rebase --continue
\`\`\`

## Important Notes
- The rebase is currently in progress - you need to resolve conflicts and continue
- Focus on maintaining both the feature functionality and main branch stability
- When resolved, the feature will be cleanly rebased onto the latest main

Work systematically through each conflict. Main branch changes take priority when there's ambiguity.
`;
}

export default featureSync;