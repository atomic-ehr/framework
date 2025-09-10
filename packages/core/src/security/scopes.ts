import type { HandlerContext } from "../types/index.js";

export type SMARTScopePrefix = 'patient' | 'user' | 'system';
export type SMARTScopePermission = 'c' | 'r' | 'u' | 'd' | 's' | 'cruds' | '*';
export type SMARTScopeContext = 'patient' | 'encounter' | 'location' | 'organization' | 'practitioner';

export interface ParsedSMARTScope {
  prefix: SMARTScopePrefix;
  resourceType: string;
  permissions: string[];
  isLaunchContext: boolean;
  isWildcard: boolean;
  raw: string;
}

export interface SecurityContext {
  scopes: string[];
  user?: {
    id: string;
    roles?: string[];
    metadata?: Record<string, any>;
  };
  client?: {
    id: string;
    type: 'public' | 'confidential';
  };
}

const FHIR_RESOURCE_TYPES = new Set([
  'Account', 'ActivityDefinition', 'AdverseEvent', 'AllergyIntolerance', 'Appointment',
  'AppointmentResponse', 'AuditEvent', 'Basic', 'Binary', 'BiologicallyDerivedProduct',
  'BodyStructure', 'Bundle', 'CapabilityStatement', 'CarePlan', 'CareTeam',
  'CatalogEntry', 'ChargeItem', 'ChargeItemDefinition', 'Claim', 'ClaimResponse',
  'ClinicalImpression', 'CodeSystem', 'Communication', 'CommunicationRequest',
  'CompartmentDefinition', 'Composition', 'ConceptMap', 'Condition', 'Consent',
  'Contract', 'Coverage', 'CoverageEligibilityRequest', 'CoverageEligibilityResponse',
  'DetectedIssue', 'Device', 'DeviceDefinition', 'DeviceMetric', 'DeviceRequest',
  'DeviceUseStatement', 'DiagnosticReport', 'DocumentManifest', 'DocumentReference',
  'DomainResource', 'EffectEvidenceSynthesis', 'Encounter', 'Endpoint',
  'EnrollmentRequest', 'EnrollmentResponse', 'EpisodeOfCare', 'EventDefinition',
  'Evidence', 'EvidenceVariable', 'ExampleScenario', 'ExplanationOfBenefit',
  'FamilyMemberHistory', 'Flag', 'Goal', 'GraphDefinition', 'Group',
  'GuidanceResponse', 'HealthcareService', 'ImagingStudy', 'Immunization',
  'ImmunizationEvaluation', 'ImmunizationRecommendation', 'ImplementationGuide',
  'InsurancePlan', 'Invoice', 'Library', 'Linkage', 'List', 'Location',
  'Measure', 'MeasureReport', 'Media', 'Medication', 'MedicationAdministration',
  'MedicationDispense', 'MedicationKnowledge', 'MedicationRequest', 'MedicationStatement',
  'MedicinalProduct', 'MedicinalProductAuthorization', 'MedicinalProductContraindication',
  'MedicinalProductIndication', 'MedicinalProductIngredient', 'MedicinalProductInteraction',
  'MedicinalProductManufactured', 'MedicinalProductPackaged', 'MedicinalProductPharmaceutical',
  'MedicinalProductUndesirableEffect', 'MessageDefinition', 'MessageHeader',
  'MolecularSequence', 'NamingSystem', 'NutritionOrder', 'Observation',
  'ObservationDefinition', 'OperationDefinition', 'OperationOutcome', 'Organization',
  'OrganizationAffiliation', 'Parameters', 'Patient', 'PaymentNotice',
  'PaymentReconciliation', 'Person', 'PlanDefinition', 'Practitioner',
  'PractitionerRole', 'Procedure', 'Provenance', 'Questionnaire', 'QuestionnaireResponse',
  'RelatedPerson', 'RequestGroup', 'ResearchDefinition', 'ResearchElementDefinition',
  'ResearchStudy', 'ResearchSubject', 'Resource', 'RiskAssessment', 'RiskEvidenceSynthesis',
  'Schedule', 'SearchParameter', 'ServiceRequest', 'Slot', 'Specimen',
  'SpecimenDefinition', 'StructureDefinition', 'StructureMap', 'Subscription',
  'Substance', 'SubstanceNucleicAcid', 'SubstancePolymer', 'SubstanceProtein',
  'SubstanceReferenceInformation', 'SubstanceSourceMaterial', 'SubstanceSpecification',
  'SupplyDelivery', 'SupplyRequest', 'Task', 'TerminologyCapabilities', 'TestReport',
  'TestScript', 'ValueSet', 'VerificationResult', 'VisionPrescription'
]);

