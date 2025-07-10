const fs = require('fs');
const path = require('path');

const distRoot = path.join(__dirname, '../functions');
const helperSrc = path.join(__dirname, '../function_helpers');

function isLambdaDir(dirPath) {
  const files = fs.readdirSync(dirPath);
  return files.some(file => file.endsWith('.ts')); // Customize if needed
}

function recursivelyInjectHelper(currentPath) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (isLambdaDir(fullPath)) {
        const helperTarget = path.join(fullPath, 'function_helpers');

        if (fs.existsSync(helperTarget)) {
          fs.rmSync(helperTarget, { recursive: true, force: true });
        }

        fs.cpSync(helperSrc, helperTarget, { recursive: true });
        console.log(`✅ Copied helper to ${fullPath}`);
      } else {
        recursivelyInjectHelper(fullPath); // Recurse deeper
      }
    }
  }
}

recursivelyInjectHelper(distRoot);