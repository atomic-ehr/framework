# OAuth2/SMART on FHIR Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing OAuth2 authorization and SMART on FHIR support in the Atomic FHIR Framework. The implementation includes:

- OAuth2 Authorization Code Flow with PKCE
- SMART on FHIR scope system and context management
- OpenID Connect integration
- Client management and authentication
- Security best practices

## Prerequisites

- Atomic FHIR Framework with auth package installed
- Database for storing OAuth2 clients, codes, and tokens
- SSL/TLS certificates for production deployment
- Understanding of OAuth2/OIDC specifications

## Phase 1: Core OAuth2 Infrastructure

### 1.1 Database Schema Setup

Create the necessary database tables for OAuth2 support:

```sql
-- OAuth2 Clients
CREATE TABLE oauth2_clients (
    client_id VARCHAR(255) PRIMARY KEY,
    client_secret VARCHAR(255),
    client_name VARCHAR(255) NOT NULL,
    client_type ENUM('public', 'confidential') NOT NULL,
    redirect_uris JSON NOT NULL,
    scopes JSON NOT NULL,
    fhir_versions JSON DEFAULT ('["4.0.1"]'),
    software_id VARCHAR(255),
    software_version VARCHAR(255),
    logo_uri VARCHAR(255),
    launch_uri VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('active', 'inactive', 'pending') DEFAULT 'pending'
);

-- Authorization Codes
CREATE TABLE oauth2_authorization_codes (
    code VARCHAR(255) PRIMARY KEY,
    client_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    scopes JSON NOT NULL,
    redirect_uri VARCHAR(255) NOT NULL,
    code_challenge VARCHAR(255),
    code_challenge_method ENUM('S256', 'plain'),
    launch_context_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    INDEX idx_client_id (client_id),
    INDEX idx_user_id (user_id),
    INDEX idx_expires_at (expires_at),
    FOREIGN KEY (client_id) REFERENCES oauth2_clients(client_id)
);

-- Refresh Tokens
CREATE TABLE oauth2_refresh_tokens (
    token_hash VARCHAR(255) PRIMARY KEY,
    client_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    scopes JSON NOT NULL,
    launch_context_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_used TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE,
    INDEX idx_client_id (client_id),
    INDEX idx_user_id (user_id),
    INDEX idx_expires_at (expires_at),
    FOREIGN KEY (client_id) REFERENCES oauth2_clients(client_id)
);

-- Launch Contexts
CREATE TABLE smart_launch_contexts (
    launch_id VARCHAR(255) PRIMARY KEY,
    client_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    patient_id VARCHAR(255),
    encounter_id VARCHAR(255),
    organization_id VARCHAR(255),
    location_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    INDEX idx_client_id (client_id),
    INDEX idx_patient_id (patient_id),
    INDEX idx_expires_at (expires_at),
    FOREIGN KEY (client_id) REFERENCES oauth2_clients(client_id)
);
```

### 1.2 Configuration Setup

Configure the OAuth2 authorization server:

```typescript
// src/config/oauth2-config.ts
import { AuthorizationServerConfig } from '@atomic-fhir/auth/types/oauth2';

export const oauth2Config: AuthorizationServerConfig = {
  name: 'oauth2-server',
  priority: 5,
  enabled: true,
  
  // Server identification
  issuer: 'https://your-fhir-server.com',
  fhir_server_url: 'https://your-fhir-server.com',
  
  // Endpoints
  authorization_endpoint: '/oauth/authorize',
  token_endpoint: '/oauth/token',
  introspection_endpoint: '/oauth/introspect',
  revocation_endpoint: '/oauth/revoke',
  jwks_uri: '/.well-known/jwks.json',
  userinfo_endpoint: '/oauth/userinfo',
  
  // Supported features
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scopes: [
    // Patient scopes
    'patient/Patient.read',
    'patient/Patient.write',
    'patient/Observation.read',
    'patient/Observation.write',
    'patient/Condition.read',
    'patient/MedicationRequest.read',
    'patient/*.read',
    
    // User scopes  
    'user/Patient.read',
    'user/Patient.write',
    'user/Practitioner.read',
    'user/*.read',
    
    // System scopes
    'system/Patient.read',
    'system/*.read',
    
    // Special scopes
    'openid',
    'profile',
    'fhirUser',
    'launch',
    'launch/patient',
    'launch/encounter',
    'online_access',
    'offline_access'
  ],
  
  // Token lifetimes (seconds)
  authorization_code_ttl: 600,        // 10 minutes
  access_token_ttl: 3600,            // 1 hour
  refresh_token_ttl: 7776000,        // 90 days
  id_token_ttl: 3600,                // 1 hour
  launch_context_ttl: 3600,          // 1 hour
  
  // Security settings
  require_pkce: true,
  pkce_methods: ['S256'],
  
  // FHIR versions
  supported_fhir_versions: ['4.0.1'],
  
  // Signing configuration
  signing_algorithm: 'RS256',
  signing_key: process.env.OAUTH2_PRIVATE_KEY!, // RSA private key
  signing_key_id: 'oauth2-key-1',
  
  // Client management
  allow_dynamic_registration: true,
  require_client_approval: true,
  
  // OpenID Connect
  oidc_supported: true,
  subject_types: ['public'],
  id_token_signing_alg: ['RS256'],
};
```

