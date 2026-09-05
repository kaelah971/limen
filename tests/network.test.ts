import { describe, expect, it } from "vitest";
import { LOCAL_HOSTS, parseOutboundUrl } from "../packages/core/src";

const policy = { name: "Outbound" };

describe("outbound URL boundary", () => {
  it.each([
    "http://remote.example.test",
    "https://localhost:8443",
    "https://127.0.0.1:8443",
    "https://[::1]:8443",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.5/internal",
    "https://172.16.0.5/internal",
    "https://192.168.1.5/internal",
    "https://user:password@remote.example.test",
    "not-a-url",
  ])("rejects unsafe destination %s", (value) => {
    expect(() => parseOutboundUrl(value, policy)).toThrow();
  });

  it("allows only explicit local development HTTP destinations", () => {
    expect(parseOutboundUrl("http://127.0.0.1:8787", {
      ...policy,
      allowHttpHosts: LOCAL_HOSTS,
    }).hostname).toBe("127.0.0.1");
    expect(() => parseOutboundUrl("http://remote.example.test", {
      ...policy,
      allowHttpHosts: LOCAL_HOSTS,
    })).toThrow();
  });

  it("rejects private IPv4-mapped IPv6 destinations", () => {
    expect(() => parseOutboundUrl("https://[::ffff:127.0.0.1]:8443", policy)).toThrow();
  });

  it.each([
    "https://remote.example.test?redirect=https://attacker.example",
    "https://remote.example.test/#fragment",
  ])("rejects URL-controlled routing data %s", (value) => {
    expect(() => parseOutboundUrl(value, policy)).toThrow();
  });
});
