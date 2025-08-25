import { defineOperation } from '@atomic/framework';

// ValueSet expansion operation that uses loaded packages
export default defineOperation({
  name: 'expand',
  resource: 'ValueSet',
  type: 'type',
  
  parameters: {
    input: [
      {
        name: 'url',
        type: 'uri',
        min: 0,
        max: '1',
        documentation: 'ValueSet canonical URL'
      },
      {
        name: 'filter',
        type: 'string',
        min: 0,
        max: '1',
        documentation: 'Filter text'
      }
    ],
    output: [
      {
        name: 'return',
        type: 'ValueSet',
        min: 1,
        max: '1',
        documentation: 'Expanded ValueSet'
      }
    ]
  },
  
  async handler(params, context) {
    const { url, filter } = params;
    const app = this;
    
    // Get ValueSet from loaded packages
    const valueSet = url ? app.packageManager.getValueSet(url) : null;
    
    if (!valueSet) {
      throw new Error(`ValueSet not found: ${url}`);
    }
    
    console.log(`Expanding ValueSet: ${valueSet.name || valueSet.url}`);
    
    // Simple expansion (in real implementation, would resolve all includes)
    const expansion = {
      resourceType: 'ValueSet',
      url: valueSet.url,
      name: valueSet.name,
      status: valueSet.status,
      expansion: {
        timestamp: new Date().toISOString(),
        contains: []
      }
    };
    
    // If the ValueSet includes codes from a CodeSystem
    if (valueSet.compose?.include) {
      for (const include of valueSet.compose.include) {
        if (include.system) {
          // Try to get the CodeSystem from packages
          const codeSystem = app.packageManager.getCodeSystem(include.system);
          
          if (codeSystem) {
            console.log(`Using loaded CodeSystem: ${codeSystem.name || codeSystem.url}`);
            
            // Add concepts from CodeSystem
            if (codeSystem.concept) {
              for (const concept of codeSystem.concept) {
                // Apply filter if provided
                if (!filter || 
                    concept.display?.toLowerCase().includes(filter.toLowerCase()) ||
                    concept.code?.toLowerCase().includes(filter.toLowerCase())) {
                  expansion.expansion.contains.push({
                    system: include.system,
                    code: concept.code,
                    display: concept.display
                  });
                }
              }
            }
          } else if (include.concept) {
            // Use explicitly listed concepts
            for (const concept of include.concept) {
              if (!filter || 
                  concept.display?.toLowerCase().includes(filter.toLowerCase()) ||
                  concept.code?.toLowerCase().includes(filter.toLowerCase())) {
                expansion.expansion.contains.push({
                  system: include.system,
                  code: concept.code,
                  display: concept.display
                });
              }
            }
          }
        }
      }
    }
    
    expansion.expansion.total = expansion.expansion.contains.length;
    
    return expansion;
  }
});