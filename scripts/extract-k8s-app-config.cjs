#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function getIndent(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function extractAppConfigBlock(content) {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex(line =>
    /^\s*app-config\.yaml:\s*\|[-+]?\s*$/.test(line),
  );

  if (startIndex === -1) {
    throw new Error('Could not find `app-config.yaml: |` block in the source file.');
  }

  let blockIndent;
  const extractedLines = [];

  for (const line of lines.slice(startIndex + 1)) {
    if (line.length === 0) {
      extractedLines.push('');
      continue;
    }

    const indent = getIndent(line);
    if (blockIndent === undefined) {
      blockIndent = indent;
    } else if (indent < blockIndent) {
      break;
    }

    extractedLines.push(line.slice(blockIndent));
  }

  if (extractedLines.length === 0) {
    throw new Error('Found `app-config.yaml` block, but it did not contain any data.');
  }

  return `${extractedLines.join('\n').replace(/\n+$/, '')}\n`;
}

function main() {
  const [sourcePath, outputPath] = process.argv.slice(2);

  if (!sourcePath || !outputPath) {
    console.error(
      'Usage: node scripts/extract-k8s-app-config.cjs <source-configmap-path> <output-config-path>',
    );
    process.exit(1);
  }

  const sourceContent = fs.readFileSync(sourcePath, 'utf8');
  const extractedConfig = extractAppConfigBlock(sourceContent);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, extractedConfig, 'utf8');
}

main();
