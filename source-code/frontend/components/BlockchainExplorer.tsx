import React, { useEffect, useState } from 'react';
import { Shield, ShieldCheck, ShieldAlert, Loader2, RefreshCw, Search, CheckCircle2, XCircle, Box } from 'lucide-react';
import {
  getChainStats,
  verifyChain,
  browseChain,
  verifyBlock,
  type ChainBlock,
  type VerifyReport,
} from '../services/blockchainAPI';

const short = (h?: string | null) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : ' ');

const BlockchainExplorer: React.FC = () => {
  const [stats, setStats] = useState<{ totalBlocks: number; lastBlock: ChainBlock | null } | null>(null);
  const [blocks, setBlocks] = useState<ChainBlock[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [report, setReport] = useState<VerifyReport | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [blockVerify, setBlockVerify] = useState<Record<string, { valid: boolean; reasons: string[] } | 'loading'>>({});

  const limit = 20;

  const load = async (nextPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const [s, list] = await Promise.all([
        getChainStats(),
        browseChain({ page: nextPage, limit, eventType: eventType || undefined }),
      ]);
      setStats(s);
      setBlocks(list.blocks || []);
      setTotal(list.total || 0);
      setPage(list.page || nextPage);
    } catch (e: any) {
      setError(e?.message || 'Failed to load the chain');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerifyChain = async () => {
    setVerifying(true);
    setReport(null);
    try {
      setReport(await verifyChain());
    } catch (e: any) {
      setError(e?.message || 'Chain verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyBlock = async (id: string) => {
    setBlockVerify((prev) => ({ ...prev, [id]: 'loading'}));
    try {
      const r = await verifyBlock(id);
      setBlockVerify((prev) => ({ ...prev, [id]: { valid: r.valid, reasons: r.reasons } }));
    } catch {
      setBlockVerify((prev) => ({ ...prev, [id]: { valid: false, reasons: ['Verification request failed'] } }));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="text-blue-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Blockchain Explorer</h1>
          <p className="text-sm text-gray-500">Tamper-evident audit chain of platform events</p>
        </div>
        <button
          onClick={() => load(page)}
          className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="text-xs uppercase text-gray-400 mb-1">Total Blocks</div>
          <div className="text-3xl font-extrabold text-gray-900 flex items-center gap-2">
            <Box size={22} className="text-blue-500" /> {stats?.totalBlocks ?? ' '}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="text-xs uppercase text-gray-400 mb-1">Last Block</div>
          <div className="text-sm font-mono text-gray-700 mt-2">
            {stats?.lastBlock ? `#${stats.lastBlock.block_number} · ${short(stats.lastBlock.current_hash)}` : ' '}
          </div>
        </div>
        <div className={`rounded-xl border p-5 ${report ? (report.valid ? 'border-green-200 bg-green-50': 'border-red-200 bg-red-50') : 'border-gray-200 bg-white'}`}>
          <div className="text-xs uppercase text-gray-400 mb-1">Chain Integrity</div>
          {report ? (
            report.valid ? (
              <div className="text-green-700 font-bold flex items-center gap-2"><ShieldCheck size={20} /> 🟢 Verified</div>
            ) : (
              <div className="text-red-700 font-bold flex items-center gap-2"><ShieldAlert size={20} /> 🔴 Integrity Failed</div>
            )
          ) : (
            <div className="text-gray-400 text-sm mt-2">Not yet verified</div>
          )}
        </div>
      </div>

      {/* Verify entire chain */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Verify entire blockchain</h3>
            <p className="text-sm text-gray-500">Recomputes every hash and validates the prev-hash links to detect tampering.</p>
          </div>
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {verifying ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {verifying ? 'Verifying…': 'Verify Chain'}
          </button>
        </div>

        {report && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-gray-50 p-3"><div className="text-xl font-bold text-gray-900">{report.totalBlocks}</div><div className="text-xs text-gray-500">Blocks</div></div>
            <div className="rounded-lg bg-green-50 p-3"><div className="text-xl font-bold text-green-700">{report.verifiedCount}</div><div className="text-xs text-gray-500">Verified</div></div>
            <div className="rounded-lg bg-red-50 p-3"><div className="text-xl font-bold text-red-700">{report.failedCount}</div><div className="text-xs text-gray-500">Failed</div></div>
            <div className="rounded-lg bg-gray-50 p-3"><div className="text-xl font-bold text-gray-900">{report.firstInvalidBlockNumber ?? ' '}</div><div className="text-xs text-gray-500">First Invalid</div></div>
          </div>
        )}
        {report && report.issues.length > 0 && (
          <ul className="mt-3 space-y-1">
            {report.issues.map((i, idx) => (
              <li key={idx} className="text-sm text-red-600 flex items-center gap-2"><XCircle size={14} /> Block #{i.block_number}: {i.reason}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(1); }}
            placeholder="Filter by event type (e.g. simulation_submitted)"
            className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-80 max-w-full"
          />
        </div>
        <button onClick={() => load(1)} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm">Search</button>
        {eventType && <button onClick={() => { setEventType(''); setTimeout(() => load(1), 0); }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600">Clear</button>}
      </div>

      {/* Blocks table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500"><Loader2 className="animate-spin mx-auto mb-2" /> Loading chain…</div>
        ) : error ? (
          <div className="p-10 text-center text-red-600">{error}</div>
        ) : blocks.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No blocks yet. Events will appear here as they are recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">#</th>
                  <th className="text-left px-4 py-3">Event</th>
                  <th className="text-left px-4 py-3">Hash</th>
                  <th className="text-left px-4 py-3">Prev Hash</th>
                  <th className="text-left px-4 py-3">Timestamp</th>
                  <th className="text-left px-4 py-3">Verify</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => {
                  const v = blockVerify[b.id];
                  return (
                    <tr key={b.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-mono text-gray-900">{b.block_number}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs">{b.event_type}</span></td>
                      <td className="px-4 py-3 font-mono text-gray-600">{short(b.current_hash)}</td>
                      <td className="px-4 py-3 font-mono text-gray-400">{short(b.prev_hash)}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(b.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {v === 'loading'? (
                          <Loader2 size={16} className="animate-spin text-gray-400" />
                        ) : v ? (
                          v.valid ? (
                            <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 size={14} /> Valid</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 text-xs" title={v.reasons.join('; ')}><XCircle size={14} /> Invalid</span>
                          )
                        ) : (
                          <button onClick={() => handleVerifyBlock(b.id)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Verify</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && blocks.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
            <span className="text-gray-500">{total} blocks</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40">Prev</button>
              <span className="text-gray-600">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => load(page + 1)} className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlockchainExplorer;
