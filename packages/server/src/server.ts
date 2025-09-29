/**
 * Main FHIR server class with hooks integration
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { EventEmitter } from 'events';
import {
  HooksManager,
  ContextFactory,
  generateRequestId,
  type HookDefinition,
  type HookPhase,
  type AppContext,
  type BaseContext
} from '@atomic-ehr/core';

import type {
  FhirServerConfig,
  HttpRequestContext,
  HttpResponseContext,
  ErrorContext,
  ServerStats,
  ServerEvent,
  ServerEventData
} from './types.js';
import { FhirRouter, FhirRoutingError, defaultNotFoundHandler } from './routing/index.js';
import { PackageIntegration, createPackageIntegration } from './integration/packages.js';
import type { LoadedPackage } from '@atomic-ehr/packages';
import type { FHIRSchema } from '@atomic-ehr/fhirschema';
import { RouteGenerator, MemoryStorageAdapter, type StorageAdapter, type ResourceCapabilities } from './generation/index.js';
import { ValidationBridge, ValidationMetricsCollector, FhirValidationError } from '@atomic-ehr/validation-bridge';
import { CapabilityStatementGenerator, MetadataHandler, type CapabilityStatement } from './capability/index.js';
import { ErrorHandler, RequestResponseLogger, DebugSupport, createDebugSupport } from './error/index.js';

/**
 * FHIR Server with integrated hooks system
 */
export class FhirServer extends EventEmitter {
  private server: Server | null = null;
  private hooksManager: HooksManager;
  private router: FhirRouter;
  private config: FhirServerConfig;
  private appContext: AppContext;
  private baseContext: BaseContext;
  private stats: ServerStats;
  private packageIntegration: PackageIntegration | null = null;
  private routeGenerator: RouteGenerator | null = null;
  private validationBridge: ValidationBridge | null = null;
  private validationMetrics: ValidationMetricsCollector | null = null;
  private storage: StorageAdapter;
  private dynamicRoutes: Map<string, any> = new Map();
  private capabilityGenerator: CapabilityStatementGenerator | null = null;
  private metadataHandler: MetadataHandler | null = null;
  private errorHandler: ErrorHandler | null = null;
  private requestLogger: RequestResponseLogger | null = null;
  private debugSupport: DebugSupport | null = null;
  private isStarted = false;

  constructor(config: FhirServerConfig) {
    super();

    this.config = {
      host: 'localhost',
      timeout: 30000,
      maxBodySize: 10 * 1024 * 1024, // 10MB
      cors: { enabled: false },
      logging: { level: 'info', format: 'text' },
      enableDynamicRoutes: true, // Enable by default
      ...config
    };

    this.hooksManager = new HooksManager();
    this.router = new FhirRouter();
    this.stats = this.initializeStats();

    // Initialize storage
    this.storage = this.config.storage || new MemoryStorageAdapter();

    // Initialize route generator if dynamic routes are enabled
    if (this.config.enableDynamicRoutes) {
      this.routeGenerator = new RouteGenerator({
        storage: this.storage,
        defaultCapabilities: this.config.defaultCapabilities,
        enabledOperations: this.config.enabledOperations as any
      });
    }

    // Create base context with default services
    this.baseContext = ContextFactory.createBaseContext({
      requestId: generateRequestId(),
      logger: this.createLogger(),
      clock: this.createClock(),
      config: this.createConfig(),
      events: this
    });

    this.appContext = ContextFactory.createAppContext(this.baseContext);

    // Initialize package integration if packages are configured
    if (this.config.packages && this.config.packages.length > 0) {
      this.initializePackageIntegration();
    }

    // Register pre-configured hooks
    if (this.config.hooks) {
      this.config.hooks.forEach(hook => this.addHook(hook));
    }

    // Initialize validation bridge if enabled
    if (this.config.validation?.enabled !== false) {
      this.validationBridge = new ValidationBridge(this.config.validation);
      this.validationMetrics = new ValidationMetricsCollector();
      this.registerValidationHooks();
    }

    // Register dynamic route generation hooks
    if (this.routeGenerator) {
      this.registerDynamicRouteHooks();
    }

    // Initialize capability statement generator
    this.capabilityGenerator = new CapabilityStatementGenerator({
      serverName: config.serverName || '@atomic-ehr/server',
      serverVersion: config.serverVersion || '0.1.0',
      serverDescription: config.description || 'FHIR Server with Hook-based Architecture',
      fhirVersion: config.fhirVersion || '4.0.1',
      enabledOperations: config.enabledOperations || [],
      securityConfiguration: config.securityConfig || { cors: true }
    });

    this.metadataHandler = new MetadataHandler(this.capabilityGenerator, this.packageIntegration || undefined);

    // Register capability hooks
    this.registerCapabilityHooks();

    // Register /metadata endpoint
    this.registerMetadataEndpoint();

    // Initialize error handling
    this.errorHandler = new ErrorHandler({
      includeStackTrace: config.debug || false,
      ...config.errorHandling
    });
    this.addHook(this.errorHandler.createErrorHandlingHook());

    // Initialize request/response logging
    if (config.requestLogging?.logRequests !== false || config.requestLogging?.logResponses !== false) {
      this.requestLogger = new RequestResponseLogger(config.requestLogging);
      const loggingHooks = this.requestLogger.createLoggingHooks();
      loggingHooks.forEach(hook => this.addHook(hook));
    }

    // Initialize debug support
    this.debugSupport = config.debug ? new DebugSupport(true) : createDebugSupport();
    const debugHooks = this.debugSupport.createDebugHooks();
    debugHooks.forEach(hook => this.addHook(hook));
  }

