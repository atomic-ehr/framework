/**
 * Package caching functionality for improved performance
 */

import type {
  LoadedPackage,
  PackageCacheEntry,
  PackageLoaderError
} from './types.js';

/**
 * Configuration for package cache
 */
export interface CacheConfig {
  /** Enable caching */
  enabled?: boolean;

  /** Cache directory */
  cacheDir?: string;

  /** Cache TTL in milliseconds */
  ttl?: number;

  /** Maximum cache size in number of packages */
  maxSize?: number;

  /** Cache version for invalidation */
  version?: string;
}

/**
 * Package cache implementation
 */
export class PackageCache {
  private config: Required<CacheConfig>;
  private cache: Map<string, PackageCacheEntry> = new Map();
  private accessTimes: Map<string, number> = new Map();

  constructor(config: CacheConfig = {}) {
    this.config = {
      enabled: true,
      cacheDir: './cache/packages',
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      maxSize: 100,
      version: '1.0.0',
      ...config
    };
  }

  /**
   * Initialize cache
   */
  async init(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // In a full implementation, this would load cache from disk
    await this.loadCacheFromDisk();
    this.startCleanupInterval();
  }

  /**
   * Dispose of cache resources
   */
  async dispose(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    await this.saveCacheToDisk();
  }

  /**
   * Get cached package
   */
  get(packageId: string): LoadedPackage | null {
    if (!this.config.enabled) {
      return null;
    }

    const entry = this.cache.get(packageId);
    if (!entry) {
      return null;
    }

    // Check expiry
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(packageId);
      this.accessTimes.delete(packageId);
      return null;
    }

    // Update access time for LRU
    this.accessTimes.set(packageId, Date.now());

    return entry.package;
  }

  /**
   * Set cached package
   */
  set(packageId: string, loadedPackage: LoadedPackage): void {
    if (!this.config.enabled) {
      return;
    }

    // Check cache size and evict if necessary
    this.evictIfNecessary();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.ttl);

    const entry: PackageCacheEntry = {
      packageId,
      package: loadedPackage,
      cachedAt: now,
      expiresAt,
      metadata: {
        cacheVersion: this.config.version,
        packageVersion: loadedPackage.version,
        checksum: this.generateChecksum(loadedPackage)
      }
    };

    this.cache.set(packageId, entry);
    this.accessTimes.set(packageId, Date.now());
  }

  /**
   * Check if package is cached
   */
  has(packageId: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    return this.get(packageId) !== null;
  }

  /**
   * Remove package from cache
   */
  delete(packageId: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    this.accessTimes.delete(packageId);
    return this.cache.delete(packageId);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.accessTimes.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRatio: number;
    totalHits: number;
    totalMisses: number;
  } {
    // In a full implementation, this would track hits and misses
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRatio: 0,
      totalHits: 0,
      totalMisses: 0
    };
  }

  /**
   * Evict least recently used entries if cache is full
   */
  private evictIfNecessary(): void {
    while (this.cache.size >= this.config.maxSize) {
      // Find least recently used entry
      let oldestKey: string | null = null;
      let oldestTime = Date.now();

      for (const [key, time] of this.accessTimes) {
        if (time < oldestTime) {
          oldestTime = time;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.accessTimes.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * Generate checksum for cache validation
   */
  private generateChecksum(loadedPackage: LoadedPackage): string {
    // Simple checksum based on package metadata
    const data = `${loadedPackage.name}:${loadedPackage.version}:${loadedPackage.resourceTypes.length}:${loadedPackage.loadTime}`;

    // In a full implementation, this would use a proper hash function
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(16);
  }

  /**
   * Load cache from disk
   */
  private async loadCacheFromDisk(): Promise<void> {
    // In a full implementation, this would load from actual files
    // For now, this is a placeholder
  }

  /**
   * Save cache to disk
   */
  private async saveCacheToDisk(): Promise<void> {
    // In a full implementation, this would save to actual files
    // For now, this is a placeholder
  }

  /**
   * Start cleanup interval for expired entries
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpired();
    }, 60 * 60 * 1000); // Run every hour
  }

  /**
   * Remove expired entries
   */
  private cleanupExpired(): void {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt && entry.expiresAt < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.accessTimes.delete(key);
    }
  }
}