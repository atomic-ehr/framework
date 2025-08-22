import { Atomic } from '@atomic/framework';

// Minimal configuration - everything else is auto-discovered!
const app = new Atomic({
  server: {
    name: 'Minimal FHIR Server'
  }
});

// That's it! The framework will automatically:
// 1. Look for resources in ./resources/
// 2. Look for operations in ./operations/
// 3. Look for middleware in ./middleware/
// 4. Register everything it finds
// 5. Start the server

app.start(3002);