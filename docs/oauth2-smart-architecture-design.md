# OAuth2/OIDC and SMART on FHIR Architecture Design

## Executive Summary

This document outlines the architectural design for OAuth2/OIDC authentication and SMART on FHIR support in the Atomic FHIR Framework. The design builds upon the existing JWT-based authentication system and extends it to support industry-standard OAuth2 flows, OpenID Connect identity protocols, and SMART on FHIR specifications.

## Current Framework Integration Points

### Existing Infrastructure
- **Auth Package**: `packages/auth/` provides authentication strategies, user management, and permission systems
- **JWT Strategy**: Robust JWT validation with JWKS support, claims extraction, and token lifecycle management
- **Middleware System**: Request/response pipeline with authentication middleware integration
- **Core Framework**: Route handling, storage abstraction, and FHIR resource management

### Key Integration Opportunities
1. **Token Management**: Extend existing JWT infrastructure for OAuth2 tokens
2. **Authentication Strategies**: Add OAuth2 strategy alongside existing JWT/Basic auth
3. **Middleware Pipeline**: Integrate authorization server endpoints into request routing
4. **FHIR Context**: Leverage existing HandlerContext for SMART context injection

## OAuth2 Authorization Server Architecture

### Core Components

#### 1. Authorization Server (`packages/auth/src/oauth2/`)
```typescript
interface AuthorizationServerConfig {
  // Server configuration
  issuer: string;                    // OAuth2 issuer identifier
  authorizationEndpoint: string;     // /oauth/authorize
  tokenEndpoint: string;             // /oauth/token
  introspectionEndpoint: string;     // /oauth/introspect
  revocationEndpoint: string;        // /oauth/revoke
  jwksEndpoint: string;             // /.well-known/jwks.json
  
  // Security settings
  supportedGrantTypes: string[];     // ['authorization_code', 'refresh_token']
  supportedResponseTypes: string[];  // ['code']
  supportedScopes: string[];         // SMART scopes + custom
  requirePKCE: boolean;             // Enforce PKCE for all clients
  
  // Token configuration  
  authorizationCodeTTL: number;     // 600 seconds (10 minutes)
  accessTokenTTL: number;           // 3600 seconds (1 hour)
  refreshTokenTTL: number;          // 7776000 seconds (90 days)
  
  // SMART on FHIR specific
  fhirServerUrl: string;            // Base FHIR server URL
  supportedFHIRVersions: string[];  // ['4.0.1']
  launchContextTTL: number;         // Launch context expiration
}
```

#### 2. Authorization Endpoint Handler
```typescript
class AuthorizationEndpoint {
  async handle(req: Request): Promise<Response> {
    // 1. Parse and validate authorization request
    const authReq = this.parseAuthorizationRequest(req);
    
    // 2. Validate client and redirect URI
    const client = await this.validateClient(authReq.client_id, authReq.redirect_uri);
    
    // 3. Validate requested scopes
    const validatedScopes = await this.validateScopes(authReq.scope, client);
    
    // 4. Handle SMART launch context if present
    let launchContext: LaunchContext | undefined;
    if (authReq.launch) {
      launchContext = await this.resolveLaunchContext(authReq.launch);
    }
    
    // 5. Create authorization session
    const authSession = await this.createAuthorizationSession({
      clientId: client.client_id,
      scopes: validatedScopes,
      redirectUri: authReq.redirect_uri,
      state: authReq.state,
      codeChallenge: authReq.code_challenge,
      codeChallengeMethod: authReq.code_challenge_method,
      launchContext,
      audience: authReq.aud
    });
    
    // 6. Return consent page or redirect
    return this.renderConsentPage(authSession);
  }
}
```

#### 3. Token Endpoint Handler
```typescript
class TokenEndpoint {
  async handle(req: Request): Promise<Response> {
    // 1. Parse token request
    const tokenReq = this.parseTokenRequest(req);
    
    // 2. Authenticate client
    const client = await this.authenticateClient(tokenReq, req);
    
    // 3. Handle grant type
    switch (tokenReq.grant_type) {
      case 'authorization_code':
        return this.handleAuthorizationCode(tokenReq, client);
      case 'refresh_token':
        return this.handleRefreshToken(tokenReq, client);
      default:
        throw new OAuth2Error('unsupported_grant_type');
    }
  }
  
  private async handleAuthorizationCode(
    tokenReq: TokenRequest, 
    client: SMARTClient
  ): Promise<Response> {
    // 1. Validate authorization code
    const authCode = await this.validateAuthorizationCode(tokenReq.code!);
    
    // 2. Validate PKCE if present
    if (authCode.codeChallenge) {
      this.validatePKCE(authCode.codeChallenge, tokenReq.code_verifier!);
    }
    
    // 3. Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(authCode, client);
    
    // 4. Include SMART context in token response
    const tokenResponse: TokenResponse = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.config.accessTokenTTL,
      refresh_token: refreshToken,
      scope: authCode.scopes.join(' '),
      // SMART context
      patient: authCode.launchContext?.patient,
      encounter: authCode.launchContext?.encounter,
      user: authCode.launchContext?.user,
      // OpenID Connect
      id_token: client.supportedGrantTypes?.includes('openid') ? 
        await this.generateIdToken(authCode, client) : undefined
    };
    
    return new Response(JSON.stringify(tokenResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

## SMART on FHIR Context and Scopes System

### SMART Scope Parser
```typescript
class SMARTScopeParser {
  parseScopes(scopeString: string): SMARTScope[] {
    return scopeString.split(' ').map(scope => this.parseScope(scope));
  }
  
