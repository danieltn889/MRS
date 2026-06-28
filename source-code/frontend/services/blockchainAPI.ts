// Blockchain audit-chain API client.

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

const authHeaders = () => {
  const token = localStorage.getItem('authToken');
  return { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' };
};

const handle = async (res: Response) => {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed (${res.status})`);
  }
  return res.json();
};

export interface ChainBlock {
  id: string;
  block_number: number;
  prev_hash: string;
  current_hash: string;
  timestamp: string;
  event_type: string;
  candidate_id?: string | null;
  simulation_id?: string | null;
  action?: string | null;
  metadata?: Record<string, any> | null;
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

export const getChainStats = async (): Promise<{ totalBlocks: number; lastBlock: ChainBlock | null }> => {
  const json = await handle(await fetch(`${API_BASE_URL}/blockchain/chain/stats`, { headers: authHeaders() }));
  return json.data;
};

export const verifyChain = async (): Promise<VerifyReport> => {
  const json = await handle(await fetch(`${API_BASE_URL}/blockchain/chain/verify`, { headers: authHeaders() }));
  return json.data;
};

export const browseChain = async (
  params: { page?: number; limit?: number; eventType?: string; blockNumber?: number } = {}
): Promise<{ blocks: ChainBlock[]; total: number; page: number; limit: number }> => {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.eventType) qs.set('eventType', params.eventType);
  if (params.blockNumber !== undefined && params.blockNumber !== null) qs.set('blockNumber', String(params.blockNumber));
  const json = await handle(await fetch(`${API_BASE_URL}/blockchain/chain?${qs.toString()}`, { headers: authHeaders() }));
  return json.data;
};

export const verifyBlock = async (
  id: string
): Promise<{ found: boolean; valid: boolean; reasons: string[]; block?: ChainBlock }> => {
  const json = await handle(await fetch(`${API_BASE_URL}/blockchain/chain/${id}/verify`, { headers: authHeaders() }));
  return json.data;
};
