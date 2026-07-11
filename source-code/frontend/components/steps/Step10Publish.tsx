import React from 'react';
import { CheckCircle, X, Play, Save, Copy, Archive, Loader2 } from 'lucide-react';
import { Simulation, ComplianceCheck } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  complianceChecks: ComplianceCheck[];
  simulationId?: string;
  onSave: () => void;
  onPublish: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  loading?: boolean;
}

const Step10Publish: React.FC<Props> = ({
  simulation, complianceChecks, simulationId,
  onSave, onPublish, onDuplicate, onArchive, loading,
}) => {
  const checklistItems = [
    { label: 'Practical assessment title and description completed', ok: !!(simulation.title?.trim()) && !!(simulation.description?.trim()) },
    { label: 'Job linked and role specified',              ok: !!(simulation.jobId) && !!(simulation.jobRole?.trim()) },
    { label: 'At least one learning objective defined',    ok: simulation.objectives.filter(o => o?.trim()).length > 0 },
    { label: 'At least one task with title and description', ok: simulation.tasks.length > 0 && simulation.tasks.every(t => t.title?.trim() && t.description?.trim()) },
    { label: 'Scoring weights total 100%',                 ok: simulation.scoring.qualityWeight + simulation.scoring.speedWeight + simulation.scoring.behavioralWeight === 100 },
    { label: 'Passing score is valid (1–100%)',            ok: simulation.scoring.passingScore >= 1 && simulation.scoring.passingScore <= 100 },
    { label: 'Environment settings configured',            ok: !!(simulation.settings?.environment) },
  ];

  const canPublish = checklistItems.every(item => item.ok);

  const summaryItems = [
    { label: 'Title',         value: simulation.title        || ' '},
    { label: 'Job Role',      value: simulation.jobRole      || ' '},
    { label: 'Duration',      value: `${simulation.duration} minutes` },
    { label: 'Difficulty',    value: simulation.difficulty },
    { label: 'Tasks',         value: `${simulation.tasks.length} tasks` },
    { label: 'Passing Score', value: `${simulation.scoring.passingScore}%` },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Review & Publish</h3>
        <p className="text-sm text-gray-500 mt-0.5">Final review before making this practical assessment available to candidates.</p>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Practical Assessment Summary</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {summaryItems.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="text-xs text-gray-500">{label}</span>
              <span className="text-sm font-medium text-gray-900 capitalize">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div className="border border-gray-100 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Publishing Checklist</h4>
        <div className="space-y-2.5">
          {checklistItems.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              {item.ok
                ? <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                : <X size={16} className="text-red-400 flex-shrink-0" />
              }
              <span className={`text-sm ${item.ok ? 'text-gray-700': 'text-red-600'}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
        {simulationId && (
          <>
            <button
              onClick={onDuplicate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors"
            >
              <Copy size={15} /> Duplicate
            </button>
            <button
              onClick={onArchive}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
            >
              <Archive size={15} /> Archive
            </button>
          </>
        )}
        <div className="flex-1" />
        <button
          onClick={onSave}
          className="flex items-center gap-2 px-5 py-2 text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <Save size={15} /> Save as Draft
        </button>
        <button
          onClick={onPublish}
          disabled={!canPublish || loading}
          className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {loading
            ? <><Loader2 size={15} className="animate-spin" /> Publishing…</>
            : <><Play size={15} /> Publish Simulation</>
          }
        </button>
      </div>
    </div>
  );
};

export default Step10Publish;
