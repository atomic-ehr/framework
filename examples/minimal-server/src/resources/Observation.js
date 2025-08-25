import { defineResource } from '@atomic/framework';

// This file will be auto-discovered because it's in the resources/ folder
// and exports a resource definition as default
// Hooks are now defined separately in the hooks/ folder for better reusability

export default defineResource({
  resourceType: 'Observation'
  // All capabilities (create, read, update, delete, search, history) enabled by default
  // Add custom search parameters or other configuration as needed
});