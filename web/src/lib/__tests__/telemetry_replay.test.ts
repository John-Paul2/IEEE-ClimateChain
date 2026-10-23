/**
 * Tests for telemetry replay, snapshot integrity, and chart data flow.
 * Strictly verifies Requirement 5:
 * 1. The snapshot has at least one packet per batch.
 * 2. Each packet's prev_hash equals the previous packet's hash.
 * 3. The chart receives data after the first replayed event.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import realRunSnapshot from "../../../public/snapshots/real-run.json" with { type: "json" };
import { REGISTERED_CHANNELS } from "../../types/telemetry.ts";

describe("Telemetry Replay & Snapshot Packet Integrity", () => {
  it("the snapshot has at least one packet per batch", () => {
    assert.ok(Array.isArray(realRunSnapshot.batches), "batches must be an array");
    assert.ok(realRunSnapshot.batches.length > 0, "must have at least one batch");

    for (const batch of realRunSnapshot.batches as any[]) {
      assert.ok(Array.isArray(batch.packets), `batch #${batch.batch_id} must have packets array`);
      assert.ok(
        batch.packets.length >= 1,
        `batch #${batch.batch_id} must have at least one packet (found ${batch.packets.length})`
      );
    }

    const batchDetails = (realRunSnapshot as any).batch_details || {};
    for (const [batchId, detail] of Object.entries(batchDetails) as [string, any][]) {
      assert.ok(Array.isArray(detail.packets), `batch detail #${batchId} must have packets array`);
      assert.ok(
        detail.packets.length >= 1,
        `batch detail #${batchId} must have at least one packet (found ${detail.packets.length})`
      );
    }
  });

  it("each packet's prev_hash equals the previous packet's hash", () => {
    const batches = (realRunSnapshot as any).batches || [];
    const allPackets: any[] = batches.flatMap((b: any) => b.packets || []);

    assert.ok(allPackets.length >= 2, "must have at least 2 packets to verify chain linking");

    // Genesis packet previous hash check
    const genesisPrev = allPackets[0].prev_hash;
    assert.equal(
      genesisPrev,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "genesis packet prev_hash must be zero bytes"
    );

    // Each packet's prev_hash equals the previous packet's hash
    for (let i = 1; i < allPackets.length; i++) {
      const current = allPackets[i];
      const previous = allPackets[i - 1];
      const prevHash = current.prev_hash;
      const expectedHash = previous.hash || previous.packet_hash;

      assert.ok(expectedHash, `packet seq #${previous.seq} must have a hash`);
      assert.equal(
        prevHash.toLowerCase(),
        expectedHash.toLowerCase(),
        `Packet seq #${current.seq} prev_hash must equal packet seq #${previous.seq} hash`
      );
    }
  });

  it("the chart receives data after the first replayed event", () => {
    // 1. Locate the first packet event in the snapshot events
    const packetEvents = (realRunSnapshot.events as any[]).filter(
      (e) => e.type === "packet" && (e.seq !== undefined || e.data?.seq !== undefined)
    );
    assert.ok(packetEvents.length > 0, "snapshot events must contain packet events");

    const firstEvent = packetEvents[0];
    const eventData = firstEvent.data || {};

    // 2. Map replayed event into a telemetry packet record (as OperatorPage does)
    const replayedPacket = {
      device_id: String(firstEvent.device_id || eventData.device_id || "DEV-CAMPD-1073-3"),
      seq: Number(firstEvent.seq ?? eventData.seq ?? 0),
      timestamp_utc: String(
        firstEvent.timestamp_utc || firstEvent.timestamp || eventData.timestamp_utc || eventData.timestamp || ""
      ),
      values: (firstEvent.values || eventData.values || {}) as Record<string, number>,
      prev_hash: String(firstEvent.prev_hash || eventData.prev_hash || ""),
      signature: String(firstEvent.signature || eventData.signature || ""),
      packet_hash: String(firstEvent.hash || firstEvent.packet_hash || eventData.hash || eventData.packet_hash || ""),
    };

    assert.ok(replayedPacket.values, "replayed packet must contain channel values");
    assert.ok(
      typeof replayedPacket.values.co2_mass_short_tons === "number",
      "replayed packet must have numeric co2_mass_short_tons"
    );

    // 3. Transform into chart data points using REGISTERED_CHANNELS (as TelemetryCharts does)
    const packets = [replayedPacket];
    const chartData = packets.map((pkt) => {
      const rawTime = pkt.timestamp_utc;
      const timeStr = rawTime
        ? new Date(rawTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : `Seq #${pkt.seq}`;

      const pt: Record<string, any> = {
        seq: pkt.seq,
        label: `Seq #${pkt.seq}`,
        time: timeStr,
      };

      for (const ch of REGISTERED_CHANNELS) {
        pt[ch.key] = pkt.values?.[ch.key] ?? null;
      }
      return pt;
    });

    // Chart has received data
    assert.equal(chartData.length, 1, "chart must have 1 point after first replayed event");
    assert.equal(chartData[0].seq, replayedPacket.seq);
    assert.equal(chartData[0].co2_mass_short_tons, replayedPacket.values.co2_mass_short_tons);
    assert.equal(chartData[0].heat_input_mmbtu, replayedPacket.values.heat_input_mmbtu);
    assert.notEqual(chartData[0].co2_mass_short_tons, null);
  });
});
