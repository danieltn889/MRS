import { test } from 'node:test';
import assert from 'node:assert/strict';
import AuditChainService, { AuditBlock, GENESIS_PREV_HASH } from '../audit-chain.service.js';

// Build a valid hash-linked chain of `n` blocks (genesis-anchored).
function buildChain(n: number): AuditBlock[] {
  const blocks: AuditBlock[] = [];
  let prev = GENESIS_PREV_HASH;
  for (let i = 0; i < n; i++) {
    const b: AuditBlock = {
      block_number: i,
      prev_hash: prev,
      timestamp: `2026-01-01T00:00:0${i % 10}Z`,
      event_type: 'test_event',
      candidate_id: `cand-${i}`,
      metadata: { index: i },
      nonce: 0,
    };
    b.current_hash = AuditChainService.computeHash(b);
    prev = b.current_hash!;
    blocks.push(b);
  }
  return blocks;
}

// ---- Hash determinism ----
test('computeHash is deterministic for identical input', () => {
  const block: AuditBlock = {
    block_number: 1, prev_hash: GENESIS_PREV_HASH, timestamp: '2026-01-01T00:00:00Z',
    event_type: 'simulation_submitted', metadata: { a: 1 }, nonce: 0,
  };
  assert.equal(AuditChainService.computeHash(block), AuditChainService.computeHash({ ...block }));
});

test('computeHash changes when any field changes (tamper-evident)', () => {
  const block: AuditBlock = {
    block_number: 1, prev_hash: GENESIS_PREV_HASH, timestamp: '2026-01-01T00:00:00Z',
    event_type: 'simulation_submitted', metadata: { score: 80 }, nonce: 0,
  };
  const original = AuditChainService.computeHash(block);
  assert.notEqual(original, AuditChainService.computeHash({ ...block, metadata: { score: 81 } }));
  assert.notEqual(original, AuditChainService.computeHash({ ...block, event_type: 'other'}));
  assert.notEqual(original, AuditChainService.computeHash({ ...block, prev_hash: 'f'.repeat(64) }));
  assert.notEqual(original, AuditChainService.computeHash({ ...block, nonce: 1 }));
});

test('computeHash returns a 64-char sha256 hex string', () => {
  const h = AuditChainService.computeHash(buildChain(1)[0]!);
  assert.match(h, /^[a-f0-9]{64}$/);
});

// ---- Metadata sanitization ----
test('sanitizeMetadata strips secrets and truncates huge values', () => {
  const out = AuditChainService.sanitizeMetadata({ password: 'x', api_key: 'y', token: 'z', ok: 'value', big: 'a'.repeat(5000) });
  assert.equal(out.password, undefined);
  assert.equal(out.api_key, undefined);
  assert.equal(out.token, undefined);
  assert.equal(out.ok, 'value');
  assert.equal(out.big.length, 2000);
});

// ---- Chain validation ----
test('a valid chain passes verification', () => {
  const report = AuditChainService.verifyBlocks(buildChain(50));
  assert.equal(report.valid, true);
  assert.equal(report.totalBlocks, 50);
  assert.equal(report.verifiedCount, 50);
  assert.equal(report.failedCount, 0);
  assert.equal(report.firstInvalidBlockNumber, null);
});

test('a single-block (genesis) chain is valid', () => {
  const report = AuditChainService.verifyBlocks(buildChain(1));
  assert.equal(report.valid, true);
});

test('a tampered block fails verification (hash mismatch)', () => {
  const chain = buildChain(10);
  // Alter contents WITHOUT recomputing the stored hash.
  chain[5]!.metadata = { index: 999 };
  const report = AuditChainService.verifyBlocks(chain);
  assert.equal(report.valid, false);
  assert.equal(report.firstInvalidBlockNumber, 5);
  assert.ok(report.issues.some((i) => i.reason.includes('Hash mismatch')));
});

test('a broken link fails verification even if the block hash itself is valid', () => {
  const chain = buildChain(10);
  // Recompute the hash so contents are self-consistent, but point prev_hash at the wrong block.
  chain[6]!.prev_hash = 'a'.repeat(64);
  chain[6]!.current_hash = AuditChainService.computeHash(chain[6]!);
  const report = AuditChainService.verifyBlocks(chain);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((i) => i.reason.includes('Broken link')));
});

test('an invalid genesis previous-hash fails verification', () => {
  const chain = buildChain(3);
  chain[0]!.prev_hash = 'b'.repeat(64);
  chain[0]!.current_hash = AuditChainService.computeHash(chain[0]!);
  const report = AuditChainService.verifyBlocks(chain);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((i) => i.reason.includes('Genesis')));
});

test('a missing block (non-sequential numbers) fails verification', () => {
  const chain = buildChain(10);
  // Remove block 4   the chain is now broken at block 5.
  const broken = chain.filter((b) => b.block_number !== 4);
  const report = AuditChainService.verifyBlocks(broken);
  assert.equal(report.valid, false);
});
