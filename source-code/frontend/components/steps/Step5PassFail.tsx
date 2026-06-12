import React from 'react';
import { Simulation, PassFailCriteria } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  setSimulation: React.Dispatch<React.SetStateAction<Simulation | null>>;
}

// Default pass/fail criteria
const DEFAULT_PASS_FAIL: PassFailCriteria = {
  overallScore: { minimum: 70, maximum: 100 },
  sectionScores: [],
  criticalTasks: [],
  behavioralMetrics: [],
  timeManagement: { completionRequired: true, timeBonus: false },
  qualityStandards: [],
  automatedRules: [],
};

const Step5PassFail: React.FC<Props> = ({ simulation, setSimulation }) => {
  // Initialize passFailCriteria if undefined
  React.useEffect(() => {
    if (!simulation.passFailCriteria) {
      setSimulation(prev => prev ? {
        ...prev,
        passFailCriteria: { ...DEFAULT_PASS_FAIL }
      } : null);
    }
  }, [simulation.passFailCriteria, setSimulation]);

  // Use default if criteria is undefined
  const criteria = simulation.passFailCriteria || DEFAULT_PASS_FAIL;

  const setPFC = (patch: Partial<PassFailCriteria>) =>
    setSimulation(prev =>
      prev ? { 
        ...prev, 
        passFailCriteria: { 
          ...(prev.passFailCriteria || DEFAULT_PASS_FAIL), 
          ...patch 
        } 
      } : null
    );

  // Safely get overall score with defaults
  const overallScore = criteria.overallScore || { minimum: 70, maximum: 100 };
  const timeManagement = criteria.timeManagement || { completionRequired: true, timeBonus: false };
  const criticalTasks = criteria.criticalTasks || [];

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
              value={overallScore.minimum}
              onChange={e =>
                setPFC({ 
                  overallScore: { 
                    ...overallScore, 
                    minimum: Number(e.target.value) 
                  } 
                })
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
              value={overallScore.maximum}
              onChange={e =>
                setPFC({ 
                  overallScore: { 
                    ...overallScore, 
                    maximum: Number(e.target.value) 
                  } 
                })
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>
        {overallScore.minimum > overallScore.maximum && (
          <p className="text-xs text-red-500 mt-1">Minimum score cannot be greater than maximum score</p>
        )}
      </div>

      {/* Time management */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">Time Management</h4>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={timeManagement.completionRequired || false}
            onChange={e =>
              setPFC({ 
                timeManagement: { 
                  ...timeManagement, 
                  completionRequired: e.target.checked 
                } 
              })
            }
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
          />
          <span className="text-sm text-gray-700">Require completion within time limit</span>
        </label>
        
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={timeManagement.timeBonus || false}
            onChange={e =>
              setPFC({ 
                timeManagement: { 
                  ...timeManagement, 
                  timeBonus: e.target.checked 
                } 
              })
            }
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
          />
          <span className="text-sm text-gray-700">Award bonus points for early completion</span>
        </label>
      </div>

      {/* Critical tasks */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">Critical Tasks (Must Pass)</h4>
        {simulation.tasks.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Add tasks in Step 3 first.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {simulation.tasks.map(task => (
              <label key={task.id} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white rounded-lg transition-colors">
                <input
                  type="checkbox"
                  checked={criticalTasks.includes(task.id)}
                  onChange={e => {
                    const existing = criticalTasks;
                    const next = e.target.checked
                      ? [...existing, task.id]
                      : existing.filter(id => id !== task.id);
                    setPFC({ criticalTasks: next });
                  }}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <span className="text-sm text-gray-700">
                  {task.title || `Task ${task.order}`}
                </span>
                {task.duration && (
                  <span className="text-xs text-gray-400 ml-auto">
                    {task.duration} min
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
        {criticalTasks.length > 0 && (
          <p className="text-xs text-amber-600 mt-2">
            ⚠️ {criticalTasks.length} critical task{criticalTasks.length !== 1 ? 's' : ''} — candidate must pass all to complete the simulation.
          </p>
        )}
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-5 border border-purple-100">
        <h4 className="text-sm font-semibold text-purple-800 mb-3">Summary</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Passing Score:</span>
            <span className="font-semibold text-purple-700">≥ {overallScore.minimum}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Time Limit Required:</span>
            <span className="font-semibold">{timeManagement.completionRequired ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Time Bonus:</span>
            <span className="font-semibold">{timeManagement.timeBonus ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Critical Tasks:</span>
            <span className="font-semibold">{criticalTasks.length} task{criticalTasks.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step5PassFail;