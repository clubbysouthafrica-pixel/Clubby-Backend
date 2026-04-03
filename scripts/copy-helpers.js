const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const buildRoot = path.join(__dirname, '../dist');
const lambdaRoot = buildRoot;
const helperSrc = path.join(__dirname, '../function_helpers');
const helperBuildRoot = path.join(buildRoot, '__generated_function_helpers__');

function isLambdaDir(dirPath) {
  const files = fs.readdirSync(dirPath);
  return files.some(file => file.endsWith('.js') && !file.endsWith('.d.js'));
}

function compileHelpers(sourceDir, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const outputPath = path.join(outputDir, entry.name.replace(/\.ts$/, '.js'));

    if (entry.isDirectory()) {
      compileHelpers(sourcePath, path.join(outputDir, entry.name));
      continue;
    }

    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) {
      continue;
    }

    const source = fs.readFileSync(sourcePath, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2018,
        esModuleInterop: true,
      },
      fileName: sourcePath,
    });

    fs.writeFileSync(outputPath, compiled.outputText, 'utf8');
  }
}

function recursivelyInjectHelper(currentPath) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'function_helpers' || fullPath === helperBuildRoot) {
        continue;
      }

      if (isLambdaDir(fullPath)) {
        const helperTarget = path.join(fullPath, 'function_helpers');

        if (fs.existsSync(helperTarget)) {
          fs.rmSync(helperTarget, { recursive: true, force: true });
        }

        fs.cpSync(helperBuildRoot, helperTarget, { recursive: true });
        console.log(`✅ Copied helper to ${fullPath}`);
      } else {
        recursivelyInjectHelper(fullPath); // Recurse deeper
      }
    }
  }
}

if (!fs.existsSync(buildRoot)) {
  throw new Error('dist does not exist. Run the TypeScript build before copying helpers.');
}

if (fs.existsSync(helperBuildRoot)) {
  fs.rmSync(helperBuildRoot, { recursive: true, force: true });
}

compileHelpers(helperSrc, helperBuildRoot);
recursivelyInjectHelper(lambdaRoot);

if (fs.existsSync(helperBuildRoot)) {
  fs.rmSync(helperBuildRoot, { recursive: true, force: true });
}