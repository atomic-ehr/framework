# ADR-0003: Adapters and IO Boundaries

## Status
Proposed

## Context
The `@atomic-ehr/hook-core` must support multiple HTTP runtime environments (Node.js, Bun, Deno, Edge) while maintaining adapter-agnostic core logic. This requires clean boundaries between the core hook system and runtime-specific implementations, with standardized contracts for body parsing, streaming, backpressure, and error handling.

## Decision

### Adapter Architecture
```typescript
// Core adapter interface - runtime agnostic
interface HttpAdapter<TRequest, TResponse> {
  name: string;
  version: string;
  capabilities: AdapterCapabilities;

  // Request handling
  parseRequest(rawRequest: TRequest): Promise<ParsedRequest>;

  // Response handling
  sendResponse(
    rawResponse: TResponse,
    response: ResponseData
  ): Promise<void>;

  // Streaming support
  createReadStream(source: StreamSource): ReadableStream;
  createWriteStream(target: StreamTarget): WritableStream;

  // Error handling
  mapError(error: Error): AdapterError;

  // Lifecycle
  initialize(config: AdapterConfig): Promise<void>;
  shutdown(): Promise<void>;
}

interface AdapterCapabilities {
  streaming: {
    request: boolean;
    response: boolean;
    backpressure: boolean;
  };
  bodyParsing: {
    json: boolean;
    formData: boolean;
    text: boolean;
    binary: boolean;
    maxSize: number;
  };
  compression: {
    gzip: boolean;
    brotli: boolean;
    deflate: boolean;
  };
  websockets: boolean;
  http2: boolean;
  http3: boolean;
}
```

### Standardized Request Contract
```typescript
interface ParsedRequest {
  // Core HTTP properties
  method: HttpMethod;
  url: string;
  path: string;
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  headers: Headers;

  // Body handling
  body: RequestBody;

  // Metadata
  protocol: 'http/1.1' | 'http/2' | 'http/3';
  secure: boolean;
  ip: string;
  timestamp: number;

  // Adapter-specific extensions
  raw: unknown; // Original request object
  adapter: string; // Adapter name
}

interface RequestBody {
  // Parsed body data
  data: unknown;

  // Body metadata
  contentType: string;
  contentLength: number;
  encoding: string;

  // Raw access
  raw: BodySource;

  // Streaming
  stream?: ReadableStream;

  // Validation state
  parsed: boolean;
  valid: boolean;
  errors: BodyParsingError[];
}

type BodySource =
  | string
  | Buffer
  | Uint8Array
  | ReadableStream
  | Blob
  | FormData;
```

### Standardized Response Contract
```typescript
interface ResponseData {
  // Status
  statusCode: number;
  statusMessage?: string;

  // Headers
  headers: Headers;

  // Body
  body: ResponseBody;

  // Metadata
  timestamp: number;
  duration: number;

  // Streaming
  stream?: WritableStream;
}

interface ResponseBody {
  // Response data
  data: unknown;

  // Body metadata
  contentType: string;
  contentLength?: number;
  encoding: string;

  // Serialization
  serialized: boolean;
  compressed: boolean;

  // Streaming
  stream?: ReadableStream;
}

class Headers extends Map<string, string | string[]> {
  set(name: string, value: string | string[]): this;
  get(name: string): string | undefined;
  getAll(name: string): string[];
  has(name: string): boolean;
  delete(name: string): boolean;

  // Case-insensitive operations
  setCaseInsensitive(name: string, value: string | string[]): this;
  getCaseInsensitive(name: string): string | undefined;

  // Standard headers helpers
  setContentType(type: string): this;
  setContentLength(length: number): this;
  setCacheControl(value: string): this;
  setETag(etag: string): this;

  // FHIR-specific helpers
  setFHIRVersion(version: string): this;
  setLastModified(date: Date): this;
  setLocation(url: string): this;
}
```

