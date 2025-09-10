import { defineMiddleware, SMARTScopes } from "@atomic-fhir/core";

export default defineMiddleware({
  name: "scope-logger",
  before: async (req, context) => {
    const security = SMARTScopes.getSecurityContext(req);
    if (security?.scopes?.length) {
      console.log(`🔍 [SMART FHIR] ${req.method} ${new URL(req.url).pathname} - Scopes: [${security.scopes.join(', ')}]`);
    }
    return req;
  }
});