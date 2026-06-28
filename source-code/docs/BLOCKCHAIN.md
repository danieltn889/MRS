# Blockchain & Audit-Chain Documentation

This document describes how the V-WES platform provides a **tamper-evident audit trail**
for important platform events. There are two complementary layers:

1. **Ethereum layer** — a local Hardhat/Ethereum chain with a Solidity smart contract
   (`LocalSimulation.sol`) that stores simulation scores on-chain and returns a transaction
   hash. Requires a running node.
2. **Application audit chain** — a SHA-256, hash-linked chain stored in PostgreSQL
   (`audit_chain` table) that links every event to the previous one. It works **without a
   running node**, is fully unit-tested, and can *anchor* to an Ethereum transaction via
   `eth_tx_id`.

This document focuses primarily on the application audit chain, which is the source of the
`/blockchain/chain/*` verification APIs and the Blockchain Explorer UI.

---

## 1. Overview

Each important event (e.g. a simulation submission) is written as a **block**. Every block
stores the **hash of the previous block** plus a hash of its own contents. Because each hash
depends on the one before it, changing any historical block invalidates the hash of that
block *and every block after it* — which the verification routine detects.

| Property | Value |
|----------|-------|
| Hash algorithm | SHA-256 (Node `crypto`) |
| Linking | `prev_hash` → `current_hash` (classic hash-linked chain) |
| Genesis `prev_hash` | 64 zeros (`"0".repeat(64)`) |
| Storage | PostgreSQL table `audit_chain` |
| Service | `backend/src/services/audit-chain.service.ts` |
| Ethereum anchor | optional `eth_tx_id` per block |

---

## 2. Architecture

```
 Event (e.g. simulation_submitted)
        │
        ▼
 AuditChainService.appendBlock()         ── advisory-locked DB transaction
        │   reads chain tip (last block)
        │   computes current_hash = SHA256( block_number | prev_hash | timestamp | … | nonce )
        ▼
 INSERT INTO audit_chain (…)             ── prev_hash = tip.current_hash
        │
        ▼
 (optional) eth_tx_id anchors the block to an on-chain Ethereum transaction
```

Verification (`verifyChain`) loads all blocks ordered by `block_number`, recomputes each
hash, and confirms each block links to its predecessor.

---

## 3. Block format (`audit_chain` table)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `block_number` | BIGINT | Sequential, starts at 0 (genesis) |
| `prev_hash` | VARCHAR(64) | `current_hash` of the previous block (genesis = 64 zeros) |
| `current_hash` | VARCHAR(64) UNIQUE | SHA-256 of this block's canonical contents |
| `timestamp` | TIMESTAMPTZ | Block creation time (part of the hash) |
| `event_type` | VARCHAR(100) | e.g. `simulation_submitted` |
| `candidate_id` | UUID | Related candidate (nullable) |
| `simulation_id` | UUID | Related simulation (nullable) |
| `evaluation_id` | UUID | Related evaluation (nullable) |
| `git_commit_hash` | VARCHAR(255) | Final commit (nullable) |
| `repo_hash` | VARCHAR(255) | Repository reference (nullable) |
| `action` | TEXT | Human-readable action |
| `metadata` | JSONB | Sanitized extra data (secrets stripped) |
| `nonce` | INTEGER | Reserved (default 0) |
| `eth_tx_id` | VARCHAR(255) | Anchoring Ethereum transaction hash (nullable) |
| `created_at` | TIMESTAMPTZ | Row creation time |

Indexes: `block_number` (unique), `event_type`, `candidate_id`, `simulation_id`,
`current_hash`.

---

## 4. Hash generation

The hash is deterministic over a pipe-joined canonical string. From
`AuditChainService.computeHash`:

```
SHA256(
  block_number | prev_hash | timestamp | event_type |
  candidate_id | simulation_id | evaluation_id |
  git_commit_hash | repo_hash | action |
  JSON.stringify(metadata) | nonce | eth_tx_id
)
```

Properties (all covered by tests):
- **Deterministic** — identical input always yields the same 64-char hex hash.
- **Tamper-evident** — changing any field (metadata, event_type, prev_hash, nonce, …)
  produces a different hash.

---

## 5. Verification algorithm

`verifyBlocks(blocks)` (pure, in-memory) orders blocks by `block_number` and for each:

1. **Recompute** `computeHash(block)` and compare to the stored `current_hash`
   → mismatch means the block's contents were altered.
2. **Genesis (index 0):** `prev_hash` must equal the 64-zero genesis hash.
3. **Non-genesis:** `prev_hash` must equal the previous block's `current_hash`
   (broken-link detection), and `block_number` must be exactly `prev.block_number + 1`
   (missing-block detection).

It returns a report:

