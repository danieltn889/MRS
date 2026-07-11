import React from 'react';
import { Eye, Shield, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { Simulation, ComplianceCheck } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  complianceChecks: ComplianceCheck[];
  onRunCompliance: () => void;
  onPreview: () => void;
}

const Step9Testing: React.FC<Props> = ({ simulation, complianceChecks, onRunCompliance, onPreview }) => {
  const totalTaskDuration = simulation.tasks.reduce((s, t) => s + t.duration, 0);
  const evalPoints = simulation.tasks.reduce((s, t) => s + t.evaluation.criteria.length, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Testing & Validation</h3>
        <p className="text-sm text-gray-500 mt-0.5">Preview the candidate experience and run compliance checks.</p>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 space-y-3">
          <h4 className="font-semibold text-gray-800 flex items-center gap-2">
            <Eye size={16} className="text-purple-600" /> Preview Mode
          </h4>
          <p className="text-sm text-gray-500">Experience the practical assessment exactly as a candidate would.</p>
          <button
            onClick={onPreview}
            className="w-full px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all"
          >
            Start Preview
          </button>
        </div>
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 space-y-3">
          <h4 className="font-semibold text-gray-800 flex items-center gap-2">
            <Shield size={16} className="text-green-600" /> Compliance Check
          </h4>
          <p className="text-sm text-gray-500">Run automated bias, accessibility, and legal compliance checks.</p>
          <button
            onClick={onRunCompliance}
            className="w-full px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Run Checks
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="border border-gray-100 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Practical Assessment Statistics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { value: simulation.tasks.length,     label: 'Tasks',       color: 'purple'},
            { value: totalTaskDuration,            label: 'Minutes',     color: 'blue'  },
            { value: evalPoints,                   label: 'Eval Points', color: 'indigo'},
            { value: simulation.scoring.totalPoints, label: 'Max Score', color: 'green' },
          ].map(({ value, label, color }) => (
            <div key={label} className="text-center">
              <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Compliance results */}
      {complianceChecks.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Compliance Results</h4>
          {complianceChecks.map(check => (
            <div key={check.category} className="border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-sm font-medium text-gray-900 capitalize">{check.category} Check</h5>
                <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  check.status === 'passed' ? 'bg-green-100 text-green-700' :
                  check.status === 'warning'? 'bg-yellow-100 text-yellow-700':
                  'bg-red-100 text-red-700'
                }`}>
                  {check.status === 'passed' && <CheckCircle size={11} />}
                  {check.status === 'warning'&& <AlertTriangle size={11} />}
                  {check.status === 'failed' && <X size={11} />}
                  {check.status}
                </span>
              </div>
              {check.issues.length > 0 && (
                <ul className="text-xs text-red-600 list-disc list-inside mb-2 space-y-0.5">
                  {check.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                </ul>
              )}
              {check.recommendations.length > 0 && (
                <ul className="text-xs text-blue-600 list-disc list-inside space-y-0.5">
                  {check.recommendations.map((r, idx) => <li key={idx}>{r}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Step9Testing;
