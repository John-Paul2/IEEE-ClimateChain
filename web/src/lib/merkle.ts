/**
 * Cryptographic Merkle Tree & Proof utilities for VeriCEMS in TypeScript.
 *
 * Conforms to docs/INTERFACES.md Section 4 & DECISION-04:
 * - Hash primitive: Keccak-256 (0x01 domain padding, via viem's keccak256).
 * - Leaves: leaf_i = keccak256(bytes32(packet_hash_i)).
 * - Internal nodes: keccak256(min(a, b) + max(a, b)) where comparison is unsigned 32-byte big-endian.
 * - Odd-node promotion: unpaired trailing leaf/node at an odd-length level is promoted unchanged.
 */

import { keccak256, stringToHex, type Hex } from "viem";

export interface MerkleProof {
  leaf_index: number;
  packet_hash: Hex;
  leaf_hash: Hex;
  siblings: Hex[];
  merkle_root: Hex;
}

export interface MerkleTreeResult {
  leaves: Hex[];
  levels: Hex[][];
  merkle_root: Hex;
  proofs: MerkleProof[];
}

/**
 * Compare two 0x-prefixed 32-byte hex strings lexicographically as unsigned 32-byte big-endian integers.
 * Because hex characters '0'..'9' < 'a'..'f', lowercase string comparison is identical to byte comparison.
 */
export function hashSortedPair(aHex: string, bHex: string): Hex {
  const aNorm = aHex.toLowerCase() as Hex;
  const bNorm = bHex.toLowerCase() as Hex;
  const combined = aNorm <= bNorm ? `${aNorm}${bNorm.slice(2)}` : `${bNorm}${aNorm.slice(2)}`;
  return keccak256(combined as Hex);
}

/**
 * Compute the domain-separated leaf hash for a 32-byte packet_hash:
 * leaf = keccak256(bytes32(packet_hash))
 */
export function computeLeafHash(packetHashHex: string): Hex {
  return keccak256(packetHashHex.toLowerCase() as Hex);
}

/**
 * Construct a binary Merkle tree with sorted pairs and odd-node promotion (DECISION-04).
 * `packetHashes` may be packet hashes or batch roots when aggregating a period tree.
 */
export function buildMerkleTree(packetHashes: string[]): MerkleTreeResult {
  if (!packetHashes || packetHashes.length === 0) {
    throw new Error("Cannot build Merkle tree from empty hash list");
  }

  const leaves: Hex[] = packetHashes.map((h) => computeLeafHash(h));
  const levels: Hex[][] = [leaves];

  let current = leaves;
  while (current.length > 1) {
    const nextLevel: Hex[] = [];
    for (let i = 0; i < current.length - 1; i += 2) {
      nextLevel.push(hashSortedPair(current[i], current[i + 1]));
    }
    if (current.length % 2 === 1) {
      // DECISION-04: Odd trailing node is promoted unchanged without self-hashing
      nextLevel.push(current[current.length - 1]);
    }
    levels.push(nextLevel);
    current = nextLevel;
  }

  const rootHex = levels[levels.length - 1][0];
  const proofs: MerkleProof[] = [];

  for (let leafIdx = 0; leafIdx < leaves.length; leafIdx++) {
    const siblings: Hex[] = [];
    let idx = leafIdx;
    for (let l = 0; l < levels.length - 1; l++) {
      const level = levels[l];
      if (idx % 2 === 0) {
        if (idx + 1 < level.length) {
          siblings.push(level[idx + 1]);
        }
        // else: odd trailing node promoted unchanged -> no sibling added
      } else {
        siblings.push(level[idx - 1]);
      }
      idx = Math.floor(idx / 2);
    }
    proofs.push({
      leaf_index: leafIdx,
      packet_hash: packetHashes[leafIdx].toLowerCase() as Hex,
      leaf_hash: leaves[leafIdx],
      siblings,
      merkle_root: rootHex,
    });
  }

  return {
    leaves,
    levels,
    merkle_root: rootHex,
    proofs,
  };
}

/**
 * Verify a Merkle inclusion proof using OpenZeppelin's sorted-pair folding rule.
 */
export function verifyMerkleProof(
  leafHashHex: string,
  siblingsHex: string[],
  expectedRootHex: string,
  packetHashHex?: string
): boolean {
  try {
    const leaf = leafHashHex.toLowerCase() as Hex;
    const expectedRoot = expectedRootHex.toLowerCase() as Hex;

    if (packetHashHex) {
      const computedLeaf = computeLeafHash(packetHashHex);
      if (computedLeaf.toLowerCase() !== leaf.toLowerCase()) {
        return false;
      }
    }

    let computed = leaf;
    for (const sib of siblingsHex) {
      computed = hashSortedPair(computed, sib);
    }

    return computed.toLowerCase() === expectedRoot.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Convert an installation_id or device_id to a 32-byte hex string (INTERFACES.md Sec 8.1):
 * keccak256(utf8Bytes(identifier)) unless already a 32-byte hex string.
 */
export function idToBytes32Hex(identifier: string): Hex {
  if (!identifier) {
    throw new Error("Identifier must be non-empty");
  }
  if (identifier.startsWith("0x") && identifier.length === 66) {
    return identifier.toLowerCase() as Hex;
  }
  return keccak256(stringToHex(identifier));
}
