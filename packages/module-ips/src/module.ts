import { AtomicModule } from '@atomic-fhir/core';

export default new AtomicModule({
  name: 'ips',
  description: 'International Patient Summary (IPS) module',
  version: '1.0.0',
  packages: [
    {
      package: 'hl7.fhir.uv.ips',
      version: '2.0.0-ballot',
      npmRegistry: 'https://get-ig.org'
    }
  ]
});