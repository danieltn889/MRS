import React from 'react';
import { Mail, Calendar, FileText, Code, Globe, Terminal, File, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { Simulation, SimulationSettings } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  setSimulation: React.Dispatch<React.SetStateAction<Simulation | null>>;
}

const TOOLS = [
  { id: 'email',        label: 'Email Client',   icon: <Mail size={13} /> },
  { id: 'calendar',     label: 'Calendar',        icon: <Calendar size={13} /> },
  { id: 'documents',    label: 'Documents',       icon: <FileText size={13} /> },
  { id: 'code_editor',  label: 'Code Editor',     icon: <Code size={13} /> },
  { id: 'browser',      label: 'Web Browser',     icon: <Globe size={13} /> },
  { id: 'terminal',     label: 'Terminal',        icon: <Terminal size={13} /> },
  { id: 'spreadsheet',  label: 'Spreadsheet',     icon: <File size={13} /> },
  { id: 'presentation', label: 'Presentation',    icon: <File size={13} /> },
];

const OPTIONS = [
  { key: 'allowPause',     label: 'Allow candidates to pause and resume' },
  { key: 'showTimer',      label: 'Display countdown timer' },
  { key: 'randomizeTasks', label: 'Randomize task order' },
  { key: 'allowHints',     label: 'Provide hints during tasks' },
  { key: 'recordScreen',   label: 'Record screen activity' },
  { key: 'recordAudio',    label: 'Record audio during simulation' },
];

const Step6Settings: React.FC<Props> = ({ simulation, setSimulation }) => {
  const setSettings = (patch: Partial<SimulationSettings>) =>
    setSimulation(prev => prev ? { ...prev, settings: { ...prev.settings, ...patch } } : null);

  const isCustomEnv   = !['office', 'remote', 'field'].includes(simulation.settings.environment);
  const totalTaskMins = simulation.tasks.reduce((s, t) => s + (t.duration || 0), 0);
  const timeLimitVal  = simulation.settings.timeLimit ?? 0;
  const timeLimitSet  = timeLimitVal > 0;
  const timeLimitErr  = timeLimitSet && timeLimitVal < totalTaskMins;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Environment & Settings</h3>
        <p className="text-sm text-gray-500 mt-0.5">Configure the simulation environment and candidate experience.</p>
      </div>

      {/* Environment + Attempts + Time Limit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Work Environment</label>
          <select
            value={isCustomEnv ? 'custom' : simulation.settings.environment}
            onChange={e => {
              if (e.target.value !== 'custom') setSettings({ environment: e.target.value as any });
              else setSettings({ environment: '' });
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="office">Office Environment</option>
            <option value="remote">Remote Work Setup</option>
            <option value="field">Field Work Scenario</option>
            <option value="custom">Custom Environment</option>
          </select>
          {isCustomEnv && (
            <input
              type="text"
              value={simulation.settings.environment}
              onChange={e => setSettings({ environment: e.target.value })}
              className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Describe the custom environment…"
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Maximum Attempts
            <span className="ml-1.5 text-xs font-normal text-gray-400">(1 – 5)</span>
          </label>
          <input
            type="number" min={1} max={5}
            value={simulation.settings.maxAttempts}
            onChange={e => setSettings({ maxAttempts: Math.min(5, Math.max(1, Number(e.target.value))) })}
            placeholder="1"
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-400 mt-1">How many times a candidate may retake this simulation</p>
        </div>
      </div>

      {/* Time Limit */}
      <div className={`rounded-xl border p-4 space-y-3 ${timeLimitErr ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Clock size={15} className="text-purple-500" />
            Time Limit (minutes)
            <span className="text-xs font-normal text-gray-400">— optional</span>
          </label>
          {/* Total task time badge */}
          {totalTaskMins > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
              Total task time: {totalTaskMins} min
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="number" min={0}
            value={timeLimitVal || ''}
            onChange={e => setSettings({ timeLimit: Number(e.target.value) || 0 })}
            placeholder="Leave blank for no limit"
            className={`flex-1 px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all ${
              timeLimitErr ? 'border-red-400 bg-white' : 'border-gray-200 bg-white'
            }`}
          />
          {timeLimitSet && !timeLimitErr && (
            <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium shrink-0">
              <CheckCircle size={15} /> Valid
            </div>
          )}
          {timeLimitSet && (
            <button
              onClick={() => setSettings({ timeLimit: 0 })}
              className="text-xs text-gray-400 hover:text-red-500 shrink-0 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {timeLimitErr && (
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={14} className="shrink-0" />
            Time limit ({timeLimitVal} min) is less than total task duration ({totalTaskMins} min).
            Must be <strong>≥ {totalTaskMins} min</strong>.
          </div>
        )}

        {!timeLimitSet && totalTaskMins > 0 && (
          <p className="text-xs text-gray-400">
            No limit set — candidates will have unlimited time.
            Recommended minimum: <strong>{totalTaskMins} min</strong> (total task time).
          </p>
        )}

        {timeLimitSet && !timeLimitErr && (
          <p className="text-xs text-gray-500">
            Candidates have <strong>{timeLimitVal} min</strong> to complete all tasks
            ({timeLimitVal - totalTaskMins} min buffer above task total).
          </p>
        )}
      </div>

      {/* Tools */}
      <div className="bg-gray-50 rounded-xl p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Available Tools</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TOOLS.map(tool => (
            <label key={tool.id} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={simulation.settings.tools.includes(tool.id)}
                onChange={e => {
                  const tools = e.target.checked
                    ? [...simulation.settings.tools, tool.id]
                    : simulation.settings.tools.filter(t => t !== tool.id);
                  setSettings({ tools });
                }}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
              />
              <span className="flex items-center gap-1.5 text-sm text-gray-700">
                <span className="text-gray-400">{tool.icon}</span>
                {tool.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">Simulation Options</h4>
        {OPTIONS.map(opt => (
          <label key={opt.key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={(simulation.settings as any)[opt.key]}
              onChange={e => setSettings({ [opt.key]: e.target.checked })}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
            />
            <span className="text-sm text-gray-700">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default Step6Settings;
