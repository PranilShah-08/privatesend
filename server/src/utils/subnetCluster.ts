import crypto from 'node:crypto';

/**
 * Extracts a privacy-preserving Subnet Cluster ID.
 * Devices connected to the same Wi-Fi / local network share the same cluster ID,
 * without exposing real IP addresses to peers.
 */
export function extractSubnetClusterId(ip: string, salt = 'privatesend-cluster-salt'): string {
  const cleanIp = (ip || '').trim().toLowerCase();

  let subnetPrefix: string;

  if (!cleanIp || cleanIp === 'unknown') {
    subnetPrefix = 'unknown-network';
  } else if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
    subnetPrefix = 'local-loopback';
  } else if (cleanIp.includes('.')) {
    // IPv4: mask to /24 (e.g. 192.168.1.0/24)
    const parts = cleanIp.split('.');
    if (parts.length === 4) {
      subnetPrefix = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    } else {
      subnetPrefix = cleanIp;
    }
  } else if (cleanIp.includes(':')) {
    // IPv6: mask to /64 (first 4 groups)
    const groups = cleanIp.split(':').filter(Boolean);
    const prefix = groups.slice(0, 4).join(':');
    subnetPrefix = `${prefix}::/64`;
  } else {
    subnetPrefix = cleanIp;
  }

  // Hash prefix with salt to create a safe 16-hex cluster ID
  return crypto
    .createHash('sha256')
    .update(`${subnetPrefix}:${salt}`)
    .digest('hex')
    .slice(0, 16);
}
