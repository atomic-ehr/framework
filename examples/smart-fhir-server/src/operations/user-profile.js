import { defineOperation } from "@atomic-fhir/core";

export default defineOperation({
  name: "user-profile",
  level: "system",
  
  async handler(req, context) {
    const { SMARTScopes } = await import("@atomic-fhir/core");
    
    // This endpoint requires authentication - the protected middleware will handle redirects
    const securityContext = SMARTScopes.getSecurityContext(req);
    
    if (!securityContext) {
      return {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'unauthorized', message: 'Authentication required' }
      };
    }

    try {
      // Look up the user's Basic resource to get profile information
      const searchResult = await context.storage.search('Basic', {});
      const resources = Array.isArray(searchResult) ? searchResult : searchResult?.entry?.map(e => e.resource) || [];
      
      let userResource = null;
      for (const resource of resources) {
        if (resource.code?.coding?.[0]?.code === 'user' && resource.id === securityContext.userId) {
          userResource = resource;
          break;
        }
      }

      if (!userResource) {
        return {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: { error: 'user_not_found', message: 'User profile not found' }
        };
      }

      // Extract user information from extensions
      const getExtensionValue = (url) => {
        const extension = userResource.extension?.find(ext => 
          ext.url === `http://atomic-fhir.org/ig/auth/StructureDefinition/${url}`
        );
        return extension?.valueString || extension?.valueBoolean;
      };

      const getExtensionValues = (url) => {
        const extensions = userResource.extension?.filter(ext => 
          ext.url === `http://atomic-fhir.org/ig/auth/StructureDefinition/${url}`
        );
        return extensions?.map(ext => ext.valueString || ext.valueBoolean) || [];
      };

      const userProfile = {
        id: userResource.id,
        username: getExtensionValue('username'),
        email: getExtensionValue('email'),
        active: getExtensionValue('active-status') !== false,
        roles: getExtensionValues('user-role'),
        scopes: getExtensionValues('smart-scope'),
        currentSessionScopes: securityContext.scopes,
        lastUpdated: userResource.meta?.lastUpdated || 'Unknown'
      };

      const url = new URL(req.url);
      const format = url.searchParams.get('format') || 'json';

      if (format === 'html') {
        const htmlResponse = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>User Profile</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                max-width: 600px; 
                margin: 50px auto; 
                padding: 20px; 
                background-color: #f5f5f5;
              }
              .profile { 
                background: white; 
                padding: 30px; 
                border-radius: 10px; 
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .field { 
                margin: 15px 0; 
                padding: 10px; 
                background: #f8f9fa; 
                border-radius: 5px;
              }
              .label { 
                font-weight: bold; 
                color: #495057;
              }
              .value { 
                margin-top: 5px;
              }
              .scope, .role {
                display: inline-block;
                background: #007bff;
                color: white;
                padding: 2px 8px;
                border-radius: 3px;
                margin: 2px;
                font-size: 12px;
              }
              .role {
                background: #28a745;
              }
              .active {
                color: #28a745;
                font-weight: bold;
              }
              .inactive {
                color: #dc3545;
                font-weight: bold;
              }
              .back-link {
                display: inline-block;
                margin-top: 20px;
                background: #6c757d;
                color: white;
                padding: 10px 20px;
                text-decoration: none;
                border-radius: 5px;
              }
            </style>
          </head>
          <body>
            <div class="profile">
              <h1>👤 User Profile</h1>
              
              <div class="field">
                <div class="label">User ID:</div>
                <div class="value">${userProfile.id}</div>
              </div>
              
              <div class="field">
                <div class="label">Username:</div>
                <div class="value">${userProfile.username}</div>
              </div>
              
              <div class="field">
                <div class="label">Email:</div>
                <div class="value">${userProfile.email || 'Not set'}</div>
              </div>
              
              <div class="field">
                <div class="label">Status:</div>
                <div class="value">
                  <span class="${userProfile.active ? 'active' : 'inactive'}">
                    ${userProfile.active ? '✅ Active' : '❌ Inactive'}
                  </span>
                </div>
              </div>
              
              <div class="field">
                <div class="label">Roles:</div>
                <div class="value">
                  ${userProfile.roles.map(role => `<span class="role">${role}</span>`).join('')}
                </div>
              </div>
              
              <div class="field">
                <div class="label">Available Scopes:</div>
                <div class="value">
                  ${userProfile.scopes.map(scope => `<span class="scope">${scope}</span>`).join('')}
                </div>
              </div>
              
              <div class="field">
                <div class="label">Current Session Scopes:</div>
                <div class="value">
                  ${userProfile.currentSessionScopes.map(scope => `<span class="scope">${scope}</span>`).join('')}
                </div>
              </div>
              
              <div class="field">
                <div class="label">Last Updated:</div>
                <div class="value">${userProfile.lastUpdated}</div>
              </div>
              
              <a href="/\$dashboard" class="back-link">← Back to Dashboard</a>
            </div>
          </body>
          </html>
        `;

        return {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
          body: htmlResponse
        };
      }

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: userProfile
      };

    } catch (error) {
      console.error('[User Profile] Error:', error);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'server_error', message: 'Failed to retrieve user profile' }
      };
    }
  }
});