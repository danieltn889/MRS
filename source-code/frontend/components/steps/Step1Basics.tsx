import React, { useState } from 'react';
import { Briefcase, AlertCircle, CheckCircle, X, Eye, Loader2, Lock } from 'lucide-react';
import { Simulation } from '../types/simulationTypes';
import JobViewModal from '../jobs/JobViewModal';
import { getJob } from '../../services/jobAPI';

interface Props {
  simulation: Simulation;
  setSimulation: React.Dispatch<React.SetStateAction<Simulation | null>>;
  jobs: any[];
}

const Step1Basics: React.FC<Props> = ({ simulation, setSimulation, jobs }) => {
  const set = (patch: Partial<Simulation>) =>
    setSimulation(prev => (prev ? { ...prev, ...patch } : null));

  const [modalJob,    setModalJob]    = useState<any>(null);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const openJobModal = async () => {
    if (!simulation.jobId) return;
    // Use already-loaded job if available
    const fromList = jobs.find(j => j.id === simulation.jobId);
    if (fromList) { setModalJob(fromList); setModalOpen(true); return; }
    // Otherwise fetch full details
    try {
      setModalLoading(true);
      const result = await getJob(simulation.jobId);
      setModalJob(result?.data || result);
      setModalOpen(true);
    } catch { /* ignore */ }
    finally { setModalLoading(false); }
  };

  const hasLinkedJob  = Boolean(simulation.jobId?.trim());
  const hasSessions   = (simulation.totalInstances ?? 0) > 0;
  const selectedJob   = hasLinkedJob
    ? (jobs.find(j => j.id === simulation.jobId) ?? null)
    : null;

  // When editing: jobId is set but job not yet in list — build a stub from stored fields
  const displayJob = selectedJob ?? (hasLinkedJob
    ? { id: simulation.jobId!, title: simulation.jobRole || simulation.title || 'Linked job', company_name: '', department: '', job_type: '', status: 'linked' }
    : null);

  const handleJobSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const jobId = e.target.value;
    if (!jobId) { set({ jobId: undefined }); return; }
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      set({
        jobId:   job.id,
        jobRole: job.title,
        title:   `${job.title} Assessment`,
      });
    }
  };

  return (
    <div className="p-6 space-y-7">

      <div>
        <h3 className="text-lg font-bold text-gray-900">Practical Assessment Basics</h3>
        <p className="text-sm text-gray-500 mt-0.5">Define the core details of your practical assessment.</p>
      </div>

      {/* ── Job link — REQUIRED, first ── */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Link to Job <span className="text-red-500">*</span>
        </label>

        {displayJob ? (
          /* ── Selected / linked state ── */
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${hasSessions ? 'bg-gray-50 border-gray-200' : 'bg-purple-50 border-purple-200'}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${hasSessions ? 'bg-gray-400' : 'bg-purple-600'}`}>
              {hasSessions ? <Lock size={17} className="text-white" /> : <Briefcase size={17} className="text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${hasSessions ? 'text-gray-700' : 'text-purple-900'}`}>{displayJob.title}</p>
              <div className={`flex flex-wrap gap-3 mt-1 text-xs ${hasSessions ? 'text-gray-500' : 'text-purple-600'}`}>
                {displayJob.company_name && <span>{displayJob.company_name}</span>}
                {displayJob.department   && <span>· {displayJob.department}</span>}
                {displayJob.job_type     && <span>· {displayJob.job_type}</span>}
                {displayJob.status && <span className="capitalize">· {displayJob.status}</span>}
              </div>
              {hasSessions && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <Lock size={10} /> Locked — {simulation.totalInstances} active session{simulation.totalInstances !== 1 ? 's' : ''} in progress
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <CheckCircle size={15} className="text-green-500" />
              <button
                onClick={openJobModal}
                disabled={modalLoading}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors disabled:opacity-50"
                title="View full job details"
              >
                {modalLoading
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Eye size={12} />}
                View
              </button>
              {!hasSessions && (
                <button
                  onClick={() => set({ jobId: undefined })}
                  className="p-1 rounded-lg text-purple-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Unlink job"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ── Empty state ── */
          <div className="space-y-2">
            <select
              value=""
              onChange={handleJobSelect}
              className="w-full px-4 py-2.5 border-2 border-red-300 bg-red-50 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:bg-white transition-all"
            >
              <option value="">Select a job to link to this practical assessment…</option>
              {jobs.map(job => (
                <option key={job.id} value={job.id}>
                  {job.title}
                  {job.department ? ` — ${job.department}` : ''}
                  {job.company_name ? ` (${job.company_name})` : ''}
                  {` · ${job.status}`}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertCircle size={12} />
              A linked job is required before you can proceed.
            </div>
            {jobs.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No jobs found. Create a job posting first, then come back to link it here.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Rest of the form (only shown once a job is linked) ── */}
      <div className={`space-y-6 transition-opacity duration-200 ${!displayJob ? 'opacity-40 pointer-events-none select-none' : ''}`}>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Simulation Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Simulation Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={simulation.title}
              onChange={e => set({ title: e.target.value })}
              className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all ${
                !simulation.title.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-purple-300'
              }`}
              placeholder="e.g., Senior Full Stack Developer Assessment"
            />
          </div>

          {/* Job Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Job Role <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={simulation.jobRole}
              onChange={e => set({ jobRole: e.target.value })}
              className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all ${
                !simulation.jobRole.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-purple-300'
              }`}
              placeholder="e.g., Senior Full Stack Developer"
            />
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Difficulty Level</label>
            <select
              value={simulation.difficulty}
              onChange={e => set({ difficulty: e.target.value as Simulation['difficulty'] })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white hover:border-purple-300 transition-all"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
            </select>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Duration (minutes) <span className="text-red-500">*</span>
            </label>
            <input
              type="number" min={15} max={480}
              value={simulation.duration}
              onChange={e => set({ duration: Number(e.target.value) })}
              className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all ${
                simulation.duration < 15 || simulation.duration > 480 ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-purple-300'
              }`}
            />
            <p className="text-xs text-gray-400 mt-1">Between 15 and 480 minutes</p>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={simulation.description}
            onChange={e => set({ description: e.target.value })}
            rows={4}
            className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none transition-all ${
              !simulation.description.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-purple-300'
            }`}
            placeholder="Describe what this simulation assesses and what candidates can expect…"
          />
          <p className={`text-xs mt-1 text-right ${simulation.description.trim().length < 10 ? 'text-red-400' : 'text-gray-400'}`}>
            {simulation.description.trim().length} chars
          </p>
        </div>

      </div>
      <JobViewModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        job={modalJob}
      />
    </div>
  );
};

export default Step1Basics;