### Body Parsing Strategy
```typescript
interface BodyParser {
  contentTypes: string[];
  maxSize: number;

  parse(
    source: BodySource,
    contentType: string,
    options: BodyParsingOptions
  ): Promise<BodyParsingResult>;

  canParse(contentType: string): boolean;
}

interface BodyParsingOptions {
  maxSize?: number;
  encoding?: string;
  strict?: boolean;
  reviver?: (key: string, value: unknown) => unknown;
}

interface BodyParsingResult {
  success: boolean;
  data: unknown;
  errors: BodyParsingError[];
  metadata: {
    originalSize: number;
    parsedSize: number;
    contentType: string;
    encoding: string;
    parseTime: number;
  };
}

// Built-in parsers
class JsonBodyParser implements BodyParser {
  contentTypes = ['application/json', 'application/fhir+json'];
  maxSize = 50 * 1024 * 1024; // 50MB

  async parse(source: BodySource, contentType: string, options: BodyParsingOptions) {
    // Implementation specific to JSON parsing
  }
}

class FhirXmlParser implements BodyParser {
  contentTypes = ['application/fhir+xml', 'application/xml'];
  maxSize = 50 * 1024 * 1024;

  async parse(source: BodySource, contentType: string, options: BodyParsingOptions) {
    // Implementation specific to FHIR XML parsing
  }
}
```

### Streaming Support
```typescript
interface StreamingRequest extends ParsedRequest {
  body: StreamingRequestBody;
}

interface StreamingRequestBody extends RequestBody {
  stream: ReadableStream;

  // Stream control
  pause(): void;
  resume(): void;
  pipe<T>(destination: WritableStream<T>): Promise<void>;

  // Backpressure handling
  highWaterMark: number;
  readableLength: number;
  flowing: boolean;
}

interface StreamingResponse extends ResponseData {
  body: StreamingResponseBody;
}

interface StreamingResponseBody extends ResponseBody {
  stream: WritableStream;

  // Stream control
  write(chunk: unknown): Promise<void>;
  end(finalChunk?: unknown): Promise<void>;

  // Backpressure handling
  drain(): Promise<void>;
  writableLength: number;
  writableHighWaterMark: number;
}

// Streaming utilities
class StreamProcessor {
  static async processRequestStream(
    stream: ReadableStream,
    processor: (chunk: unknown) => Promise<unknown>
  ): Promise<void> {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await processor(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  static createTransformStream<TInput, TOutput>(
    transformer: (input: TInput) => Promise<TOutput>
  ): TransformStream<TInput, TOutput> {
    return new TransformStream({
      async transform(chunk, controller) {
        try {
          const result = await transformer(chunk);
          controller.enqueue(result);
        } catch (error) {
          controller.error(error);
        }
      }
    });
  }
}
```

### Error Taxonomy and Mapping
```typescript
// Standardized error hierarchy
abstract class AdapterError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly timestamp: number = Date.now();
  readonly adapter: string;

  constructor(message: string, adapter: string, public readonly cause?: Error) {
    super(message);
    this.adapter = adapter;
  }
}

class RequestParsingError extends AdapterError {
  readonly code = 'REQUEST_PARSING_ERROR';
  readonly statusCode = 400;
}

class BodyTooLargeError extends AdapterError {
  readonly code = 'BODY_TOO_LARGE';
  readonly statusCode = 413;

  constructor(adapter: string, public readonly maxSize: number, public readonly actualSize: number) {
    super(`Request body too large: ${actualSize} bytes (max: ${maxSize})`, adapter);
  }
}

class UnsupportedMediaTypeError extends AdapterError {
  readonly code = 'UNSUPPORTED_MEDIA_TYPE';
  readonly statusCode = 415;

  constructor(adapter: string, public readonly contentType: string) {
    super(`Unsupported media type: ${contentType}`, adapter);
  }
}

class StreamingError extends AdapterError {
  readonly code = 'STREAMING_ERROR';
  readonly statusCode = 500;
}

class BackpressureError extends StreamingError {
  readonly code = 'BACKPRESSURE_ERROR';

  constructor(adapter: string, public readonly bufferSize: number) {
    super(`Backpressure limit exceeded: ${bufferSize} bytes`, adapter);
  }
}

// Error mapping interface
interface ErrorMapper {
  map(error: Error): AdapterError;
  canMap(error: Error): boolean;
}

class StandardErrorMapper implements ErrorMapper {
  private mappings = new Map<string, (error: Error) => AdapterError>();

  constructor(private adapter: string) {
    this.setupStandardMappings();
  }

  private setupStandardMappings() {
    this.mappings.set('SyntaxError', (error) =>
      new RequestParsingError(this.adapter, error)
    );

    this.mappings.set('RangeError', (error) =>
      new BodyTooLargeError(this.adapter, 0, 0)
    );
  }

  map(error: Error): AdapterError {
    const mapper = this.mappings.get(error.constructor.name);
    return mapper ? mapper(error) : new AdapterError(error.message, this.adapter, error);
  }

  canMap(error: Error): boolean {
    return this.mappings.has(error.constructor.name);
  }
}
```

