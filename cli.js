#!/usr/bin/env bun

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const args = process.argv.slice(2);
const command = args[0];

async function createProject(name) {
  const projectPath = join(process.cwd(), name);
  
  // Create project directory
  await mkdir(projectPath, { recursive: true });
  await mkdir(join(projectPath, 'resources'), { recursive: true });
  await mkdir(join(projectPath, 'operations'), { recursive: true });
  await mkdir(join(projectPath, 'middleware'), { recursive: true });
  
  // Create package.json
  const packageJson = {
    name: name,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'bun run server.js',
      test: 'bun test'
    },
    dependencies: {
      '@atomic/framework': 'file:../../'
    }
  };
  
  await writeFile(
    join(projectPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  // Create server.js
  const serverCode = `import { Atomic } from '@atomic/framework';

const app = new Atomic({
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
  // No need to configure unless you want custom paths
});

// Start server
// Components are auto-discovered from:
// - ./resources/    (FHIR resources)
// - ./operations/   (FHIR operations)
// - ./middleware/   (HTTP middleware)
// - ./packages/     (FHIR IG packages)
app.start();
`;
  
  await writeFile(join(projectPath, 'server.js'), serverCode);
  
  // Create atomic.config.js
  const configCode = `export default {
  server: {
    name: '${name}',
    version: '0.1.0',
    fhirVersion: '4.0.1',
    port: process.env.PORT || 3000,
    url: process.env.BASE_URL || 'http://localhost:3000'
  },
  storage: {
    adapter: 'sqlite',
    config: {
      database: './data.db'
    }
  },
  validation: {
    strict: true
  },
  features: {
    bulkData: false,
    subscription: false
  }
};
`;
  
  await writeFile(join(projectPath, 'atomic.config.js'), configCode);
  
  // Create example Patient resource
  const exampleResource = `import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: 'Patient',
  
  hooks: {
    beforeCreate: async (resource, context) => {
      console.log('Creating patient...');
      return resource;
    }
  }
});
`;
  
  await writeFile(join(projectPath, 'resources', 'Patient.js'), exampleResource);
  
  console.log(`✨ Created new Atomic FHIR project: ${name}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${name}`);
  console.log(`  bun install`);
  console.log(`  bun run dev`);
  console.log(`\nYour server is ready with auto-discovery enabled!`);
  console.log(`- Add resources to ./resources/`);
  console.log(`- Add operations to ./operations/`);
  console.log(`- Add middleware to ./middleware/`);
}

async function generateResource(name) {
  const resourcePath = join(process.cwd(), 'resources', `${name}.js`);
  
  const resourceCode = `import { defineResource } from '@atomic/framework';

export default defineResource({
  resourceType: '${name}',
  
  // Lifecycle hooks
  hooks: {
    beforeCreate: async (resource, context) => {
      // Add custom logic before creating
      return resource;
    },
    afterCreate: async (resource, context) => {
      // Add custom logic after creating
    },
    beforeUpdate: async (resource, previous, context) => {
      // Add custom logic before updating
      return resource;
    },
    afterUpdate: async (resource, previous, context) => {
      // Add custom logic after updating
    }
  },
  
  // Custom search parameters
  searches: {
    // 'custom-param': {
    //   type: 'string',
    //   path: 'field.path',
    //   documentation: 'Custom search parameter'
    // }
  },
  
  // Custom validators
  validators: {
    // async validateCustom(resource) {
    //   // Custom validation logic
    // }
  }
});
`;
  
  await writeFile(resourcePath, resourceCode);
  console.log(`✨ Generated resource: ${name}`);
}

async function generateOperation(name) {
  const [resourceType, opName] = name.includes('/') 
    ? name.split('/')
    : [null, name];
  
  const operationPath = join(process.cwd(), 'operations', `${opName.replace('$', '')}.js`);
  
  const operationCode = `import { defineOperation } from '@atomic/framework';

export default defineOperation({
  name: '${opName.replace('$', '')}',
  resource: ${resourceType ? `'${resourceType}'` : 'null'},
  type: ${resourceType ? "'type'" : "'system'"}, // 'type' | 'instance' | 'system'
  
  parameters: {
    input: [
      // {
      //   name: 'param1',
      //   type: 'string',
      //   min: 0,
      //   max: '1'
      // }
    ],
    output: [
      // {
      //   name: 'return',
      //   type: 'Bundle',
      //   min: 1,
      //   max: '1'
      // }
    ]
  },
  
  async handler(params, context) {
    // Implementation logic
    
    return {
      resourceType: 'Bundle',
      type: 'collection',
      entry: []
    };
  }
});
`;
  
  await writeFile(operationPath, operationCode);
  console.log(`✨ Generated operation: ${name}`);
}

// Main CLI logic
switch (command) {
  case 'new':
    if (!args[1]) {
      console.error('Please provide a project name');
      process.exit(1);
    }
    await createProject(args[1]);
    break;
    
  case 'generate':
  case 'g':
    const type = args[1];
    const name = args[2];
    
    if (!name) {
      console.error('Please provide a name');
      process.exit(1);
    }
    
    switch (type) {
      case 'resource':
        await generateResource(name);
        break;
      case 'operation':
        await generateOperation(name);
        break;
      default:
        console.error(`Unknown generate type: ${type}`);
        process.exit(1);
    }
    break;
    
  case 'dev':
    // Start development server
    console.log('Starting development server...');
    await import('./server.js');
    break;
    
  default:
    console.log(`
Atomic FHIR Framework CLI

Commands:
  atomic new <project-name>           Create a new Atomic project
  atomic generate resource <name>     Generate a new resource
  atomic generate operation <name>    Generate a new operation
  atomic dev                          Start development server
    `);
}