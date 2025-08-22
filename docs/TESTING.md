# Testing and Validation Guide

This guide covers the testing, linting, and validation tools available in the Atomic FHIR Framework.

## Quick Start

```bash
# Initial setup - install all dependencies
bun run setup

# Run all checks
bun run check

# Run validation suite
bun run validate
```

## Available Commands

### Testing

```bash
# Run all tests
bun test

# Watch mode for development
bun test --watch

# Generate coverage report
bun test --coverage

# Run specific test file
bun test test/framework.test.js
```

### Linting and Formatting

```bash
# Check code style with ESLint
bun run lint

# Auto-fix ESLint issues
bun run lint:fix

# Format code with Prettier
bun run format

# Check formatting without changes
bun run format:check
```

### Validation

```bash
# Check JavaScript syntax across all files
bun run check:syntax

# Run comprehensive validation suite
bun run validate

# Run all checks (syntax, lint, test)
bun run check
```

## Test Structure

```
test/
├── framework.test.js    # Core framework tests
├── validation.test.js   # Validator tests
├── storage.test.js      # Storage adapter tests (future)
└── integration/         # Integration tests (future)
```

## Writing Tests

Tests use Bun's built-in test runner with a Jest-like API:

```javascript
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';

describe('Feature', () => {
  test('should do something', () => {
    expect(1 + 1).toBe(2);
  });
  
  test('async operations', async () => {
    const result = await someAsyncFunction();
    expect(result).toBeDefined();
  });
});
```

## Validation Suite

The validation suite (`scripts/validate.js`) checks:

1. **Framework Instantiation**: Can the framework be created?
2. **Module Imports**: Do all modules load correctly?
3. **Resource Validation**: Are resources properly exported?
4. **Operation Validation**: Are operations properly exported?
5. **Middleware Validation**: Is middleware properly exported?

## Continuous Integration

GitHub Actions runs the following on every push/PR:

1. **Lint Check**: ESLint and Prettier validation
2. **Test Suite**: All unit and integration tests
3. **Build Validation**: Syntax checking and example server validation
4. **FHIR Validation**: FHIR-specific validation tests

## Pre-commit Hooks

Husky runs checks before commits:

```bash
# Automatically runs on git commit:
- ESLint
- Tests
- Syntax check
```

To skip hooks (emergency only):
```bash
git commit --no-verify
```

## Code Quality Standards

### ESLint Rules

- **Semicolons**: Required
- **Quotes**: Single quotes preferred
- **Indentation**: 2 spaces
- **Arrow Functions**: Preferred over function expressions
- **Template Literals**: Preferred for string concatenation
- **Const/Let**: No var declarations

### File Organization

- One export per file for resources/operations/middleware
- Use `export default` for main exports
- Group imports: external, then internal
- Sort imports alphabetically within groups

### Testing Standards

- Minimum 80% code coverage goal
- Test both success and failure cases
- Use descriptive test names
- Mock external dependencies
- Test async operations properly

## Debugging Tests

```bash
# Run tests with detailed output
bun test --verbose

# Run specific test suite
bun test --grep "Resource CRUD"

# Debug with console output
bun test --no-clear-console
```

## Performance Testing

```bash
# Run with timing information
bun test --timing

# Memory usage analysis
bun test --memory-limit=512
```

## Common Issues

### Module Not Found

If you see "Cannot find module '@atomic/framework'":
```bash
# Run setup to install dependencies
bun run setup
```

### Syntax Errors

If syntax check fails:
```bash
# Check specific file
bun scripts/check-syntax.js

# Auto-fix with ESLint
bun run lint:fix
```

### Test Failures

If tests fail:
```bash
# Run tests in watch mode to debug
bun test --watch

# Check test output
bun test --verbose
```

## Contributing

When contributing:

1. Write tests for new features
2. Ensure all tests pass: `bun test`
3. Check linting: `bun run lint`
4. Format code: `bun run format`
5. Run validation: `bun run validate`
6. Update documentation if needed

## Resources

- [Bun Test Documentation](https://bun.sh/docs/cli/test)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [Prettier Options](https://prettier.io/docs/en/options.html)
- [FHIR Validation](http://hl7.org/fhir/validation.html)