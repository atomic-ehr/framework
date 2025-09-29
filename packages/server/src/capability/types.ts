/**
 * Types for FHIR CapabilityStatement generation
 */

/**
 * Configuration for capability statement generation
 */
export interface CapabilityStatementGeneratorConfig {
  serverName?: string;
  serverVersion?: string;
  serverDescription?: string;
  publisher?: string;
  contact?: ContactDetail[];
  fhirVersion?: string;
  format?: string[];
  acceptLanguage?: string[];
  enabledOperations?: string[];
  securityConfiguration?: SecurityConfig;
}

/**
 * Security configuration for capability statement
 */
export interface SecurityConfig {
  cors?: boolean;
  authentication?: AuthenticationMethod[];
  authorization?: AuthorizationMethod[];
  certificates?: CertificateInfo[];
}

/**
 * Authentication method
 */
export interface AuthenticationMethod {
  type: string;
  display: string;
  description?: string;
}

/**
 * Authorization method
 */
export interface AuthorizationMethod {
  type: string;
  display: string;
  description?: string;
}

/**
 * Certificate information
 */
export interface CertificateInfo {
  type: string;
  blob?: string;
}

/**
 * Contact detail
 */
export interface ContactDetail {
  name?: string;
  telecom?: ContactPoint[];
}

/**
 * Contact point
 */
export interface ContactPoint {
  system?: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
  value?: string;
  use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
  rank?: number;
  period?: Period;
}

/**
 * Period
 */
export interface Period {
  start?: string;
  end?: string;
}

/**
 * FHIR CapabilityStatement resource
 */
export interface CapabilityStatement {
  resourceType: 'CapabilityStatement';
  id?: string;
  meta?: Meta;
  implicitRules?: string;
  language?: string;
  text?: Narrative;
  contained?: any[];
  extension?: Extension[];
  modifierExtension?: Extension[];
  url?: string;
  version?: string;
  name?: string;
  title?: string;
  status: 'draft' | 'active' | 'retired' | 'unknown';
  experimental?: boolean;
  date: string;
  publisher?: string;
  contact?: ContactDetail[];
  description?: string;
  useContext?: UsageContext[];
  jurisdiction?: CodeableConcept[];
  purpose?: string;
  copyright?: string;
  kind: 'instance' | 'capability' | 'requirements';
  instantiates?: string[];
  imports?: string[];
  software?: CapabilityStatementSoftware;
  implementation?: CapabilityStatementImplementation;
  fhirVersion: string;
  format: string[];
  patchFormat?: string[];
  implementationGuide?: string[];
  rest?: CapabilityStatementRest[];
  messaging?: CapabilityStatementMessaging[];
  document?: CapabilityStatementDocument[];
}

/**
 * Software component
 */
export interface CapabilityStatementSoftware {
  name: string;
  version?: string;
  releaseDate?: string;
}

/**
 * Implementation component
 */
export interface CapabilityStatementImplementation {
  description: string;
  url?: string;
}

/**
 * REST component
 */
export interface CapabilityStatementRest {
  mode: 'client' | 'server';
  documentation?: string;
  security?: CapabilityStatementRestSecurity;
  resource?: CapabilityStatementRestResource[];
  interaction?: SystemInteraction[];
  searchParam?: SearchParam[];
  operation?: OperationDefinitionReference[];
  compartment?: string[];
}

/**
 * REST security component
 */
export interface CapabilityStatementRestSecurity {
  cors?: boolean;
  service?: CodeableConcept[];
  description?: string;
  extension?: Extension[];
}

/**
 * REST resource component
 */
export interface CapabilityStatementRestResource {
  type: string;
  profile?: string;
  supportedProfile?: string[];
  documentation?: string;
  interaction?: ResourceInteraction[];
  versioning?: 'no-version' | 'versioned' | 'versioned-update';
  readHistory?: boolean;
  updateCreate?: boolean;
  conditionalCreate?: boolean;
  conditionalRead?: 'not-supported' | 'modified-since' | 'not-match' | 'full-support';
  conditionalUpdate?: boolean;
  conditionalDelete?: 'not-supported' | 'single' | 'multiple';
  referencePolicy?: ('literal' | 'logical' | 'resolves' | 'enforced' | 'local')[];
  searchInclude?: string[];
  searchRevInclude?: string[];
  searchParam?: SearchParam[];
  operation?: OperationDefinitionReference[];
}

