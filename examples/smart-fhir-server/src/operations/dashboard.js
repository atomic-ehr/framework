import { defineOperation, SMARTScopes } from "@atomic-fhir/core";

export default defineOperation({
  name: "dashboard",
  level: "system",
  
  async handler(req, context) {
    // This endpoint requires authentication - the protected middleware will handle redirects
    const securityContext = SMARTScopes.getSecurityContext(req);
    
    if (!securityContext) {
      // This should not happen with protected middleware, but just in case
      return {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'unauthorized', message: 'Authentication required' }
      };
    }

    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'json';

    // Get some basic stats from storage
    const patientCount = await context.storage.search('Patient', {}).then(result => {
      return Array.isArray(result) ? result.length : (result?.total || 0);
    });

    const observationCount = await context.storage.search('Observation', {}).then(result => {
      return Array.isArray(result) ? result.length : (result?.total || 0);
    });

    const dashboardData = {
      title: "Protected Dashboard",
      user: {
        id: securityContext.userId,
        scopes: securityContext.scopes
      },
      stats: {
        totalPatients: patientCount,
        totalObservations: observationCount
      },
      timestamp: new Date().toISOString()
    };

    if (format === 'html') {
      const htmlResponse = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Protected Dashboard</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              max-width: 800px; 
              margin: 50px auto; 
              padding: 20px; 
              background-color: #f5f5f5;
            }
            .dashboard { 
              background: white; 
              padding: 30px; 
              border-radius: 10px; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .stat { 
              display: inline-block; 
              margin: 20px; 
              padding: 20px; 
              background: #4CAF50; 
              color: white; 
              border-radius: 5px;
              min-width: 120px;
              text-align: center;
            }
            .user-info {
              background: #2196F3;
              color: white;
              padding: 15px;
              border-radius: 5px;
              margin-bottom: 20px;
            }
            .scopes {
              margin-top: 10px;
            }
            .scope {
              display: inline-block;
              background: rgba(255,255,255,0.2);
              padding: 2px 8px;
              border-radius: 3px;
              margin: 2px;
              font-size: 12px;
            }
            .logout {
              float: right;
              background: #f44336;
              color: white;
              padding: 10px 20px;
              text-decoration: none;
              border-radius: 5px;
            }
          </style>
        </head>
        <body>
          <div class="dashboard">
            <h1>🔒 Protected Dashboard</h1>
            <a href="/auth/logout" class="logout">Logout</a>
            
            <div class="user-info">
              <strong>👤 User ID:</strong> ${securityContext.userId}
              <div class="scopes">
                <strong>🔑 Scopes:</strong>
                ${securityContext.scopes.map(scope => `<span class="scope">${scope}</span>`).join('')}
              </div>
            </div>
            
            <h2>📊 System Statistics</h2>
            <div class="stat">
              <h3>${dashboardData.stats.totalPatients}</h3>
              <p>Patients</p>
            </div>
            <div class="stat">
              <h3>${dashboardData.stats.totalObservations}</h3>
              <p>Observations</p>
            </div>
            
            <p><strong>Last Updated:</strong> ${dashboardData.timestamp}</p>
            
            <h3>🔗 Try These Protected Endpoints:</h3>
            <ul>
              <li><a href="/Patient">GET /Patient</a> - List patients (requires patient/*.read scope)</li>
              <li><a href="/Observation">GET /Observation</a> - List observations (requires appropriate scopes)</li>
              <li><a href="/\$user-profile">POST /\$user-profile</a> - Your user profile</li>
              <li><a href="/\$dashboard?format=json">POST /\$dashboard?format=json</a> - JSON version</li>
            </ul>
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
      body: dashboardData
    };
  }
});