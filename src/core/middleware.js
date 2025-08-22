export function defineMiddleware(definition) {
  return {
    name: definition.name,
    scope: definition.scope || {},
    before: definition.before,
    after: definition.after
  };
}