import simpleGit from 'simple-git';
import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';

interface FeatureSyncArgs {
  featureName: string;
}

/**
 * Check if a git repository is currently in a rebase state
 * This is done by checking for the existence of .git/rebase-merge or .git/rebase-apply directories
 */
function isRebaseInProgress(repositoryPath: string): boolean {
  try {
    const gitDir = path.join(repositoryPath, '.git');
    const rebaseMergePath = path.join(gitDir, 'rebase-merge');
    const rebaseApplyPath = path.join(gitDir, 'rebase-apply');
    
    return fs.existsSync(rebaseMergePath) || fs.existsSync(rebaseApplyPath);
  } catch {
    return false;
  }
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
    throw new Error(`Feature '${featureName}' does not exist at '${worktreePath}'. Use feature_start to create it first.`);
  }

  const git = simpleGit(worktreePath);
  const mainGit = simpleGit(projectRoot);

  try {
    // Ensure we're in a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new Error('Worktree directory is not a git repository.');
    }

    // Get current branch name
    const status = await git.status();
    const currentBranch = status.current || branchName;

    console.log(`🔄 Syncing feature '${featureName}' to main...`);

    // Step 1: Fetch latest main
    console.log('📥 Fetching latest main...');
    await mainGit.fetch('origin', 'main');
    
    // Check how many commits behind main we are
    const mainCommits = await mainGit.log(['origin/main', '--oneline', '-10']);
    const featureLog = await git.log([currentBranch, '--oneline', '-10']);
    
    console.log(`📥 Fetching latest main (${mainCommits.total} commits on main)`);

    // Step 2: Switch to feature branch and attempt rebase
    console.log(`🔀 Rebasing ${currentBranch} onto main...`);
    
    try {
      // First, make sure we're on the feature branch
      await git.checkout(currentBranch);
      
      // Attempt the rebase
      await git.rebase(['origin/main']);
      
      // If we get here, rebase was successful
      const updatedLog = await git.log([currentBranch, '--oneline', '-5']);
      const aheadCount = await git.raw(['rev-list', '--count', `origin/main..${currentBranch}`]);
      
      return {
        content: [
          {
            type: 'text',
            text: `✅ Feature synced successfully!

🔄 **Sync Summary:**
- Branch: ${currentBranch}
- Rebased onto: origin/main
- Status: Clean rebase (no conflicts)

📊 **Current Status:**
- Your branch is now ${aheadCount.trim()} commits ahead of main
- Latest commits on feature:
${updatedLog.all.slice(0, 3).map(commit => `  • ${commit.hash.substring(0, 7)} ${commit.message}`).join('\n')}

✨ Ready for PR creation: \`gh pr create --fill\``,
          },
        ],
      };

    } catch (rebaseError: any) {
      // Check if this is a conflict error
      const statusAfterError = await git.status();
      const conflictedFiles = statusAfterError.conflicted;
      
      if (conflictedFiles.length > 0) {
        console.log(`⚠️  ${conflictedFiles.length} conflicts detected in ${conflictedFiles.map(f => path.basename(f)).join(', ')}`);
        
        // Step 3: Use Claude Code for conflict resolution
        return await resolveConflictsWithClaude(
          worktreePath, 
          conflictedFiles, 
          featureName, 
          currentBranch
        );
      } else {
        // Some other rebase error
        throw new Error(`Rebase failed: ${rebaseError.message}`);
      }
    }

  } catch (error: unknown) {
    // If we're in the middle of a rebase, abort it
    try {
      if (isRebaseInProgress(worktreePath)) {
        await git.rebase(['--abort']);
        console.log('🔙 Rebase aborted due to error');
      }
    } catch {
      // Ignore abort errors
    }
    
    throw error;
  }
}