  private parseScope(scope: string): SMARTScope {
    // Handle standard SMART scopes: patient/Patient.read, user/Observation.*, system/*.write
    const smartMatch = scope.match(/^(patient|user|system)\/([^.]+)\.(.+)$/);
    if (smartMatch) {
      return {
        context: smartMatch[1] as 'patient' | 'user' | 'system',
        resourceType: smartMatch[2],
        access: smartMatch[3] as 'read' | 'write' | '*',
        originalScope: scope
      };
    }
    
    // Handle special scopes: openid, profile, fhirUser, launch, launch/patient, etc.
    const specialScopes = [
      'openid', 'profile', 'email', 'phone', 'address',
      'fhirUser', 'launch', 'launch/patient', 'launch/encounter',
      'online_access', 'offline_access'
    ];
    
    if (specialScopes.includes(scope)) {
      return {
        context: 'system',
        resourceType: '*',
        access: '*',
        originalScope: scope,
        special: scope
      };
    }
    
    throw new OAuth2Error('invalid_scope', `Unsupported scope: ${scope}`);
  }
}
```

### FHIR Context Manager
```typescript
class FHIRContextManager {
  async createLaunchContext(
    launchId: string, 
    clientId: string,
    contextParams: FHIRContext
  ): Promise<LaunchContext> {
    // 1. Validate context parameters
    await this.validateContext(contextParams);
    
    // 2. Create launch context
    const launchContext: LaunchContext = {
      launch_id: launchId,
      client_id: clientId,
      context: contextParams,
      created_at: new Date(),
      expires_at: new Date(Date.now() + this.config.launchContextTTL * 1000)
    };
    
    // 3. Store launch context
    await this.storage.storeLaunchContext(launchContext);
    
    return launchContext;
  }
  
  async resolveLaunchContext(launchId: string): Promise<LaunchContext | null> {
    const context = await this.storage.retrieveLaunchContext(launchId);
    
    if (!context || context.expires_at < new Date()) {
      return null;
    }
    
    return context;
  }
  
  private async validateContext(context: FHIRContext): Promise<void> {
    // Validate patient exists and user has access
    if (context.patient) {
      const patient = await this.fhirStorage.read('Patient', context.patient);
      if (!patient) {
        throw new OAuth2Error('invalid_request', 'Patient not found');
      }
    }
    
    // Validate encounter exists and is associated with patient
    if (context.encounter) {
      const encounter = await this.fhirStorage.read('Encounter', context.encounter);
      if (!encounter) {
        throw new OAuth2Error('invalid_request', 'Encounter not found');
      }
      
      if (context.patient && encounter.subject?.reference !== `Patient/${context.patient}`) {
        throw new OAuth2Error('invalid_request', 'Encounter not associated with patient');
      }
    }
  }
}
```

## Client Application Management System

### Client Registry
```typescript
class ClientRegistry {
  async registerClient(registration: ClientRegistration): Promise<SMARTClient> {
    // 1. Validate registration data
    this.validateRegistration(registration);
    
    // 2. Generate client credentials
    const clientId = this.generateClientId();
    const clientSecret = registration.client_type === 'confidential' ? 
      this.generateClientSecret() : undefined;
    
    // 3. Create client record
    const client: SMARTClient = {
      client_id: clientId,
      client_secret: clientSecret,
      client_name: registration.client_name,
      client_type: registration.client_type,
      redirect_uris: registration.redirect_uris,
      scopes: registration.scopes || this.getDefaultScopes(),
      fhir_versions: registration.fhir_versions || ['4.0.1'],
      software_id: registration.software_id,
      software_version: registration.software_version,
      logo_uri: registration.logo_uri,
      launch_uri: registration.launch_uri,
      created_at: new Date(),
      status: 'active'
    };
    
    // 4. Store client
    await this.storage.storeClient(client);
    
    return client;
  }
  
