const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace roots
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo workspace (including /convex)
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules')
];

module.exports = config;
