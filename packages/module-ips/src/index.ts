import type { AtomicModule } from '@atomic-fhir/core';

interface IPSModuleConfig {
  version: string;
}

class IPSModule implements AtomicModule {
  name = 'module-ips';
  description = 'International Patient Summary (IPS) module';
  version = '1.0.0';
  packages = [{
    package: 'hl7.fhir.uv.ips',
    version: '2.0.0-ballot',
    npmRegistry: 'https://get-ig.org'
  }];

  constructor(config: IPSModuleConfig) {
    console.log('ipsModule init');
    return this;
  }

}

export { IPSModule };