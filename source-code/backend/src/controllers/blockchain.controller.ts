import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import BaseController from './base.controller';
import DatabaseService from '../services/database.service';
import ResponseService from '../services/response.service';
import { logger } from '../config/logger';
import * as crypto from 'crypto';
import { BlockchainCredential, CredentialAccess, AccessAudit } from '../models';

// Controller-specific types that match the actual database schema
interface DatabaseBlockchainCredential {
  id?: number; // Database uses number, not UUID
  user_id: number; // Database uses number, not UUID
  company_id?: number; // Additional field not in model
  title: string; // Additional field
  description?: string; // Additional field
  issuer: string; // Additional field
  issue_date: Date; // Additional field
  expiry_date?: Date; // Additional field
  status: 'pending' | 'verified' | 'rejected'; // Different from model's CredentialStatus
  verified_at?: Date; // Additional field
  verified_by?: number; // Additional field
  verifier_notes?: string; // Additional field
  created_at?: Date;
  updated_at?: Date;
  company_name?: string; // Joined field
  user_email?: string; // Joined field
}

interface DatabaseCredentialAccess {
  id?: number;
  credential_id: number; // Database uses number
  granted_to?: number; // Database uses number
  company_id?: number; // Database uses number
  access_level: 'basic' | 'full'; // Different values
  access_token: string;
  expires_at?: Date;
  granted_by: number; // Database uses number
  created_at?: Date;
}

interface DatabaseAccessAudit {
  id?: number;
  credential_id: number; // Database uses number
  accessed_by?: number; // Database uses number
  action: string; // More flexible than model's enum
  accessed_by_email?: string; // Joined field
  accessed_at?: Date;
  ip_address?: string;
  user_agent?: string;
  metadata?: any;
}

interface BlockchainNetworkStatus {
  id?: number;
  network_name: string;
  block_height: number;
  gas_price: number;
  status: 'healthy' | 'degraded' | 'down';
  checked_at: Date;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface CredentialsResponse {
  success: boolean;
  data: {
    credentials: DatabaseBlockchainCredential[];
    pagination: PaginationInfo;
  };
}

interface CredentialDetailResponse {
  success: boolean;
  data: {
    credential: DatabaseBlockchainCredential;
    access_audit: DatabaseAccessAudit[];
  };
}

interface CreateCredentialResponse {
  success: boolean;
  data: DatabaseBlockchainCredential;
  message: string;
}

interface VerifyCredentialResponse {
  success: boolean;
  data: DatabaseBlockchainCredential;
  message: string;
}

interface ShareCredentialResponse {
  success: boolean;
  data: {
    access: CredentialAccess;
    share_url: string;
  };
  message: string;
}

interface TokenVerificationResponse {
  success: boolean;
  data: {
    verification: any;
    issuer: {
      company_name?: string;
      user_email?: string;
      candidate_name?: string | null;
    };
    blockchain: {
      network: string;
      transaction_id: string;
      verified: boolean;
    };
  };
}

interface NetworkStatusResponse {
  success: boolean;
  data: BlockchainNetworkStatus[];
}

export class BlockchainController extends BaseController {
  private dbService: typeof DatabaseService;

  constructor() {
    super('blockchain');
    this.dbService = DatabaseService;
  }