### Runtime-Specific Adapters

#### Node.js HTTP Adapter
```typescript
// @atomic-ehr/hook-core-http-node
class NodeHttpAdapter implements HttpAdapter<IncomingMessage, ServerResponse> {
  name = 'node-http';
  version = '1.0.0';
  capabilities: AdapterCapabilities = {
    streaming: { request: true, response: true, backpressure: true },
    bodyParsing: { json: true, formData: true, text: true, binary: true, maxSize: 100 * 1024 * 1024 },
    compression: { gzip: true, brotli: true, deflate: true },
    websockets: false,
    http2: true,
    http3: false
  };

  async parseRequest(req: IncomingMessage): Promise<ParsedRequest> {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    return {
      method: req.method as HttpMethod,
      url: req.url!,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      params: {}, // Set by router
      headers: new Headers(req.headers as Record<string, string>),
      body: await this.parseBody(req),
      protocol: req.httpVersion as any,
      secure: req.socket.encrypted || false,
      ip: req.socket.remoteAddress || '',
      timestamp: Date.now(),
      raw: req,
      adapter: this.name
    };
  }

  async sendResponse(res: ServerResponse, response: ResponseData): Promise<void> {
    res.statusCode = response.statusCode;

    // Set headers
    for (const [name, value] of response.headers) {
      res.setHeader(name, value);
    }

    // Handle streaming vs regular response
    if (response.stream) {
      await this.sendStreamingResponse(res, response);
    } else {
      await this.sendRegularResponse(res, response);
    }
  }

  private async parseBody(req: IncomingMessage): Promise<RequestBody> {
    // Node.js specific body parsing implementation
  }

  private async sendStreamingResponse(res: ServerResponse, response: ResponseData): Promise<void> {
    // Node.js specific streaming implementation
  }

  private async sendRegularResponse(res: ServerResponse, response: ResponseData): Promise<void> {
    // Node.js specific regular response implementation
  }
}
```

#### Fetch API Adapter
```typescript
// @atomic-ehr/hook-core-http-fetch
class FetchAdapter implements HttpAdapter<Request, Response> {
  name = 'fetch';
  version = '1.0.0';
  capabilities: AdapterCapabilities = {
    streaming: { request: true, response: true, backpressure: false },
    bodyParsing: { json: true, formData: true, text: true, binary: true, maxSize: 50 * 1024 * 1024 },
    compression: { gzip: true, brotli: false, deflate: true },
    websockets: false,
    http2: false,
    http3: false
  };

  async parseRequest(req: Request): Promise<ParsedRequest> {
    const url = new URL(req.url);

    return {
      method: req.method as HttpMethod,
      url: req.url,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      params: {}, // Set by router
      headers: new Headers(req.headers as any),
      body: await this.parseBody(req),
      protocol: 'http/1.1',
      secure: url.protocol === 'https:',
      ip: '', // Not available in fetch
      timestamp: Date.now(),
      raw: req,
      adapter: this.name
    };
  }

  async sendResponse(res: Response, response: ResponseData): Promise<void> {
    // Fetch API specific response handling
    // Note: Response object is immutable, so this adapter would be used
    // in environments where we construct the Response object
  }

  private async parseBody(req: Request): Promise<RequestBody> {
    // Fetch API specific body parsing implementation
  }
}
```