  /**
   * Add a hook to the server
   */
  addHook(hook: HookDefinition): void {
    this.hooksManager.register(hook);
    this.log('debug', `Registered hook: ${hook.name} for phase: ${hook.phase}`);
  }

  /**
   * Remove a hook from the server
   */
  removeHook(hookName: string): void {
    this.hooksManager.unregister(hookName);
    this.log('debug', `Unregistered hook: ${hookName}`);
  }

  /**
   * Get the FHIR router instance
   */
  getRouter(): FhirRouter {
    return this.router;
  }

  /**
   * Add a route to the server
   */
  addRoute(route: any): void {
    this.router.addRoute(route);
    this.log('debug', `Added route: ${route.method} ${route.pattern}`);
  }

  /**
   * Remove a route from the server
   */
  removeRoute(method: string, pattern: any): void {
    this.router.removeRoute(method, pattern);
    this.log('debug', `Removed route: ${method} ${pattern}`);
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('Server is already started');
    }

    this.emit('server:starting', { timestamp: Date.now() });

    try {
      // Initialize package integration if configured
      if (this.packageIntegration) {
        await this.packageIntegration.init();
      }

      // Execute bootstrap hooks (will trigger package loading)
      await this.executeHookPhase('onBootstrap', this.appContext);

      // Execute config resolved hooks
      await this.executeHookPhase('onConfigResolved', this.appContext);

      // Execute registration hooks
      await this.executeHookPhase('onRegister', this.appContext);

      // Execute route registration hooks (placeholder for Task 003)
      await this.executeHookPhase('onRouteRegister', this.appContext);

      // Create HTTP server
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch(error => {
          this.log('error', 'Unhandled request error:', error);
          this.sendErrorResponse(res, error);
        });
      });

      // Configure server settings
      this.server.timeout = this.config.timeout!;
      this.server.maxHeadersCount = 100;

      // Start listening
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.config.port, this.config.host, () => {
          this.isStarted = true;
          this.log('info', `FHIR Server started on http://${this.config.host}:${this.config.port}`);
          this.emit('server:started', { timestamp: Date.now() });
          resolve();
        });

        this.server!.on('error', reject);
      });

    } catch (error) {
      this.log('error', 'Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    if (!this.isStarted || !this.server) {
      return;
    }

    this.emit('server:stopping', { timestamp: Date.now() });

    try {
      // Execute shutdown hooks
      await this.executeHookPhase('onShutdown', this.appContext);

      // Dispose package integration
      if (this.packageIntegration) {
        await this.packageIntegration.dispose();
      }

      // Close server
      await new Promise<void>((resolve, reject) => {
        this.server!.close((error) => {
          if (error) {
            reject(error);
          } else {
            this.isStarted = false;
            this.server = null;
            this.log('info', 'FHIR Server stopped');
            this.emit('server:stopped', { timestamp: Date.now() });
            resolve();
          }
        });
      });

    } catch (error) {
      this.log('error', 'Error during server shutdown:', error);
      throw error;
    }
  }

  /**
   * Get server statistics
   */
  getStats(): ServerStats {
    return { ...this.stats };
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.isStarted;
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    this.stats.totalRequests++;
    this.stats.activeConnections++;

    this.emit('request:received', {
      timestamp: startTime,
      requestId,
      data: { method: req.method, url: req.url }
    });

    try {
      // Create request context
      const requestContext = await this.createRequestContext(req, res, requestId, startTime);

      // Execute hook phases
      await this.executeHookPhase('preRequest', requestContext);

      // Check if hooks took over response
      if (requestContext._hookState?.takenOver) {
        const response = requestContext._hookState.response!;
        this.sendResponse(res, response);
        this.updateStats(startTime, true);
        return;
      }

      await this.executeHookPhase('preValidation', requestContext);

      if (requestContext._hookState?.takenOver) {
        const response = requestContext._hookState.response!;
        this.sendResponse(res, response);
        this.updateStats(startTime, true);
        return;
      }

      await this.executeHookPhase('preHandler', requestContext);

      if (requestContext._hookState?.takenOver) {
        const response = requestContext._hookState.response!;
        this.sendResponse(res, response);
        this.updateStats(startTime, true);
        return;
      }

      // Execute FHIR routing and handler
      const responseContext = await this.executeHandler(requestContext);

      await this.executeHookPhase('preResponse', responseContext);
      await this.executeHookPhase('onResponse', responseContext);

      this.sendResponse(res, responseContext);
      this.updateStats(startTime, true);

      this.emit('request:completed', {
        timestamp: Date.now(),
        requestId,
        data: { statusCode: responseContext.statusCode, duration: Date.now() - startTime }
      });

    } catch (error) {
      const errorContext: ErrorContext = {
        ...(await this.createRequestContext(req, res, requestId, startTime)),
        error: error as Error,
        handled: false
      };

      try {
        await this.executeHookPhase('onError', errorContext);

        if (errorContext.handled && errorContext.errorResponse) {
          this.sendResponse(res, errorContext.errorResponse);
        } else {
          this.sendErrorResponse(res, error as Error);
        }
      } catch (hookError) {
        this.log('error', 'Error in error handling hooks:', hookError);
        this.sendErrorResponse(res, error as Error);
      }

      this.updateStats(startTime, false);
      this.emit('request:error', {
        timestamp: Date.now(),
        requestId,
        data: { error: (error as Error).message }
      });
    } finally {
      this.stats.activeConnections--;
    }
  }

  /**
   * Execute a hook phase
   */
  private async executeHookPhase<T extends Record<string, any>>(
    phase: HookPhase,
    context: T
  ): Promise<T> {
    return this.hooksManager.executePhase(phase, context);
  }

  /**
   * Create request context from HTTP request
   */
  private async createRequestContext(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    startTime: number
  ): Promise<HttpRequestContext> {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const body = await this.parseBody(req);

    const baseRequestContext = ContextFactory.createRequestContext(this.appContext, {
      method: req.method!,
      url: req.url!,
      headers: req.headers as Record<string, string>,
      body,
      resourceType: this.extractResourceType(req.url!),
      operation: this.extractOperation(req.method!, req.url!)
    });

    // Augment with HTTP-specific properties
    const httpContext: HttpRequestContext = {
      ...baseRequestContext,
      requestId,
      startTime,
      params: {}, // Will be populated by router in Task 003
      query: Object.fromEntries(url.searchParams),
      raw: { req, res },
      _hookState: {
        stopped: false,
        takenOver: false,
        skipped: false,
        diagnostics: []
      }
    };

    // Add hook control methods
    this.augmentContextWithHookControls(httpContext);

    return httpContext;
  }

  /**
   * Execute FHIR routing and handler
   */
  private async executeHandler(context: HttpRequestContext): Promise<HttpResponseContext> {
    try {
      // Match the request against FHIR routes
      const routeMatch = this.router.match(context.method, context.url);

      if (!routeMatch) {
        // No route matched - return 404 with FHIR OperationOutcome
        return defaultNotFoundHandler(context);
      }

      // Augment context with route information
      context.params = { ...context.params, ...routeMatch.params };
      context.operation = routeMatch.operation;
      context.resourceType = routeMatch.resourceType;

      // Add routing-specific properties to context
      (context as any).level = routeMatch.level;
      (context as any).operationName = routeMatch.operationName;

      this.log('debug', `Matched route: ${routeMatch.route.method} ${routeMatch.route.pattern} -> ${routeMatch.operation}`);

      // Execute the matched route handler
      const response = await routeMatch.route.handler(context);

      // Ensure response has proper timing information
      if (!response.timing) {
        response.timing = {
          startTime: context.startTime,
          endTime: Date.now(),
          duration: Date.now() - context.startTime,
          hookDuration: 0
        };
      }

      return response;

    } catch (error) {
      // Handle routing errors
      if (error instanceof FhirRoutingError) {
        return {
          statusCode: error.statusCode,
          responseHeaders: {
            'Content-Type': 'application/fhir+json; charset=utf-8',
            'X-Request-ID': context.requestId
          },
          responseBody: error.toOperationOutcome(),
          timing: {
            startTime: context.startTime,
            endTime: Date.now(),
            duration: Date.now() - context.startTime,
            hookDuration: 0
          }
        };
      }

      // Re-throw other errors to be handled by the main error handler
      throw error;
    }
  }

  /**
   * Send HTTP response
   */
  private sendResponse(res: ServerResponse, context: HttpResponseContext): void {
    res.statusCode = context.statusCode || 200;

    // Set headers
    Object.entries(context.responseHeaders || {}).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Set default FHIR headers if not present
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/fhir+json');
    }

    // Handle CORS if enabled
    if (this.config.cors?.enabled) {
      this.setCorsHeaders(res);
    }

    // Send response body
    if (context.responseBody) {
      const body = typeof context.responseBody === 'string'
        ? context.responseBody
        : JSON.stringify(context.responseBody, null, 2);
      res.end(body);
    } else {
      res.end();
    }
  }

  /**
   * Send error response with FHIR OperationOutcome
   */
  private sendErrorResponse(res: ServerResponse, error: Error): void {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/fhir+json');

    if (this.config.cors?.enabled) {
      this.setCorsHeaders(res);
    }

    const operationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    };

    res.end(JSON.stringify(operationOutcome, null, 2));
  }

  /**
   * Parse request body
   */
  private async parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (req.method === 'GET' || req.method === 'DELETE') {
        resolve(undefined);
        return;
      }

      let body = '';
      let length = 0;

      req.on('data', (chunk) => {
        length += chunk.length;
        if (length > this.config.maxBodySize!) {
          reject(new Error('Request body too large'));
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          if (body && req.headers['content-type']?.includes('application/json')) {
            resolve(JSON.parse(body));
          } else {
            resolve(body || undefined);
          }
        } catch (error) {
          reject(new Error('Invalid JSON in request body'));
        }
      });

      req.on('error', reject);
    });
  }

  /**
   * Extract resource type from URL (placeholder for Task 003)
   */
  private extractResourceType(url: string): string | undefined {
    const match = url.match(/\/([A-Z][a-zA-Z]*)/);
    return match ? match[1] : undefined;
  }

  /**
   * Extract operation from method and URL (placeholder for Task 003)
   */
  private extractOperation(method: string, url: string): string | undefined {
    switch (method) {
      case 'GET': return 'read';
      case 'POST': return 'create';
      case 'PUT': return 'update';
      case 'DELETE': return 'delete';
      default: return undefined;
    }
  }

  /**
   * Augment context with hook control methods
   */
  private augmentContextWithHookControls(context: HttpRequestContext): void {
    (context as any).stopPropagation = () => {
      context._hookState!.stopped = true;
    };

    (context as any).takeOver = () => {
      context._hookState!.takenOver = true;
    };

    (context as any).skip = () => {
      context._hookState!.skipped = true;
    };

    (context as any).setResponse = (response: HttpResponseContext) => {
      context._hookState!.response = response;
    };

    (context as any).addDiagnostic = (diagnostic: any) => {
      context._hookState!.diagnostics.push(diagnostic);
    };
  }

  /**
   * Set CORS headers
   */
  private setCorsHeaders(res: ServerResponse): void {
    const corsConfig = this.config.cors!;

    res.setHeader('Access-Control-Allow-Origin',
      corsConfig.origins?.join(', ') || '*');

    res.setHeader('Access-Control-Allow-Methods',
      corsConfig.methods?.join(', ') || 'GET, POST, PUT, DELETE, OPTIONS');

    res.setHeader('Access-Control-Allow-Headers',
      corsConfig.headers?.join(', ') || 'Content-Type, Authorization');
  }

  /**
   * Initialize server statistics
   */
  private initializeStats(): ServerStats {
    return {
      totalRequests: 0,
      activeConnections: 0,
      averageResponseTime: 0,
      requestsPerSecond: 0,
      errorRate: 0,
      uptime: Date.now()
    };
  }

  /**
   * Initialize package integration
   */
  private initializePackageIntegration(): void {
    this.packageIntegration = createPackageIntegration({
      packages: this.config.packages || [],
      packageConfig: this.config.packageConfig,
      autoLoadBaseResources: this.config.packageConfig?.autoLoadBaseResources ?? true,
      enableProgressLogging: this.config.packageConfig?.enableProgressLogging ?? true,
      failOnPackageLoadError: this.config.packageConfig?.failOnPackageLoadError ?? false
    });

    // Register package integration hooks
    const hooks = this.packageIntegration.getHooks();
    hooks.forEach(hook => this.addHook(hook));

    this.log('info', 'Package integration initialized', {
      packagesConfigured: this.config.packages?.length || 0
    });
  }

  /**
   * Get loaded packages
   */
  getLoadedPackages(): LoadedPackage[] {
    return this.packageIntegration?.getLoadedPackages() || [];
  }

  /**
   * Get all schemas
   */
  getSchemas(): Map<string, FHIRSchema> {
    return this.packageIntegration?.getSchemas() || new Map();
  }

  /**
   * Get supported resource types
   */
  getSupportedResourceTypes(): string[] {
    return this.packageIntegration?.getSupportedResourceTypes() || [];
  }

  /**
   * Get package loading statistics
   */
  getPackageStats() {
    return this.packageIntegration?.getStats();
  }

  /**
   * Check if a resource type is supported
   */
  isResourceTypeSupported(resourceType: string): boolean {
    const schemas = this.getSchemas();
    return schemas.has(resourceType);
  }

  /**
   * Get schema for a resource type
   */
  getSchema(resourceType: string): FHIRSchema | undefined {
    const schemas = this.getSchemas();
    return schemas.get(resourceType);
  }

  /**
   * Get dynamic routes
   */
  getDynamicRoutes(): any[] {
    return Array.from(this.dynamicRoutes.values());
  }

  /**
   * Get resource capabilities
   */
  getResourceCapabilities(resourceType: string): ResourceCapabilities | undefined {
    return this.routeGenerator?.getResourceCapabilities(resourceType);
  }

  /**
   * Get storage adapter
   */
  getStorage(): StorageAdapter {
    return this.storage;
  }

  /**
   * Get validation bridge
   */
  getValidationBridge(): ValidationBridge | null {
    return this.validationBridge;
  }

  /**
   * Get validation metrics
   */
  getValidationMetrics() {
    return this.validationMetrics?.getSummary();
  }

  /**
   * Validate a resource manually
   */
  async validateResource(resourceType: string, resource: any) {
    if (!this.validationBridge) {
      throw new Error('Validation bridge not initialized');
    }

    return this.validationBridge.validateResource(resourceType, resource);
  }

  /**
   * Get capability statement
   */
  getCapabilityStatement(): CapabilityStatement | null {
    return this.capabilityGenerator?.generate() || null;
  }

  /**
   * Get capability generator
   */
  getCapabilityGenerator(): CapabilityStatementGenerator | null {
    return this.capabilityGenerator;
  }

  /**
   * Get error handler
   */
  getErrorHandler(): ErrorHandler | null {
    return this.errorHandler;
  }

  /**
   * Get error metrics
   */
  getErrorMetrics() {
    return this.errorHandler?.getSummary();
  }

  /**
   * Get request logger
   */
  getRequestLogger(): RequestResponseLogger | null {
    return this.requestLogger;
  }

  /**
   * Get debug support
   */
  getDebugSupport(): DebugSupport | null {
    return this.debugSupport;
  }

  /**
   * Register validation hooks
   */
  private registerValidationHooks(): void {
    if (!this.validationBridge) {
      return;
    }

    // Configure validation schemas after packages are loaded
    this.addHook({
      name: 'validation-schema-setup',
      phase: 'onRouteRegister',
      priority: 85, // After packages loaded, before route generation
      handler: async (context) => {
        if (!this.packageIntegration) {
          return context;
        }

        const schemas = this.packageIntegration.getSchemas();
        this.validationBridge!.setSchemas(schemas);

        this.log('info', 'Validation schemas configured', {
          schemaCount: schemas.size,
          resourceTypes: Array.from(schemas.keys()).slice(0, 10)
        });

        return context;
      }
    });

    // Register validation hooks
    this.addHook(this.validationBridge.createValidationHook());

    if (this.config.validation?.profileValidation !== false) {
      this.addHook(this.validationBridge.createProfileValidationHook());
    }

    // Register metrics collection hook
    if (this.validationMetrics) {
      this.addHook(this.validationMetrics.createMetricsHook());
    }

    // Handle validation errors
    this.addHook({
      name: 'validation-error-handler',
      phase: 'onError',
      priority: 90,
      handler: async (context: any) => {
        if (context.error instanceof FhirValidationError) {
          context.setResponse({
            statusCode: context.error.statusCode,
            responseHeaders: {
              'Content-Type': 'application/fhir+json; charset=utf-8',
              'X-Request-ID': context.requestId
            },
            responseBody: context.error.operationOutcome,
            timing: {
              startTime: context.startTime,
              endTime: Date.now(),
              duration: Date.now() - context.startTime,
              hookDuration: 0
            }
          });
          context.handled = true;

          this.log('warn', 'FHIR validation failed', {
            resourceType: context.resourceType,
            operation: context.operation,
            issues: context.error.operationOutcome.issue?.length || 0
          });
        }

        return context;
      }
    });
  }

  /**
   * Register dynamic route generation hooks
   */
  private registerDynamicRouteHooks(): void {
    if (!this.routeGenerator) {
      return;
    }

    // Generate routes after packages are loaded
    this.addHook({
      name: 'dynamic-route-generator',
      phase: 'onRouteRegister',
      priority: 80,
      handler: async (context) => {
        const packages = this.packageIntegration?.getLoadedPackages() || [];

        if (packages.length === 0) {
          this.log('info', 'No packages loaded, skipping dynamic route generation');
          return context;
        }

        this.log('info', 'Generating dynamic routes from packages...', {
          packageCount: packages.length
        });

        try {
          const routes = this.routeGenerator!.generateFromPackages(packages);

          // Register routes with router
          let successCount = 0;
          for (const route of routes) {
            try {
              // Check if route already exists (avoid duplicates with default routes)
              if (!this.router.hasRoute(route.method, route.pattern)) {
                this.router.addRoute(route);
                this.dynamicRoutes.set(`${route.method}:${route.pattern}`, route);
                successCount++;
              }
            } catch (error) {
              this.log('warn', `Failed to add dynamic route ${route.method} ${route.pattern}:`, error);
            }
          }

          const resourceTypes = [...new Set(packages.flatMap(p => Object.keys(p.resources)))];

          this.log('info', 'Dynamic routes generated successfully', {
            totalRoutes: routes.length,
            registeredRoutes: successCount,
            resourceTypes: resourceTypes.length
          });
        } catch (error) {
          this.log('error', 'Failed to generate dynamic routes:', error);
        }

        return context;
      }
    });

    // Add resource validation hook
    this.addHook({
      name: 'resource-validation',
      phase: 'preHandler',
      priority: 70,
      handler: async (context: any) => {
        // Validate resources during create/update/patch operations
        if (['create', 'update', 'patch'].includes(context.operation) && context.body) {
          const resourceType = context.resourceType;
          if (resourceType) {
            const schema = this.getSchema(resourceType);
            if (schema) {
              // Basic validation - in production use full FHIRSchema validation
              if (!context.body.resourceType || context.body.resourceType !== resourceType) {
                // Set error response in context
                (context as any).setResponse({
                  statusCode: 422,
                  responseHeaders: {
                    'Content-Type': 'application/fhir+json; charset=utf-8',
                    'X-Request-ID': context.requestId
                  },
                  responseBody: {
                    resourceType: 'OperationOutcome',
                    issue: [{
                      severity: 'error',
                      code: 'invalid',
                      diagnostics: `Resource type mismatch: expected ${resourceType}, got ${context.body.resourceType || 'undefined'}`
                    }]
                  },
                  timing: {
                    startTime: context.startTime,
                    endTime: Date.now(),
                    duration: Date.now() - context.startTime,
                    hookDuration: 0
                  }
                });
                (context as any).takeOver();
              }
            }
          }
        }
        return context;
      }
    });
  }

  /**
   * Register capability hooks
   */
  private registerCapabilityHooks(): void {
    if (!this.capabilityGenerator) {
      return;
    }

    // Update capability statement when packages are loaded
    this.addHook({
      name: 'capability-package-integration',
      phase: 'onRouteRegister',
      priority: 70, // After packages and routes are loaded
      handler: async (context) => {
        const packages = this.packageIntegration?.getLoadedPackages() || [];
        this.capabilityGenerator!.updateWithPackages(packages);

        // Update with resource capabilities
        const resourceCapabilities = new Map<string, ResourceCapabilities>();
        for (const pkg of packages) {
          for (const [url, _] of Object.entries(pkg.resources)) {
            const resourceType = this.extractResourceTypeFromUrl(url);
            if (resourceType) {
              const capabilities = this.routeGenerator?.getResourceCapabilities(resourceType);
              if (capabilities) {
                resourceCapabilities.set(resourceType, capabilities);
              }
            }
          }
        }

        this.capabilityGenerator!.updateWithResourceCapabilities(resourceCapabilities);

        this.log('info', 'Capability statement updated', {
          resourceCount: resourceCapabilities.size,
          packageCount: packages.length
        });

        return context;
      }
    });
  }

  /**
   * Register /metadata endpoint
   */
  private registerMetadataEndpoint(): void {
    if (!this.metadataHandler) {
      return;
    }

    const handler = this.metadataHandler;

    this.router.addRoute({
      method: 'GET',
      pattern: '/metadata' as any,
      operation: 'capabilities' as any,
      level: 'system',
      priority: 1000, // High priority
      handler: async (context: HttpRequestContext): Promise<HttpResponseContext> => {
        // Update base URL from request
        const host = context.headers.host || context.headers.Host || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        this.capabilityGenerator!.setBaseUrl(`${protocol}://${host}`);

        return handler.handle(context);
      },
      description: 'Get server capability statement'
    } as any);

    this.log('info', 'Registered /metadata endpoint');
  }

  /**
   * Extract resource type from StructureDefinition URL
   */
  private extractResourceTypeFromUrl(url: string): string | undefined {
    // Example: http://hl7.org/fhir/StructureDefinition/Patient -> Patient
    const match = url.match(/\/StructureDefinition\/([A-Z][a-zA-Z]+)$/);
    return match ? match[1] : undefined;
  }

  /**
   * Update server statistics
   */
  private updateStats(startTime: number, success: boolean): void {
    const duration = Date.now() - startTime;

    // Update average response time
    this.stats.averageResponseTime =
      (this.stats.averageResponseTime + duration) / 2;

    // Update error rate
    if (!success) {
      this.stats.errorRate =
        (this.stats.errorRate * (this.stats.totalRequests - 1) + 1) / this.stats.totalRequests;
    }
  }

  /**
   * Create logger instance
   */
  private createLogger() {
    const level = this.config.logging?.level || 'info';
    const format = this.config.logging?.format || 'text';

    return {
      debug: (message: string, ...args: any[]) => {
        if (['debug'].includes(level)) {
          this.log('debug', message, ...args);
        }
      },
      info: (message: string, ...args: any[]) => {
        if (['debug', 'info'].includes(level)) {
          this.log('info', message, ...args);
        }
      },
      warn: (message: string, ...args: any[]) => {
        if (['debug', 'info', 'warn'].includes(level)) {
          this.log('warn', message, ...args);
        }
      },
      error: (message: string, ...args: any[]) => {
        this.log('error', message, ...args);
      }
    };
  }

  /**
   * Create clock instance
   */
  private createClock() {
    return {
      now: () => Date.now(),
      toISOString: (timestamp?: number) =>
        new Date(timestamp || Date.now()).toISOString()
    };
  }

  /**
   * Create config instance
   */
  private createConfig() {
    return {
      get: (key: string) => (this.config as any)[key],
      set: (key: string, value: any) => {
        (this.config as any)[key] = value;
      },
      has: (key: string) => key in this.config
    };
  }

  /**
   * Internal logging method
   */
  private log(level: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const format = this.config.logging?.format || 'text';

    if (format === 'json') {
      console.log(JSON.stringify({
        timestamp,
        level,
        message,
        data: args.length > 0 ? args : undefined
      }));
    } else {
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
    }
  }
}