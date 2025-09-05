import { randomUUID } from "crypto";
import type {
	AuthenticatedContext,
	AuthenticatedUser,
} from "../types/index.ts";

// ============================================================================
// Audit Event Types and Interfaces
// ============================================================================

/**
 * Authentication and authorization audit event types
 */
export type AuthAuditEventType =
	| "auth_attempt" // Authentication attempt started
	| "auth_success" // Successful authentication
	| "auth_failure" // Failed authentication
	| "permission_check" // Permission evaluation
	| "permission_denied" // Access denied
	| "permission_granted" // Access granted
	| "token_issued" // New token created
	| "token_revoked" // Token revoked
	| "token_refreshed" // Token refreshed
	| "session_created" // Session established
	| "session_expired" // Session expired
	| "session_destroyed" // Session manually destroyed
	| "password_changed" // User password changed
	| "account_locked" // Account locked due to failed attempts
	| "account_unlocked" // Account unlocked
	| "privilege_escalation" // Role or permission changes
	| "suspicious_activity" // Potentially malicious activity detected
	| "rate_limit_exceeded" // Rate limiting triggered
	| "configuration_changed" // Security configuration modified
	| "backup_created" // Security backup created
	| "backup_restored"; // Security backup restored

/**
 * Severity levels for audit events
 */
export type AuditSeverity = "info" | "warning" | "error" | "critical";

/**
 * Comprehensive audit event structure
 */
export interface AuthAuditEvent {
	// Core event information
	eventId: string;
	timestamp: Date;
	type: AuthAuditEventType;
	severity: AuditSeverity;
	source: string; // Component that generated the event

	// User information
	userId?: string;
	username?: string;
	roles?: string[];

	// Request context
	requestId?: string;
	sessionId?: string;
	ipAddress?: string;
	userAgent?: string;
	referer?: string;

	// FHIR context
	resourceType?: string;
	resourceId?: string;
	operation?: string;
	endpoint?: string;

	// Authentication details
	strategy?: string;
	success: boolean;
	error?: string;
	errorCode?: string;

	// Performance and operational data
	duration?: number;
	responseSize?: number;

	// Security-specific fields
	riskScore?: number;
	geoLocation?: {
		country?: string;
		region?: string;
		city?: string;
		latitude?: number;
		longitude?: number;
	};

	// Additional metadata
	metadata?: Record<string, any>;

	// Compliance fields
	complianceContext?: {
		regulation?: string; // HIPAA, GDPR, etc.
		purpose?: string; // Treatment, payment, operations
		lawfulBasis?: string; // For GDPR
	};
}

/**
 * Filters for querying audit events
 */
export interface AuditQueryFilters {
	// Time range
	startTime?: Date;
	endTime?: Date;

	// Event filtering
	eventTypes?: AuthAuditEventType[];
	severities?: AuditSeverity[];
	sources?: string[];

	// User filtering
	userIds?: string[];
	usernames?: string[];
	roles?: string[];

	// Request filtering
	ipAddresses?: string[];
	sessionIds?: string[];
	requestIds?: string[];

	// FHIR filtering
	resourceTypes?: string[];
	operations?: string[];

	// Result filtering
	success?: boolean;
	riskScoreMin?: number;
	riskScoreMax?: number;

	// Pagination
	limit?: number;
	offset?: number;

	// Search
	searchQuery?: string;
}

/**
 * Configuration for audit system
 */
export interface AuditConfig {
	enabled: boolean;
	backends: AuditBackendConfig[];

	// Event filtering
	logLevel: AuditSeverity;
	includeEventTypes?: AuthAuditEventType[];
	excludeEventTypes?: AuthAuditEventType[];

	// Performance settings
	batchSize?: number;
	flushInterval?: number;
	maxQueueSize?: number;

	// Security settings
	encryptionEnabled?: boolean;
	signEvents?: boolean;
	anonymizeUserData?: boolean;

	// Retention settings
	retentionDays?: number;
	archiveAfterDays?: number;
}

