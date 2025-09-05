import type { HandlerContext } from "@atomic-fhir/core";
import type {
	AuthenticatedUser,
	AuthenticationResult,
	AuthStrategyConfig,
} from "../types/index.ts";
import { BaseAuthStrategy } from "./base-strategy.ts";

/**
 * Configuration for Basic Authentication strategy
 */
export interface BasicAuthConfig extends AuthStrategyConfig {
	// Static user list
	users?: Record<string, string | UserInfo>;

	// Dynamic user provider function
	userProvider?: (username: string) => Promise<UserProviderResult | null>;

	// Security options
	hashPasswords?: boolean;
	realm?: string;
	caseSensitiveUsernames?: boolean;

	// Rate limiting (for future implementation)
	maxAttempts?: number;
	lockoutDuration?: number;
}

/**
 * User information structure
 */
export interface UserInfo {
	password: string;
	user?: Partial<AuthenticatedUser>;
}

/**
 * Result from user provider function
 */
export interface UserProviderResult {
	password: string;
	user: Partial<AuthenticatedUser>;
}

/**
 * HTTP Basic Authentication strategy
 *
 * Supports both static user lists and dynamic user providers with secure password handling.
 * Implements RFC 7617 HTTP Basic Authentication with modern security practices.
 */
export class BasicAuthStrategy extends BaseAuthStrategy {
	private readonly users = new Map<string, UserInfo>();
	private readonly userProvider?: (
		username: string,
	) => Promise<UserProviderResult | null>;
	private readonly hashPasswords: boolean;
	private readonly realm: string;
	private readonly caseSensitiveUsernames: boolean;

	constructor(config: BasicAuthConfig) {
		super(config);

		this.userProvider = config.userProvider;
		this.hashPasswords = config.hashPasswords ?? false;
		this.realm = config.realm || "FHIR Server";
		this.caseSensitiveUsernames = config.caseSensitiveUsernames ?? true;

		// Initialize static users
		if (config.users) {
			this.initializeUsers(config.users);
		}
	}

	/**
	 * Initialize static users from configuration
	 */
	private initializeUsers(users: Record<string, string | UserInfo>): void {
		for (const [username, userConfig] of Object.entries(users)) {
			const normalizedUsername = this.normalizeUsername(username);

			if (typeof userConfig === "string") {
				// Simple username -> password mapping
				this.users.set(normalizedUsername, {
					password: userConfig,
					user: {
						id: `user-${normalizedUsername}`,
						username: username,
						roles: ["user"],
					},
				});
			} else {
				// Full UserInfo object
				this.users.set(normalizedUsername, {
					password: userConfig.password,
					user: {
						id: `user-${normalizedUsername}`,
						username: username,
						roles: ["user"],
						...userConfig.user,
					},
				});
			}
		}
	}

	/**
	 * Normalize username for comparison
	 */
	private normalizeUsername(username: string): string {
		return this.caseSensitiveUsernames ? username : username.toLowerCase();
	}

	/**
	 * Check if this strategy can handle the request
	 */
	canHandle(req: Request): boolean {
		if (!super.canHandle(req)) {
			return false;
		}

		// Check for Authorization header with Basic scheme
		const authHeader = this.getAuthorizationHeader(req);
		return authHeader !== null && authHeader.toLowerCase().startsWith("basic ");
	}

	/**
	 * Authenticate request using Basic Authentication
	 */
	async authenticate(
		req: Request,
		_context: HandlerContext,
	): Promise<AuthenticationResult> {
		const startTime = Date.now();

		try {
			// Extract credentials from Authorization header
			const credentials = this.extractBasicCredentials(req);
			if (!credentials) {
				this.logAuthEvent(
					"auth_failure",
					req,
					undefined,
					"Missing or malformed Authorization header",
				);
				return this.createFailureResult(
					"Missing or malformed Authorization header",
					401,
				);
			}

			const { username, password } = credentials;

			// Validate credentials are not empty
			if (!username || !password) {
				this.logAuthEvent(
					"auth_failure",
					req,
					undefined,
					"Username or password is empty",
				);
				return this.createFailureResult(
					"Username and password are required",
					400,
				);
			}

			// Find user via static list or provider
			const userInfo = await this.findUser(username);
			if (!userInfo) {
				this.logAuthEvent(
					"auth_failure",
					req,
					undefined,
					`User not found: ${username}`,
				);
				return this.createFailureResult("Invalid credentials", 401);
			}

			// Verify password
			const isValidPassword = await this.verifyPassword(
				password,
				userInfo.password,
			);
			if (!isValidPassword) {
				this.logAuthEvent(
					"auth_failure",
					req,
					undefined,
					`Invalid password for user: ${username}`,
				);
				return this.createFailureResult("Invalid credentials", 401);
			}

			// Create authenticated user
			const authenticatedUser = this.createAuthenticatedUser(
				username,
				userInfo.user,
			);

			const _duration = Date.now() - startTime;
			_duration; // Use variable to avoid unused warning
			this.logAuthEvent("auth_success", req, authenticatedUser);

			return this.createSuccessResult(authenticatedUser);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Authentication error";
			this.logAuthEvent("auth_failure", req, undefined, errorMessage);
			return this.createFailureResult("Authentication failed", 500);
		}
	}