  async getClient(clientId: string): Promise<SMARTClient | null> {
    return this.storage.retrieveClient(clientId);
  }
  
  async validateClient(clientId: string, redirectUri?: string): Promise<SMARTClient> {
    const client = await this.getClient(clientId);
    if (!client || client.status !== 'active') {
      throw new OAuth2Error('invalid_client', 'Client not found or inactive');
    }
    
    if (redirectUri && !client.redirect_uris.includes(redirectUri)) {
      throw new OAuth2Error('invalid_request', 'Invalid redirect URI');
    }
    
    return client;
  }
}
```

### Client Authentication
```typescript
class ClientAuthenticator {
  async authenticateClient(req: Request, tokenReq: TokenRequest): Promise<SMARTClient> {
    // 1. Try client_secret_basic (Authorization header)
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Basic ')) {
      return this.authenticateBasic(authHeader);
    }
    
    // 2. Try client_secret_post (request body)
    if (tokenReq.client_secret) {
      return this.authenticatePost(tokenReq.client_id, tokenReq.client_secret);
    }
    
    // 3. Public client (PKCE required)
    const client = await this.clientRegistry.getClient(tokenReq.client_id);
    if (client?.client_type === 'public') {
      return client;
    }
    
    throw new OAuth2Error('invalid_client', 'Client authentication required');
  }
}
```

## Token Management with PKCE Support

### PKCE Validator
```typescript
class PKCEValidator {
  validateChallenge(codeChallenge: string, codeVerifier: string, method: 'S256' | 'plain' = 'S256'): boolean {
    if (method === 'plain') {
      return codeChallenge === codeVerifier;
    }
    
    if (method === 'S256') {
      const hash = crypto.createHash('sha256').update(codeVerifier).digest();
      const expected = hash.toString('base64url');
      return codeChallenge === expected;
    }
    
    return false;
  }
  
  generateChallenge(): { verifier: string; challenge: string } {
    const verifier = this.generateCodeVerifier();
    const hash = crypto.createHash('sha256').update(verifier).digest();
    const challenge = hash.toString('base64url');
    
    return { verifier, challenge };
  }
  
