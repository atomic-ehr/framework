/**
 * Plugin API methods for FhirServer
 * Separated for better organization
 */

import type {
  Plugin,
  PluginFunction,
  PluginOptions,
  DecoratorValue,
  DecoratorGetter,
  AtomicContext
} from '@atomic-ehr/core';
import type { FhirServer } from './server.js';

/**
 * Plugin registration methods
 */
export class ServerPluginAPI {
  constructor(private server: FhirServer) {}

  /**
   * Register a plugin with the server
   * Similar to Fastify's register() method
   *
   * @example
   * ```ts
   * server.register(myPlugin, {
   *   prefix: '/api',
   *   config: { apiKey: 'secret' }
   * });
   * ```
   */
  async register<Options extends PluginOptions = PluginOptions>(
    plugin: Plugin | PluginFunction,
    options?: Options
  ): Promise<void> {
    // Ensure we're not started yet
    if (this.server['isStarted']) {
      throw new Error('Cannot register plugins after server has started');
    }

    // Register with the plugin registry
    await this.server['pluginRegistry'].register(plugin, options);

    // Mark that we need to initialize plugins
    this.server['pluginsReady'] = false;
  }

  /**
   * Decorate the server instance with custom properties/methods
   * Similar to Fastify's decorate() method
   *
   * @example
   * ```ts
   * server.decorate('database', databaseConnection);
   * server.decorate('authenticate', async function(token) {
   *   return validateToken(token);
   * });
   * ```
   */
  decorate(name: string, value: DecoratorValue): void {
    this.server['decoratorManager'].add('server', name, value);

    // Make decorator immediately available on server instance
    Object.defineProperty(this.server, name, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  /**
   * Decorate the server instance with a getter function
   *
   * @example
   * ```ts
   * server.decorateGetter('config', () => loadConfig());
   * ```
   */
  decorateGetter(name: string, getter: DecoratorGetter): void {
    this.server['decoratorManager'].addGetter('server', name, getter);

    // Make decorator immediately available on server instance
    Object.defineProperty(this.server, name, {
      get: getter,
      enumerable: true,
      configurable: true,
    });
  }

  /**
   * Decorate request contexts with custom properties/methods
   * These will be available on all request contexts
   *
   * @example
   * ```ts
   * server.decorateRequest('user', null); // Will be set per-request
   * server.decorateRequest('getUserId', function() {
   *   return this.user?.id;
   * });
   * ```
   */
  decorateRequest(name: string, value: DecoratorValue): void {
    this.server['decoratorManager'].add('request', name, value);
  }

  /**
   * Decorate request contexts with a getter function
   */
  decorateRequestGetter(name: string, getter: DecoratorGetter): void {
    this.server['decoratorManager'].addGetter('request', name, getter);
  }

  /**
   * Decorate response contexts with custom properties/methods
   *
   * @example
   * ```ts
   * server.decorateResponse('setCookie', function(name, value) {
   *   this.responseHeaders['Set-Cookie'] = `${name}=${value}`;
   * });
   * ```
   */
  decorateResponse(name: string, value: DecoratorValue): void {
    this.server['decoratorManager'].add('response', name, value);
  }

  /**
   * Decorate response contexts with a getter function
   */
  decorateResponseGetter(name: string, getter: DecoratorGetter): void {
    this.server['decoratorManager'].addGetter('response', name, getter);
  }

  /**
   * Check if server has a decorator
   */
  hasDecorator(name: string): boolean {
    return this.server['decoratorManager'].has('server', name);
  }

  /**
   * Check if request context has a decorator
   */
  hasRequestDecorator(name: string): boolean {
    return this.server['decoratorManager'].has('request', name);
  }

  /**
   * Check if response context has a decorator
   */
  hasResponseDecorator(name: string): boolean {
    return this.server['decoratorManager'].has('response', name);
  }

  /**
   * Get plugin registry for advanced usage
   */
  getPluginRegistry() {
    return this.server['pluginRegistry'];
  }

  /**
   * Get decorator manager for advanced usage
   */
  getDecoratorManager() {
    return this.server['decoratorManager'];
  }

  /**
   * Initialize all registered plugins
   * Called automatically before server starts
   */
  async initializePlugins(): Promise<void> {
    if (this.server['pluginsReady']) {
      return;
    }

    // Validate plugin dependencies
    this.server['pluginRegistry'].validateDependencies();

    // Get plugins in registration order
    const plugins = this.server['pluginRegistry'].all();

    // Execute each plugin
    for (const pluginContext of plugins) {
      const context = this.server['appContext'] as unknown as AtomicContext;

      // Execute plugin hooks in onRegister phase
      await this.server['hooksManager'].executePhase('onRegister', context, {
        tags: [pluginContext.metadata.name],
      });
    }

    this.server['pluginsReady'] = true;

    // Execute onReady hooks
    await this.server['hooksManager'].executePhase(
      'onReady',
      this.server['appContext']
    );
  }
}

/**
 * Add plugin methods to FhirServer
 * This is used to extend the FhirServer class without circular dependencies
 */
export function addPluginMethods(server: FhirServer): void {
  const api = new ServerPluginAPI(server);

  // Bind methods to server
  server.register = api.register.bind(api);
  server.decorate = api.decorate.bind(api);
  server.decorateGetter = api.decorateGetter.bind(api);
  server.decorateRequest = api.decorateRequest.bind(api);
  server.decorateRequestGetter = api.decorateRequestGetter.bind(api);
  server.decorateResponse = api.decorateResponse.bind(api);
  server.decorateResponseGetter = api.decorateResponseGetter.bind(api);
  server.hasDecorator = api.hasDecorator.bind(api);
  server.hasRequestDecorator = api.hasRequestDecorator.bind(api);
  server.hasResponseDecorator = api.hasResponseDecorator.bind(api);
  server.initializePlugins = api.initializePlugins.bind(api);
}

/**
 * Type augmentation for FhirServer with plugin methods
 * This makes TypeScript aware of the plugin methods
 */
declare module './server.js' {
  interface FhirServer {
    /**
     * Register a plugin with the server
     */
    register<Options extends PluginOptions = PluginOptions>(
      plugin: Plugin | PluginFunction,
      options?: Options
    ): Promise<void>;

    /**
     * Decorate the server instance
     */
    decorate(name: string, value: DecoratorValue): void;

    /**
     * Decorate the server instance with a getter
     */
    decorateGetter(name: string, getter: DecoratorGetter): void;

    /**
     * Decorate request contexts
     */
    decorateRequest(name: string, value: DecoratorValue): void;

    /**
     * Decorate request contexts with a getter
     */
    decorateRequestGetter(name: string, getter: DecoratorGetter): void;

    /**
     * Decorate response contexts
     */
    decorateResponse(name: string, value: DecoratorValue): void;

    /**
     * Decorate response contexts with a getter
     */
    decorateResponseGetter(name: string, getter: DecoratorGetter): void;

    /**
     * Check if server has a decorator
     */
    hasDecorator(name: string): boolean;

    /**
     * Check if request context has a decorator
     */
    hasRequestDecorator(name: string): boolean;

    /**
     * Check if response context has a decorator
     */
    hasResponseDecorator(name: string): boolean;

    /**
     * Initialize all registered plugins (called automatically)
     */
    initializePlugins(): Promise<void>;
  }
}
