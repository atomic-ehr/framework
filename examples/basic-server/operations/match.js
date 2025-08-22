import { defineOperation } from '@atomic/framework';

function calculateMatchScore(searchPatient, candidatePatient) {
  let score = 0;
  let maxScore = 0;
  
  // Name matching (40% weight)
  if (searchPatient.name && candidatePatient.name) {
    maxScore += 40;
    const searchName = searchPatient.name[0];
    const candidateName = candidatePatient.name[0];
    
    if (searchName.family && candidateName.family) {
      if (searchName.family.toLowerCase() === candidateName.family.toLowerCase()) {
        score += 20;
      } else if (candidateName.family.toLowerCase().includes(searchName.family.toLowerCase())) {
        score += 10;
      }
    }
    
    if (searchName.given && candidateName.given) {
      const searchGiven = searchName.given[0]?.toLowerCase();
      const candidateGiven = candidateName.given[0]?.toLowerCase();
      
      if (searchGiven === candidateGiven) {
        score += 20;
      } else if (candidateGiven?.startsWith(searchGiven)) {
        score += 10;
      }
    }
  }
  
  // Birth date matching (30% weight)
  if (searchPatient.birthDate && candidatePatient.birthDate) {
    maxScore += 30;
    if (searchPatient.birthDate === candidatePatient.birthDate) {
      score += 30;
    }
  }
  
  // Identifier matching (30% weight)
  if (searchPatient.identifier && candidatePatient.identifier) {
    maxScore += 30;
    for (const searchId of searchPatient.identifier) {
      for (const candidateId of candidatePatient.identifier) {
        if (searchId.system === candidateId.system && 
            searchId.value === candidateId.value) {
          score += 30;
          break;
        }
      }
    }
  }
  
  return maxScore > 0 ? score / maxScore : 0;
}

export default defineOperation({
  name: 'match',
  resource: 'Patient',
  type: 'type',
  
  parameters: {
    input: [
      {
        name: 'resource',
        type: 'Patient',
        min: 1,
        max: '1',
        documentation: 'The patient resource to match against'
      },
      {
        name: 'onlyCertainMatches',
        type: 'boolean',
        min: 0,
        max: '1',
        documentation: 'If true, only return matches with high confidence (>0.8)'
      },
      {
        name: 'count',
        type: 'integer',
        min: 0,
        max: '1',
        documentation: 'Maximum number of matches to return'
      }
    ],
    output: [
      {
        name: 'return',
        type: 'Bundle',
        min: 1,
        max: '1',
        documentation: 'Bundle of matching patients with scores'
      }
    ]
  },
  
  async handler(params, context) {
    const { resource, onlyCertainMatches = false, count = 10 } = params;
    
    if (!resource || resource.resourceType !== 'Patient') {
      throw new Error('Invalid patient resource provided');
    }
    
    // Search for potential matches
    const candidates = await context.storage.searchPatients({
      name: resource.name,
      birthDate: resource.birthDate,
      identifier: resource.identifier
    });
    
    // Calculate match scores
    const matches = candidates
      .map(candidate => ({
        resource: candidate,
        score: calculateMatchScore(resource, candidate)
      }))
      .filter(match => match.score > 0)
      .sort((a, b) => b.score - a.score);
    
    // Filter by certainty if requested
    const filtered = onlyCertainMatches 
      ? matches.filter(m => m.score > 0.8)
      : matches;
    
    // Limit results
    const limited = filtered.slice(0, count);
    
    // Build response bundle
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: limited.length,
      entry: limited.map(({ resource, score }) => ({
        fullUrl: `Patient/${resource.id}`,
        resource,
        search: {
          mode: 'match',
          score: Math.round(score * 100) / 100
        }
      }))
    };
  }
});