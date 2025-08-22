#!/usr/bin/env bun

import { Atomic } from '../src/index.js';
import { readdir } from 'fs/promises';
import { join } from 'path';

console.log('🏥 Atomic Framework Validation Suite\n');

async function validateFramework() {
  const results = {
    syntax: { passed: true, errors: [] },
    imports: { passed: true, errors: [] },
    resources: { passed: true, errors: [] },
    operations: { passed: true, errors: [] },
    middleware: { passed: true, errors: [] }
  };

  // Test 1: Check if framework can be instantiated
  console.log('📋 Testing framework instantiation...');
  try {
    const app = new Atomic({
      server: { name: 'Validation Test' },
      autoload: { enabled: false }
    });
    console.log('  ✅ Framework instantiation successful');
  } catch (error) {
    results.syntax.passed = false;
    results.syntax.errors.push(`Framework instantiation failed: ${error.message}`);
    console.log(`  ❌ Framework instantiation failed: ${error.message}`);
  }

  // Test 2: Check all imports
  console.log('\n📦 Testing module imports...');
  const modules = [
    '../src/core/atomic.js',
    '../src/core/router.js',
    '../src/core/resource.js',
    '../src/core/operation.js',
    '../src/core/middleware.js',
    '../src/core/validator.js',
    '../src/storage/sqlite-adapter.js',
    '../src/core/filesystem-loader.js'
  ];

  for (const module of modules) {
    try {
      await import(module);
      console.log(`  ✅ ${module.split('/').pop()}`);
    } catch (error) {
      results.imports.passed = false;
      results.imports.errors.push(`${module}: ${error.message}`);
      console.log(`  ❌ ${module.split('/').pop()}: ${error.message}`);
    }
  }

  // Test 3: Validate example resources
  console.log('\n🏗️  Testing example resources...');
  const exampleDirs = ['minimal-server', 'basic-server', 'us-core-server'];
  
  for (const dir of exampleDirs) {
    try {
      const resourcePath = join(process.cwd(), 'examples', dir, 'resources');
      const files = await readdir(resourcePath).catch(() => []);
      
      for (const file of files) {
        if (file.endsWith('.js')) {
          try {
            const module = await import(join(resourcePath, file));
            if (module.default && module.default.resourceType) {
              console.log(`  ✅ ${dir}/${file}`);
            } else {
              throw new Error('Invalid resource export');
            }
          } catch (error) {
            results.resources.passed = false;
            results.resources.errors.push(`${dir}/${file}: ${error.message}`);
            console.log(`  ❌ ${dir}/${file}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      // Directory might not exist, which is okay
    }
  }

  // Test 4: Validate operations
  console.log('\n⚙️  Testing example operations...');
  for (const dir of exampleDirs) {
    try {
      const operationsPath = join(process.cwd(), 'examples', dir, 'operations');
      const files = await readdir(operationsPath).catch(() => []);
      
      for (const file of files) {
        if (file.endsWith('.js')) {
          try {
            const module = await import(join(operationsPath, file));
            if (module.default && module.default.name && module.default.handler) {
              console.log(`  ✅ ${dir}/${file}`);
            } else {
              throw new Error('Invalid operation export');
            }
          } catch (error) {
            results.operations.passed = false;
            results.operations.errors.push(`${dir}/${file}: ${error.message}`);
            console.log(`  ❌ ${dir}/${file}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      // Directory might not exist, which is okay
    }
  }

  // Test 5: Validate middleware
  console.log('\n🔗 Testing example middleware...');
  for (const dir of exampleDirs) {
    try {
      const middlewarePath = join(process.cwd(), 'examples', dir, 'middleware');
      const files = await readdir(middlewarePath).catch(() => []);
      
      for (const file of files) {
        if (file.endsWith('.js')) {
          try {
            const module = await import(join(middlewarePath, file));
            if (module.default && (module.default.before || module.default.after)) {
              console.log(`  ✅ ${dir}/${file}`);
            } else {
              throw new Error('Invalid middleware export');
            }
          } catch (error) {
            results.middleware.passed = false;
            results.middleware.errors.push(`${dir}/${file}: ${error.message}`);
            console.log(`  ❌ ${dir}/${file}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      // Directory might not exist, which is okay
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Validation Summary\n');
  
  let allPassed = true;
  for (const [category, result] of Object.entries(results)) {
    if (result.passed) {
      console.log(`  ✅ ${category.charAt(0).toUpperCase() + category.slice(1)}`);
    } else {
      allPassed = false;
      console.log(`  ❌ ${category.charAt(0).toUpperCase() + category.slice(1)}`);
      for (const error of result.errors) {
        console.log(`     - ${error}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  
  if (allPassed) {
    console.log('\n🎉 All validations passed!\n');
    process.exit(0);
  } else {
    console.log('\n❌ Some validations failed. Please fix the errors above.\n');
    process.exit(1);
  }
}

// Run validation
validateFramework().catch(error => {
  console.error('Fatal error during validation:', error);
  process.exit(1);
});