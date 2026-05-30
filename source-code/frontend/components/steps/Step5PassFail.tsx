import React from 'react';
import { Simulation, PassFailCriteria } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  setSimulation: React.Dispatch<React.SetStateAction<Simulation | null>>;
}

const Step5PassFail: React.FC<Props> = ({ simulation, setSimulation }) => {
  const criteria = simulation.passFailCriteria!;

  const setPFC = (patch: Partial<PassFailCriteria>) =>
    setSimulation(prev =>
      prev ? { ...prev, passFailCriteria: { ...prev.passFailCriteria!, ...patch } } : null
    );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Pass / Fail Criteria</h3>
        <p className="text-sm text-gray-500 mt-0.5">Define the standards candidates must meet to pass this simulation.</p>
      </div>

      {/* Overall score */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">Overall Score Requirements</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Minimum Score (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={criteria.overallScore.minimum}
              onChange={e =>
                setPFC({ overallScore: { ...criteria.overallScore, minimum: Number(e.target.value) } })
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Maximum Score (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={criteria.overallScore.maximum}
              onChange={e =>
                setPFC({ overallScore: { ...criteria.overallScore, maximum: Number(e.target.value) } })
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Time management */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">Time Management</h4>
        {[
          { key: 'completionRequired', label: 'Require completion within time limit' },
          { key: 'timeBonus',          label: 'Award bonus points for early completion' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={(criteria.timeManagement as any)[key] || false}
              onChange={e =>
                setPFC({ timeManagement: { ...criteria.timeManagement, [key]: e.target.checked } })
              }
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
            />
            <span className="text-sm text-gray-700">{label}</span>
          </label>
        ))}
      </div>

      {/* Critical tasks */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">Critical Tasks (Must Pass)</h4>
        {simulation.tasks.length === 0 ? (
          <p className="text-sm text-gray-400">Add tasks in Step 3 first.</p>
        ) : (
          simulation.tasks.map(task => (
            <label key={task.id} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={criteria.criticalTasks.includes(task.id)}
                onChange={e => {
                  const existing = criteria.criticalTasks;
                  const next = e.target.checked
                    ? [...existing, task.id]
                    : existing.filter(id => id !== task.id);
                  setPFC({ criticalTasks: next });
                }}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
              />
              <span className="text-sm text-gray-700">{task.title || `Task ${task.order}`}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
};

export default Step5PassFail;
