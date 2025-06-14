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
    throw new Error(`Feature worktree '${featureName}' not found at '${worktreePath}'. Use feature_start to create it first.`);
  }

  const git = simpleGit(worktreePath);
  const mainGit = simpleGit(projectRoot);

  // Ensure we're in a git repository
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error('Not in a git repository.');
  }

  console.log(`🔄 Syncing feature '${featureName}' to main...`);

  // Step 1: Fetch latest main
  await mainGit.fetch(['origin', 'main']);
  const mainStatus = await mainGit.status(['main']);
  console.log(`📥 Fetching latest main (${mainStatus.ahead} commits ahead)`);

  // Step 2: Switch to feature branch and attempt rebase
  await git.checkout(branchName);
  console.log(`🔀 Rebasing ${branchName} onto main...`);

  let conflicts: string[] = [];
  try {
    await git.rebase(['main']);
    console.log('✅ Feature synced successfully! No conflicts detected.');
    
    const status = await git.status();
    const aheadCount = status.ahead || 0;
    
    return {
      content: [
        {
          type: 'text',
          text: `✅ Feature '${featureName}' synced successfully!

🔄 **Sync Complete**
📥 Fetched latest main commits
🔀 Rebased feature branch onto main
✅ No conflicts detected

Your branch is now ${aheadCount} commits ahead of main.

💡 Ready to create a Pull Request: \`gh pr create --fill\``,
        },
      ],
    };
  } catch (rebaseError) {
    // Check for conflicts
    const status = await git.status();
    conflicts = status.conflicted || [];
    
    if (conflicts.length === 0) {
      // Non-conflict rebase error
      throw new Error(`Feature sync failed: ${rebaseError instanceof Error ? rebaseError.message : String(rebaseError)}`);
    }

    console.log(`⚠️  ${conflicts.length} conflicts detected in ${conflicts.join(', ')}`);
    console.log('🤖 Launching Claude Code for conflict resolution...');

    // Step 3: Launch Claude Code for conflict resolution
    const conflictAnalysis = await analyzeConflicts(git, conflicts);
    const resolutionInstructions = createResolutionInstructions(conflicts, conflictAnalysis);

    // Launch Claude Code with conflict resolution task
    const claudeCommand = process.env.CLAUDE_COMMAND || 'claude';
    const claudeArgs = process.env.CLAUDE_ARGS ? process.env.CLAUDE_ARGS.split(' ') : ['--dangerously-skip-permissions'];

    try {
      const claudeProcess = await execa(claudeCommand, claudeArgs, {
        input: resolutionInstructions,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: worktreePath,
        timeout: 300000, // 5 minute timeout
      });

      console.log('✅ Claude Code resolved conflicts (main-first strategy)');

      // Continue the rebase
      await git.rebase(['--continue']);
      
      const finalStatus = await git.status();
      const aheadCount = finalStatus.ahead || 0;

      return {
        content: [
          {
            type: 'text',
            text: `✅ Feature '${featureName}' synced successfully!

🔄 **Sync Complete with Conflict Resolution**
📥 Fetched latest main commits
🔀 Rebased feature branch onto main
⚠️  ${conflicts.length} conflicts detected in ${conflicts.join(', ')}
🤖 Claude Code resolved conflicts (main-first strategy)
✅ Rebase completed successfully

Your branch is now ${aheadCount} commits ahead of main.

💡 Ready to create a Pull Request: \`gh pr create --fill\``,
          },
        ],
      };
    } catch (claudeError) {
      // Claude Code failed to resolve conflicts
      console.log('🤖 Claude Code could not complete conflict resolution');
      
      // Save conflict details for manual intervention
      const conflictDetails = await generateConflictSummary(git, conflicts, conflictAnalysis);
      fs.writeFileSync(path.join(worktreePath, 'CONFLICTS.md'), conflictDetails);

      // Abort the rebase to return to clean state
      await git.rebase(['--abort']);

      return {
        content: [
          {
            type: 'text',
            text: `⚠️  Conflicts detected in ${conflicts.join(', ')}
🤖 Claude Code could not complete conflict resolution
📋 Conflict details saved to .worktrees/${featureName}/CONFLICTS.md

**Manual Intervention Required**
1. Review the conflicts in CONFLICTS.md
2. Resolve conflicts manually in the affected files
3. Run feature_sync again to complete the process

**Files with conflicts:**
${conflicts.map(file => `- ${file}`).join('\n')}`,
          },
        ],
      };
    }
  }
}

