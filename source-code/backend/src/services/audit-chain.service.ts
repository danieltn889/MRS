import crypto from 'crypto';
import { query, getClient } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * AuditChainService
 * -----------------
 * An application-level, hash-linked audit chain that provides a tamper-evident
 * record of important platform events. Each block stores the hash of the previous
 * block, so altering any block breaks every hash after it   which `verifyChain`
 * detects.
 *
 * This complements (does not replace) the existing Ethereum integration: a block
 * can anchor to an on-chain transaction via `eth_tx_id`.
 *
 * The hashing and verification logic is implemented as PURE static functions so it
 * can be unit-tested without a database or a running blockchain node.
 */

export const GENESIS_PREV_HASH = '0'.repeat(64);

export interface AuditBlock {
  block_number: number;
  prev_hash: string;
  current_hash?: string;
  timestamp: string;            // ISO string   part of the hash, so it must be stable
  event_type: string;
  candidate_id?: string | null;
  simulation_id?: string | null;
  evaluation_id?: string | null;
  git_commit_hash?: string | null;
  repo_hash?: string | null;
  action?: string | null;
  metadata?: Record<string, any> | null;
  nonce?: number;
  eth_tx_id?: string | null;
}

export interface VerifyReport {
  valid: boolean;
  totalBlocks: number;
  verifiedCount: number;
  failedCount: number;
  firstInvalidBlockNumber: number | null;
  issues: Array<{ block_number: number; reason: string }>;
}

export interface AppendEventInput {
  eventType: string;
  candidateId?: string | null;
  simulationId?: string | null;
  evaluationId?: string | null;
  gitCommitHash?: string | null;
  repoHash?: string | null;
  action?: string | null;
  metadata?: Record<string, any> | null;
  ethTxId?: string | null;
}

class AuditChainService {
  // =========================================================================
  // PURE LOGIC (no DB / no network)   unit-testable
  // =========================================================================

