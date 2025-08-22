#!/usr/bin/env bun

import { readdir } from 'fs/promises';
import { join } from 'path';
import { $ } from 'bun';

console.log('🚀 Setting up Atomic FHIR Framework\n');

// Install root dependencies
console.log('📦 Installing root dependencies...');
await $`bun install`;

// Install example dependencies
const examplesDir = join(process.cwd(), 'examples');
const examples = await readdir(examplesDir, { withFileTypes: true });

for (const example of examples) {
  if (example.isDirectory()) {
    const examplePath = join(examplesDir, example.name);
    console.log(`\n📦 Installing dependencies for ${example.name}...`);
    
    try {
      // Change to example directory and install
      process.chdir(examplePath);
      await $`bun install`;
      console.log(`  ✅ ${example.name} dependencies installed`);
    } catch (error) {
      console.error(`  ❌ Failed to install ${example.name}: ${error.message}`);
    }
  }
}

// Return to root directory
process.chdir(join(examplesDir, '..'));

console.log('\n✨ Setup complete!');
console.log('\nYou can now run:');
console.log('  bun test           - Run tests');
console.log('  bun run lint       - Check code style');
console.log('  bun run validate   - Validate framework');
console.log('  bun example:minimal - Run minimal example');
console.log('  bun example:basic  - Run basic example');
console.log('  bun example:us-core - Run US Core example');