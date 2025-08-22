# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a minimal FHIR framework repository that appears to be in early development stages. The codebase currently consists of a single `index.js` file.

## Project Structure

```
fhir-framework/
├── index.js       # Main entry point (currently empty)
└── CLAUDE.md      # This file
```

## Development Notes

This appears to be a new or minimal project setup for a FHIR (Fast Healthcare Interoperability Resources) framework. As the project grows, this file should be updated with:
- Build and test commands once package.json or other build configurations are added
- Architecture patterns as the codebase develops
- FHIR-specific implementation details and standards followed

## Key Highlights:

### 1. Framework Architecture Analysis

- Analyzed Django, Ruby on Rails, Laravel, and Go frameworks
- Extracted core patterns: MVC/MVT, routing strategies, ORM
  patterns, middleware systems, and extension mechanisms

### 2. FHIR-Native Design Philosophy

  The framework (tentatively named "Atomic.js") maps
  traditional web framework concepts to FHIR:
  - Models → StructureDefinition (resource schemas)
  - Controllers → OperationDefinition (business logic)
  - Routes → CapabilityStatement (API surface)
  - Plugins → Implementation Guides (modular extensions)

### 3. Core Features

  - Resource-centric architecture with lifecycle hooks
  - Operation definitions for custom business logic
  - Middleware system for cross-cutting concerns (auth, audit,
   consent)
  - Implementation Guide support for extensibility
  - Built-in FHIR validation using StructureDefinitions
  - Multiple storage adapters (SQLite default, PostgreSQL,
  etc.)

### 4. Developer Experience

  - Convention over configuration approach
  - Comprehensive CLI tool for scaffolding and management
  - Familiar patterns from popular frameworks
  - TypeScript-first with Bun runtime optimization

### 5. Enterprise Features

  - Subscription support
  - Bulk Data operations
  - SMART on FHIR integration
  - GraphQL interface (optional)
  - Horizontal scaling capabilities

## Conclusion
  The framework leverages Bun's performance characteristics
  while providing a Rails-like developer experience
  specifically tailored for FHIR applications. The
  extensibility through Implementation Guides ensures it can
  adapt to various healthcare standards and regional
  requirements.