### Adapter Configuration
```typescript
interface AdapterConfig {
  // Body parsing
  maxBodySize: number;
  bodyParsers: BodyParser[];

  // Streaming
  enableStreaming: boolean;
  backpressureThreshold: number;
  streamTimeout: number;

  // Compression
  enableCompression: boolean;
  compressionLevel: number;
  compressionThreshold: number;

  // Security
  enableCors: boolean;
  corsOptions: CorsOptions;

  // Performance
  keepAliveTimeout: number;
  requestTimeout: number;

  // Error handling
  errorMappers: ErrorMapper[];

  // Adapter-specific options
  [key: string]: unknown;
}

interface CorsOptions {
  origin: string | string[] | boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}
```

### Adapter Registry
```typescript
interface AdapterRegistry {
  register<TRequest, TResponse>(
    adapter: HttpAdapter<TRequest, TResponse>
  ): void;

  unregister(name: string): void;

  get<TRequest, TResponse>(
    name: string
  ): HttpAdapter<TRequest, TResponse> | undefined;

  list(): string[];

  getCapabilities(name: string): AdapterCapabilities | undefined;

  findCompatible(requirements: AdapterRequirements): string[];
}

interface AdapterRequirements {
  streaming?: boolean;
  bodyParsing?: string[];
  compression?: string[];
  websockets?: boolean;
  http2?: boolean;
  http3?: boolean;
}

// Global registry
const adapterRegistry = new AdapterRegistry();

// Registration
adapterRegistry.register(new NodeHttpAdapter());
adapterRegistry.register(new FetchAdapter());
```

## Implementation Guidelines

### Adapter Development Best Practices
1. **Error Handling**: Always map runtime-specific errors to standardized error types
2. **Resource Management**: Properly dispose of streams and cleanup resources
3. **Performance**: Minimize copying and allocations in hot paths
4. **Compatibility**: Support the lowest common denominator of features
5. **Testing**: Include comprehensive tests for all supported scenarios

### Boundary Enforcement
1. **No Leakage**: Adapter-specific types should not leak into core logic
2. **Standardized Contracts**: All adapters must implement the same interface
3. **Error Isolation**: Adapter errors should not crash the core system
4. **Performance Isolation**: Adapter performance issues should not affect other adapters

### Streaming Guidelines
1. **Backpressure**: Always handle backpressure appropriately
2. **Resource Cleanup**: Ensure streams are properly closed and cleaned up
3. **Error Propagation**: Propagate stream errors through the error handling system
4. **Memory Management**: Avoid accumulating large amounts of data in memory

## Consequences

### Benefits
- **Runtime Agnostic**: Core logic works across different HTTP runtimes
- **Type Safety**: Strong typing prevents adapter-specific bugs
- **Performance**: Optimized implementations for each runtime
- **Extensibility**: Easy to add support for new runtimes
- **Error Handling**: Consistent error handling across all runtimes

### Trade-offs
- **Complexity**: Additional abstraction layer adds complexity
- **Performance Overhead**: Adapter layer adds slight performance overhead
- **Learning Curve**: Developers need to understand adapter concepts
- **Testing Complexity**: Need to test across multiple adapter implementations

### Migration Strategy
- Start with most common adapter (Node.js HTTP)
- Add adapters incrementally based on demand
- Provide adapter selection utilities for automatic detection
- Comprehensive documentation for adapter-specific considerations