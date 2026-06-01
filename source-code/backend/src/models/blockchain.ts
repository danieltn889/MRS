import { BaseEntity, UUID, TIMESTAMP, JSONB, CredentialStatus } from './types.ts';

export interface BlockchainCredential extends BaseEntity {
  user_id: UUID;
  credential_type: string;
  credential_data: JSONB;
  credential_hash: string;
  blockchain_tx_id: string;
  blockchain_network?: string;
  block_number?: number;
  block_hash?: string;
  timestamp?: TIMESTAMP;
  issuer?: string;
  issuer_did?: string;
  status: CredentialStatus;
  expires_at?: TIMESTAMP;
  revoked_at?: TIMESTAMP;
  revoked_reason?: string;
  revoked_by?: UUID;
  metadata: JSONB;
}

export interface CredentialAccess extends BaseEntity {
  credential_id: UUID;
  granted_to?: UUID;
  company_id?: UUID;
  access_level: 'view' | 'verify' | 'download' | 'share';
  granted_at: TIMESTAMP;
  granted_by?: UUID;
  expires_at?: TIMESTAMP;
  revoked_at?: TIMESTAMP;
  revoked_by?: UUID;
  access_token?: string;
  purpose?: string;
}

export interface AccessAudit extends BaseEntity {
  credential_id?: UUID;
  accessed_by?: UUID;
  accessed_at: TIMESTAMP;
  ip_address?: string;
  user_agent?: string;
  action: 'viewed' | 'verified' | 'downloaded' | 'shared' | 'revoked';
  resource_type?: string;
  resource_id?: string;
  success: boolean;
  failure_reason?: string;
  metadata: JSONB;
}

export interface BlockchainNetworkStatus extends BaseEntity {
  network: string;
  network_name?: string;
  status: 'operational' | 'degraded' | 'outage' | 'maintenance';
  block_height?: number;
  avg_block_time?: number;
  tx_success_rate?: number;
  tx_count?: number;
  node_count?: number;
  gas_price?: number;
  checked_at: TIMESTAMP;
  response_time?: number;
  error_rate?: number;
  metadata: JSONB;
}

export interface BlockchainWallet extends BaseEntity {
  company_id?: UUID;
  user_id?: UUID;
  wallet_address: string;
  wallet_type?: string;
  public_key?: string;
  encrypted_private_key?: string;
  is_active: boolean;
  last_used_at?: TIMESTAMP;
}

export interface ExternalCredential extends BaseEntity {
  user_id: UUID;
  external_issuer: string;
  credential_type: string;
  credential_id: string;
  credential_url?: string;
  verification_url?: string;
  issued_at?: TIMESTAMP;
  expires_at?: TIMESTAMP;
  status: CredentialStatus;
  metadata: JSONB;
}