	/**
	 * Find user by username (static list or provider)
	 */
	private async findUser(username: string): Promise<UserInfo | null> {
		const normalizedUsername = this.normalizeUsername(username);

		// Try static user list first
		if (this.users.has(normalizedUsername)) {
			return this.users.get(normalizedUsername)!;
		}

		// Try dynamic user provider
		if (this.userProvider) {
			try {
				const result = await this.userProvider(username);
				if (result) {
					return {
						password: result.password,
						user: result.user,
					};
				}
			} catch (error) {
				console.error(
					`[BasicAuthStrategy] User provider error for ${username}:`,
					error,
				);
				return null;
			}
		}

		return null;
	}

	/**
	 * Verify password against stored hash or plain text
	 */
	private async verifyPassword(
		plaintext: string,
		stored: string,
	): Promise<boolean> {
		if (this.hashPasswords) {
			// Use bcrypt for hashed passwords
			try {
				const bcrypt = await import("bcrypt");
				return await bcrypt.compare(plaintext, stored);
			} catch (error) {
				console.error(
					"[BasicAuthStrategy] bcrypt not available, falling back to plain text comparison",
				);
				return plaintext === stored;
			}
		} else {
			// Use constant-time comparison for plain text passwords
			return this.constantTimeCompare(plaintext, stored);
		}
	}

	/**
	 * Constant-time string comparison to prevent timing attacks
	 */
	private constantTimeCompare(a: string, b: string): boolean {
		if (a.length !== b.length) {
			return false;
		}

		let result = 0;
		for (let i = 0; i < a.length; i++) {
			result |= a.charCodeAt(i) ^ b.charCodeAt(i);
		}

		return result === 0;
	}

	/**
	 * Create authenticated user from user info
	 */
	private createAuthenticatedUser(
		username: string,
		userInfo?: Partial<AuthenticatedUser>,
	): AuthenticatedUser {
		const baseUser: AuthenticatedUser = {
			id: `user-${this.normalizeUsername(username)}`,
			username: username,
			roles: ["user"],
			permissions: this.getDefaultPermissions(),
			metadata: {
				authStrategy: this.name,
				realm: this.realm,
			},
		};

		// Merge with provided user info
		if (userInfo) {
			return {
				...baseUser,
				...userInfo,
				// Ensure these fields are not overridden incorrectly
				id: userInfo.id || baseUser.id,
				username: userInfo.username || username,
				roles: userInfo.roles || baseUser.roles,
				permissions: userInfo.permissions || baseUser.permissions,
				metadata: {
					...baseUser.metadata,
					...userInfo.metadata,
				},
			};
		}

		return baseUser;
	}

	/**
	 * Create WWW-Authenticate challenge response
	 */
	challenge(_req: Request): Response {
		return new Response(
			JSON.stringify({
				error: "Authentication required",
				message: "Please provide valid Basic authentication credentials",
			}),
			{
				status: 401,
				headers: {
					"Content-Type": "application/fhir+json",
					"WWW-Authenticate": `Basic realm="${this.realm}", charset="UTF-8"`,
				},
			},
		);
	}

	/**
	 * Get WWW-Authenticate header for this strategy
	 */
	protected getWWWAuthenticateHeader(): string {
		return `Basic realm="${this.realm}", charset="UTF-8"`;
	}

	/**
	 * Hash a password using bcrypt
	 * Utility method for external use
	 */
	public static async hashPassword(
		password: string,
		rounds: number = 12,
	): Promise<string> {
		try {
			const bcrypt = await import("bcrypt");
			return await bcrypt.hash(password, rounds);
		} catch (error) {
			throw new Error(
				"bcrypt not available - install with: bun add bcrypt && bun add -d @types/bcrypt",
			);
		}
	}

	/**
	 * Verify if a password matches a hash
	 * Utility method for external use
	 */
	public static async verifyPassword(
		password: string,
		hash: string,
	): Promise<boolean> {
		try {
			const bcrypt = await import("bcrypt");
			return await bcrypt.compare(password, hash);
		} catch (error) {
			throw new Error(
				"bcrypt not available - install with: bun add bcrypt && bun add -d @types/bcrypt",
			);
		}
	}
}
