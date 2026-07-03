import React from 'react';
import { Mail, Calendar, FileText, Code, Globe, Terminal, File, AlertCircle, Clock, CheckCircle, Github, MessageSquare, BookOpen, PenTool, LayoutGrid, Database } from 'lucide-react';
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
  { id: 'github',       label: 'GitHub',          icon: <Github size={13} /> },
  { id: 'slack',        label: 'Slack',           icon: <MessageSquare size={13} /> },
  { id: 'notion',       label: 'Notion',          icon: <BookOpen size={13} /> },
  { id: 'figma',        label: 'Figma',           icon: <PenTool size={13} /> },
  { id: 'jira',         label: 'Jira',            icon: <LayoutGrid size={13} /> },
  { id: 'database',     label: 'Database',        icon: <Database size={13} /> },
];

const OPTIONS = [
  { key: 'allowPause',     label: 'Allow candidates to pause and resume' },
  { key: 'showTimer',      label: 'Display countdown timer' },
  { key: 'randomizeTasks', label: 'Randomize task order' },
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
        <p className="text-sm text-gray-500 mt-0.5">Configure the practical assessment environment and candidate experience.</p>
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
          <p className="text-xs text-gray-400 mt-1">How many times a candidate may retake this practical assessment</p>
        </div>
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
        <h4 className="text-sm font-semibold text-gray-700">Practical Assessment Options</h4>
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
