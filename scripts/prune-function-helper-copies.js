const fs = require('fs');
const path = require('path');

const functionsRoot = path.join(__dirname, '..', 'functions');

function removeHelperDirectories(currentPath) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(currentPath, entry.name);

    if (entry.name === 'function_helpers') {
      fs.rmSync(fullPath, { recursive: true, force: true });
      continue;
    }

    removeHelperDirectories(fullPath);
  }
}

removeHelperDirectories(functionsRoot);