  /**
   * Get user's blockchain credentials
   */
  async getCredentials(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      let whereConditions: string[] = [`user_id = $${1}`];
      let params: any[] = [userId];
      let paramIndex = 2;

      if (status) {
        whereConditions.push(`status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM blockchain_credentials ${whereClause}`;
      const countResult = await this.dbService.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Get credentials
      const credentialsQuery = `
        SELECT bc.*, c.name as company_name
        FROM blockchain_credentials bc
        LEFT JOIN companies c ON bc.company_id = c.id
        ${whereClause}
        ORDER BY bc.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limitNum, offset);

      const credentialsResult = await this.dbService.query(credentialsQuery, params);

      // Calculate pagination
      const totalPages = Math.ceil(total / limitNum);
      const hasNext = pageNum < totalPages;
      const hasPrev = pageNum > 1;

      const pagination: PaginationInfo = {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext,
        hasPrev
      };

      const response: CredentialsResponse = {
        success: true,
        data: {
          credentials: credentialsResult.rows,
          pagination
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Get blockchain credentials error:', error);
      ResponseService.error(res, 'Failed to fetch blockchain credentials');
    }
  }

  /**
   * Get specific credential details
   */
  async getCredential(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const userType = req.user?.user_type;

      if (!userId || !userType) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const credentialQuery = `
        SELECT bc.*, c.name as company_name, u.email as user_email
        FROM blockchain_credentials bc
        LEFT JOIN companies c ON bc.company_id = c.id
        LEFT JOIN users u ON bc.user_id = u.id
        WHERE bc.id = $1
      `;

      const credentialResult = await this.dbService.query(credentialQuery, [id]);

      if (credentialResult.rows.length === 0) {
        ResponseService.notFound(res, 'Credential not found');
        return;
      }

      const credential = credentialResult.rows[0];

      // Check permissions
      let hasPermission = false;

      if (userType === 'candidate') {
        hasPermission = credential.user_id === userId;
      } else if (userType === 'recruiter' || userType === 'company_admin') {
        // Check if user has access to the company
        if (credential.company_id) {
          const companyCheck = await this.dbService.query(
            'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
            [credential.company_id, userId]
          );
          hasPermission = companyCheck.rows.length > 0;
        }
      }

      if (!hasPermission) {
        ResponseService.forbidden(res, 'You do not have permission to view this credential');
        return;
      }

      // Get access audit trail
      const auditQuery = `
        SELECT aa.*, u.email as accessed_by_email
        FROM access_audit aa
        LEFT JOIN users u ON aa.accessed_by = u.id
        WHERE aa.credential_id = $1
        ORDER BY aa.accessed_at DESC
        LIMIT 10
      `;

      const auditResult = await this.dbService.query(auditQuery, [id]);

      const response: CredentialDetailResponse = {
        success: true,
        data: {
          credential,
          access_audit: auditResult.rows
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Get blockchain credential error:', error);
      ResponseService.error(res, 'Failed to fetch blockchain credential');
    }
  }

  /**
   * Create blockchain credential
   */
  async createCredential(req: AuthenticatedRequest, res: Response): Promise<void> {
    const client = await this.dbService.getClient();

    try {
      await client.query('BEGIN');

      const {
        credentialType,
        title,
        description,
        issuer,
        issueDate,
        expiryDate,
        metadata,
        companyId
      } = req.body;

      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!credentialType || !title || !issuer || !issueDate) {
        ResponseService.error(res, 'Credential type, title, issuer, and issue date are required', 400);
        return;
      }

      // Generate credential hash (simulate blockchain hash)
      const credentialData = JSON.stringify({
        userId,
        type: credentialType,
        title,
        issuer,
        issueDate,
        metadata
      });

      const credentialHash = crypto.createHash('sha256').update(credentialData).digest('hex');

      // Simulate blockchain transaction ID
      const blockchainTxId = `0x${crypto.randomBytes(32).toString('hex')}`;

      // Create credential
      const credentialResult = await client.query(
        `INSERT INTO blockchain_credentials (
          user_id, company_id, credential_type, title, description,
          issuer, issue_date, expiry_date, credential_hash,
          blockchain_tx_id, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          userId,
          companyId,
          credentialType,
          title,
          description,
          issuer,
          issueDate,
          expiryDate,
          credentialHash,
          blockchainTxId,
          'pending',
          metadata || {}
        ]
      );

      const credential = credentialResult.rows[0];

      // Log creation in audit trail
      await client.query(
        `INSERT INTO access_audit (
          credential_id, action, accessed_by, ip_address, user_agent, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          credential.id,
          'created',
          userId,
          req.ip,
          req.get('User-Agent'),
          { blockchain_tx_id: blockchainTxId }
        ]
      );

      await client.query('COMMIT');

      logger.info(`Blockchain credential created: ${credential.id} for user ${userId}`);

      const response: CreateCredentialResponse = {
        success: true,
        data: credential,
        message: 'Blockchain credential created successfully'
      };

      res.status(201).json(response);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Create blockchain credential error:', error);
      ResponseService.error(res, 'Failed to create blockchain credential');
    } finally {
      client.release();
    }
  }

  /**
   * Verify credential on blockchain
   */
  async verifyCredential(req: AuthenticatedRequest, res: Response): Promise<void> {
    const client = await this.dbService.getClient();

    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { verifierNotes } = req.body;
      const userId = req.user?.id;
      const userType = req.user?.user_type;

      if (!userId || !userType) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      // Get credential
      const credentialCheck = await client.query(
        'SELECT * FROM blockchain_credentials WHERE id = $1',
        [id]
      );

      if (credentialCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        ResponseService.notFound(res, 'Credential not found');
        return;
      }

      const credential = credentialCheck.rows[0];

      // Check permissions
      let hasPermission = false;

      if (userType === 'candidate') {
        hasPermission = credential.user_id === userId;
      } else if (userType === 'company_admin') {
        hasPermission = credential.company_id && credential.company_id === req.user?.company_id;
      }

      if (!hasPermission) {
        await client.query('ROLLBACK');
        ResponseService.forbidden(res, 'You do not have permission to verify this credential');
        return;
      }

      // Update credential status
      const updateResult = await client.query(
        `UPDATE blockchain_credentials SET
          status = $1, verified_at = $2, verified_by = $3,
          verifier_notes = $4, updated_at = $5
        WHERE id = $6
        RETURNING *`,
        ['verified', new Date(), userId, verifierNotes, new Date(), id]
      );

      // Log verification in audit trail
      await client.query(
        `INSERT INTO access_audit (
          credential_id, action, accessed_by, ip_address, user_agent, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          'verified',
          userId,
          req.ip,
          req.get('User-Agent'),
          { verifier_notes: verifierNotes }
        ]
      );

      await client.query('COMMIT');

      logger.info(`Blockchain credential verified: ${id} by user ${userId}`);

      const response: VerifyCredentialResponse = {
        success: true,
        data: updateResult.rows[0],
        message: 'Credential verified successfully'
      };

      res.json(response);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Verify blockchain credential error:', error);
      ResponseService.error(res, 'Failed to verify credential');
    } finally {
      client.release();
    }
  }