  private generateCodeVerifier(): string {
    // Generate random 43-128 character URL-safe string
    const length = 128;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
```

### Enhanced JWT Strategy for SMART Tokens
```typescript
class SMARTJWTStrategy extends JWTStrategy {
  async authenticate(req: Request, context: HandlerContext): Promise<AuthenticationResult> {
    const result = await super.authenticate(req, context);
    
    if (result.success && result.user) {
      // Enhance user with SMART context from token
      result.user = await this.enrichWithSMARTContext(result.user);
    }
    
    return result;
  }
  
  private async enrichWithSMARTContext(user: AuthenticatedUser): Promise<AuthenticatedUser> {
    const tokenPayload = user.metadata?.jwtClaims as JWTPayload;
    if (!tokenPayload) return user;
    
    // Extract SMART context from token
    const smartContext: FHIRContext = {
      patient: tokenPayload.patient,
      encounter: tokenPayload.encounter,
      user: tokenPayload.fhirUser || user.id,
      organization: tokenPayload.organization,
      location: tokenPayload.location
    };
    
    // Parse SMART scopes
    const scopes = tokenPayload.scope?.split(' ') || [];
    const smartScopes = this.smartScopeParser.parseScopes(scopes.join(' '));
    
    return {
      ...user,
      metadata: {
        ...user.metadata,
        smartContext,
        smartScopes,
        fhirVersion: tokenPayload.fhir_version || '4.0.1'
      }
    };
  }
}
```

## OAuth2 Middleware Integration

### Authorization Server Middleware
```typescript
export function createOAuth2Middleware(config: AuthorizationServerConfig): MiddlewareDefinition {
  return {
    name: 'oauth2-server',
    priority: 10,
    
    async before(context: HandlerContext) {
      const { req } = context as any;
      const url = new URL(req.url);
      
      // Handle OAuth2 endpoints
      if (url.pathname === '/oauth/authorize') {
        return await authorizationEndpoint.handle(req);
      }
      
      if (url.pathname === '/oauth/token') {
        return await tokenEndpoint.handle(req);
      }
      
      if (url.pathname === '/oauth/introspect') {
        return await introspectionEndpoint.handle(req);
      }
      
      if (url.pathname === '/oauth/revoke') {
        return await revocationEndpoint.handle(req);
      }
      
      if (url.pathname === '/.well-known/jwks.json') {
        return await jwksEndpoint.handle(req);
      }
      
      if (url.pathname === '/.well-known/openid_configuration') {
        return await discoveryEndpoint.handle(req);
      }
      
      if (url.pathname === '/.well-known/smart-configuration') {
        return await smartDiscoveryEndpoint.handle(req);
      }
      
      // Continue with normal request processing
      return undefined;
    }
  };
}
```

### SMART Context Injection Middleware
```typescript
export function createSMARTContextMiddleware(): MiddlewareDefinition {
  return {
    name: 'smart-context',
    priority: 20, // After authentication
    
    async before(context: HandlerContext) {
      const { req, user } = context as any;
      
      if (!user?.metadata?.smartContext) {
        return undefined;
      }
      
      // Inject SMART context into request processing
      const smartContext = user.metadata.smartContext as FHIRContext;
      
      // Add context-based query filters
      if (smartContext.patient) {
        this.addPatientContextFilters(context, smartContext.patient);
      }
      
      if (smartContext.user) {
        this.addUserContextFilters(context, smartContext.user);
      }
      
      return undefined;
    }
  };
}
```

## Security Considerations and Implementation Plan

### Security Best Practices

#### 1. PKCE Implementation
- **Mandatory for Public Clients**: All mobile and SPA clients must use PKCE
- **Recommended for Confidential Clients**: Provides additional security layer
- **Code Challenge Method**: Use SHA256 only, deprecate 'plain' method
- **Entropy Requirements**: Code verifier minimum 43 characters, maximum 128

#### 2. Token Security
- **Short-lived Access Tokens**: 15-60 minutes maximum
- **Secure Refresh Tokens**: Rotation on use, longer TTL (90 days max)
- **Token Binding**: Consider implementing token binding to client certificates
- **Cryptographic Security**: Use crypto-secure random number generation

#### 3. FHIR Context Security
- **Context Validation**: Verify user has legitimate access to patient context
- **Organizational Boundaries**: Enforce data access within user's organization
- **Audit Requirements**: Log all context access and context switching
- **Context Lifetime**: Short-lived launch contexts with proper expiration

#### 4. Client Security
- **Dynamic Registration**: Support for client registration with approval workflow
- **Client Authentication**: Enforce appropriate authentication for client type
- **Redirect URI Validation**: Strict exact-match validation for security
- **Scope Restrictions**: Per-client scope limitations and validation

### Implementation Phases

#### Phase 1: Core OAuth2 Infrastructure (4-6 hours)
1. **Authorization Server Setup**
   - Basic endpoint handlers (authorize, token, introspect)
   - Client registry and authentication
   - Authorization code generation and validation

2. **Database Schema**
   - OAuth2 clients table
   - Authorization codes table  
   - Refresh tokens table
   - Launch contexts table

3. **Basic PKCE Support**
   - Code challenge generation and validation
   - Integration with authorization flow

#### Phase 2: SMART on FHIR Integration (3-4 hours)
1. **SMART Scope Parser**
   - Parse and validate SMART scopes
   - Context-specific permission mapping
   - Integration with existing permission system

2. **Launch Context Management**
   - Launch parameter handling
   - Context validation and storage
   - Context injection into tokens

3. **FHIR Context Middleware**
   - Patient context filtering
   - User context enforcement
   - Audit logging integration

#### Phase 3: Advanced Features (2-3 hours)
1. **OpenID Connect Support**
   - ID token generation
   - UserInfo endpoint
   - Discovery endpoints

2. **Token Introspection**
   - RFC 7662 compliance
   - Scope and context exposure
   - Performance optimization

3. **Discovery and Metadata**
   - OAuth2 discovery endpoint
   - SMART configuration endpoint
   - JWKS endpoint

### Testing Strategy

#### Unit Tests
- OAuth2 flow components
- PKCE validation logic
- SMART scope parsing
- Client authentication methods

#### Integration Tests
- Full OAuth2 authorization code flow
- SMART launch sequence
- Token refresh and revocation
- Error scenarios and edge cases

#### Security Tests
- PKCE bypass attempts
- Token reuse and replay attacks
- Scope elevation attacks
- Client impersonation scenarios

### Performance Considerations

#### Optimization Strategies
- **Token Caching**: Cache frequently accessed tokens and contexts
- **Database Indexing**: Proper indexing on client_id, user_id, token hashes
- **Connection Pooling**: Efficient database connection management
- **Rate Limiting**: Protect authorization and token endpoints

#### Monitoring and Metrics
- **Token Generation Rate**: Monitor for abuse patterns
- **Failed Authentication Attempts**: Security monitoring
- **Context Resolution Time**: Performance tracking
- **Client Usage Patterns**: Analytics and optimization

This comprehensive architecture provides a robust foundation for OAuth2/OIDC and SMART on FHIR support while maintaining security best practices and integration with the existing Atomic FHIR Framework infrastructure.