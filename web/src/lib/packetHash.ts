/**
 * Canonical JSON serialization and SHA-256 packet hashing in TypeScript.
 *
 * Conforms to docs/INTERFACES.md Section 2 and Section 3 (DECISION-01, DECISION-02):
 * - Excludes "signature" key
 * - Formats numeric values to fixed 6 decimal places ("0.000000")
 * - Keys sorted lexicographically in ascending UTF-8 code point order
 * - Computes standard SHA-256 digest with 0x prefix via crypto.subtle
 */

export interface TelemetryPacketPreimage {
  device_id?: string;
  prev_hash?: string;
  seq: number;
  timestamp_utc?: string;
  values?: Record<string, number | string | null | undefined>;
}

export function canonicalPacketJson(packet: TelemetryPacketPreimage): string {
  const formattedValues: Record<string, string> = {};
  const rawValues = packet.values || {};
  const sortedValueKeys = Object.keys(rawValues).sort();

  for (const k of sortedValueKeys) {
    const rawVal = rawValues[k];
    if (rawVal !== undefined && rawVal !== null) {
      const num = Number(rawVal);
      formattedValues[k] = isNaN(num) ? "0.000000" : num.toFixed(6);
    }
  }

  const preimage = {
    device_id: String(packet.device_id || "DEV-CAMPD-1073-3"),
    prev_hash: String(packet.prev_hash || "0x" + "00".repeat(32)),
    seq: Number(packet.seq ?? 0),
    timestamp_utc: String(packet.timestamp_utc || "2025-01-01T00:00:00Z"),
    values: formattedValues,
  };

  // Deterministically sort top-level keys
  const sortedPreimage: Record<string, unknown> = {};
  for (const key of Object.keys(preimage).sort()) {
    sortedPreimage[key] = (preimage as Record<string, unknown>)[key];
  }

  return JSON.stringify(sortedPreimage);
}

export async function computePacketSha256(packet: TelemetryPacketPreimage): Promise<string> {
  const jsonStr = canonicalPacketJson(packet);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonStr);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
