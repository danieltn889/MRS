import React from 'react';
import { Simulation, PassFailCriteria, TaskPriority } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  setSimulation: React.Dispatch<React.SetStateAction<Simulation | null>>;
  currentStep?: number;
  totalSteps?: number;
}

// Default pass/fail criteria with all tasks mandatory
const DEFAULT_PASS_FAIL: PassFailCriteria = {
  overallScore: { minimum: 70, maximum: 100 },
  sectionScores: [],
  criticalTasks: [],
  behavioralMetrics: [],
  timeManagement: { completionRequired: true, timeBonus: false },
  qualityStandards: [],
  automatedRules: [],
  taskPriority: {
    mode: 'sequential',
    weightDistribution: 'equal',
    taskWeights: {},
    mandatoryTasks: [],
    optionalTasks: [],
  },
};

// Default task priority with all tasks mandatory
const getDefaultTaskPriority = (taskIds: string[]): TaskPriority => ({
  mode: 'sequential',
  weightDistribution: 'equal',
  taskWeights: {},
  mandatoryTasks: taskIds,
  optionalTasks: [],
});

const Step5PassFail: React.FC<Props> = ({ 
  simulation, 
  setSimulation, 
  currentStep = 5, 
  totalSteps = 9 
}) => {
  // Initialize passFailCriteria if undefined
  React.useEffect(() => {
    if (!simulation.passFailCriteria) {
      const allTaskIds = simulation.tasks.map(task => task.id);
      setSimulation({
        ...simulation,
        passFailCriteria: {
          ...DEFAULT_PASS_FAIL,
          taskPriority: getDefaultTaskPriority(allTaskIds),
        }
      });
    }
  }, [simulation.passFailCriteria, simulation.tasks, simulation, setSimulation]);

  // Use default if criteria is undefined
  const criteria = simulation.passFailCriteria || DEFAULT_PASS_FAIL;

  const setPFC = (patch: Partial<PassFailCriteria>) => {
    setSimulation({
      ...simulation,
      passFailCriteria: {
        ...(simulation.passFailCriteria || DEFAULT_PASS_FAIL),
        ...patch
      }
    });
  };

  // Get task priority with defaults - ensure mode is always defined
  const taskPriority: TaskPriority = criteria.taskPriority || getDefaultTaskPriority(
    simulation.tasks.map(task => task.id)
  );

  // Safely get overall score with defaults
  const overallScore = criteria.overallScore || { minimum: 70, maximum: 100 };
  const timeManagement = criteria.timeManagement || { completionRequired: true, timeBonus: false };

  // Update task priority settings - ensure mode is always provided
  const updateTaskPriority = (patch: Partial<TaskPriority>) => {
    setPFC({
      taskPriority: { 
        ...taskPriority, 
        ...patch,
        mode: patch.mode || taskPriority.mode, // Ensure mode is always defined
      }
    });
  };

  // Toggle task weight
  const toggleTaskWeight = (taskId: string) => {
    const weights = { ...(taskPriority.taskWeights || {}) };
    if (weights[taskId]) {
      delete weights[taskId];
    } else {
      weights[taskId] = 1;
    }
    updateTaskPriority({ taskWeights: weights });
  };

  // Update task weight value
  const updateTaskWeightValue = (taskId: string, value: number) => {
    const weights = { ...(taskPriority.taskWeights || {}), [taskId]: Math.max(0, Math.min(10, value)) };
    updateTaskPriority({ taskWeights: weights });
  };

  // Toggle task between mandatory and optional (MUTUALLY EXCLUSIVE)
  const toggleTaskCategory = (taskId: string, category: 'mandatory'| 'optional') => {
    const currentMandatory = taskPriority.mandatoryTasks || [];
    const currentOptional = taskPriority.optionalTasks || [];
    
    let newMandatory = [...currentMandatory];
    let newOptional = [...currentOptional];
    
    if (category === 'mandatory') {
      if (newMandatory.includes(taskId)) {
        newMandatory = newMandatory.filter(id => id !== taskId);
      } else {
        newMandatory.push(taskId);
        newOptional = newOptional.filter(id => id !== taskId);
      }
    } else if (category === 'optional') {
      if (newOptional.includes(taskId)) {
        newOptional = newOptional.filter(id => id !== taskId);
      } else {
        newOptional.push(taskId);
        newMandatory = newMandatory.filter(id => id !== taskId);
      }
    }
    
    updateTaskPriority({ 
      mandatoryTasks: newMandatory,
      optionalTasks: newOptional 
    });
  };

  // Make ALL tasks mandatory
  const makeAllTasksMandatory = () => {
    const allTaskIds = simulation.tasks.map(task => task.id);
    updateTaskPriority({ 
      mandatoryTasks: allTaskIds,
      optionalTasks: []
    });
  };

  // Make ALL tasks optional
  const makeAllTasksOptional = () => {
    const allTaskIds = simulation.tasks.map(task => task.id);
    updateTaskPriority({ 
      optionalTasks: allTaskIds,
      mandatoryTasks: []
    });
  };

  // Clear all assignments
  const clearAllAssignments = () => {
    updateTaskPriority({ 
      mandatoryTasks: [],
      optionalTasks: []
    });
  };

  // Check if a task is in mandatory or optional
  const getTaskStatus = (taskId: string) => {
    const isMandatory = taskPriority.mandatoryTasks?.includes(taskId) || false;
    const isOptional = taskPriority.optionalTasks?.includes(taskId) || false;
    return { isMandatory, isOptional };
  };

  return (
    <div className="p-6 space-y-6">
      {/* Task Priority Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Task Priority</h3>
            <p className="text-sm text-gray-500 mt-0.5">Define the standards candidates must meet to pass this practical assessment.</p>
          </div>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
            Step {currentStep}/{totalSteps}
          </span>
        </div>

        {/* Bulk Actions */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={makeAllTasksMandatory}
            className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors"
          >
            🔒 Make All Mandatory
          </button>
          <button
            onClick={makeAllTasksOptional}
            className="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors"
          >
            🔓 Make All Optional
          </button>
          <button
            onClick={clearAllAssignments}
            className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            🗑️ Clear All
          </button>
        </div>

        {/* Priority Mode Selection */}
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700 block mb-2">
            Priority Mode
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'sequential'as const, label: 'Sequential', desc: 'Must finish each before starting next'},
              { value: 'parallel'as const, label: 'Parallel', desc: 'Start any task at any time'},
              { value: 'weighted'as const, label: 'Weighted', desc: 'Assign custom importance'},
            ].map((mode) => (
              <button
                key={mode.value}
                onClick={() => updateTaskPriority({ mode: mode.value })}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  taskPriority.mode === mode.value
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-sm text-gray-900">{mode.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{mode.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Weight Distribution (only for weighted mode) */}
        {taskPriority.mode === 'weighted'&& (
          <div className="mt-3 space-y-3">
            <label className="text-sm font-medium text-gray-700 block">
              Weight Distribution
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={taskPriority.weightDistribution === 'equal'}
                  onChange={() => updateTaskPriority({ weightDistribution: 'equal'})}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700">Equal weights</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={taskPriority.weightDistribution === 'custom'}
                  onChange={() => updateTaskPriority({ weightDistribution: 'custom'})}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700">Custom weights</span>
              </label>
            </div>

            {/* Custom weight sliders */}
            {taskPriority.weightDistribution === 'custom'&& simulation.tasks.length > 0 && (
              <div className="mt-3 space-y-3">
                {simulation.tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-4 p-2 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700 w-32 truncate">
                      {task.title || `Task ${task.order}`}
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={taskPriority.taskWeights?.[task.id] || 0}
                      onChange={(e) => updateTaskWeightValue(task.id, parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                    />
                    <span className="text-sm font-mono w-8 text-center">
                      {taskPriority.taskWeights?.[task.id] || 0}x
                    </span>
                    <button
                      onClick={() => toggleTaskWeight(task.id)}
                      className={`px-2 py-1 text-xs rounded ${
                        taskPriority.taskWeights?.[task.id] && taskPriority.taskWeights[task.id] > 0
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {taskPriority.taskWeights?.[task.id] && taskPriority.taskWeights[task.id] > 0 ? 'Active': 'Inactive'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Task Requirements */}
        <div className="mt-3 space-y-3">
          <label className="text-sm font-medium text-gray-700 block">
            Task Requirements
          </label>

          {simulation.tasks.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No tasks available   add tasks in Step 3 first.</p>
          ) : (
            <>
              {/* Unassigned pool */}
              {(() => {
                const unassigned = simulation.tasks.filter(t =>
                  !taskPriority.mandatoryTasks?.includes(t.id) &&
                  !taskPriority.optionalTasks?.includes(t.id)
                );
                if (unassigned.length === 0) return null;
                return (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Unassigned   click <strong>M</strong> or <strong>O</strong> to categorize:</p>
                    <div className="space-y-1 border border-dashed border-gray-300 rounded-lg p-2 bg-gray-50">
                      {unassigned.map(task => (
                        <div key={task.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-white border border-gray-200">
                          <span className="flex-1 text-gray-700 font-medium truncate">{task.title || `Task ${task.order}`}</span>
                          {task.duration && <span className="text-gray-400 shrink-0">{task.duration}m</span>}
                          <button
                            onClick={() => toggleTaskCategory(task.id, 'mandatory')}
                            className="shrink-0 px-2 py-0.5 bg-red-100 text-red-700 rounded font-semibold hover:bg-red-200 transition-colors"
                            title="Make Mandatory"
                          >M</button>
                          <button
                            onClick={() => toggleTaskCategory(task.id, 'optional')}
                            className="shrink-0 px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-semibold hover:bg-blue-200 transition-colors"
                            title="Make Optional"
                          >O</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-4">
                {/* Mandatory Tasks Column */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-red-600">🔒</span>
                    <span className="text-xs font-medium text-gray-700">Mandatory</span>
                    <span className="text-xs text-gray-400">({taskPriority.mandatoryTasks?.length || 0})</span>
                  </div>
                  <div className="space-y-1 min-h-14 max-h-48 overflow-y-auto border border-red-200 rounded-lg p-2 bg-red-50">
                    {(taskPriority.mandatoryTasks?.length || 0) === 0 ? (
                      <p className="text-xs text-gray-400 italic py-2 text-center">None yet</p>
                    ) : (
                      simulation.tasks
                        .filter(t => taskPriority.mandatoryTasks?.includes(t.id))
                        .map(task => (
                          <div
                            key={task.id}
                            className="flex items-center gap-2 text-xs p-2 rounded bg-red-200 text-gray-800 border border-red-300 cursor-pointer hover:bg-red-300 transition-colors"
                            onClick={() => toggleTaskCategory(task.id, 'mandatory')}
                            title="Click to remove from Mandatory"
                          >
                            <span className="flex-1 font-medium truncate">{task.title || `Task ${task.order}`}</span>
                            {task.duration && <span className="text-gray-500 shrink-0">{task.duration}m</span>}
                            <span className="text-red-500 shrink-0 font-bold">×</span>
                          </div>
                        ))
                    )}
                  </div>
                  {(taskPriority.mandatoryTasks?.length || 0) === 0 && (
                    <p className="text-xs text-red-500"> No mandatory tasks selected</p>
                  )}
                </div>

                {/* Optional Tasks Column */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-600">○</span>
                    <span className="text-xs font-medium text-gray-700">Optional</span>
                    <span className="text-xs text-gray-400">({taskPriority.optionalTasks?.length || 0})</span>
                  </div>
                  <div className="space-y-1 min-h-14 max-h-48 overflow-y-auto border border-blue-200 rounded-lg p-2 bg-blue-50">
                    {(taskPriority.optionalTasks?.length || 0) === 0 ? (
                      <p className="text-xs text-gray-400 italic py-2 text-center">None yet</p>
                    ) : (
                      simulation.tasks
                        .filter(t => taskPriority.optionalTasks?.includes(t.id))
                        .map(task => (
                          <div
                            key={task.id}
                            className="flex items-center gap-2 text-xs p-2 rounded bg-blue-200 text-gray-800 border border-blue-300 cursor-pointer hover:bg-blue-300 transition-colors"
                            onClick={() => toggleTaskCategory(task.id, 'optional')}
                            title="Click to remove from Optional"
                          >
                            <span className="flex-1 font-medium truncate">{task.title || `Task ${task.order}`}</span>
                            {task.duration && <span className="text-gray-500 shrink-0">{task.duration}m</span>}
                            <span className="text-blue-500 shrink-0 font-bold">×</span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-400">Click a task in Mandatory or Optional to move it back to Unassigned.</p>
            </>
          )}
        </div>

        {/* Quick Stats */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-100">
          <div className="text-xs">
            <span className="text-gray-500">Total Tasks:</span>
            <span className="font-medium ml-1">{simulation.tasks.length}</span>
          </div>
          <div className="text-xs">
            <span className="text-gray-500">Mandatory:</span>
            <span className="font-medium ml-1 text-red-600">{taskPriority.mandatoryTasks?.length || 0}</span>
          </div>
          <div className="text-xs">
            <span className="text-gray-500">Optional:</span>
            <span className="font-medium ml-1 text-blue-600">{taskPriority.optionalTasks?.length || 0}</span>
          </div>
          
          {taskPriority.mode === 'weighted'&& (
            <div className="text-xs">
              <span className="text-gray-500">Active Weights:</span>
              <span className="font-medium ml-1">
                {Object.keys(taskPriority.taskWeights || {}).filter(k => (taskPriority.taskWeights?.[k] || 0) > 0).length}
              </span>
            </div>
          )}
        </div>

        {/* Warning if no tasks are mandatory */}
        {taskPriority.mandatoryTasks?.length === 0 && simulation.tasks.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
            <p className="text-xs text-yellow-700">
               No tasks are marked as mandatory. Consider making at least one task mandatory for the simulation to be meaningful.
            </p>
          </div>
        )}

        {/* Info if all tasks are assigned */}
        {(taskPriority.mandatoryTasks?.length + taskPriority.optionalTasks?.length) === simulation.tasks.length && simulation.tasks.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
            <p className="text-xs text-green-700">
              ''All {simulation.tasks.length} tasks have been assigned!
            </p>
          </div>
        )}
      </div>

      {/* Time management section */}
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
            <span className="font-semibold">{timeManagement.completionRequired ? 'Yes': 'No'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Time Bonus:</span>
            <span className="font-semibold">{timeManagement.timeBonus ? 'Enabled': 'Disabled'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Mandatory Tasks:</span>
            <span className="font-semibold text-red-600">{taskPriority.mandatoryTasks?.length || 0} tasks</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Optional Tasks:</span>
            <span className="font-semibold text-blue-600">{taskPriority.optionalTasks?.length || 0} tasks</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Priority Mode:</span>
            <span className="font-semibold capitalize">{taskPriority.mode}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step5PassFail;