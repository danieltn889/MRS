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

      {/* Enable toggle */}
      <label className="flex items-center gap-3 cursor-pointer p-4 bg-gray-50 rounded-xl border border-gray-100">
        <input
          type="checkbox"
          checked={simulation.practiceEnabled || false}
          onChange={e =>
            setSimulation(prev => prev ? { ...prev, practiceEnabled: e.target.checked } : null)
          }
          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
        />
        <div>
          <span className="text-sm font-semibold text-gray-800">Enable practice simulation</span>
          <p className="text-xs text-gray-500 mt-0.5">Candidates can take an optional practice run before the real simulation.</p>
        </div>
      </label>

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
                <option value="section">Section practice</option>
                <option value="timed">Timed practice</option>
                <option value="untimed">Untimed practice</option>
                <option value="tutorial">Interactive tutorial</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Difficulty</label>
              <select
                value={simulation.practiceSimulation?.difficulty || 'easier'}
                onChange={e => setPractice({ difficulty: e.target.value as PracticeSimulation['difficulty'] })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500"
              >
                <option value="easier">Easier than main simulation</option>
                <option value="same">Same as main simulation</option>
                <option value="adaptive">Adaptive difficulty</option>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Time Limit (minutes) <span className="text-gray-400 font-normal">— optional</span>
              </label>
              <input
                type="number"
                min={5}
                max={120}
                value={simulation.practiceSimulation?.timeLimit || ''}
                onChange={e => setPractice({ timeLimit: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                placeholder="No limit"
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

      {/* Benefits callout */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-purple-900 mb-2">Why enable practice?</h4>
        <ul className="text-sm text-purple-800 space-y-1">
          {[
            'Reduces candidate anxiety and test stress',
            'Familiarizes candidates with the interface and format',
            'Provides immediate feedback for learning',
            'Improves overall assessment quality and fairness',
          ].map(b => <li key={b}>• {b}</li>)}
        </ul>
      </div>
    </div>
  );
};

export default Step8Practice;