/**
 * Backend configuration
 */
export interface AuditBackendConfig {
	type: "console" | "file" | "database" | "syslog" | "webhook" | "custom";
	name: string;
	enabled: boolean;
	config: Record<string, any>;

	// Filtering at backend level
	logLevel?: AuditSeverity;
	eventTypes?: AuthAuditEventType[];
}

// ============================================================================
// Audit Backend Interface
// ============================================================================

/**
 * Base interface for all audit backends
 */
export interface AuditBackend {
	readonly name: string;
	readonly type: string;

	/**
	 * Initialize the backend
	 */
	initialize(): Promise<void>;

	/**
	 * Log a single audit event
	 */
	log(event: AuthAuditEvent): Promise<void>;

	/**
	 * Log multiple audit events (batch operation)
	 */
	logBatch(events: AuthAuditEvent[]): Promise<void>;

	/**
	 * Query audit events (if supported)
	 */
	query?(filters: AuditQueryFilters): Promise<AuthAuditEvent[]>;

	/**
	 * Close/cleanup the backend
	 */
	close(): Promise<void>;
}

// ============================================================================
// Built-in Audit Backends
// ============================================================================

/**
 * Console audit backend for development and debugging
 */
export class ConsoleAuditBackend implements AuditBackend {
	readonly name = "console";
	readonly type = "console";

	private formatEvent(event: AuthAuditEvent): string {
		const timestamp = event.timestamp.toISOString();
		const severity = event.severity.toUpperCase();
		const type = event.type;
		const userId = event.userId || "anonymous";
		const success = event.success ? "✓" : "✗";

		return `[${timestamp}] ${severity} [${type}] ${success} User:${userId} ${event.error || ""}`.trim();
	}

	async initialize(): Promise<void> {
		console.log("[AUDIT] Console audit backend initialized");
	}

	async log(event: AuthAuditEvent): Promise<void> {
		const formatted = this.formatEvent(event);

		switch (event.severity) {
			case "critical":
			case "error":
				console.error(formatted);
				break;
			case "warning":
				console.warn(formatted);
				break;
			default:
				console.info(formatted);
		}
	}

	async logBatch(events: AuthAuditEvent[]): Promise<void> {
		for (const event of events) {
			await this.log(event);
		}
	}

	async close(): Promise<void> {
		console.log("[AUDIT] Console audit backend closed");
	}
}

/**
 * File-based audit backend
 */
export class FileAuditBackend implements AuditBackend {
	readonly name = "file";
	readonly type = "file";

	private filePath: string;
	private rotationSize: number;
	private maxFiles: number;

	constructor(config: {
		filePath: string;
		rotationSize?: number; // Size in bytes before rotation
		maxFiles?: number; // Max number of rotated files to keep
	}) {
		this.filePath = config.filePath;
		this.rotationSize = config.rotationSize || 100 * 1024 * 1024; // 100MB
		this.maxFiles = config.maxFiles || 10;
	}

	async initialize(): Promise<void> {
		// Ensure directory exists
		const { dirname } = await import("path");
		const { mkdir } = await import("fs/promises");

		const dir = dirname(this.filePath);
		await mkdir(dir, { recursive: true });
	}

	async log(event: AuthAuditEvent): Promise<void> {
		const { appendFile } = await import("fs/promises");
		const logLine = JSON.stringify(event) + "\n";
		await appendFile(this.filePath, logLine);

		// Check if rotation is needed
		await this.checkRotation();
	}

	async logBatch(events: AuthAuditEvent[]): Promise<void> {
		const { appendFile } = await import("fs/promises");
		const logLines =
			events.map((event) => JSON.stringify(event)).join("\n") + "\n";
		await appendFile(this.filePath, logLines);

		await this.checkRotation();
	}

	private async checkRotation(): Promise<void> {
		try {
			const { stat } = await import("fs/promises");
			const stats = await stat(this.filePath);

			if (stats.size >= this.rotationSize) {
				await this.rotateFile();
			}
		} catch (error) {
			// File doesn't exist yet, ignore
		}
	}