/**
 * Resource interaction
 */
export interface ResourceInteraction {
  code: 'read' | 'vread' | 'update' | 'patch' | 'delete' | 'history-instance' | 'history-type' | 'create' | 'search-type';
  documentation?: string;
  extension?: Extension[];
}

/**
 * System interaction
 */
export interface SystemInteraction {
  code: 'transaction' | 'batch' | 'search-system' | 'history-system';
  documentation?: string;
  extension?: Extension[];
}

/**
 * Search parameter
 */
export interface SearchParam {
  name: string;
  definition?: string;
  type: 'number' | 'date' | 'string' | 'token' | 'reference' | 'composite' | 'quantity' | 'uri' | 'special';
  documentation?: string;
  extension?: Extension[];
}

/**
 * Operation definition reference
 */
export interface OperationDefinitionReference {
  name: string;
  definition: string;
  documentation?: string;
}

/**
 * Messaging component
 */
export interface CapabilityStatementMessaging {
  endpoint?: MessagingEndpoint[];
  reliableCache?: number;
  documentation?: string;
  supportedMessage?: SupportedMessage[];
}

/**
 * Messaging endpoint
 */
export interface MessagingEndpoint {
  protocol: Coding;
  address: string;
}

/**
 * Supported message
 */
export interface SupportedMessage {
  mode: 'sender' | 'receiver';
  definition: string;
}

/**
 * Document component
 */
export interface CapabilityStatementDocument {
  mode: 'producer' | 'consumer';
  documentation?: string;
  profile: string;
}

/**
 * Meta
 */
export interface Meta {
  versionId?: string;
  lastUpdated?: string;
  source?: string;
  profile?: string[];
  security?: Coding[];
  tag?: Coding[];
}

/**
 * Narrative
 */
export interface Narrative {
  status: 'generated' | 'extensions' | 'additional' | 'empty';
  div: string;
}

/**
 * Extension
 */
export interface Extension {
  url: string;
  valueBoolean?: boolean;
  valueInteger?: number;
  valueDecimal?: number;
  valueString?: string;
  valueDateTime?: string;
  valueDate?: string;
  valueTime?: string;
  valueCode?: string;
  valueUri?: string;
  valueId?: string;
  valueUnsignedInt?: number;
  valuePositiveInt?: number;
  valueMarkdown?: string;
  valueCoding?: Coding;
  valueCodeableConcept?: CodeableConcept;
  valueReference?: Reference;
  valuePeriod?: Period;
  valueQuantity?: Quantity;
  valueAttachment?: Attachment;
  extension?: Extension[];
}

/**
 * Usage context
 */
export interface UsageContext {
  code: Coding;
  valueCodeableConcept?: CodeableConcept;
  valueQuantity?: Quantity;
  valueRange?: Range;
  valueReference?: Reference;
}

/**
 * Codeable concept
 */
export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

/**
 * Coding
 */
export interface Coding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
  userSelected?: boolean;
}

/**
 * Reference
 */
export interface Reference {
  reference?: string;
  type?: string;
  identifier?: Identifier;
  display?: string;
}

/**
 * Identifier
 */
export interface Identifier {
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
  type?: CodeableConcept;
  system?: string;
  value?: string;
  period?: Period;
  assigner?: Reference;
}

/**
 * Quantity
 */
export interface Quantity {
  value?: number;
  comparator?: '<' | '<=' | '>=' | '>';
  unit?: string;
  system?: string;
  code?: string;
}

/**
 * Range
 */
export interface Range {
  low?: Quantity;
  high?: Quantity;
}

/**
 * Attachment
 */
export interface Attachment {
  contentType?: string;
  language?: string;
  data?: string;
  url?: string;
  size?: number;
  hash?: string;
  title?: string;
  creation?: string;
}

/**
 * Validation result for capability statement
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validation error
 */
export interface ValidationError {
  path: string;
  message: string;
}