const VALID_PERMISSIONS = new Set(['c', 'r', 'u', 'd', 's']);

export function parseSMARTScope(scope: string): ParsedSMARTScope | null {
  if (!scope || typeof scope !== 'string') {
    return null;
  }

  scope = scope.trim();

  // Handle special scopes
  if (scope === 'openid' || scope === 'fhirUser' || scope === 'offline_access' || scope === 'online_access') {
    return {
      prefix: 'user' as SMARTScopePrefix,
      resourceType: 'special',
      permissions: [],
      isLaunchContext: false,
      isWildcard: false,
      raw: scope
    };
  }

  // Handle launch context scopes
  if (scope.startsWith('launch/')) {
    const contextType = scope.substring(7); // Remove 'launch/'
    return {
      prefix: 'user' as SMARTScopePrefix,
      resourceType: contextType,
      permissions: [],
      isLaunchContext: true,
      isWildcard: false,
      raw: scope
    };
  }

  // Parse standard SMART scopes: [prefix]/[ResourceType].[permissions]
  const scopePattern = /^(patient|user|system)\/([A-Z*][A-Za-z*]*|\*)\.([cruds*]+|\*)$/;
  const match = scope.match(scopePattern);

  if (!match) {
    return null;
  }

  const [, prefix, resourceType, permissionString] = match;
  const isWildcard = resourceType === '*';

  // Validate resource type (unless it's a wildcard)
  if (!isWildcard && !FHIR_RESOURCE_TYPES.has(resourceType)) {
    // Allow custom resource types but warn
    console.warn(`[SMART Scopes] Unknown FHIR resource type: ${resourceType}`);
  }

  // Parse permissions
  let permissions: string[] = [];
  if (permissionString === '*' || permissionString === 'cruds') {
    permissions = ['c', 'r', 'u', 'd', 's'];
  } else {
    // Split individual permissions and validate
    permissions = [...new Set(permissionString.split(''))].filter(p => VALID_PERMISSIONS.has(p));
    
    if (permissions.length === 0) {
      return null;
    }
  }

  return {
    prefix: prefix as SMARTScopePrefix,
    resourceType,
    permissions,
    isLaunchContext: false,
    isWildcard,
    raw: scope
  };
}

export function parseSMARTScopes(scopes: string | string[]): ParsedSMARTScope[] {
  if (!scopes) return [];

  const scopeArray = typeof scopes === 'string' ? scopes.split(' ') : scopes;
  const parsed: ParsedSMARTScope[] = [];

  for (const scope of scopeArray) {
    const parsedScope = parseSMARTScope(scope);
    if (parsedScope) {
      parsed.push(parsedScope);
    }
  }

  return parsed;
}

export function hasScope(request: Request, requiredScope: string): boolean {
  const context = getSecurityContext(request);
  if (!context || !context.scopes) return false;

  const requiredParsed = parseSMARTScope(requiredScope);
  if (!requiredParsed) return false;

  const userScopes = parseSMARTScopes(context.scopes);

  return userScopes.some(userScope => isScopeMatch(userScope, requiredParsed));
}

export function hasAnyScope(request: Request, requiredScopes: string[]): boolean {
  return requiredScopes.some(scope => hasScope(request, scope));
}

export function hasAllScopes(request: Request, requiredScopes: string[]): boolean {
  return requiredScopes.every(scope => hasScope(request, scope));
}

function isScopeMatch(userScope: ParsedSMARTScope, requiredScope: ParsedSMARTScope): boolean {
  // Special scopes match exactly
  if (userScope.resourceType === 'special' || requiredScope.resourceType === 'special') {
    return userScope.raw === requiredScope.raw;
  }

  // Launch context scopes match exactly
  if (userScope.isLaunchContext || requiredScope.isLaunchContext) {
    return userScope.raw === requiredScope.raw;
  }

  // Prefix must match
  if (userScope.prefix !== requiredScope.prefix) {
    return false;
  }

  // Check resource type match (wildcard user scopes match any resource)
  if (!userScope.isWildcard && userScope.resourceType !== requiredScope.resourceType) {
    return false;
  }

  // Check permissions (user must have all required permissions)
  return requiredScope.permissions.every(reqPerm => 
    userScope.permissions.includes(reqPerm)
  );
}