	private async rotateFile(): Promise<void> {
		const { rename, unlink } = await import("fs/promises");

		try {
			// Remove oldest file if at max capacity
			const oldestFile = `${this.filePath}.${this.maxFiles}`;
			try {
				await unlink(oldestFile);
			} catch {
				// File doesn't exist, ignore
			}

			// Rotate existing files
			for (let i = this.maxFiles - 1; i >= 1; i--) {
				const currentFile = `${this.filePath}.${i}`;
				const nextFile = `${this.filePath}.${i + 1}`;

				try {
					await rename(currentFile, nextFile);
				} catch {
					// File doesn't exist, continue
				}
			}

			// Rotate current file to .1
			await rename(this.filePath, `${this.filePath}.1`);
		} catch (error) {
			console.error("File rotation failed:", error);
		}
	}

	async query(filters: AuditQueryFilters): Promise<AuthAuditEvent[]> {
		const { readFile } = await import("fs/promises");

		try {
			const content = await readFile(this.filePath, "utf-8");
			const lines = content
				.trim()
				.split("\n")
				.filter((line) => line);
			let events = lines.map((line) => JSON.parse(line) as AuthAuditEvent);

			// Apply filters
			if (filters.startTime || filters.endTime) {
				events = events.filter((event) => {
					const timestamp = new Date(event.timestamp);
					if (filters.startTime && timestamp < filters.startTime) return false;
					if (filters.endTime && timestamp > filters.endTime) return false;
					return true;
				});
			}

			if (filters.eventTypes?.length) {
				events = events.filter((event) =>
					filters.eventTypes!.includes(event.type),
				);
			}

			if (filters.severities?.length) {
				events = events.filter((event) =>
					filters.severities!.includes(event.severity),
				);
			}

			if (filters.userIds?.length) {
				events = events.filter(
					(event) => event.userId && filters.userIds!.includes(event.userId),
				);
			}

			if (filters.success !== undefined) {
				events = events.filter((event) => event.success === filters.success);
			}

			// Apply pagination
			if (filters.offset) {
				events = events.slice(filters.offset);
			}

			if (filters.limit) {
				events = events.slice(0, filters.limit);
			}

			return events;
		} catch (error) {
			console.error("Error querying audit log:", error);
			return [];
		}
	}

	async close(): Promise<void> {
		// File backend doesn't need explicit cleanup
	}
}

/**
 * Database audit backend (generic implementation)
 */
export class DatabaseAuditBackend implements AuditBackend {
	readonly name = "database";
	readonly type = "database";

	private db: any;
	private tableName: string;

	constructor(config: {
		database: any;
		tableName?: string;
	}) {
		this.db = config.database;
		this.tableName = config.tableName || "audit_logs";
	}

	async initialize(): Promise<void> {
		// Create table if it doesn't exist
		// This is a generic implementation - actual implementation would depend on the DB
		console.log(
			`[AUDIT] Database backend initialized with table: ${this.tableName}`,
		);
	}

	async log(event: AuthAuditEvent): Promise<void> {
		// Convert event to database format
		const dbEvent = {
			...event,
			timestamp: event.timestamp.toISOString(),
			roles: event.roles ? JSON.stringify(event.roles) : null,
			metadata: event.metadata ? JSON.stringify(event.metadata) : null,
			geo_location: event.geoLocation
				? JSON.stringify(event.geoLocation)
				: null,
			compliance_context: event.complianceContext
				? JSON.stringify(event.complianceContext)
				: null,
		};

		// Example using a generic query method
		if (this.db.insert) {
			await this.db.insert(this.tableName, dbEvent);
		} else {
			console.log("[AUDIT] Would insert to database:", dbEvent);
		}
	}