  /** Sanitize metadata so secrets / huge blobs are never written to the chain. */
  static sanitizeMetadata(metadata: Record<string, any> | null | undefined): Record<string, any> {
    if (!metadata || typeof metadata !== 'object') return {};
    const REDACT = /(password|secret|token|privatekey|private_key|authorization|apikey|api_key)/i;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(metadata)) {
      if (REDACT.test(k)) continue;
      if (typeof v === 'string'&& v.length > 2000) {
        out[k] = v.slice(0, 2000);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  /**
   * Deterministically compute a block's SHA-256 hash from its canonical contents,
   * INCLUDING prev_hash and nonce. Same input → same hash; any change → different hash.
   */
  static computeHash(block: AuditBlock): string {
    // A TIMESTAMPTZ comes back from PostgreSQL as a Date object (not the original
    // ISO string), and BIGINT comes back as a string   normalize both so the hash
    // computed at insert time and at verify time are identical.
    let ts: string;
    try { ts = new Date(block.timestamp as any).toISOString(); } catch { ts = String(block.timestamp); }
    const canonical = [
      Number(block.block_number),
      block.prev_hash,
      ts,
      block.event_type,
      block.candidate_id || '',
      block.simulation_id || '',
      block.evaluation_id || '',
      block.git_commit_hash || '',
      block.repo_hash || '',
      block.action || '',
      JSON.stringify(block.metadata || {}),
      block.nonce ?? 0,
      block.eth_tx_id || '',
    ].join('|');
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Verify an in-memory ordered list of blocks: recompute each hash, confirm each
   * block links to the previous block's hash, and confirm block numbers are
   * sequential. Returns a detailed integrity report.
   */
  static verifyBlocks(blocks: AuditBlock[]): VerifyReport {
    const issues: Array<{ block_number: number; reason: string }> = [];
    let verifiedCount = 0;
    let firstInvalidBlockNumber: number | null = null;

    // block_number arrives as a string from PostgreSQL (BIGINT)   coerce to numbers.
    const ordered = [...blocks].sort((a, b) => Number(a.block_number) - Number(b.block_number));

    for (let i = 0; i < ordered.length; i++) {
      const block = ordered[i]!;
      const blockNum = Number(block.block_number);
      let blockValid = true;

      // 1. Recompute the stored hash.
      const recomputed = AuditChainService.computeHash(block);
      if (recomputed !== block.current_hash) {
        blockValid = false;
        issues.push({ block_number: blockNum, reason: 'Hash mismatch   block contents were altered'});
      }

      // 2. Check the link to the previous block.
      if (i === 0) {
        if (block.prev_hash !== GENESIS_PREV_HASH) {
          blockValid = false;
          issues.push({ block_number: blockNum, reason: 'Genesis block has an invalid previous hash'});
        }
      } else {
        const prev = ordered[i - 1]!;
        if (block.prev_hash !== prev.current_hash) {
          blockValid = false;
          issues.push({ block_number: blockNum, reason: 'Broken link   previous hash does not match prior block'});
        }
        if (blockNum !== Number(prev.block_number) + 1) {
          blockValid = false;
          issues.push({ block_number: blockNum, reason: 'Non-sequential block number   a block may be missing'});
        }
      }

      if (blockValid) {
        verifiedCount++;
      } else if (firstInvalidBlockNumber === null) {
        firstInvalidBlockNumber = blockNum;
      }
    }

    return {
      valid: issues.length === 0,
      totalBlocks: ordered.length,
      verifiedCount,
      failedCount: ordered.length - verifiedCount,
      firstInvalidBlockNumber,
      issues,
    };
  }

  // =========================================================================
  // DB-BACKED OPERATIONS
  // =========================================================================

  /**
   * Append a new event as a block linked to the current chain tip. Atomic: a
   * transaction-level advisory lock serializes appends so two events can't claim
   * the same block number / prev_hash. Never throws   auditing must not break the
   * triggering action; returns null on failure.
   */
  static async appendBlock(input: AppendEventInput): Promise<AuditBlock | null> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      // Serialize concurrent appends to keep the chain linear.
      await client.query('SELECT pg_advisory_xact_lock(91234567)');

      const tip = await client.query(
        `SELECT block_number, current_hash FROM audit_chain ORDER BY block_number DESC LIMIT 1`
      );
      const prevBlockNumber = tip.rows[0] ? Number(tip.rows[0].block_number) : -1;
      const prevHash = tip.rows[0] ? tip.rows[0].current_hash : GENESIS_PREV_HASH;

      const block: AuditBlock = {
        block_number: prevBlockNumber + 1,
        prev_hash: prevHash,
        timestamp: new Date().toISOString(),
        event_type: input.eventType,
        candidate_id: input.candidateId ?? null,
        simulation_id: input.simulationId ?? null,
        evaluation_id: input.evaluationId ?? null,
        git_commit_hash: input.gitCommitHash ?? null,
        repo_hash: input.repoHash ?? null,
        action: input.action ?? null,
        metadata: AuditChainService.sanitizeMetadata(input.metadata),
        nonce: 0,
        eth_tx_id: input.ethTxId ?? null,
      };
      block.current_hash = AuditChainService.computeHash(block);

      const result = await client.query(
        `INSERT INTO audit_chain (
           block_number, prev_hash, current_hash, timestamp, event_type,
           candidate_id, simulation_id, evaluation_id, git_commit_hash, repo_hash,
           action, metadata, nonce, eth_tx_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          block.block_number, block.prev_hash, block.current_hash, block.timestamp, block.event_type,
          block.candidate_id, block.simulation_id, block.evaluation_id, block.git_commit_hash, block.repo_hash,
          block.action, JSON.stringify(block.metadata), block.nonce, block.eth_tx_id,
        ]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`AuditChainService.appendBlock failed: ${(err as Error).message}`);
      return null;
    } finally {
      client.release();
    }
  }

  /** Load the full chain (ordered) and verify its integrity. */
  static async verifyChain(): Promise<VerifyReport> {
    const result = await query(`SELECT * FROM audit_chain ORDER BY block_number ASC`, []);
    return AuditChainService.verifyBlocks(result.rows as AuditBlock[]);
  }

  /** Verify a single block: recompute its hash and confirm it links to its predecessor. */
  static async verifyBlock(id: string): Promise<{ found: boolean; valid: boolean; reasons: string[]; block?: any }> {
    const result = await query(`SELECT * FROM audit_chain WHERE id = $1`, [id]);
    const block = result.rows[0];
    if (!block) return { found: false, valid: false, reasons: ['Block not found'] };

    const reasons: string[] = [];
    if (AuditChainService.computeHash(block as AuditBlock) !== block.current_hash) {
      reasons.push('Hash mismatch   block contents were altered');
    }
    if (Number(block.block_number) === 0) {
      if (block.prev_hash !== GENESIS_PREV_HASH) reasons.push('Genesis block has an invalid previous hash');
    } else {
      const prev = await query(`SELECT current_hash FROM audit_chain WHERE block_number = $1`, [Number(block.block_number) - 1]);
      if (!prev.rows[0]) reasons.push('Previous block is missing');
      else if (prev.rows[0].current_hash !== block.prev_hash) reasons.push('Broken link   previous hash does not match prior block');
    }
    return { found: true, valid: reasons.length === 0, reasons, block };
  }

  static async getStats(): Promise<{ totalBlocks: number; lastBlock: any | null }> {
    const countRes = await query(`SELECT COUNT(*)::int AS total FROM audit_chain`, []);
    const lastRes = await query(`SELECT * FROM audit_chain ORDER BY block_number DESC LIMIT 1`, []);
    return { totalBlocks: countRes.rows[0]?.total || 0, lastBlock: lastRes.rows[0] || null };
  }

  static async getBlock(id: string): Promise<any | null> {
    const result = await query(`SELECT * FROM audit_chain WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  /** Search / explorer query with filters + pagination. */
  static async search(filters: {
    eventType?: string;
    candidateId?: string;
    simulationId?: string;
    blockNumber?: number;
    page?: number;
    limit?: number;
  }): Promise<{ blocks: any[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conds: string[] = [];
    const params: any[] = [];
    if (filters.eventType) { params.push(filters.eventType); conds.push(`event_type = $${params.length}`); }
    if (filters.candidateId) { params.push(filters.candidateId); conds.push(`candidate_id = $${params.length}`); }
    if (filters.simulationId) { params.push(filters.simulationId); conds.push(`simulation_id = $${params.length}`); }
    if (filters.blockNumber !== undefined) { params.push(filters.blockNumber); conds.push(`block_number = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join('AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM audit_chain ${where}`, params);
    const listRes = await query(
      `SELECT * FROM audit_chain ${where} ORDER BY block_number DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return { blocks: listRes.rows, total: countRes.rows[0]?.total || 0, page, limit };
  }
}

export default AuditChainService;