  /**
   * Share credential access
   */
  async shareCredential(req: AuthenticatedRequest, res: Response): Promise<void> {
    const client = await this.dbService.getClient();

    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { companyId, accessLevel, expiresAt } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!companyId || !accessLevel) {
        ResponseService.error(res, 'Company ID and access level are required', 400);
        return;
      }

      // Get credential
      const credentialCheck = await client.query(
        'SELECT * FROM blockchain_credentials WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      if (credentialCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        ResponseService.notFound(res, 'Credential not found');
        return;
      }

      // Generate access token
      const accessToken = crypto.randomBytes(32).toString('hex');

      // Create access record
      const accessResult = await client.query(
        `INSERT INTO credential_access (
          credential_id, granted_to, company_id, access_level,
          access_token, expires_at, granted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          id,
          null, // granted_to user (null for company access)
          companyId,
          accessLevel,
          accessToken,
          expiresAt,
          userId
        ]
      );

      // Log sharing in audit trail
      await client.query(
        `INSERT INTO access_audit (
          credential_id, action, accessed_by, ip_address, user_agent, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          'shared',
          userId,
          req.ip,
          req.get('User-Agent'),
          { company_id: companyId, access_level: accessLevel }
        ]
      );

      await client.query('COMMIT');

      const response: ShareCredentialResponse = {
        success: true,
        data: {
          access: accessResult.rows[0],
          share_url: `${process.env.FRONTEND_URL}/verify/${accessToken}`
        },
        message: 'Credential shared successfully'
      };

      res.json(response);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Share blockchain credential error:', error);
      ResponseService.error(res, 'Failed to share credential');
    } finally {
      client.release();
    }
  }

  /**
   * Verify credential via shared token
   */
  async verifyByToken(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;

      // Get access record
      const accessQuery = `
        SELECT ca.*, bc.*, c.name as company_name, u.email as user_email,
               cp.first_name, cp.last_name
        FROM credential_access ca
        JOIN blockchain_credentials bc ON ca.credential_id = bc.id
        LEFT JOIN companies c ON bc.company_id = c.id
        LEFT JOIN users u ON bc.user_id = u.id
        LEFT JOIN candidate_profiles cp ON bc.user_id = cp.user_id
        WHERE ca.access_token = $1 AND (ca.expires_at IS NULL OR ca.expires_at > NOW())
      `;

      const accessResult = await this.dbService.query(accessQuery, [token]);

      if (accessResult.rows.length === 0) {
        ResponseService.notFound(res, 'Invalid or expired verification token');
        return;
      }

      const access = accessResult.rows[0];

      // Log access in audit trail
      await this.dbService.query(
        `INSERT INTO access_audit (
          credential_id, action, accessed_by, ip_address, user_agent, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          access.credential_id,
          'viewed',
          null, // anonymous access
          req.ip,
          req.get('User-Agent'),
          { access_token: token, access_level: access.access_level }
        ]
      );

      // Return verification data based on access level
      const verificationData: any = {
        id: access.id,
        credential_type: access.credential_type,
        title: access.title,
        issuer: access.issuer,
        issue_date: access.issue_date,
        expiry_date: access.expiry_date,
        status: access.status,
        blockchain_tx_id: access.blockchain_tx_id,
        verified_at: access.verified_at
      };

      if (access.access_level === 'full') {
        verificationData.description = access.description;
        verificationData.metadata = access.metadata;
      }

      const response: TokenVerificationResponse = {
        success: true,
        data: {
          verification: verificationData,
          issuer: {
            company_name: access.company_name,
            user_email: access.user_email,
            candidate_name: access.first_name && access.last_name ?
              `${access.first_name} ${access.last_name}` : null
          },
          blockchain: {
            network: 'Ethereum',
            transaction_id: access.blockchain_tx_id,
            verified: access.status === 'verified'
          }
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Verify by token error:', error);
      ResponseService.error(res, 'Failed to verify credential');
    }
  }

  /**
   * Get blockchain network status
   */
  async getNetworkStatus(req: Request, res: Response): Promise<void> {
    try {
      const statusQuery = `
        SELECT * FROM blockchain_network_status
        ORDER BY checked_at DESC
        LIMIT 10
      `;

      const statusResult = await this.dbService.query(statusQuery);

      const response: NetworkStatusResponse = {
        success: true,
        data: statusResult.rows
      };

      res.json(response);
    } catch (error) {
      logger.error('Get blockchain network status error:', error);
      ResponseService.error(res, 'Failed to fetch network status');
    }
  }
}

export default new BlockchainController();