	async logBatch(events: AuthAuditEvent[]): Promise<void> {
		const dbEvents = events.map((event) => ({
			...event,
			timestamp: event.timestamp.toISOString(),
			roles: event.roles ? JSON.stringify(event.roles) : null,
			metadata: event.metadata ? JSON.stringify(event.metadata) : null,
			geo_location: event.geoLocation
				? JSON.stringify(event.geoLocation)
				: null,
			compliance_context: event.complianceContext
				? JSON.stringify(event.complianceContext)
				: null,
		}));

		if (this.db.insertBatch) {
			await this.db.insertBatch(this.tableName, dbEvents);
		} else {
			for (const event of events) {
				await this.log(event);
			}
		}
	}

	async query(filters: AuditQueryFilters): Promise<AuthAuditEvent[]> {
		// Build query based on filters
		// This is a simplified example
		const conditions: string[] = [];
		const params: any[] = [];

		if (filters.startTime) {
			conditions.push("timestamp >= ?");
			params.push(filters.startTime.toISOString());
		}

		if (filters.endTime) {
			conditions.push("timestamp <= ?");
			params.push(filters.endTime.toISOString());
		}

		if (filters.eventTypes?.length) {
			const placeholders = filters.eventTypes.map(() => "?").join(", ");
			conditions.push(`type IN (${placeholders})`);
			params.push(...filters.eventTypes);
		}

		const whereClause = conditions.length
			? `WHERE ${conditions.join(" AND ")}`
			: "";
		const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";
		const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : "";

		const query = `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY timestamp DESC ${limitClause} ${offsetClause}`;

		if (this.db.query) {
			const results = await this.db.query(query, params);
			return results.map((row: any) => ({
				...row,
				timestamp: new Date(row.timestamp),
				roles: row.roles ? JSON.parse(row.roles) : undefined,
				metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
				geoLocation: row.geo_location
					? JSON.parse(row.geo_location)
					: undefined,
				complianceContext: row.compliance_context
					? JSON.parse(row.compliance_context)
					: undefined,
			}));
		} else {
			console.log("[AUDIT] Would query database:", query, params);
			return [];
		}
	}

	async close(): Promise<void> {
		if (this.db.close) {
			await this.db.close();
		}
	}
}

/**
 * Webhook audit backend for external services
 */
export class WebhookAuditBackend implements AuditBackend {
	readonly name = "webhook";
	readonly type = "webhook";

	private url: string;
	private headers: Record<string, string>;
	private retryAttempts: number;
	private retryDelay: number;

	constructor(config: {
		url: string;
		headers?: Record<string, string>;
		retryAttempts?: number;
		retryDelay?: number;
	}) {
		this.url = config.url;
		this.headers = {
			"Content-Type": "application/json",
			...config.headers,
		};
		this.retryAttempts = config.retryAttempts || 3;
		this.retryDelay = config.retryDelay || 1000;
	}

	async initialize(): Promise<void> {
		console.log(`[AUDIT] Webhook backend initialized for: ${this.url}`);
	}

	async log(event: AuthAuditEvent): Promise<void> {
		await this.sendWithRetry([event]);
	}

	async logBatch(events: AuthAuditEvent[]): Promise<void> {
		await this.sendWithRetry(events);
	}

