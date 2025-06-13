import simpleGit from 'simple-git';
import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';

interface FeatureStartArgs {
  featureFile: string;
  branchPrefix?: string;
  baseBranch?: string;
  interactive?: boolean;
}

export async function featureStart(args: FeatureStartArgs) {
  const { featureFile, branchPrefix = 'feature/', baseBranch = 'main', interactive = false } = args;

  // Get project root directory - require PROJECT_ROOT env var for Cursor MCP
  const projectRoot = process.env.PROJECT_ROOT;
  if (!projectRoot) {
    throw new Error('PROJECT_ROOT environment variable not set. This is required for Cursor MCP. Add "env": {"PROJECT_ROOT": "/path/to/your/project"} to your MCP configuration.');
  }
  
  const fullFeaturePath = path.isAbsolute(featureFile) ? featureFile : path.join(projectRoot, featureFile);

  // Validate feature file exists
  if (!fs.existsSync(fullFeaturePath)) {
    throw new Error(`Feature file '${featureFile}' not found at '${fullFeaturePath}'`);
  }

  // Extract feature name from file path
  const featureName = path.basename(featureFile, '.md')
    .toLowerCase()
    .replace(/[^a-zA-Z0-9-]/g, '-'); 

  const worktreePath = path.join(projectRoot, '.worktrees', featureName);
  const branchName = `${branchPrefix}${featureName}`;

  // Check if worktree already exists
  if (fs.existsSync(worktreePath)) {
    throw new Error(`Feature '${featureName}' already exists at '${worktreePath}'. Use feature_revision to modify or feature_cleanup to remove.`);
  }

  const git = simpleGit(projectRoot);

  try {
    // Ensure we're in a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new Error('Not in a git repository. Please run this command from your project root.');
    }

    // Create worktree directory
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

    // Create new branch and worktree
    await git.checkout(['-b', branchName, baseBranch]);
    await git.raw(['worktree', 'add', worktreePath, branchName]);

    // Copy feature specification
    const featureContent = fs.readFileSync(fullFeaturePath, 'utf-8');
    fs.writeFileSync(path.join(worktreePath, 'FEATURE.md'), featureContent);

    // Copy essential project files
    const filesToCopy = [
      'package.json',
      'tsconfig.json', 
      'jsconfig.json',
      '.eslintrc*',
      '.prettierrc*',
      'vite.config.*',
      'next.config.*',
      'tailwind.config.*',
      'README.md'
    ];

    filesToCopy.forEach(pattern => {
      if (pattern.includes('*')) {
        // Handle glob patterns
        const files = fs.readdirSync(projectRoot).filter(file => {
          const regex = new RegExp(pattern.replace('*', '.*'));
          return regex.test(file);
        });
        files.forEach(file => {
          if (fs.existsSync(path.join(projectRoot, file))) {
            fs.copyFileSync(path.join(projectRoot, file), path.join(worktreePath, file));
          }
        });
      } else {
        // Handle exact filenames
        if (fs.existsSync(path.join(projectRoot, pattern))) {
          fs.copyFileSync(path.join(projectRoot, pattern), path.join(worktreePath, pattern));
        }
      }
    });

    // Copy entire src directory if it exists
    if (fs.existsSync(path.join(projectRoot, 'src'))) {
      fs.cpSync(path.join(projectRoot, 'src'), path.join(worktreePath, 'src'), { recursive: true });
    }

    // Install dependencies in worktree
    if (fs.existsSync(path.join(worktreePath, 'package.json'))) {
      try {
        // Try pnpm first, fall back to npm
        await execa('pnpm', ['install'], { stdio: 'pipe', cwd: worktreePath });
      } catch {
        try {
          await execa('npm', ['install'], { stdio: 'pipe', cwd: worktreePath });
        } catch (error) {
          console.warn('Warning: Failed to install dependencies. Claude Code will proceed but may encounter issues.');
        }
      }
    }

    // Create comprehensive development instructions
    const instructions = `I need you to implement the feature described in FEATURE.md.

This is an isolated development environment:
- You're in a git worktree: ${worktreePath}
- Working on branch: ${branchName}
- Base branch: ${baseBranch}

Your task:
1. **Read FEATURE.md carefully** - understand all requirements and acceptance criteria
2. **Analyze the existing codebase** - understand the project structure and patterns
3. **Implement the feature** following existing conventions and best practices
4. **Write tests** if the project has a testing setup
5. **Commit your work** with clear, descriptive commit messages
6. **Create a Pull Request** when ready: \`gh pr create --fill\`

Important guidelines:
- Follow the existing code style and patterns
- Add proper error handling and validation
- Include TypeScript types if this is a TypeScript project
- Update documentation if needed
- Test your implementation thoroughly

Work autonomously and systematically. The feature specification in FEATURE.md is your primary guide.`;

    // Start Claude Code with configurable command
    const claudeCommand = process.env.CLAUDE_COMMAND || 'claude';
    const claudeArgs = process.env.CLAUDE_ARGS ? process.env.CLAUDE_ARGS.split(' ') : ['--dangerously-skip-permissions'];
    
    if (interactive) {
      // Interactive mode: Open Claude Code in the terminal
      const fullArgs = [...claudeArgs, 'FEATURE.md'];
      const claudeProcess = execa(claudeCommand, fullArgs, {
        stdio: 'inherit',
        cwd: worktreePath
      });
      
      // Don't wait for completion in interactive mode
      claudeProcess.catch(() => {
        // Ignore errors in interactive mode
      });
    } else {
      // Background mode: Original behavior
      const claudeProcess = execa(claudeCommand, claudeArgs, {
        input: instructions,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: worktreePath
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ Feature development started!

📁 **Feature:** ${featureName}
📄 **Source:** ${fullFeaturePath}
📍 **Location:** ${worktreePath}
🌿 **Branch:** ${branchName}
🔧 **Claude Code:** ${claudeCommand} ${claudeArgs.join(' ')}${interactive ? ' (Interactive Mode)' : ''}
📋 **Instructions:** ${interactive ? 'Open in terminal for interactive development' : 'Comprehensive development guide provided'}

${interactive ? 
`🖥️  **Interactive Mode Active**
Claude Code is opening in your terminal where you can:
- See the interactive development process
- Provide real-time feedback and guidance
- Monitor progress step-by-step

Navigate to the worktree directory and interact with Claude Code directly.` :
`The Claude Code agent is now working autonomously on your feature. It will:
- Analyze the feature requirements in FEATURE.md
- Study your existing codebase patterns
- Implement the feature following your conventions
- Write tests and documentation
- Create a Pull Request when complete`}

Use \`feature_status\` to monitor progress.

💡 **Tip:** Run \`verify_setup\` first to ensure all prerequisites are met.`,
        },
      ],
    };

  } catch (error: unknown) {
    // Clean up on failure
    try {
      if (fs.existsSync(worktreePath)) {
        await git.raw(['worktree', 'remove', worktreePath, '--force']);
      }
      await git.deleteLocalBranch(branchName, true);
    } catch {
      // Ignore cleanup errors
    }
    
    throw error;
  }
} 