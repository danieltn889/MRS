import React from 'react';
import { Simulation, PracticeSimulation } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  setSimulation: React.Dispatch<React.SetStateAction<Simulation | null>>;
}

const Step8Practice: React.FC<Props> = ({ simulation, setSimulation }) => {
  const setPractice = (patch: Partial<PracticeSimulation>) =>
    setSimulation(prev =>
      prev
        ? { ...prev, practiceSimulation: { ...prev.practiceSimulation!, ...patch, enabled: true } }
        : null
    );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Practice Simulation Setup</h3>
        <p className="text-sm text-gray-500 mt-0.5">Give candidates a chance to warm up before the real assessment.</p>
      </div>

      {simulation.practiceEnabled && (
        <div className="space-y-5 pl-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Practice Type</label>
              <select
                value={simulation.practiceSimulation?.type || 'section'}
                onChange={e => setPractice({ type: e.target.value as PracticeSimulation['type'] })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500"
              >
                <option value="full">Full simulation</option>
                <option value="timed">Timed practice</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Attempts</label>
              <input
                type="number"
                min={1}
                max={10}
                value={simulation.practiceSimulation?.maxAttempts || 5}
                onChange={e => setPractice({ maxAttempts: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={simulation.practiceSimulation?.includeFeedback ?? true}
              onChange={e => setPractice({ includeFeedback: e.target.checked })}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
            />
            <span className="text-sm text-gray-700">Include immediate feedback and explanations</span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Practice Instructions</label>
            <textarea
              value={simulation.practiceSimulation?.instructions || ''}
              onChange={e => setPractice({ instructions: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 resize-none"
              placeholder="Instructions shown to candidates before they start the practice…"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Step8Practice;
