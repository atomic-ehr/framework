import { defineHook, SMARTScopes } from "@atomic-fhir/core";

export default defineHook({
  name: "auth-audit-hook",
  type: "afterRead",
  resources: "*",
  priority: 900, // Run after most other hooks
  
  handler: async (resource, context) => {
    try {
      // Get security context from the request
      const security = context.security || SMARTScopes.getSecurityContext(context.req);
      
      if (!security) {
        return; // No authentication context
      }

      // Create audit event
      const auditEvent = {
        resourceType: 'AuditEvent',
        id: `auth-read-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        type: {
          system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
          code: 'rest',
          display: 'RESTful Operation'
        },
        subtype: [
          {
            system: 'http://hl7.org/fhir/restful-interaction',
            code: 'read',
            display: 'read'
          }
        ],
        action: 'R',
        recorded: new Date().toISOString(),
        outcome: '0', // Success
        agent: [
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/extra-security-role-type',
                  code: 'humanuser',
                  display: 'Human User'
                }
              ]
            },
            who: security.user ? {
              identifier: {
                value: security.user.id
              }
            } : undefined,
            requestor: true
          }
        ],
        source: {
          observer: {
            display: 'Atomic FHIR Server'
          },
          type: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/security-source-type',
              code: '4',
              display: 'Application Server'
            }
          ]
        },
        entity: [
          {
            what: {
              reference: `${resource.resourceType}/${resource.id}`
            },
            type: {
              system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type',
              code: '2',
              display: 'System Object'
            },
            role: {
              system: 'http://terminology.hl7.org/CodeSystem/object-role',
              code: '4',
              display: 'Domain Resource'
            }
          }
        ]
      };

      // Log audit event (in production, this would be sent to an audit service)
      console.log('[Auth Audit]', JSON.stringify({
        timestamp: auditEvent.recorded,
        action: 'read',
        resource: `${resource.resourceType}/${resource.id}`,
        user: security.user?.id,
        client: security.client?.id,
        scopes: security.scopes?.join(' ')
      }));

      // Optionally store audit event (uncomment to persist audit logs)
      // await context.storage.create('AuditEvent', auditEvent);

    } catch (error) {
      console.error('[Auth Audit Hook] Error:', error);
      // Don't fail the request due to audit errors
    }
  }
});