async function analyzeConflicts(git: any, conflicts: string[]): Promise<string> {
  const analysis: string[] = [];
  
  for (const file of conflicts) {
    try {
      const diff = await git.diff(['--name-only', '--diff-filter=U']);
      analysis.push(`**${file}:**`);
      analysis.push(`- Merge conflict detected`);
      analysis.push(`- Contains both main and feature branch changes`);
      analysis.push('');
    } catch (error) {
      analysis.push(`**${file}:** Unable to analyze (${error})`);
    }
  }
  
  return analysis.join('\n');
}

function createResolutionInstructions(conflicts: string[], analysis: string): string {
  return `# Conflict Resolution Task

You need to resolve merge conflicts that occurred during a feature sync (rebase of feature branch onto main).

## Priority Strategy: MAIN WINS
When conflicts are ambiguous or unclear, prioritize main branch changes over feature branch changes to prevent regressions.

## Conflicts to Resolve
${conflicts.map(file => `- ${file}`).join('\n')}

## Conflict Analysis
${analysis}

## Your Task
1. **Open each conflicted file** and examine the conflict markers:
   - \`<<<<<<< HEAD\` (current/main branch changes)
   - \`=======\` (separator)
   - \`>>>>>>> branch-name\` (feature branch changes)

2. **Resolve conflicts** following these rules:
   - **Prefer main branch changes** when in doubt
   - **Preserve essential feature functionality** when clearly beneficial
   - **Remove all conflict markers** (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`)
   - **Ensure code compiles and follows project patterns**

3. **Stage resolved files**: \`git add <resolved-file>\`

4. **Test your resolution** if possible (run build/lint commands)

5. **Continue the rebase**: \`git rebase --continue\`

## Important Notes
- DO NOT commit manually - the rebase will handle commits
- If you cannot resolve a conflict, document why in the file and mark it clearly
- Focus on maintaining code quality and preventing regressions
- Follow the existing code style and patterns

Begin conflict resolution now.`;
}

async function generateConflictSummary(git: any, conflicts: string[], analysis: string): Promise<string> {
  const timestamp = new Date().toISOString();
  
  return `# Merge Conflicts - Manual Resolution Required

**Generated:** ${timestamp}
**Status:** Rebase aborted, conflicts unresolved

## Files with Conflicts
${conflicts.map(file => `- ${file}`).join('\n')}

## Conflict Analysis
${analysis}

## Resolution Strategy
When resolving these conflicts manually:

1. **Main-first approach**: Prioritize main branch changes to prevent regressions
2. **Preserve feature value**: Keep essential feature functionality
3. **Code quality**: Ensure resolved code follows project patterns
4. **Testing**: Run build/test commands after resolution

## Manual Resolution Steps

1. **Start the sync again:**
   \`\`\`bash
   git rebase main
   \`\`\`

2. **For each conflicted file:**
   - Open the file in your editor
   - Look for conflict markers (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`)
   - Choose the appropriate resolution (prefer main when ambiguous)
   - Remove all conflict markers
   - Save the file

3. **Stage resolved files:**
   \`\`\`bash
   git add <resolved-file>
   \`\`\`

4. **Continue the rebase:**
   \`\`\`bash
   git rebase --continue
   \`\`\`

5. **Verify the result:**
   \`\`\`bash
   git status
   pnpm build  # or your build command
   \`\`\`

## Next Steps
After manual resolution, you can run \`feature_sync\` again or proceed directly to creating a PR:
\`\`\`bash
gh pr create --fill
\`\`\`
`;
}