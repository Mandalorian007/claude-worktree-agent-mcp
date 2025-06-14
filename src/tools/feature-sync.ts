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

  // Validate that the feature worktree exists
  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Feature '${featureName}' not found. Worktree directory does not exist at '${worktreePath}'`);
  }

  const mainGit = simpleGit(projectRoot);
  const featureGit = simpleGit(worktreePath);

  try {
    // Ensure we're in a git repository
    const isRepo = await mainGit.checkIsRepo();
    if (!isRepo) {
      throw new Error('Not in a git repository. Please run this command from your project root.');
    }

    // Check if the feature branch exists
    const branches = await mainGit.branchLocal();
    if (!branches.all.includes(branchName)) {
      throw new Error(`Feature branch '${branchName}' not found. Please ensure the feature was created properly.`);
    }

    let statusMessage = `🔄 Syncing feature '${featureName}' to main...\n`;

    // Step 1: Fetch latest main
    statusMessage += '📥 Fetching latest main...';
    await mainGit.fetch('origin', 'main');
    
    // Get the number of new commits
    const beforeLog = await mainGit.log({ from: 'main', to: 'origin/main' });
    const newCommitsCount = beforeLog.total;
    
    if (newCommitsCount > 0) {
      statusMessage += ` (${newCommitsCount} new commits)\n`;
    } else {
      statusMessage += ' (up to date)\n';
    }

    // Update local main branch
    await mainGit.checkout('main');
    await mainGit.pull('origin', 'main');

    // Step 2: Switch to feature branch and attempt rebase
    statusMessage += `🔀 Rebasing ${branchName} onto main...\n`;
    
    // Switch to feature branch in the worktree
    await featureGit.checkout(branchName);
    
    try {
      // Attempt rebase
      await featureGit.rebase(['main']);
      statusMessage += '✅ Feature synced successfully!\n\n';
      
      // Get ahead/behind status
      const aheadBehind = await featureGit.raw(['rev-list', '--left-right', '--count', 'main...HEAD']);
      const [behind, ahead] = aheadBehind.trim().split('\t').map(Number);
      
      if (ahead > 0) {
        statusMessage += `Your branch is now ${ahead} commit${ahead === 1 ? '' : 's'} ahead of main.`;
      } else {
        statusMessage += 'Your branch is up to date with main.';
      }

      return {
        content: [
          {
            type: 'text',
            text: statusMessage,
          },
        ],
      };

    } catch (rebaseError) {
      // Step 3: Handle conflicts with Claude Code
      const status = await featureGit.status();
      const conflictedFiles = status.conflicted;

      if (conflictedFiles.length > 0) {
        statusMessage += `⚠️  ${conflictedFiles.length} conflict${conflictedFiles.length === 1 ? '' : 's'} detected in:\n`;
        conflictedFiles.forEach(file => {
          statusMessage += `   - ${file}\n`;
        });

        statusMessage += '🤖 Launching Claude Code for conflict resolution...\n';

        // Create conflict resolution instructions
        const conflictInstructions = createConflictResolutionInstructions(featureName, conflictedFiles);

        // Launch Claude Code for conflict resolution
        const claudeCommand = process.env.CLAUDE_COMMAND || 'claude';
        const claudeArgs = process.env.CLAUDE_ARGS ? process.env.CLAUDE_ARGS.split(' ') : ['--dangerously-skip-permissions'];

        try {
          const claudeProcess = await execa(claudeCommand, claudeArgs, {
            input: conflictInstructions,
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: worktreePath,
            timeout: 300000, // 5 minute timeout
          });

          // Check if Claude Code succeeded
          const finalStatus = await featureGit.status();
          if (finalStatus.conflicted.length === 0) {
            // Conflicts resolved, continue rebase
            await featureGit.rebase(['--continue']);
            statusMessage += '✅ Claude Code resolved conflicts (main-first strategy)\n';
            statusMessage += '✅ Feature synced successfully!\n\n';
            
            // Get ahead/behind status
            const aheadBehind = await featureGit.raw(['rev-list', '--left-right', '--count', 'main...HEAD']);
            const [behind, ahead] = aheadBehind.trim().split('\t').map(Number);
            
            if (ahead > 0) {
              statusMessage += `Your branch is now ${ahead} commit${ahead === 1 ? '' : 's'} ahead of main.`;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: statusMessage,
                },
              ],
            };
          } else {
            throw new Error('Claude Code could not resolve all conflicts');
          }

        } catch (claudeError) {
          // Claude Code failed, abort rebase and provide manual instructions
          await featureGit.rebase(['--abort']);
          
          // Create detailed conflict summary
          const conflictDetails = await createConflictSummary(featureGit, conflictedFiles);
          const conflictFilePath = path.join(worktreePath, 'CONFLICTS.md');
          fs.writeFileSync(conflictFilePath, conflictDetails);

          statusMessage += '🤖 Claude Code could not complete conflict resolution\n';
          statusMessage += `📋 Conflict details saved to ${conflictFilePath}\n\n`;
          statusMessage += 'Next steps: Review conflicts manually, then run feature_sync again';

          return {
            content: [
              {
                type: 'text',
                text: statusMessage,
              },
            ],
          };
        }

      } else {
        // Non-conflict rebase error
        throw new Error(`Rebase failed: ${rebaseError instanceof Error ? rebaseError.message : String(rebaseError)}`);
      }
    }

  } catch (error: unknown) {
    // Ensure we abort any ongoing rebase
    try {
      await featureGit.rebase(['--abort']);
    } catch {
      // Ignore abort errors
    }
    
    throw error;
  }
}

function createConflictResolutionInstructions(featureName: string, conflictedFiles: string[]): string {
  return `🔄 CONFLICT RESOLUTION TASK