	private async sendWithRetry(
		events: AuthAuditEvent[],
		attempt: number = 1,
	): Promise<void> {
		try {
			const response = await fetch(this.url, {
				method: "POST",
				headers: this.headers,
				body: JSON.stringify({ events }),
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		} catch (error) {
			if (attempt < this.retryAttempts) {
				console.warn(`[AUDIT] Webhook attempt ${attempt} failed, retrying...`);
				await new Promise((resolve) =>
					setTimeout(resolve, this.retryDelay * attempt),
				);
				return this.sendWithRetry(events, attempt + 1);
			} else {
				console.error(
					`[AUDIT] Webhook failed after ${this.retryAttempts} attempts:`,
					error,
				);
				throw error;
			}
		}
	}

	async close(): Promise<void> {
		console.log("[AUDIT] Webhook backend closed");
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate unique event ID
 */
export function generateEventId(): string {
	return randomUUID();
}

/**
 * Determine severity based on event type and success
 */
export function determineSeverity(
	type: AuthAuditEventType,
	success: boolean,
	_error?: string,
): AuditSeverity {
	if (!success) {
		switch (type) {
			case "auth_failure":
				return "warning";
			case "permission_denied":
				return "warning";
			case "account_locked":
				return "error";
			case "suspicious_activity":
				return "critical";
			case "privilege_escalation":
				return "critical";
			default:
				return "warning";
		}
	}

	switch (type) {
		case "auth_success":
		case "permission_granted":
		case "session_created":
			return "info";
		case "token_issued":
		case "password_changed":
			return "info";
		case "privilege_escalation":
			return "warning";
		case "configuration_changed":
			return "warning";
		default:
			return "info";
	}
}

/**
 * Extract security context from request
 */
export function extractSecurityContext(
	req: Request,
	context?: AuthenticatedContext,
): Partial<AuthAuditEvent> {
	const url = new URL(req.url);

	return {
		requestId:
			(context as any)?.requestId ||
			req.headers.get("x-request-id") ||
			undefined,
		sessionId: extractSessionId(req),
		ipAddress: getClientIP(req),
		userAgent: req.headers.get("user-agent") || undefined,
		referer: req.headers.get("referer") || undefined,
		endpoint: url.pathname,
		metadata: {
			method: req.method,
			query: url.search,
			protocol: url.protocol,
			host: url.host,
		},
	};
}

/**
 * Extract session ID from request
 */
function extractSessionId(req: Request): string | undefined {
	const cookie = req.headers.get("cookie");
	if (!cookie) return undefined;

	const match = cookie.match(/sessionId=([^;]+)/);
	return match?.[1];
}

/**
 * Get client IP address
 */
function getClientIP(req: Request): string | undefined {
	return (
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		req.headers.get("cf-connecting-ip") ||
		undefined
	);
}

/**
 * Create base audit event
 */
export function createAuditEvent(
	type: AuthAuditEventType,
	success: boolean,
	source: string = "auth-system",
	additional: Partial<AuthAuditEvent> = {},
): AuthAuditEvent {
	return {
		eventId: generateEventId(),
		timestamp: new Date(),
		type,
		severity: determineSeverity(type, success, additional.error),
		source,
		success,
		...additional,
	};
}

// ============================================================================
// Audit Manager
// ============================================================================

/**
 * Central audit manager that coordinates multiple backends
 * Handles batching, filtering, and performance optimizations
 */
export class AuditManager {
	private backends: Map<string, AuditBackend>;
	private config: AuditConfig;
	private eventQueue: AuthAuditEvent[];
	private flushTimer?: NodeJS.Timeout;
	private isShuttingDown: boolean = false;
	private stats: AuditStats;

	constructor(config: AuditConfig) {
		this.config = {
			batchSize: 100,
			flushInterval: 5000, // 5 seconds
			maxQueueSize: 10000,
			...config,
		};
		this.backends = new Map();
		this.eventQueue = [];
		this.stats = {
			eventsLogged: 0,
			eventsDropped: 0,
			backendsActive: 0,
			lastFlush: new Date(),
			averageLatency: 0,
			errorCount: 0,
		};

		// Start flush timer if batching is enabled
		if (this.config.batchSize && this.config.batchSize > 1) {
			this.startFlushTimer();
		}
	}

	// ============================================================================
	// Backend Management
	// ============================================================================

	/**
	 * Add an audit backend
	 */
	async addBackend(backend: AuditBackend): Promise<void> {
		try {
			await backend.initialize();
			this.backends.set(backend.name, backend);
			this.stats.backendsActive = this.backends.size;
			console.log(`[AUDIT] Backend '${backend.name}' added and initialized`);
		} catch (error) {
			console.error(
				`[AUDIT] Failed to initialize backend '${backend.name}':`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Remove an audit backend
	 */
	async removeBackend(name: string): Promise<void> {
		const backend = this.backends.get(name);
		if (backend) {
			try {
				await backend.close();
				this.backends.delete(name);
				this.stats.backendsActive = this.backends.size;
				console.log(`[AUDIT] Backend '${name}' removed`);
			} catch (error) {
				console.error(`[AUDIT] Error closing backend '${name}':`, error);
			}
		}
	}

	/**
	 * Create backends from configuration
	 */
	async createBackendsFromConfig(
		backendConfigs: AuditBackendConfig[],
	): Promise<void> {
		for (const config of backendConfigs) {
			if (!config.enabled) continue;

			let backend: AuditBackend;

			switch (config.type) {
				case "console":
					backend = new ConsoleAuditBackend();
					break;
				case "file":
					backend = new FileAuditBackend(config.config as any);
					break;
				case "database":
					backend = new DatabaseAuditBackend(config.config as any);
					break;
				case "webhook":
					backend = new WebhookAuditBackend(config.config as any);
					break;
				default:
					console.warn(`[AUDIT] Unknown backend type: ${config.type}`);
					continue;
			}

			await this.addBackend(backend);
		}
	}

	// ============================================================================
	// Event Logging
	// ============================================================================

	/**
	 * Log a single audit event
	 */
	async log(event: AuthAuditEvent): Promise<void> {
		if (!this.config.enabled || this.isShuttingDown) {
			return;
		}

		// Apply filtering
		if (!this.shouldLogEvent(event)) {
			return;
		}

		// If batching is disabled, log immediately
		if (!this.config.batchSize || this.config.batchSize <= 1) {
			await this.logToBackends([event]);
			return;
		}

		// Add to queue for batching
		if (this.eventQueue.length >= this.config.maxQueueSize!) {
			console.warn("[AUDIT] Event queue full, dropping oldest events");
			this.eventQueue.splice(0, this.config.batchSize!);
			this.stats.eventsDropped += this.config.batchSize!;
		}

		this.eventQueue.push(event);

		// Flush immediately if batch size is reached
		if (this.eventQueue.length >= this.config.batchSize!) {
			await this.flush();
		}
	}

	/**
	 * Log multiple events
	 */
	async logBatch(events: AuthAuditEvent[]): Promise<void> {
		if (!this.config.enabled || this.isShuttingDown) {
			return;
		}

		// Filter events
		const filteredEvents = events.filter((event) => this.shouldLogEvent(event));
		if (filteredEvents.length === 0) {
			return;
		}

		if (!this.config.batchSize || this.config.batchSize <= 1) {
			await this.logToBackends(filteredEvents);
		} else {
			this.eventQueue.push(...filteredEvents);

			// Respect max queue size
			if (this.eventQueue.length > this.config.maxQueueSize!) {
				const excess = this.eventQueue.length - this.config.maxQueueSize!;
				this.eventQueue.splice(0, excess);
				this.stats.eventsDropped += excess;
			}

			// Flush if batch size exceeded
			if (this.eventQueue.length >= this.config.batchSize!) {
				await this.flush();
			}
		}
	}

	/**
	 * Flush queued events to backends
	 */
	async flush(): Promise<void> {
		if (this.eventQueue.length === 0) {
			return;
		}

		const events = this.eventQueue.splice(0, this.config.batchSize!);
		await this.logToBackends(events);
		this.stats.lastFlush = new Date();
	}

	/**
	 * Log events to all active backends
	 */
	private async logToBackends(events: AuthAuditEvent[]): Promise<void> {
		if (events.length === 0 || this.backends.size === 0) {
			return;
		}

		const startTime = Date.now();
		const promises: Promise<void>[] = [];

		for (const backend of this.backends.values()) {
			const backendEvents = events.filter((event) =>
				this.shouldLogEventToBackend(event, backend),
			);

			if (backendEvents.length === 0) continue;

			const promise = this.logToBackend(backend, backendEvents).catch(
				(error) => {
					console.error(
						`[AUDIT] Backend '${backend.name}' logging failed:`,
						error,
					);
					this.stats.errorCount++;
				},
			);

			promises.push(promise);
		}

		try {
			await Promise.allSettled(promises);
			this.stats.eventsLogged += events.length;

			// Update average latency
			const latency = Date.now() - startTime;
			this.stats.averageLatency = (this.stats.averageLatency + latency) / 2;
		} catch (error) {
			console.error("[AUDIT] Error logging to backends:", error);
			this.stats.errorCount++;
		}
	}

	/**
	 * Log to a single backend
	 */
	private async logToBackend(
		backend: AuditBackend,
		events: AuthAuditEvent[],
	): Promise<void> {
		if (events.length === 1) {
			await backend.log(events[0]);
		} else {
			await backend.logBatch(events);
		}
	}

	// ============================================================================
	// Filtering and Configuration
	// ============================================================================

	/**
	 * Determine if an event should be logged
	 */
	private shouldLogEvent(event: AuthAuditEvent): boolean {
		// Check log level
		const severityLevels: AuditSeverity[] = [
			"info",
			"warning",
			"error",
			"critical",
		];
		const eventSeverityIndex = severityLevels.indexOf(event.severity);
		const configSeverityIndex = severityLevels.indexOf(this.config.logLevel);

		if (eventSeverityIndex < configSeverityIndex) {
			return false;
		}

		// Check include list
		if (this.config.includeEventTypes?.length) {
			if (!this.config.includeEventTypes.includes(event.type)) {
				return false;
			}
		}

		// Check exclude list
		if (this.config.excludeEventTypes?.length) {
			if (this.config.excludeEventTypes.includes(event.type)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Determine if an event should be logged to a specific backend
	 */
	private shouldLogEventToBackend(
		_event: AuthAuditEvent,
		_backend: AuditBackend,
	): boolean {
		// This would check backend-specific filtering if configured
		// For now, return true for all backends
		return true;
	}

	// ============================================================================
	// Timer Management
	// ============================================================================

	/**
	 * Start periodic flush timer
	 */
	private startFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
		}

		this.flushTimer = setInterval(async () => {
			try {
				await this.flush();
			} catch (error) {
				console.error("[AUDIT] Scheduled flush failed:", error);
				this.stats.errorCount++;
			}
		}, this.config.flushInterval!);
	}

	/**
	 * Stop flush timer
	 */
	private stopFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = undefined;
		}
	}

	// ============================================================================
	// Query Operations
	// ============================================================================

	/**
	 * Query audit events from backends that support it
	 */
	async query(filters: AuditQueryFilters): Promise<AuthAuditEvent[]> {
		const results: AuthAuditEvent[] = [];

		for (const backend of this.backends.values()) {
			if (backend.query) {
				try {
					const backendResults = await backend.query(filters);
					results.push(...backendResults);
				} catch (error) {
					console.error(
						`[AUDIT] Query failed for backend '${backend.name}':`,
						error,
					);
				}
			}
		}

		// Remove duplicates and sort by timestamp
		const uniqueResults = Array.from(
			new Map(results.map((event) => [event.eventId, event])).values(),
		);

		return uniqueResults.sort(
			(a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
		);
	}

	// ============================================================================
	// Statistics and Management
	// ============================================================================

	/**
	 * Get audit system statistics
	 */
	getStats(): AuditStats {
		return {
			...this.stats,
			queueSize: this.eventQueue.length,
			uptime: Date.now() - this.stats.lastFlush.getTime(),
		};
	}

	/**
	 * Get configuration
	 */
	getConfig(): AuditConfig {
		return { ...this.config };
	}

	/**
	 * Update configuration
	 */
	updateConfig(newConfig: Partial<AuditConfig>): void {
		this.config = { ...this.config, ...newConfig };

		// Restart flush timer if interval changed
		if (newConfig.flushInterval || newConfig.batchSize) {
			if (this.config.batchSize && this.config.batchSize > 1) {
				this.startFlushTimer();
			} else {
				this.stopFlushTimer();
			}
		}
	}

	/**
	 * Graceful shutdown
	 */
	async shutdown(): Promise<void> {
		console.log("[AUDIT] Shutting down audit manager...");
		this.isShuttingDown = true;

		// Stop timer
		this.stopFlushTimer();

		// Flush remaining events
		await this.flush();

		// Close all backends
		const closePromises = Array.from(this.backends.values()).map((backend) =>
			backend
				.close()
				.catch((error) =>
					console.error(
						`[AUDIT] Error closing backend '${backend.name}':`,
						error,
					),
				),
		);

		await Promise.allSettled(closePromises);
		this.backends.clear();
		this.stats.backendsActive = 0;

		console.log("[AUDIT] Audit manager shutdown complete");
	}
}

// ============================================================================
// Statistics Interface
// ============================================================================

export interface AuditStats {
	eventsLogged: number;
	eventsDropped: number;
	backendsActive: number;
	lastFlush: Date;
	averageLatency: number;
	errorCount: number;
	queueSize?: number;
	uptime?: number;
}

// ============================================================================
// Helper Functions for Authentication Events
// ============================================================================

/**
 * Create authentication attempt event
 */
export function createAuthAttemptEvent(
	req: Request,
	context: AuthenticatedContext,
	strategy: string,
): AuthAuditEvent {
	return createAuditEvent(
		"auth_attempt",
		true, // Attempt is always "successful" in starting
		"auth-middleware",
		{
			strategy,
			...extractSecurityContext(req, context),
		},
	);
}

/**
 * Create authentication success event
 */
export function createAuthSuccessEvent(
	req: Request,
	user: AuthenticatedUser,
	strategy: string,
	duration?: number,
): AuthAuditEvent {
	return createAuditEvent("auth_success", true, "auth-middleware", {
		userId: user.id,
		username: user.username,
		roles: user.roles,
		strategy,
		duration,
		...extractSecurityContext(req),
	});
}

/**
 * Create authentication failure event
 */
export function createAuthFailureEvent(
	req: Request,
	strategy: string,
	error: string,
	duration?: number,
): AuthAuditEvent {
	return createAuditEvent("auth_failure", false, "auth-middleware", {
		strategy,
		error,
		duration,
		...extractSecurityContext(req),
	});
}

/**
 * Create permission check event
 */
export function createPermissionCheckEvent(
	user: AuthenticatedUser | undefined,
	resourceType: string,
	operation: string,
	success: boolean,
	reason?: string,
	context?: AuthenticatedContext,
): AuthAuditEvent {
	return createAuditEvent(
		success ? "permission_granted" : "permission_denied",
		success,
		"permission-system",
		{
			userId: user?.id,
			username: user?.username,
			roles: user?.roles,
			resourceType,
			operation,
			error: success ? undefined : reason,
			requestId: (context as any)?.requestId,
			sessionId: (context as any)?.sessionId,
			metadata: {
				hasResourceData: context ? "yes" : "no",
			},
		},
	);
}

/**
 * Create token-related events
 */
export function createTokenEvent(
	type: "token_issued" | "token_revoked" | "token_refreshed",
	user: AuthenticatedUser,
	tokenInfo?: { type: string; expiresAt?: Date },
): AuthAuditEvent {
	return createAuditEvent(type, true, "token-system", {
		userId: user.id,
		username: user.username,
		roles: user.roles,
		metadata: {
			tokenType: tokenInfo?.type,
			expiresAt: tokenInfo?.expiresAt?.toISOString(),
		},
	});
}

/**
 * Create session-related events
 */
export function createSessionEvent(
	type: "session_created" | "session_expired" | "session_destroyed",
	user: AuthenticatedUser,
	sessionId: string,
	req?: Request,
): AuthAuditEvent {
	return createAuditEvent(type, true, "session-system", {
		userId: user.id,
		username: user.username,
		roles: user.roles,
		sessionId,
		...(req ? extractSecurityContext(req) : {}),
	});
}