```json
{
  "valid": true,
  "totalBlocks": 50,
  "verifiedCount": 50,
  "failedCount": 0,
  "firstInvalidBlockNumber": null,
  "issues": []
}
```

If tampering is detected, `valid` is `false`, `firstInvalidBlockNumber` points to the first
bad block, and `issues[]` explains each failure (`Hash mismatch`, `Broken link`,
`Non-sequential block number`, `Genesis block has an invalid previous hash`).

---

## 6. Event types

Currently written:
- `simulation_submitted` — appended after a submission is saved (anchored to the Ethereum
  tx hash when on-chain storage is enabled).

Designed to be extended (one `AuditChainService.appendBlock({...})` call each):
candidate registration, email verification, profile completion, simulation started,
auto-save checkpoint, task completed, evaluation started/completed, repository linked/synced,
final commit recorded, results published.

---

## 7. APIs

Base path: `/api/v1/blockchain` (file: `backend/src/routes/v1/blockchain.routes.ts`).
All routes require authentication (`protect`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/chain/stats` | any user | `{ totalBlocks, lastBlock }` for the dashboard |
| GET | `/chain/verify` | any user | Verify the **entire** chain → integrity report |
| GET | `/chain` | any user | Browse/search blocks (`page`, `limit`, `eventType`, `candidateId`, `simulationId`, `blockNumber`) |
| GET | `/chain/:id` | any user | Get a single block |
| GET | `/chain/:id/verify` | any user | Verify a single block (hash + prev-hash link) |

> Chain verification is intentionally available to any authenticated user (including the
> candidate) — it is a **read-only integrity check** that reveals only status and counts,
> no sensitive data — so candidates can verify their own results have not been tampered with.

### Example: verify the chain

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/v1/blockchain/chain/verify
```

```json
{ "success": true, "data": { "valid": true, "totalBlocks": 12, "verifiedCount": 12, "failedCount": 0, "firstInvalidBlockNumber": null, "issues": [] } }
```

---

## 8. Security considerations

- **Append-only** — there is no update/delete API for the chain; rows are only inserted.
- **Serialized appends** — `appendBlock` runs inside a transaction with
  `pg_advisory_xact_lock`, so concurrent events cannot claim the same block number / link.
- **Metadata sanitization** — `sanitizeMetadata` strips keys matching
  `password|secret|token|privatekey|authorization|apikey` and truncates oversized values, so
  secrets never enter the chain.
- **No sensitive payloads** — store identifiers and hashes, not raw PII or credentials.
- **Best-effort, non-blocking** — `appendBlock` never throws into the request path; a chain
  failure cannot fail the underlying action.

---

## 9. Testing

The pure hash/verify logic is unit-tested with Node's built-in test runner via `tsx`
(no extra dependency):

```bash
cd source-code/backend
npm run test:audit-chain
```

Covered cases (`src/services/__tests__/audit-chain.test.ts`):
- `computeHash` is deterministic and 64-char hex.
- Changing any field changes the hash (tamper-evident).
- `sanitizeMetadata` strips secrets and truncates large values.
- A valid chain passes verification.
- A tampered block fails (hash mismatch).
- A broken link fails even when the block's own hash is valid.
- An invalid genesis `prev_hash` fails.
- A missing block (non-sequential numbers) fails.

Expected output ends with `pass 10 / fail 0`.

---

## 10. Ethereum layer (reference)

- Contract: `source-code/blockchain/contracts/LocalSimulation.sol` (Hardhat, chain id 1337).
- Service: `backend/src/services/blockchain.service.ts`
  (`storeSimulationResultWithUniqueAddress`, `getSimulationResult`, `verifySimulationResult`,
  `generateCredentialHash`).
- Enabled only when `USE_BLOCKCHAIN=true` and a node is reachable at `BLOCKCHAIN_RPC_URL`.
- Stores scores on-chain and returns `{ txHash, blockNumber, blockHash }`, persisted to
  `blockchain_records` and `verifiable_credentials`. The audit chain records the same event
  and anchors to `txHash`.

To run the Ethereum node locally:

```bash
cd source-code/blockchain
npx hardhat node            # starts a local chain at http://127.0.0.1:8545
npx hardhat run scripts/deploy.js --network localhost
```

---

## 11. Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `/chain/verify` returns 403 | Ensure you are authenticated; the route only requires a valid token (not admin). |
| Verify reports `valid: false` | A block's contents or link changed. Inspect `issues[]` and `firstInvalidBlockNumber`. |
| No blocks in the explorer | No events recorded yet — submit a simulation to create the first block. |
| Ethereum tx is `null` | `USE_BLOCKCHAIN` is not `true` or no node at `BLOCKCHAIN_RPC_URL`. The audit chain still works without it. |
