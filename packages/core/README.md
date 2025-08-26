# @atomic-fhir/core

Core framework for Atomic FHIR - a FHIR-native web framework for JavaScript/Bun.

## Installation

```bash
bun add @atomic-fhir/core
```

## Usage

```javascript
import Atomic from '@atomic-fhir/core';

const app = new Atomic({
  server: {
    name: 'My FHIR Server',
    port: 3000
  }
});

await app.start();
```

## Features

- 🏥 FHIR-native architecture
- 🚀 Zero configuration with autoload
- 📦 FHIR IG package management
- 🔌 Extensible storage adapters
- 🪝 Lifecycle hooks system
- ⚡ Built for Bun runtime

## Documentation

See the main repository for full documentation: https://github.com/atomic-fhir/framework

## License

MIT