export function requireScopes(scopes: string[] | ((req: Request) => string[])): (req: Request, context: HandlerContext) => Promise<Request | void> {
  return async (req: Request, context: HandlerContext): Promise<Request | void> => {
    const requiredScopes = typeof scopes === 'function' ? scopes(req) : scopes;
    
    if (requiredScopes.length === 0) {
      return req;
    }

    const hasRequired = hasAllScopes(req, requiredScopes);
    
    if (!hasRequired) {
      const securityContext = getSecurityContext(req);
      const userScopes = securityContext?.scopes || [];
      
      throw new Error(
        `Insufficient scope. Required: [${requiredScopes.join(', ')}], ` +
        `Have: [${userScopes.join(', ')}]`
      );
    }

    return req;
  };
}

export function requireAnyScope(scopes: string[] | ((req: Request) => string[])): (req: Request, context: HandlerContext) => Promise<Request | void> {
  return async (req: Request, context: HandlerContext): Promise<Request | void> => {
    const requiredScopes = typeof scopes === 'function' ? scopes(req) : scopes;
    
    if (requiredScopes.length === 0) {
      return req;
    }

    const hasRequired = hasAnyScope(req, requiredScopes);
    
    if (!hasRequired) {
      const securityContext = getSecurityContext(req);
      const userScopes = securityContext?.scopes || [];
      
      throw new Error(
        `Insufficient scope. Required one of: [${requiredScopes.join(', ')}], ` +
        `Have: [${userScopes.join(', ')}]`
      );
    }

    return req;
  };
}

export function getSecurityContext(request: Request): SecurityContext | null {
  // Check for security context in request metadata
  // This will be populated by auth middleware
  return (request as any).security || null;
}

export function setSecurityContext(request: Request, context: SecurityContext): void {
  (request as any).security = context;
}

export function extractScopesFromToken(token: any): string[] {
  if (!token) return [];

  // Handle various token formats
  if (token.scope) {
    // OAuth2 standard: space-separated scopes
    return typeof token.scope === 'string' ? token.scope.split(' ') : token.scope;
  }

  if (token.scopes) {
    // Array format
    return Array.isArray(token.scopes) ? token.scopes : [token.scopes];
  }

  if (token.permissions) {
    // Custom permissions format - convert to SMART scopes if possible
    return Array.isArray(token.permissions) ? token.permissions : [token.permissions];
  }

  return [];
}

export function scopesToPermissions(scopes: string[], resourceType: string, operation: string): boolean {
  const parsedScopes = parseSMARTScopes(scopes);
  
  // Map FHIR operations to SMART permissions
  const operationPermissionMap: Record<string, string[]> = {
    'create': ['c'],
    'read': ['r'],
    'vread': ['r'],
    'update': ['u'],
    'patch': ['u'],
    'delete': ['d'],
    'search-type': ['s', 'r'],
    'search': ['s', 'r'],
    'history-instance': ['r'],
    'history-type': ['r']
  };

  const requiredPermissions = operationPermissionMap[operation] || ['r'];

  return parsedScopes.some(scope => {
    // Skip special and launch scopes for resource operations
    if (scope.resourceType === 'special' || scope.isLaunchContext) {
      return false;
    }

    // Check if scope covers the resource type
    if (!scope.isWildcard && scope.resourceType !== resourceType) {
      return false;
    }

    // Check if scope has required permissions
    return requiredPermissions.some(perm => scope.permissions.includes(perm));
  });
}

export function validateScopeString(scopeString: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const scopes = scopeString.split(' ').filter(s => s.trim());

  if (scopes.length === 0) {
    errors.push('Scope string cannot be empty');
    return { valid: false, errors };
  }

  for (const scope of scopes) {
    const parsed = parseSMARTScope(scope);
    if (!parsed) {
      errors.push(`Invalid scope format: ${scope}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function normalizeScopeString(scopeString: string): string {
  const scopes = scopeString.split(' ').filter(s => s.trim());
  const uniqueScopes = [...new Set(scopes)];
  
  return uniqueScopes
    .map(scope => parseSMARTScope(scope))
    .filter((parsed): parsed is ParsedSMARTScope => parsed !== null)
    .map(parsed => parsed.raw)
    .join(' ');
}