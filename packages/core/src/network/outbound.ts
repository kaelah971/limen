const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export interface OutboundUrlPolicy {
  name: string;
  allowHttpHosts?: ReadonlySet<string>;
  requireHttps?: boolean;
  rejectPrivateAddresses?: boolean;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

function isPrivateIpv6(hostname: string): boolean {
  if (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:")) {
    return true;
  }

  const mappedIpv4 = hostname.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4 !== null) {
    return isPrivateIpv4(mappedIpv4[1]);
  }

  const mappedHex = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex === null) {
    return false;
  }
  const high = Number.parseInt(mappedHex[1], 16);
  const low = Number.parseInt(mappedHex[2], 16);
  return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" ||
    normalized === "metadata.google.internal" ||
    normalized === "instance-data.ec2.internal" ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".local") ||
    isPrivateIpv4(normalized) ||
    isPrivateIpv6(normalized);
}

export function parseOutboundUrl(value: string, policy: OutboundUrlPolicy): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${policy.name} URL is invalid.`);
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error(`${policy.name} URL must not contain credentials.`);
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new Error(`${policy.name} URL must not contain a query or fragment.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${policy.name} URL must use HTTP or HTTPS.`);
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const allowHttpHosts = policy.allowHttpHosts ?? new Set<string>();
  if (parsed.protocol === "http:" && !allowHttpHosts.has(host)) {
    throw new Error(`${policy.name} remote URL must use HTTPS.`);
  }
  if (policy.requireHttps === true && parsed.protocol !== "https:") {
    throw new Error(`${policy.name} URL must use HTTPS.`);
  }
  if (
    policy.rejectPrivateAddresses !== false &&
    !allowHttpHosts.has(host) &&
    isPrivateHostname(host)
  ) {
    throw new Error(`${policy.name} URL targets a private or metadata address.`);
  }

  return parsed;
}

export { LOCAL_HOSTS };
