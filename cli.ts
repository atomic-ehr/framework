#!/usr/bin/env bun

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const args = process.argv.slice(2);
const command = args[0];

async function createProject(name: string): Promise<void> {
  const projectPath = join(process.cwd(), name);
  
  // Create project directory structure
  await mkdir(projectPath, { recursive: true });
  await mkdir(join(projectPath, 'src'), { recursive: true });
  await mkdir(join(projectPath, 'src', 'resources'), { recursive: true });
  await mkdir(join(projectPath, 'src', 'operations'), { recursive: true });
  await mkdir(join(projectPath, 'src', 'middleware'), { recursive: true });
  await mkdir(join(projectPath, 'src', 'hooks'), { recursive: true });
  await mkdir(join(projectPath, 'packages'), { recursive: true });
  
  // Create package.json
  const packageJson = {
    name: name,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'bun run src/server.ts',
      build: 'tsc',
      typecheck: 'tsc --noEmit',
      test: 'bun test',
      lint: 'eslint src --ext .ts',
      format: 'prettier --write "src/**/*.ts"'
    },
    dependencies: {
      '@atomic-fhir/core': '^0.1.0'
    },
    devDependencies: {
      '@types/bun': 'latest',
      '@types/node': '^20.0.0',
      'bun-types': 'latest',
      'typescript': '^5.3.0',
      'eslint': '^8.56.0',
      '@typescript-eslint/eslint-plugin': '^6.0.0',
      '@typescript-eslint/parser': '^6.0.0',
      'prettier': '^3.2.4'
    }
  };
  
  await writeFile(
    join(projectPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  // Create tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      lib: ['ES2022'],
      types: ['bun-types'],
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      resolveJsonModule: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules', 'dist', '**/*.test.ts']
  };
  
  await writeFile(
    join(projectPath, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );
  
  // Create src/server.ts
  const serverCode = `import { Atomic, type AtomicConfig } from '@atomic-fhir/core';

const config: AtomicConfig = {
  server: {
    name: '${name}',
    version: '0.1.0',
    port: 3000,
    url: 'http://localhost:3000'
  },
  storage: {
    adapter: 'sqlite',
    config: {
      database: './data.db'
    }
  }
  // Autoload is enabled by default!
  // Components are auto-discovered from src/ subdirectories
};

const app = new Atomic(config);

// Start server
// Components are auto-discovered from:
// - ./src/resources/    (FHIR resources)
// - ./src/operations/   (FHIR operations)
// - ./src/middleware/   (HTTP middleware)
// - ./src/hooks/        (Lifecycle hooks)
// - ./packages/         (FHIR IG packages)
app.start();
`;
  
  await writeFile(join(projectPath, 'src', 'server.ts'), serverCode);
  
  // Create example Patient resource in TypeScript
  const exampleResource = `import { defineResource, type ResourceDefinition } from '@atomic-fhir/core';

export default defineResource({
  resourceType: 'Patient',
  
  // Optional: Define search parameters
  searches: {
    name: {
      name: 'name',
      type: 'string',
      path: 'Patient.name'
    },
    birthdate: {
      name: 'birthdate',
      type: 'date',
      path: 'Patient.birthDate'
    },
    identifier: {
      name: 'identifier',
      type: 'token',
      path: 'Patient.identifier'
    }
  }
} satisfies ResourceDefinition);
`;
  
  await writeFile(
    join(projectPath, 'src', 'resources', 'Patient.ts'),
    exampleResource
  );
  
  // Create example operation in TypeScript
  const exampleOperation = `import { defineOperation, type OperationDefinition } from '@atomic-fhir/core';

export default defineOperation({
  name: 'ping',
  system: true,
  code: 'ping',
  kind: 'operation',
  description: 'Test server connectivity',
  affectsState: false,
  
  async handler(params, context) {
    return {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'result',
          valueString: 'pong'
        },
        {
          name: 'timestamp',
          valueDateTime: new Date().toISOString()
        }
      ]
    };
  }
} satisfies OperationDefinition);
`;
  
  await writeFile(
    join(projectPath, 'src', 'operations', 'ping.ts'),
    exampleOperation
  );
  
  // Create example hook in TypeScript
  const exampleHook = `import { defineHook, type HookDefinition } from '@atomic-fhir/core';

export default defineHook({
  name: 'add-timestamps',
  type: 'beforeCreate',
  resources: '*', // Apply to all resources
  
  async handler(resource, context) {
    // Add creation timestamp
    resource.meta = resource.meta || {};
    resource.meta.lastUpdated = new Date().toISOString();
    
    return resource;
  }
} satisfies HookDefinition);
`;
  
  await writeFile(
    join(projectPath, 'src', 'hooks', 'timestamps.ts'),
    exampleHook
  );
  
  // Create README.md
  const readme = `# ${name}

A FHIR server built with Atomic FHIR framework and TypeScript.

## Getting Started

\`\`\`bash
# Install dependencies
bun install

# Run development server
bun run dev

# Type check
bun run typecheck

# Build for production
bun run build

# Run tests
bun test
\`\`\`

## Project Structure

\`\`\`
${name}/
├── src/
│   ├── server.ts         # Server configuration
│   ├── resources/        # FHIR resources
│   ├── operations/       # Custom operations
│   ├── middleware/       # HTTP middleware
│   └── hooks/           # Lifecycle hooks
├── packages/            # FHIR IG packages (.tgz)
├── package.json
└── tsconfig.json
\`\`\`

## Adding Resources

Create a new file in \`src/resources/\`:

\`\`\`typescript
import { defineResource, type ResourceDefinition } from '@atomic-fhir/core';

export default defineResource({
  resourceType: 'Observation',
  // ... configuration
} satisfies ResourceDefinition);
\`\`\`

## Adding Operations

Create a new file in \`src/operations/\`:

\`\`\`typescript
import { defineOperation, type OperationDefinition } from '@atomic-fhir/core';

export default defineOperation({
  name: 'custom-op',
  // ... configuration
} satisfies OperationDefinition);
\`\`\`

## License

MIT
`;
  
  await writeFile(join(projectPath, 'README.md'), readme);
  
  console.log(`✅ Created TypeScript FHIR server project: ${name}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${name}`);
  console.log(`  bun install`);
  console.log(`  bun run dev`);
}

async function generateResource(type: string): Promise<void> {
  const resourceCode = `import { defineResource, type ResourceDefinition } from '@atomic-fhir/core';

export default defineResource({
  resourceType: '${type}',
  
  // Optional: Define search parameters
  searches: {
    // Add search parameters specific to ${type}
  },
  
  // Optional: Custom validation
  validators: {
    // Add custom validators
  }
} satisfies ResourceDefinition);
`;
  
  await writeFile(`src/resources/${type}.ts`, resourceCode);
  console.log(`✅ Generated resource: src/resources/${type}.ts`);
}

async function generateOperation(name: string): Promise<void> {
  const operationCode = `import { defineOperation, type OperationDefinition } from '@atomic-fhir/core';

export default defineOperation({
  name: '${name}',
  resource: 'Patient', // Or use 'system: true' for system-level
  code: '${name}',
  kind: 'operation',
  description: 'TODO: Add description',
  affectsState: false,
  
  parameters: {
    input: [
      // Define input parameters
    ],
    output: [
      // Define output parameters
    ]
  },
  
  async handler(params, context) {
    // TODO: Implement operation logic
    
    return {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'result',
          valueString: 'Operation completed'
        }
      ]
    };
  }
} satisfies OperationDefinition);
`;
  
  await writeFile(`src/operations/${name}.ts`, operationCode);
  console.log(`✅ Generated operation: src/operations/${name}.ts`);
}

async function generateHook(name: string): Promise<void> {
  const hookCode = `import { defineHook, type HookDefinition } from '@atomic-fhir/core';

export default defineHook({
  name: '${name}',
  type: 'beforeCreate', // Change as needed
  resources: '*', // Or specify resource types: ['Patient', 'Observation']
  
  async handler(resource, context) {
    // TODO: Implement hook logic
    
    return resource; // For 'before' hooks
  }
} satisfies HookDefinition);
`;
  
  await writeFile(`src/hooks/${name}.ts`, hookCode);
  console.log(`✅ Generated hook: src/hooks/${name}.ts`);
}

// Main CLI logic
async function main(): Promise<void> {
  switch (command) {
    case 'new':
    case 'create':
      if (!args[1]) {
        console.error('❌ Please provide a project name');
        process.exit(1);
      }
      await createProject(args[1]);
      break;
      
    case 'generate':
    case 'g':
      const subcommand = args[1];
      const name = args[2];
      
      if (!name) {
        console.error('❌ Please provide a name');
        process.exit(1);
      }
      
      switch (subcommand) {
        case 'resource':
        case 'r':
          await generateResource(name);
          break;
        case 'operation':
        case 'op':
          await generateOperation(name);
          break;
        case 'hook':
        case 'h':
          await generateHook(name);
          break;
        default:
          console.error('❌ Unknown generate command:', subcommand);
          console.log('Available: resource, operation, hook');
          process.exit(1);
      }
      break;
      
    case 'help':
    case '--help':
    case '-h':
      console.log(`
Atomic FHIR CLI - TypeScript Edition

Usage: bun cli.ts <command> [options]

Commands:
  new <name>                Create a new TypeScript FHIR server project
  generate resource <name>  Generate a new resource definition
  generate operation <name> Generate a new operation definition
  generate hook <name>      Generate a new hook definition
  help                      Show this help message

Examples:
  bun cli.ts new my-fhir-server
  bun cli.ts generate resource Practitioner
  bun cli.ts generate operation validate
  bun cli.ts generate hook audit-log
`);
      break;
      
    default:
      console.error('❌ Unknown command:', command);
      console.log('Run "bun cli.ts help" for usage information');
      process.exit(1);
  }
}

// Run the CLI
main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});