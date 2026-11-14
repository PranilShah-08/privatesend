import { describe, it, expect } from 'vitest';
import { extractSubnetClusterId } from '../src/utils/subnetCluster.js';

describe('subnetCluster', () => {
  it('masks IPv4 addresses on the same /24 subnet to the identical cluster ID', () => {
    const id1 = extractSubnetClusterId('192.168.1.10');
    const id2 = extractSubnetClusterId('192.168.1.254');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{16}$/);
  });

  it('separates different IPv4 subnets into distinct cluster IDs', () => {
    const idSubnet1 = extractSubnetClusterId('192.168.1.5');
    const idSubnet2 = extractSubnetClusterId('192.168.2.5');
    expect(idSubnet1).not.toBe(idSubnet2);
  });

  it('handles loopback addresses gracefully', () => {
    const idLoopback1 = extractSubnetClusterId('127.0.0.1');
    const idLoopback2 = extractSubnetClusterId('::1');
    expect(idLoopback1).toBe(idLoopback2);
  });

  it('masks IPv6 addresses to the same /64 prefix', () => {
    const ipv6A = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    const ipv6B = '2001:0db8:85a3:0000:ffff:ffff:ffff:ffff';
    const id1 = extractSubnetClusterId(ipv6A);
    const id2 = extractSubnetClusterId(ipv6B);
    expect(id1).toBe(id2);
  });

  it('handles unknown or empty IPs safely', () => {
    const id = extractSubnetClusterId('unknown');
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    const idEmpty = extractSubnetClusterId('');
    expect(idEmpty).toBe(id);
  });

  it('handles malformed IPv4 or generic host strings', () => {
    const idMalformed = extractSubnetClusterId('192.168.1');
    expect(idMalformed).toMatch(/^[0-9a-f]{16}$/);
    const idHost = extractSubnetClusterId('some-internal-hostname');
    expect(idHost).toMatch(/^[0-9a-f]{16}$/);
  });
});
