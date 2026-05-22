const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(repoRoot, 'functions');
const rootHelpers = path.join(repoRoot, 'function_helpers');
const stagingRoot = path.join(repoRoot, '.generated', 'functions');
const stagingConfigPath = path.join(repoRoot, '.generated', 'tsconfig.functions.json');
const stagingDir = path.dirname(stagingConfigPath);
const distRoot = path.join(repoRoot, 'dist');

function isLambdaDir(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.some(entry => {
    if (!entry.isFile()) {
      return false;
    }

    return (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.d.ts');
  });
}

function stageFunctionSources() {
  fs.cpSync(sourceRoot, stagingRoot, {
    recursive: true,
    filter: sourcePath => path.basename(sourcePath) !== 'function_helpers',
  });
}

function injectHelpers(currentPath) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(currentPath, entry.name);

    if (isLambdaDir(fullPath)) {
      fs.cpSync(rootHelpers, path.join(fullPath, 'function_helpers'), { recursive: true });
      continue;
    }

    injectHelpers(fullPath);
  }
}

function writeStagingConfig() {
  const config = {
    extends: '../tsconfig.json',
    compilerOptions: {
      rootDir: './functions',
      outDir: '../dist',
    },
    include: ['functions/**/*'],
    exclude: [],
  };

  fs.writeFileSync(stagingConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function runTypeScriptBuild() {
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npxCommand, ['tsc', '-p', stagingConfigPath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`TypeScript build failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function removeDirectoryIfPresent(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function main() {
  removeDirectoryIfPresent(stagingDir);
  removeDirectoryIfPresent(distRoot);

  fs.mkdirSync(stagingDir, { recursive: true });
  stageFunctionSources();
  injectHelpers(stagingRoot);
  writeStagingConfig();

  try {
    runTypeScriptBuild();
  } finally {
    removeDirectoryIfPresent(stagingDir);
  }
}

main();