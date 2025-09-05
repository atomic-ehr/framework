/**
 * BasicAuthStrategy Usage Examples
 * 
 * Demonstrates various configurations and use cases for HTTP Basic Authentication
 * in the Atomic FHIR framework.
 */

import { BasicAuthStrategy, type BasicAuthConfig } from '../src/strategies/basic-auth.ts';
import { AuthManager } from '../src/core/auth-manager.ts';
import type { AuthenticatedUser } from '../src/types/index.ts';

// ============================================================================
// Example 1: Simple Static Users with Plain Text Passwords
// ============================================================================

console.log('=== Example 1: Simple Static Users ===');

const basicAuthSimple = new BasicAuthStrategy({
  name: 'basic-auth-simple',
  priority: 100,
  users: {
    'admin': 'admin123',
    'doctor': 'doctor456',
    'nurse': 'nurse789'
  },
  realm: 'FHIR Hospital System'
});

console.log('Simple Basic Auth Strategy created with 3 users');

// ============================================================================
// Example 2: Static Users with Hashed Passwords
// ============================================================================

console.log('\n=== Example 2: Hashed Passwords ===');

async function createHashedPasswordStrategy() {
  // Hash passwords beforehand
  const adminHash = await BasicAuthStrategy.hashPassword('secureAdminPass');
  const doctorHash = await BasicAuthStrategy.hashPassword('doctorSecure123');
  
  const basicAuthHashed = new BasicAuthStrategy({
    name: 'basic-auth-hashed',
    priority: 150,
    users: {
      'admin': adminHash,
      'doctor': doctorHash
    },
    hashPasswords: true,
    realm: 'Secure FHIR System'
  });

  console.log('Hashed password strategy created');
  return basicAuthHashed;
}

// ============================================================================
// Example 3: Advanced User Configuration with Roles and Permissions
// ============================================================================

console.log('\n=== Example 3: Advanced User Configuration ===');

const basicAuthAdvanced = new BasicAuthStrategy({
  name: 'basic-auth-advanced',
  priority: 200,
  users: {
    'admin': {
      password: 'adminpass',
      user: {
        id: 'admin-001',
        username: 'admin',
        email: 'admin@hospital.com',
        roles: ['admin', 'practitioner'],
        permissions: {
          canRead: true,
          canWrite: true,
          canDelete: true,
          resources: {
            'Patient': { read: true, write: true, delete: true },
            'Practitioner': { read: true, write: true, delete: false },
            'Observation': { read: true, write: true, delete: false }
          },
          operations: {
            'everything': true,
            'match': true
          }
        },
        metadata: {
          department: 'Administration',
          title: 'System Administrator'
        }
      }
    },
    'doctor': {
      password: 'doctorpass',
      user: {
        id: 'doc-001',
        username: 'doctor',
        email: 'doctor@hospital.com',
        roles: ['practitioner'],
        permissions: {
          canRead: true,
          canWrite: true,
          canDelete: false,
          resources: {
            'Patient': { read: true, write: true },
            'Observation': { read: true, write: true },
            'Condition': { read: true, write: true }
          },
          operations: {
            'everything': true
          }
        },
        metadata: {
          department: 'Cardiology',
          title: 'Cardiologist',
          npi: '1234567890'
        }
      }
    }
  },
  realm: 'FHIR Clinical System',
  caseSensitiveUsernames: true
});

console.log('Advanced configuration strategy created with detailed user profiles');

// ============================================================================
// Example 4: Dynamic User Provider with Database Integration
// ============================================================================

console.log('\n=== Example 4: Dynamic User Provider ===');

// Mock database interface
interface UserDatabase {
  findUserByUsername(username: string): Promise<{
    id: string;
    username: string;
    hashedPassword: string;
    email?: string;
    roles: string[];
    department?: string;
  } | null>;
}

// Mock database implementation
const mockDatabase: UserDatabase = {
  async findUserByUsername(username: string) {
    const users = {
      'dbadmin': {
        id: 'db-admin-1',
        username: 'dbadmin',
        hashedPassword: await BasicAuthStrategy.hashPassword('dbadminpass'),
        email: 'dbadmin@hospital.com',
        roles: ['admin', 'user'],
        department: 'IT'
      },
      'dbdoctor': {
        id: 'db-doctor-1', 
        username: 'dbdoctor',
        hashedPassword: await BasicAuthStrategy.hashPassword('dbdoctorpass'),
        email: 'dbdoctor@hospital.com',
        roles: ['practitioner'],
        department: 'Emergency'
      }
    };
    
    return users[username as keyof typeof users] || null;
  }
};

const basicAuthDynamic = new BasicAuthStrategy({
  name: 'basic-auth-dynamic',
  priority: 300,
  userProvider: async (username: string) => {
    try {
      const dbUser = await mockDatabase.findUserByUsername(username);
      if (!dbUser) {
        return null;
      }

      return {
        password: dbUser.hashedPassword,
        user: {
          id: dbUser.id,
          username: dbUser.username,
          email: dbUser.email,
          roles: dbUser.roles,
          permissions: {
            canRead: true,
            canWrite: dbUser.roles.includes('practitioner'),
            canDelete: dbUser.roles.includes('admin'),
            resources: dbUser.roles.includes('admin') ? {
              '*': { read: true, write: true, delete: true }
            } : {
              'Patient': { read: true, write: true },
              'Observation': { read: true, write: true }
            }
          },
          metadata: {
            department: dbUser.department,
            source: 'database'
          }
        }
      };
    } catch (error) {
      console.error('Database error:', error);
      return null;
    }
  },
  hashPasswords: true,
  realm: 'FHIR Dynamic System'
});

console.log('Dynamic user provider strategy created');

// ============================================================================
// Export for use in other modules
// ============================================================================

export {
  basicAuthSimple,
  basicAuthAdvanced,
  basicAuthDynamic,
  createHashedPasswordStrategy
};