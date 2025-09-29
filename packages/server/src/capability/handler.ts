/**
 * Metadata endpoint handler
 */

import type { LoadedPackage } from '@atomic-ehr/packages';
import type { HttpRequestContext, HttpResponseContext } from '../types.js';
import type { CapabilityStatement } from './types.js';
import { CapabilityStatementGenerator } from './generator.js';

/**
 * Handler for /metadata endpoint with content negotiation
 */
export class MetadataHandler {
  constructor(
    private capabilityGenerator: CapabilityStatementGenerator,
    private packageLoader?: { getLoadedPackages(): LoadedPackage[] }
  ) {}

  /**
   * Handle metadata request
   */
  async handle(context: HttpRequestContext): Promise<HttpResponseContext> {
    const startTime = Date.now();

    // Content negotiation
    const acceptHeader = context.headers.accept || context.headers.Accept || 'application/fhir+json';
    const format = this.negotiateFormat(acceptHeader);

    // Generate capability statement
    const capabilityStatement = this.capabilityGenerator.generate();

    // Enrich with runtime information
    this.enrichCapabilityStatement(capabilityStatement, context);

    // Format response
    const responseBody = this.formatResponse(capabilityStatement, format);

    return {
      statusCode: 200,
      responseHeaders: {
        'Content-Type': format,
        'Cache-Control': 'public, max-age=300',
        'Last-Modified': new Date().toUTCString(),
        'Vary': 'Accept',
        'X-Request-ID': context.requestId
      },
      responseBody,
      timing: {
        startTime: context.startTime,
        endTime: Date.now(),
        duration: Date.now() - context.startTime,
        hookDuration: Date.now() - startTime
      }
    };
  }

  /**
   * Negotiate content format based on Accept header
   */
  private negotiateFormat(acceptHeader: string): string {
    // Check for XML format
    if (acceptHeader.includes('application/fhir+xml') ||
        acceptHeader.includes('application/xml') ||
        acceptHeader.includes('text/xml')) {
      return 'application/fhir+xml; charset=utf-8';
    }

    // Default to JSON
    return 'application/fhir+json; charset=utf-8';
  }

  /**
   * Enrich capability statement with runtime information
   */
  private enrichCapabilityStatement(
    capability: CapabilityStatement,
    context: HttpRequestContext
  ): void {
    // Update implementation URL based on request
    if (capability.implementation) {
      const host = context.headers.host || context.headers.Host || 'localhost:3000';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      capability.implementation.url = `${protocol}://${host}`;
    }

    // Add package information
    if (this.packageLoader) {
      const packages = this.packageLoader.getLoadedPackages();
      if (packages.length > 0) {
        capability.implementationGuide = packages.map(pkg => `${pkg.name}#${pkg.version}`);
      }
    }

    // Add server uptime extension
    const uptimeSeconds = process.uptime();
    const uptimeDate = new Date(Date.now() - (uptimeSeconds * 1000));

    if (!capability.extension) {
      capability.extension = [];
    }

    capability.extension.push({
      url: 'http://atomic-ehr.org/fhir/StructureDefinition/server-uptime',
      valueDateTime: uptimeDate.toISOString()
    });

    // Add request processing time extension
    capability.extension.push({
      url: 'http://atomic-ehr.org/fhir/StructureDefinition/metadata-generation-time',
      valueDecimal: Date.now() - context.startTime
    });
  }

  /**
   * Format response based on content type
   */
  private formatResponse(capability: CapabilityStatement, format: string): any {
    if (format.includes('xml')) {
      // Return XML formatted capability statement
      return this.toXml(capability);
    }

    // Return JSON (object will be serialized by server)
    return capability;
  }

  /**
   * Convert capability statement to XML
   * TODO: Implement full FHIR XML serialization
   */
  private toXml(capability: CapabilityStatement): string {
    // Simple XML generation for now
    // In production, use a proper FHIR XML serializer
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CapabilityStatement xmlns="http://hl7.org/fhir">
  <id value="${capability.id || 'server-capability'}"/>
  <url value="${capability.url}"/>
  <version value="${capability.version}"/>
  <name value="${capability.name}"/>
  <title value="${capability.title}"/>
  <status value="${capability.status}"/>
  <experimental value="${capability.experimental || false}"/>
  <date value="${capability.date}"/>
  <publisher value="${capability.publisher}"/>
  <description value="${capability.description}"/>
  <kind value="${capability.kind}"/>
  <fhirVersion value="${capability.fhirVersion}"/>
  ${capability.format.map(f => `<format value="${f}"/>`).join('\n  ')}
  <!-- Full XML serialization not yet implemented -->
  <!-- Please use Accept: application/fhir+json for complete capability statement -->
</CapabilityStatement>`;

    return xml;
  }

  /**
   * Update capability generator
   */
  setCapabilityGenerator(generator: CapabilityStatementGenerator): void {
    this.capabilityGenerator = generator;
  }

  /**
   * Update package loader
   */
  setPackageLoader(loader: { getLoadedPackages(): LoadedPackage[] }): void {
    this.packageLoader = loader;
  }
}