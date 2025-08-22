#!/usr/bin/env node

import { readdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

let hasErrors = false;
const errors = [];

async function checkJavaScriptSyntax(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    
    // Try to parse as a module
    try {
      new Function('return (async () => {' + content + '})');
    } catch (parseError) {
      // Try dynamic import for actual validation
      try {
        await import(filePath);
      } catch (importError) {
        if (importError.message.includes('Expected') || 
            importError.message.includes('Unexpected') ||
            importError.message.includes('Syntax')) {
          return {
            file: filePath.replace(rootDir, '.'),
            error: importError.message,
            line: importError.stack?.match(/at.*:(\d+):(\d+)/)?.[1]
          };
        }
      }
    }
  } catch (error) {
    return {
      file: filePath.replace(rootDir, '.'),
      error: error.message
    };
  }
  return null;
}

async function checkDirectory(dir, ignore = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    // Skip ignored directories
    if (ignore.some(pattern => fullPath.includes(pattern))) {
      continue;
    }
    
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      await checkDirectory(fullPath, ignore);
    } else if (entry.isFile() && extname(entry.name) === '.js') {
      const error = await checkJavaScriptSyntax(fullPath);
      if (error) {
        hasErrors = true;
        errors.push(error);
      }
    }
  }
}

console.log('🔍 Checking JavaScript syntax...\n');

// Check source files
await checkDirectory(join(rootDir, 'src'), []);

// Check examples
await checkDirectory(join(rootDir, 'examples'), ['node_modules']);

// Check tests
await checkDirectory(join(rootDir, 'test'), []);

if (hasErrors) {
  console.error('❌ Syntax errors found:\n');
  for (const error of errors) {
    console.error(`  ${error.file}${error.line ? ':' + error.line : ''}`);
    console.error(`    ${error.error}\n`);
  }
  process.exit(1);
} else {
  console.log('✅ All JavaScript files have valid syntax!\n');
}