async function resolveConflictsWithClaude(
  worktreePath: string,
  conflictedFiles: string[],
  featureName: string,
  branchName: string
): Promise<any> {
  
  console.log('🤖 Launching Claude Code for conflict resolution...');

  // Create detailed conflict analysis
  const conflictAnalysis = await generateConflictAnalysis(worktreePath, conflictedFiles);
  
  // Create conflict resolution instructions
  const instructions = `CONFLICT RESOLUTION TASK

## Situation
You are in a git rebase of feature branch '${branchName}' onto main. There are ${conflictedFiles.length} files with merge conflicts that need resolution.

## Conflicted Files
${conflictedFiles.map(file => `- ${file}`).join('\n')}

## Resolution Strategy: MAIN-FIRST
When resolving conflicts, prioritize changes from the main branch to prevent regressions:
1. **Main branch changes take precedence** - Keep main's structure, logic, and APIs
2. **Integrate feature changes carefully** - Add your feature functionality without breaking main's improvements  
3. **Preserve both when possible** - Look for ways to merge both sets of changes intelligently
4. **Test thoroughly** - Ensure the resolution doesn't break existing functionality

## Your Task
1. **Examine each conflicted file** using your tools
2. **Understand the conflicts** - What changed in main vs your feature?
3. **Resolve conflicts following main-first strategy**
4. **Stage the resolved files** with git add
5. **Continue the rebase** with git rebase --continue
6. **Commit with a clear message** describing the conflict resolution

## Conflict Analysis
${conflictAnalysis}

## Important Notes
- You are currently in the middle of a git rebase
- DO NOT abort the rebase unless absolutely necessary  
- After resolving conflicts, use: git rebase --continue
- If you encounter issues, you can use: git rebase --abort (as last resort)

Resolve the conflicts now, prioritizing main branch changes while preserving your feature functionality.`;

  // Start Claude Code with conflict resolution instructions
  const claudeCommand = process.env.CLAUDE_COMMAND || 'claude';
  const claudeArgs = process.env.CLAUDE_ARGS ? process.env.CLAUDE_ARGS.split(' ') : ['--dangerously-skip-permissions'];
  
  try {
    // Save conflict analysis to file for Claude to reference
    const conflictsFilePath = path.join(worktreePath, 'CONFLICTS.md');
    fs.writeFileSync(conflictsFilePath, `# Conflict Resolution Context\n\n${conflictAnalysis}`);
    
    const claudeProcess = await execa(claudeCommand, claudeArgs, {
      input: instructions,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: worktreePath,
      timeout: 300000 // 5 minute timeout for conflict resolution
    });

    // Check if rebase was completed successfully
    const git = simpleGit(worktreePath);
    const finalStatus = await git.status();
    
    if (!isRebaseInProgress(worktreePath) && finalStatus.conflicted.length === 0) {
      // Success! Claude resolved the conflicts and continued the rebase
      const aheadCount = await git.raw(['rev-list', '--count', `origin/main..${branchName}`]);
      
      // Clean up the conflicts file
      if (fs.existsSync(conflictsFilePath)) {
        fs.unlinkSync(conflictsFilePath);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `✅ Claude Code resolved conflicts successfully!

🤖 **Conflict Resolution Summary:**
- Files resolved: ${conflictedFiles.length}
- Strategy: Main-first (main branch changes prioritized)
- Resolution: Automatic via Claude Code

📊 **Current Status:**
- Rebase completed successfully
- Your branch is now ${aheadCount.trim()} commits ahead of main
- Ready for PR creation: \`gh pr create --fill\`

🎉 Feature '${featureName}' synced successfully!`,
          },
        ],
      };
    } else {
      // Claude Code couldn't complete the resolution
      return {
        content: [
          {
            type: 'text',
            text: `⚠️  Conflicts detected in ${conflictedFiles.map(f => path.basename(f)).join(', ')}
🤖 Claude Code could not complete conflict resolution automatically
📋 Conflict details saved to ${conflictsFilePath}

**Manual Resolution Required:**
1. Navigate to: ${worktreePath}
2. Review conflicts in: ${conflictedFiles.join(', ')}
3. Resolve conflicts manually (prioritize main branch changes)
4. Stage resolved files: \`git add <files>\`
5. Continue rebase: \`git rebase --continue\`
6. Or run feature_sync again to retry with Claude Code

**Next Steps:** Review conflicts manually, then run feature_sync again to complete the sync.`,
          },
        ],
      };
    }

  } catch (claudeError: any) {
    // Claude Code failed, provide manual resolution guidance
    const conflictsFilePath = path.join(worktreePath, 'CONFLICTS.md');
    const conflictDetails = await generateConflictAnalysis(worktreePath, conflictedFiles);
    fs.writeFileSync(conflictsFilePath, `# Manual Conflict Resolution Guide\n\n${conflictDetails}\n\n## Resolution Steps\n1. Examine each conflicted file\n2. Resolve conflicts (prioritize main branch changes)\n3. Stage files: git add <files>\n4. Continue: git rebase --continue`);
    
    return {
      content: [
        {
          type: 'text',
          text: `⚠️  Conflicts detected in ${conflictedFiles.map(f => path.basename(f)).join(', ')}
🤖 Claude Code encountered an error during conflict resolution
📋 Conflict details saved to ${conflictsFilePath}

**Error:** ${claudeError.message || 'Unknown error during conflict resolution'}

**Manual Resolution Required:**
1. Navigate to: ${worktreePath}
2. Review conflicts in: ${conflictedFiles.join(', ')}
3. Resolve conflicts manually (prioritize main branch changes)
4. Stage resolved files: \`git add <files>\`
5. Continue rebase: \`git rebase --continue\`

**Next Steps:** Review conflicts manually, then run feature_sync again to retry.`,
        },
      ],
    };
  }
}

async function generateConflictAnalysis(worktreePath: string, conflictedFiles: string[]): Promise<string> {
  const git = simpleGit(worktreePath);
  let analysis = '';
  
  for (const file of conflictedFiles) {
    try {
      const filePath = path.join(worktreePath, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const conflictSections = content.split(/<<<<<<< HEAD|=======|>>>>>>> [a-f0-9]+/);
        
        analysis += `\n## ${file}\n`;
        analysis += `- File has merge conflicts\n`;
        analysis += `- Sections to resolve: ${Math.floor(conflictSections.length / 3)}\n`;
        
        // Try to get some context about what changed
        try {
          const diffStat = await git.diff(['--stat', 'origin/main...HEAD', '--', file]);
          if (diffStat) {
            analysis += `- Changes: ${diffStat.trim()}\n`;
          }
        } catch {
          // Ignore diff errors
        }
      }
    } catch (error) {
      analysis += `\n## ${file}\n- Error analyzing file: ${error}\n`;
    }
  }
  
  return analysis;
}