You are helping resolve merge conflicts during a feature sync operation.

## Context
- Feature: ${featureName}
- Operation: Rebasing feature branch onto latest main
- Conflicts detected in: ${conflictedFiles.join(', ')}

## Your Task
Resolve the merge conflicts following these principles:

### Resolution Strategy: MAIN-FIRST
1. **Prioritize main branch changes** - When in doubt, keep main's version
2. **Preserve feature functionality** - Only keep feature changes that don't conflict with main's intent
3. **Maintain code quality** - Ensure the resolved code follows project patterns
4. **Test compatibility** - Make sure resolved code won't break existing functionality

### Step-by-Step Process
1. **Examine each conflicted file** - Understand what changed in both branches
2. **Apply main-first resolution** - Resolve conflicts favoring main branch changes
3. **Validate the resolution** - Ensure code compiles and follows project patterns
4. **Stage the resolved files** - Use git add for each resolved file
5. **Continue the rebase** - Run \`git rebase --continue\` when all conflicts are resolved

### Conflict Markers
Look for these patterns in conflicted files:
\`\`\`
<<<<<<< HEAD
// Feature branch changes
=======
// Main branch changes (PREFER THIS)
>>>>>>> main
\`\`\`

### Important Notes
- **DO NOT** create new functionality during conflict resolution
- **DO NOT** remove main branch features to resolve conflicts
- **DO** preserve the intent of main branch changes
- **DO** ensure resolved code maintains existing patterns

After resolving all conflicts, the rebase will continue automatically.

Ready to resolve conflicts with main-first priority!`;
}

async function createConflictSummary(git: any, conflictedFiles: string[]): Promise<string> {
  let summary = `# Conflict Resolution Summary\n\n`;
  summary += `Generated: ${new Date().toISOString()}\n\n`;
  summary += `## Conflicted Files\n\n`;

  for (const file of conflictedFiles) {
    summary += `### ${file}\n\n`;
    
    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      const conflictSections = content.split('<<<<<<< HEAD');
      
      if (conflictSections.length > 1) {
        summary += `**Conflicts found:** ${conflictSections.length - 1}\n\n`;
        summary += `\`\`\`\n${content}\`\`\`\n\n`;
      }
    } catch (error) {
      summary += `Error reading file: ${error instanceof Error ? error.message : String(error)}\n\n`;
    }
  }

  summary += `## Resolution Instructions\n\n`;
  summary += `1. Open each conflicted file\n`;
  summary += `2. Look for conflict markers: \`<<<<<<< HEAD\`, \`=======\`, \`>>>>>>> main\`\n`;
  summary += `3. Resolve conflicts using main-first strategy\n`;
  summary += `4. Remove conflict markers\n`;
  summary += `5. Stage resolved files: \`git add <file>\`\n`;
  summary += `6. Continue rebase: \`git rebase --continue\`\n`;
  summary += `7. Run \`feature_sync\` again to complete the sync\n\n`;

  return summary;
}

export default featureSync;