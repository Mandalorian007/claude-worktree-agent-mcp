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

  // Validate worktree exists
  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Feature '${featureName}' not found. Expected worktree at '${worktreePath}'. Use feature_start to create it first.`);
  }

  const git = simpleGit(worktreePath);
  const mainGit = simpleGit(projectRoot);

  try {
    // Ensure we're in a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new Error('Not in a git repository. Please run this command from your project root.');
    }

    let status = '🔄 Syncing feature \'' + featureName + '\' to main...\n';

    // Step 1: Fetch latest main
    status += '📥 Fetching latest main...';
    await mainGit.fetch('origin', 'main');
    const mainCommits = await mainGit.log(['main..origin/main']);
    const newCommitCount = mainCommits.all.length;
    status += ` (${newCommitCount} new commits)\n`;

    // Step 2: Switch to main and pull latest
    await mainGit.checkout('main');
    await mainGit.pull('origin', 'main');

    // Step 3: Switch to feature branch and attempt rebase
    await git.checkout(branchName);
    status += '🔀 Rebasing ' + featureName + ' onto main...\n';

    try {
      // Attempt the rebase
      await git.rebase(['main']);
      
      // If we get here, rebase was successful
      const branchStatus = await git.status();
      const aheadBy = branchStatus.ahead || 0;
      
      status += '✅ Feature synced successfully!\n\n';
      status += `Your branch is now ${aheadBy} commits ahead of main.`;

      return {
        content: [
          {
            type: 'text',
            text: status,
          },
        ],
      };

    } catch (rebaseError) {
      // Rebase failed, likely due to conflicts
      const gitStatus = await git.status();
      const conflictedFiles = gitStatus.conflicted;

      if (conflictedFiles.length > 0) {
        status += `⚠️  ${conflictedFiles.length} conflicts detected in ${conflictedFiles.join(', ')}\n`;
        status += '🤖 Launching Claude Code for conflict resolution...\n';

        // Generate conflict analysis
        const conflictAnalysis = await generateConflictAnalysis(git, conflictedFiles);
        
        // Create conflict resolution instructions
        const instructions = `I need you to resolve merge conflicts that occurred during a feature sync.

## Context
- Feature branch: ${branchName}
- Syncing with: main branch
- Conflicts detected in: ${conflictedFiles.join(', ')}

## Conflict Resolution Strategy
**IMPORTANT: Prioritize main branch changes when in doubt**

${conflictAnalysis}

## Your Task
1. **Analyze each conflict** - understand what changed in both branches
2. **Resolve conflicts** following the main-first strategy:
   - Keep main branch changes when there are conflicting business logic changes
   - Preserve feature functionality that doesn't conflict with main
   - Ensure the merged code is functional and follows existing patterns
3. **Stage resolved files** using git add
4. **Continue the rebase** with git rebase --continue
5. **Verify the resolution** by running any available tests

## Resolution Priority
1. Main branch changes take precedence for core functionality
2. Feature changes should be adapted to work with main changes
3. Ensure no functionality is broken in the final result

Work systematically through each conflict. When complete, the rebase should finish successfully.`;

        try {
          // Launch Claude Code for conflict resolution
          const claudeCommand = process.env.CLAUDE_COMMAND || 'claude';
          const claudeArgs = process.env.CLAUDE_ARGS ? process.env.CLAUDE_ARGS.split(' ') : ['--dangerously-skip-permissions'];
          
          const claudeProcess = await execa(claudeCommand, claudeArgs, {
            input: instructions,
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: worktreePath
          });

          // Check if Claude Code succeeded
          const finalStatus = await git.status();
          if (finalStatus.conflicted.length === 0) {
            // Conflicts resolved successfully
            status += '✅ Claude Code resolved conflicts (main-first strategy)\n';
            status += '✅ Feature synced successfully!\n\n';
            
            const branchStatus = await git.status();
            const aheadBy = branchStatus.ahead || 0;
            status += `Your branch is now ${aheadBy} commits ahead of main.`;

            return {
              content: [
                {
                  type: 'text',
                  text: status,
                },
              ],
            };
          } else {
            // Claude Code couldn't resolve conflicts
            throw new Error('Claude Code could not complete conflict resolution');
          }

        } catch (claudeError) {
          // Save conflict details for manual intervention
          const conflictDetails = await generateConflictReport(git, conflictedFiles);
          fs.writeFileSync(path.join(worktreePath, 'CONFLICTS.md'), conflictDetails);

          status += '🤖 Claude Code could not complete conflict resolution\n';
          status += '📋 Conflict details saved to .worktrees/' + featureName + '/CONFLICTS.md\n\n';
          status += 'Next steps: Review conflicts manually, then run feature_sync again';

          return {
            content: [
              {
                type: 'text',
                text: status,
              },
            ],
          };
        }
      } else {
        // Rebase failed for other reasons
        throw new Error(`Rebase failed: ${rebaseError instanceof Error ? rebaseError.message : String(rebaseError)}`);
      }
    }

  } catch (error: unknown) {
    // Abort any ongoing rebase
    try {
      await git.rebase(['--abort']);
    } catch {
      // Ignore abort errors
    }
    
    throw error;
  }
}

async function generateConflictAnalysis(git: any, conflictedFiles: string[]): Promise<string> {
  let analysis = '## Conflict Analysis\n\n';
  
  for (const file of conflictedFiles) {
    try {
      const fileContent = fs.readFileSync(file, 'utf-8');
      const conflictSections = fileContent.split('<<<<<<< HEAD').length - 1;
      
      analysis += `### ${file}\n`;
      analysis += `- ${conflictSections} conflict section(s) detected\n`;
      analysis += `- Review the <<<<<<< HEAD and >>>>>>> main markers\n`;
      analysis += `- HEAD contains your feature changes\n`;
      analysis += `- main contains the latest main branch changes\n\n`;
    } catch (error) {
      analysis += `### ${file}\n`;
      analysis += `- Could not analyze file: ${error instanceof Error ? error.message : String(error)}\n\n`;
    }
  }
  
  return analysis;
}

async function generateConflictReport(git: any, conflictedFiles: string[]): Promise<string> {
  let report = '# Conflict Resolution Required\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += '## Conflicted Files\n\n';
  
  for (const file of conflictedFiles) {
    report += `- ${file}\n`;
  }
  
  report += '\n## Resolution Steps\n\n';
  report += '1. Open each conflicted file\n';
  report += '2. Look for conflict markers: `<<<<<<<`, `=======`, `>>>>>>>`\n';
  report += '3. Resolve conflicts prioritizing main branch changes\n';
  report += '4. Remove conflict markers\n';
  report += '5. Stage resolved files: `git add <file>`\n';
  report += '6. Continue rebase: `git rebase --continue`\n';
  report += '7. Run feature_sync again to verify\n\n';
  report += '## Strategy\n\n';
  report += '- **Main branch wins**: When business logic conflicts, prefer main branch changes\n';
  report += '- **Adapt feature**: Modify feature code to work with main changes\n';
  report += '- **Test thoroughly**: Ensure merged code functions correctly\n';
  
  return report;
}