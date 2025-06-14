#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { featureStart } from './tools/feature-start.js';
import { featureStatus } from './tools/feature-status.js';
import { featureCleanup } from './tools/feature-cleanup.js';
import { featureRevision } from './tools/feature-revision.js';
import { featureSync } from './tools/feature-sync.js';
import { verifySetup } from './tools/verify-setup.js';

const server: Server = new Server(
  {
    name: 'claude-worktree-agent',
    version: '1.0.0',
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'verify_setup',
        description: 'Verify all prerequisites for the Claude Worktree Agent (Git, Claude Code, GitHub CLI, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            claudeCommand: {
              type: 'string',
              description: 'Custom Claude Code command to test (default: "claude" or CLAUDE_COMMAND env var)',
            },
            verbose: {
              type: 'boolean',
              description: 'Show detailed output for all checks (default: false)',
              default: false,
            },
          },
        },
      },
      {
        name: 'feature_start',
        description: 'Start Claude Code development on a feature in isolated git worktree',
        inputSchema: {
          type: 'object',
          properties: {
            featureFile: {
              type: 'string',
              description: 'Path to feature specification file (e.g., features/user-stats.md)',
            },
            branchPrefix: {
              type: 'string',
              description: 'Branch name prefix (default: feature/)',
              default: 'feature/',
            },
            baseBranch: {
              type: 'string', 
              description: 'Base branch to branch from (default: main)',
              default: 'main',
            },
            interactive: {
              type: 'boolean',
              description: 'Open Claude Code interactively in terminal (default: false)',
              default: false,
            },
          },
          required: ['featureFile'],
        },
      },
      {
        name: 'feature_status',
        description: 'Check status of all active feature development sessions',
        inputSchema: {
          type: 'object',
          properties: {
            featureName: {
              type: 'string',
              description: 'Optional: Check specific feature only',
            },
          },
        },
      },
      {
        name: 'feature_cleanup',
        description: 'Clean up completed or abandoned feature development worktrees',
        inputSchema: {
          type: 'object',
          properties: {
            featureName: {
              type: 'string',
              description: 'Optional: Clean specific feature only',
            },
            force: {
              type: 'boolean',
              description: 'Force cleanup even if PR is open (default: false)',
              default: false,
            },
            all: {
              type: 'boolean',
              description: 'Clean all features - use with caution (default: false)',
              default: false,
            },
          },
        },
      },
      {
        name: 'feature_revision',
        description: 'Apply revisions to an existing feature using AI-driven analysis of PR feedback and/or manual instructions',
        inputSchema: {
          type: 'object',
          properties: {
            featureFile: {
              type: 'string',
              description: 'Path to the feature specification file (e.g., "features/my-feature.md")',
            },
            revisionInstructions: {
              type: 'string',
              description: 'Optional: Manual revision instructions (will be combined with auto-fetched PR feedback)',
            },
            userContext: {
              type: 'string',
              description: 'Optional: Additional context to help with analysis (project constraints, priorities, background info)',
            },
            force: {
              type: 'boolean',
              description: 'Force revision even if Claude is currently running (default: false)',
              default: false,
            },
          },
          required: ['featureFile'],
        },
      },
      {
        name: 'feature_sync',
        description: 'Sync a feature branch with the latest main branch using rebase with AI-powered conflict resolution',
        inputSchema: {
          type: 'object',
          properties: {
            featureName: {
              type: 'string',
              description: 'Name of the feature to sync (e.g., "user-dashboard")',
            },
          },
          required: ['featureName'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'verify_setup':
        return await verifySetup(args as any);
      case 'feature_start':
        return await featureStart(args as any);
      case 'feature_status':
        return await featureStatus(args as any);
      case 'feature_cleanup':
        return await featureCleanup(args as any);
      case 'feature_revision':
        return await featureRevision(args as any);
      case 'feature_sync':
        return await featureSync(args as any);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🤖 Claude Worktree Agent MCP Server running');
}

// Start the server
main().catch((error: Error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

export { server }; 