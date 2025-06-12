import simpleGit from 'simple-git';
import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';

interface FeatureRevisionArgs {
  featureFile: string;
  revisionInstructions?: string;
  userContext?: string;
  force?: boolean;
}

export async function featureRevision(args: FeatureRevisionArgs) {
  const { featureFile, revisionInstructions = '', userContext = '', force = false } = args;

  // Extract feature name from file path (same logic as feature_start)
  const featureName = path.basename(featureFile, '.md')
    .toLowerCase()
    .replace(/[^a-zA-Z0-9-]/g, '-');

  const worktreePath = `.worktrees/${featureName}`;
  const branchName = `feature/${featureName}`;

  // Validate feature file exists
  if (!fs.existsSync(featureFile)) {
    throw new Error(`Feature file '${featureFile}' not found`);
  }

  // Validate worktree exists
  if (!fs.existsSync(worktreePath)) {
    throw new Error(`Feature '${featureName}' not found. Use feature_start to create it first.`);
  }

  // Check if Claude is currently running (unless forced)
  if (!force) {
    try {
      await execa('pgrep', ['-f', `claude.*${worktreePath.replace('./', '')}`], { stdio: 'pipe' });
      throw new Error(`Claude is still running on feature '${featureName}'. Use force=true to override or wait for completion.`);
    } catch (error) {
      // Good - no Claude process found, safe to proceed
      if (error instanceof Error && error.message.includes('Claude is still running')) {
        throw error;
      }
    }
  }

  const git = simpleGit();

  try {
    // Get ALL PR feedback without filtering - let Claude analyze what's relevant
    let prInfo = '';
    let allPRFeedback = '';
    let hasPR = false;
    let prNumber = '';

    try {
      process.chdir(worktreePath);
      
      // Get basic PR info
      const { stdout: prData } = await execa('gh', ['pr', 'view', '--json', 'url,title,body,state,number'], { stdio: 'pipe' });
      const pr = JSON.parse(prData);
      
      if (pr.url && pr.number) {
        hasPR = true;
        prNumber = pr.number.toString();
        prInfo = `**Existing PR:** ${pr.url} | ${pr.state} | ${pr.title}\n\n`;
        
        if (pr.body && pr.body.trim()) {
          prInfo += `**PR Description:**\n${pr.body}\n\n`;
        }

        // Collect ALL feedback types
        let prComments = '';
        let prReviews = '';
        let inlineComments = '';

        // Get general PR comments
        try {
          const { stdout: commentsData } = await execa('gh', ['pr', 'view', '--json', 'comments', '-q', '.comments[]'], { stdio: 'pipe' });
          if (commentsData.trim()) {
            const comments = commentsData.trim().split('\n').map(line => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            }).filter(Boolean);

            if (comments.length > 0) {
              prComments = '### General PR Comments\n';
              comments.forEach((comment: any, index: number) => {
                prComments += `**Comment ${index + 1}** by **${comment.author?.login || 'Unknown'}** (${comment.createdAt}):\n`;
                prComments += `${comment.body}\n\n`;
              });
            }
          }
        } catch {
          // No comments or error fetching
        }

        // Get PR reviews
        try {
          const { stdout: reviewsData } = await execa('gh', ['pr', 'review', 'list', '--json', 'author,state,body,submittedAt'], { stdio: 'pipe' });
          if (reviewsData.trim()) {
            const reviews = JSON.parse(reviewsData);
            if (reviews.length > 0) {
              prReviews = '### Code Reviews\n';
              reviews.forEach((review: any, index: number) => {
                prReviews += `**Review ${index + 1}** by **${review.author?.login || 'Unknown'}** - ${review.state} (${review.submittedAt}):\n`;
                if (review.body && review.body.trim()) {
                  prReviews += `${review.body}\n`;
                }
                prReviews += '\n';
              });
            }
          }
        } catch {
          // No reviews or error fetching
        }

        // Get ALL inline code comments (resolved and unresolved)
        try {
          // Use gh pr view to get review comments instead of direct API
          const { stdout: reviewCommentsData } = await execa('gh', ['pr', 'view', '--json', 'reviewRequests,reviews'], { stdio: 'pipe' });
          if (reviewCommentsData.trim()) {
            const reviewData = JSON.parse(reviewCommentsData);
            if (reviewData.reviews && reviewData.reviews.length > 0) {
              inlineComments = '### Code Review Comments\n';
              reviewData.reviews.forEach((review: any, index: number) => {
                if (review.body && review.body.trim()) {
                  inlineComments += `**Review ${index + 1}** by **${review.author?.login || 'Unknown'}** - ${review.state}:\n`;
                  inlineComments += `${review.body}\n\n`;
                }
              });
            }
          }
        } catch (error) {
          console.error('Failed to fetch review comments:', error);
        }

        // Note: Detailed inline comments with line numbers require GitHub API
        // For now, we'll rely on general review feedback and PR comments
        // This simplifies authentication (no API token needed)

        // Combine all feedback
        allPRFeedback = [prComments, prReviews, inlineComments].filter(Boolean).join('\n');

      } else {
        prInfo = '**Note:** No existing PR found. Will create new PR after revisions.\n\n';
      }
    } catch {
      prInfo = '**Note:** No existing PR found. Will create new PR after revisions.\n\n';
    } finally {
      process.chdir('../..');
    }

    // Get the current git status and recent changes
    const worktreeGit = simpleGit(worktreePath);
    const status = await worktreeGit.status();
    const log = await worktreeGit.log({ from: 'main', to: 'HEAD', maxCount: 10 });

    // Read CURRENT feature specification from the provided file (may have been updated)
    let currentFeatureSpec = '';
    if (fs.existsSync(featureFile)) {
      currentFeatureSpec = fs.readFileSync(featureFile, 'utf-8');
    }

    // Read the original feature spec from the worktree for comparison
    const worktreeFeatureSpecPath = path.join(worktreePath, 'FEATURE.md');
    let originalFeatureSpec = '';
    if (fs.existsSync(worktreeFeatureSpecPath)) {
      originalFeatureSpec = fs.readFileSync(worktreeFeatureSpecPath, 'utf-8');
    }

    // Check if feature spec has been updated
    let featureSpecSection = '';
    if (currentFeatureSpec !== originalFeatureSpec) {
      featureSpecSection = `## Updated Feature Specification
\`\`\`markdown
${currentFeatureSpec}
\`\`\`

## Original Feature Specification (from worktree)
\`\`\`markdown
${originalFeatureSpec}
\`\`\`

⚠️ **Note**: The feature specification has been updated since development started. Consider these changes in your revision analysis.

`;
    } else {
      featureSpecSection = `## Feature Specification
\`\`\`markdown
${currentFeatureSpec}
\`\`\`

`;
    }

    // Get diff of changes so far
    let changesSummary = '';
    try {
      process.chdir(worktreePath);
      const { stdout: diffOutput } = await execa('git', ['diff', 'main...HEAD', '--stat'], { stdio: 'pipe' });
      changesSummary = diffOutput;
    } catch {
      changesSummary = 'Unable to generate diff summary';
    } finally {
      process.chdir('../..');
    }

    // Build revision requirements section
    let revisionSource = '';
    if (allPRFeedback.trim()) {
      revisionSource = '## All PR Feedback (Requires Analysis)\n\n';
      revisionSource += allPRFeedback + '\n\n';
      if (revisionInstructions.trim()) {
        revisionSource += '## Additional Manual Instructions\n\n';
        revisionSource += revisionInstructions + '\n\n';
      }
    } else if (revisionInstructions.trim()) {
      revisionSource = '## Revision Requirements\n\n';
      revisionSource += revisionInstructions + '\n\n';
    } else {
      throw new Error('No revision requirements found. Either provide revisionInstructions or ensure the feature has a PR with feedback.');
    }

    // Add user context if provided
    let contextSection = '';
    if (userContext.trim()) {
      contextSection = `## Additional Context\n\n${userContext}\n\n`;
    }

    // AI-driven comment analysis instructions
    const claudeAnalysisInstructions = `## 🤖 Smart Comment Analysis Instructions

⚠️ **Important**: The PR feedback above may include both resolved and unresolved comments. You need to intelligently analyze which feedback requires action:

### Analysis Process:
1. **Review Recent Commits**: Examine the git history to understand what changes have been made since comments were posted
2. **Cross-Reference Comments**: For each piece of feedback, check if the concern has been addressed in recent commits
3. **Evaluate Current Code**: Look at the current state of mentioned files/functions vs. what comments reference
4. **Focus on Unaddressed**: Only implement changes for feedback that hasn't been properly resolved

### Decision Guidelines:
- ✅ **Skip if**: Comment references code that has been significantly modified/improved since the comment
- ✅ **Skip if**: The suggested change has already been implemented (even if done differently)
- ✅ **Skip if**: Code has been refactored and the concern is no longer relevant
- ⚠️ **Address if**: No evidence the feedback has been handled
- ⚠️ **Address if**: The change was attempted but doesn't fully resolve the concern

### Documentation Requirements:
- **Document your analysis**: In commit messages, note which comments you addressed vs. which were already resolved
- **Be explicit**: Use commit messages like "fix: implement error handling from comment #3, note: auth feedback from comment #1 already addressed in commit abc123"
- **Reference specifics**: Mention comment numbers, file names, and brief reasoning

### When In Doubt:
- Err on the side of addressing feedback rather than skipping it
- If a comment seems partially addressed, complete the implementation
- Focus on the intent behind feedback, not just literal suggestions

Work intelligently and systematically through the feedback, documenting your analysis decisions clearly.`;

    // Create comprehensive revision instructions
    const revisionInstructionsDoc = `# Feature Revision Instructions

${prInfo}

${contextSection}

${revisionSource}

${claudeAnalysisInstructions}

${featureSpecSection}

## Current Implementation Status

### Git Status
- **Branch:** ${branchName}
- **Files changed:** ${status.files.length}
- **Commits ahead of main:** ${log.total}

### Recent Commits
${log.all.slice(0, 5).map(commit => `- ${commit.hash.substring(0, 7)} ${commit.message}`).join('\n')}

### Changes Summary
\`\`\`
${changesSummary}
\`\`\`

## Completion Guidelines

1. **Analyze Intelligently**: Use the analysis process above to determine what needs attention
2. **Implement Systematically**: Address unresolved feedback methodically
3. **Test Thoroughly**: Ensure all changes work and don't break existing features
4. **Document Clearly**: Explain your analysis and decisions in commit messages
5. **Update PR**: Push changes and add summary comment when complete

## When Complete
1. Make clear commits with analysis documentation: \`git commit -m "fix: address review feedback on error handling (comments #2, #4); note: performance feedback #1 already addressed in commit def456"\`
2. Push changes: \`git push origin ${branchName}\`
${hasPR ? '3. Add a summary comment to the PR: `gh pr comment --body "Applied remaining unaddressed feedback, documented analysis in commits"`' : '3. Create PR: `gh pr create --fill`'}

Work systematically and intelligently. Your analysis and reasoning are key to effective revision management.
`;

    // Save revision instructions
    fs.writeFileSync(path.join(worktreePath, 'REVISION.md'), revisionInstructionsDoc);

    // Copy updated feature file to worktree if it has changed
    if (currentFeatureSpec !== originalFeatureSpec) {
      fs.copyFileSync(featureFile, worktreeFeatureSpecPath);
    }

    // Start Claude Code for revision work
    process.chdir(worktreePath);

    const claudeCommand = process.env.CLAUDE_COMMAND || 'claude';
    const claudeArgs = process.env.CLAUDE_ARGS ? process.env.CLAUDE_ARGS.split(' ') : ['--dangerously-skip-permissions'];
    
    const claudeProcess = execa(claudeCommand, claudeArgs, {
      input: `I need you to intelligently apply revisions to an existing feature implementation.

Please carefully read REVISION.md which contains:
- ${hasPR ? 'ALL PR comments and review feedback from GitHub (both resolved and unresolved)' : 'Specific revision requirements'}
- Smart analysis instructions for determining what needs attention vs. what's already been addressed
- ${currentFeatureSpec !== originalFeatureSpec ? 'Updated feature requirements (specification has changed since development started)' : 'Current feature requirements and implementation status'}
- ${userContext.trim() ? 'Additional context and requirements' : ''}

Your task is to:
1. **Analyze the feedback intelligently** - determine what has already been addressed vs. what needs work
2. **Consider any feature spec updates** - the requirements may have evolved since development started
3. **Implement only necessary changes** - focus on unaddressed feedback and updated requirements
4. **Document your analysis** - explain your decisions in commit messages
5. **Work systematically** - handle each piece of feedback methodically

${hasPR ? 'Use your AI reasoning to distinguish between feedback that has been resolved and feedback that still needs attention.' : 'Follow the provided revision requirements carefully.'}

Document your analysis process clearly in your commit messages so the reasoning is transparent.`,
      stdio: ['pipe', 'pipe', 'pipe']  // Ensure proper stdio handling
    });

    process.chdir('../..');

    const feedbackTypes = [];
    if (allPRFeedback.includes('General PR Comments')) feedbackTypes.push('PR comments');
    if (allPRFeedback.includes('Code Reviews')) feedbackTypes.push('code reviews');
    if (allPRFeedback.includes('Code Review Comments')) feedbackTypes.push('review comments');

    return {
      content: [
        {
          type: 'text',
          text: `✅ Feature revision started with intelligent analysis!

📁 **Feature:** ${featureName}
📄 **Source:** ${featureFile}
📍 **Location:** ${worktreePath}
🌿 **Branch:** ${branchName}
📝 **Revision Instructions:** Saved to REVISION.md
${hasPR ? `💬 **PR Feedback:** Auto-fetched ${feedbackTypes.join(', ')} from GitHub` : '📋 **Manual Instructions:** Using provided revision requirements'}
${userContext.trim() ? '📋 **User Context:** Additional context provided' : ''}
${currentFeatureSpec !== originalFeatureSpec ? '📄 **Updated Spec:** Feature requirements have been updated since development started' : ''}
🤖 **AI Analysis:** Claude will intelligently determine what needs attention vs. what's already resolved

The Claude Code agent will:
- Analyze ALL feedback (resolved and unresolved) 
- Cross-reference with recent commits and current code
- ${currentFeatureSpec !== originalFeatureSpec ? 'Consider updated feature requirements' : ''}
- Focus only on unaddressed concerns
- Document analysis decisions in commit messages
${userContext.trim() ? '- Consider your additional context in the analysis' : ''}

Use \`feature_status\` to monitor progress.

💡 **Note:** Using GitHub CLI authentication (no API token required)`,
        },
      ],
    };

  } catch (error: unknown) {
    throw error;
  }
} 