### 1.3 Server Integration

Integrate OAuth2 middleware into your FHIR server:

```typescript
// src/server.ts
import { Atomic } from '@atomic-fhir/core';
import { createOAuth2Middleware, createSMARTContextMiddleware, createSMARTScopeMiddleware } from '@atomic-fhir/auth';
import { oauth2Config } from './config/oauth2-config';

const app = new Atomic({
  server: {
    name: 'SMART FHIR Server',
    url: 'https://your-fhir-server.com',
    port: 3000
  }
});

// Add OAuth2 authorization server middleware
app.use(createOAuth2Middleware(oauth2Config));

// Add SMART context and scope enforcement
app.use(createSMARTContextMiddleware());
app.use(createSMARTScopeMiddleware());

await app.start();
```

## Phase 2: Client Management

### 2.1 Client Registration

Implement client registration functionality:

```typescript
// src/oauth2/client-registry.ts
import { SMARTClient, ClientRegistration } from '@atomic-fhir/auth/types/oauth2';

export class ClientRegistry {
  async registerClient(registration: ClientRegistration): Promise<SMARTClient> {
    // Validate registration data
    this.validateRegistration(registration);
    
    // Generate client credentials
    const clientId = this.generateClientId();
    const clientSecret = registration.client_type === 'confidential' ? 
      this.generateClientSecret() : undefined;
    
    // Create client record
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
      status: 'pending' // Requires approval
    };
    
    // Store in database
    await this.db.query(`
      INSERT INTO oauth2_clients 
      (client_id, client_secret, client_name, client_type, redirect_uris, 
       scopes, fhir_versions, software_id, software_version, logo_uri, launch_uri)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      client.client_id, client.client_secret, client.client_name, 
      client.client_type, JSON.stringify(client.redirect_uris),
      JSON.stringify(client.scopes), JSON.stringify(client.fhir_versions),
      client.software_id, client.software_version, client.logo_uri, client.launch_uri
    ]);
    
    return client;
  }
  
  private validateRegistration(registration: ClientRegistration): void {
    if (!registration.client_name?.trim()) {
      throw new Error('Client name is required');
    }
    
    if (!['public', 'confidential'].includes(registration.client_type)) {
      throw new Error('Invalid client type');
    }
    
    if (!registration.redirect_uris?.length) {
      throw new Error('At least one redirect URI is required');
    }
    
    // Validate redirect URIs
    for (const uri of registration.redirect_uris) {
      if (!this.isValidRedirectUri(uri)) {
        throw new Error(`Invalid redirect URI: ${uri}`);
      }
    }
  }
  
  private isValidRedirectUri(uri: string): boolean {
    try {
      const url = new URL(uri);
      // Require HTTPS for production (except localhost)
      if (url.protocol !== 'https:' && !url.hostname.includes('localhost')) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
  
  private generateClientId(): string {
    return `smart_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
  
  private generateClientSecret(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
}
```

### 2.2 Client Management API

Create REST endpoints for client management:

```typescript
// src/operations/client-management.ts
import { defineOperation } from '@atomic-fhir/core';

export default defineOperation({
  name: 'client-register',
  resource: null, // System-level operation
  method: 'POST',
  url: '/oauth/register',
  
  async handler(req, context) {
    const registrationData = await req.json();
    const clientRegistry = new ClientRegistry(context.storage);
    
    try {
      const client = await clientRegistry.registerClient(registrationData);
      
      return {
        client_id: client.client_id,
        client_secret: client.client_secret, // Only returned once
        client_name: client.client_name,
        client_type: client.client_type,
        redirect_uris: client.redirect_uris,
        registration_access_token: generateRegistrationToken(client.client_id)
      };
      
    } catch (error) {
      throw new Error(`Client registration failed: ${error.message}`);
    }
  }
});
```

## Phase 3: SMART Launch Integration

### 3.1 EHR Launch Endpoint

Implement the SMART EHR launch flow:

```typescript
// src/operations/smart-launch.ts
import { defineOperation } from '@atomic-fhir/core';

export default defineOperation({
  name: 'smart-launch',
  resource: null,
  method: 'POST',
  url: '/smart/launch',
  
  async handler(req, context) {
    const { patient, encounter, user } = await req.json();
    
    // Create launch context
    const launchId = generateLaunchId();
    const launchContext = {
      launch_id: launchId,
      client_id: '', // Will be populated during authorization
      patient_id: patient,
      encounter_id: encounter,
      user_id: user,
      expires_at: new Date(Date.now() + 3600000) // 1 hour
    };
    
    // Store launch context
    await context.storage.query(`
      INSERT INTO smart_launch_contexts 
      (launch_id, patient_id, encounter_id, user_id, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `, [launchId, patient, encounter, user, launchContext.expires_at]);
    
    return { launch: launchId };
  }
});
```

### 3.2 Launch Context Resolution

```typescript
// src/smart/context-manager.ts
export class LaunchContextManager {
  async resolveLaunchContext(launchId: string): Promise<LaunchContext | null> {
    const result = await this.db.query(`
      SELECT * FROM smart_launch_contexts 
      WHERE launch_id = ? AND expires_at > NOW() AND used = FALSE
    `, [launchId]);
    
    if (!result.length) {
      return null;
    }
    
    const row = result[0];
    return {
      launch_id: row.launch_id,
      client_id: row.client_id,
      context: {
        patient: row.patient_id,
        encounter: row.encounter_id,
        user: row.user_id,
        organization: row.organization_id,
        location: row.location_id
      },
      created_at: row.created_at,
      expires_at: row.expires_at
    };
  }
  
  async associateClientWithLaunch(launchId: string, clientId: string): Promise<void> {
    await this.db.query(`
      UPDATE smart_launch_contexts 
      SET client_id = ? 
      WHERE launch_id = ?
    `, [clientId, launchId]);
  }
  
  async markLaunchUsed(launchId: string): Promise<void> {
    await this.db.query(`
      UPDATE smart_launch_contexts 
      SET used = TRUE 
      WHERE launch_id = ?
    `, [launchId]);
  }
}
```

## Phase 4: Security Implementation

### 4.1 PKCE Implementation

```typescript
// src/oauth2/pkce-validator.ts
export class PKCEValidator {
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
    const length = 128;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }
    return result;
  }
}
```

### 4.2 Token Security

```typescript
// src/oauth2/token-generator.ts
import { createSign, createVerify } from 'crypto';

export class TokenGenerator {
  constructor(private privateKey: string, private publicKey: string) {}
  
  generateAccessToken(payload: any): string {
    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: 'oauth2-key-1'
    };
    
    const now = Math.floor(Date.now() / 1000);
    const tokenPayload = {
      ...payload,
      iat: now,
      exp: now + 3600, // 1 hour
      nbf: now - 60,   // Allow 1 minute clock skew
      jti: this.generateJTI()
    };
    
    const headerEncoded = this.base64UrlEncode(JSON.stringify(header));
    const payloadEncoded = this.base64UrlEncode(JSON.stringify(tokenPayload));
    
    const signInput = `${headerEncoded}.${payloadEncoded}`;
    const signature = createSign('RSA-SHA256')
      .update(signInput)
      .sign(this.privateKey, 'base64url');
    
    return `${signInput}.${signature}`;
  }
  
  verifyToken(token: string): any {
    const [headerEncoded, payloadEncoded, signature] = token.split('.');
    
    const signInput = `${headerEncoded}.${payloadEncoded}`;
    const isValid = createVerify('RSA-SHA256')
      .update(signInput)
      .verify(this.publicKey, signature, 'base64url');
    
    if (!isValid) {
      throw new Error('Invalid token signature');
    }
    
    const payload = JSON.parse(this.base64UrlDecode(payloadEncoded));
    
    // Validate timing claims
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      throw new Error('Token expired');
    }
    if (payload.nbf && now < payload.nbf) {
      throw new Error('Token not yet valid');
    }
    
    return payload;
  }
  
  private generateJTI(): string {
    return crypto.randomUUID();
  }
  
  private base64UrlEncode(data: string): string {
    return Buffer.from(data).toString('base64url');
  }
  
  private base64UrlDecode(data: string): string {
    return Buffer.from(data, 'base64url').toString();
  }
}
```

## Phase 5: Testing and Validation

### 5.1 Unit Tests

```typescript
// tests/oauth2/pkce-validator.test.ts
import { PKCEValidator } from '../../src/oauth2/pkce-validator';

describe('PKCEValidator', () => {
  const validator = new PKCEValidator();
  
  test('should generate valid PKCE challenge', () => {
    const { verifier, challenge } = validator.generateChallenge();
    
    expect(verifier).toHaveLength(128);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(validator.validateChallenge(challenge, verifier, 'S256')).toBe(true);
  });
  
  test('should reject invalid code verifier', () => {
    const { challenge } = validator.generateChallenge();
    const invalidVerifier = 'invalid-verifier';
    
    expect(validator.validateChallenge(challenge, invalidVerifier, 'S256')).toBe(false);
  });
});
```

### 5.2 Integration Tests

```typescript
// tests/integration/oauth2-flow.test.ts
describe('OAuth2 Authorization Code Flow', () => {
  test('should complete full authorization flow with PKCE', async () => {
    // 1. Client generates PKCE challenge
    const pkce = new PKCEValidator().generateChallenge();
    
    // 2. Start authorization flow
    const authUrl = new URL('/oauth/authorize', 'http://localhost:3000');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', 'test-client');
    authUrl.searchParams.set('redirect_uri', 'http://localhost:3001/callback');
    authUrl.searchParams.set('scope', 'patient/Patient.read patient/Observation.read');
    authUrl.searchParams.set('state', 'random-state');
    authUrl.searchParams.set('code_challenge', pkce.challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    
    const authResponse = await fetch(authUrl);
    expect(authResponse.status).toBe(200);
    
    // 3. Simulate user consent (would be handled by UI)
    // This would involve POST to /oauth/authorize with approval
    
    // 4. Exchange code for tokens
    const tokenResponse = await fetch('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'mock-auth-code',
        redirect_uri: 'http://localhost:3001/callback',
        client_id: 'test-client',
        code_verifier: pkce.verifier
      })
    });
    
    expect(tokenResponse.status).toBe(200);
    const tokenData = await tokenResponse.json();
    expect(tokenData.access_token).toBeDefined();
    expect(tokenData.token_type).toBe('Bearer');
  });
});
```

## Deployment Considerations

### Production Checklist

- [ ] SSL/TLS certificates properly configured
- [ ] Private keys securely stored (HSM or key vault)
- [ ] Database connections encrypted
- [ ] Rate limiting implemented on all endpoints
- [ ] Comprehensive audit logging configured
- [ ] Token storage uses secure random generation
- [ ] PKCE enforced for all public clients
- [ ] Redirect URI validation is strict (exact match)
- [ ] Client secrets use sufficient entropy
- [ ] Token expiration times appropriate for use case
- [ ] Refresh token rotation implemented
- [ ] Introspection endpoint properly secured
- [ ] Discovery endpoints return accurate metadata
- [ ] CORS properly configured for web clients
- [ ] Content Security Policy headers set
- [ ] Regular security audits scheduled

### Monitoring and Alerts

Set up monitoring for:
- Failed authentication attempts (potential attacks)
- Token generation rates (abuse detection)
- Client registration requests (review required)
- PKCE validation failures (implementation issues)
- Token introspection response times
- Launch context resolution failures

### Performance Optimization

- Database indexes on frequently queried fields
- Token caching for introspection endpoints
- Connection pooling for database access
- Redis/Memcached for session storage
- CDN for discovery endpoint responses
- Async processing for non-critical operations

This implementation guide provides a comprehensive foundation for OAuth2/SMART on FHIR support in the Atomic FHIR Framework while maintaining security best practices and industry standards compliance.