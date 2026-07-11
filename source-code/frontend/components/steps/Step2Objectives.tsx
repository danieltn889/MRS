import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Target, Sparkles, Search } from 'lucide-react';
import { Simulation } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  setSimulation: React.Dispatch<React.SetStateAction<Simulation | null>>;
  suggestions?: string[];
}

const STATIC_SUGGESTIONS = [
  'Demonstrate ability to debug production issues under time pressure',
  'Show proficiency in system design for scalable applications',
  'Communicate technical decisions clearly to non-technical stakeholders',
  'Apply Agile methodologies to manage tasks and priorities',
  'Collaborate effectively in a cross-functional team environment',
  'Deliver working features within given time constraints',
  'Write clean, maintainable, and well-documented code',
  'Identify and resolve security vulnerabilities in a codebase',
  'Analyse business requirements and translate them into technical solutions',
  'Demonstrate leadership and problem-solving under pressure',
  'Manage multiple competing priorities efficiently',
  'Present and justify technical choices to a non-technical audience',
  'Show adaptability when requirements change mid-task',
  'Conduct effective code reviews and provide constructive feedback',
  'Deploy and monitor applications in a production environment',
];

// ── Inline suggestion dropdown for a single objective input ──────────────────
const ObjectiveInput: React.FC<{
  value: string;
  index: number;
  suggestions: string[];
  usedValues: string[];
  onChange: (v: string) => void;
  onRemove: () => void;
}> = ({ value, index, suggestions, usedValues, onChange, onRemove }) => {
  const [open, setOpen] = useState(false);
  const [selIdx, setSelIdx] = useState(-1);

  // Compute matches synchronously   no debounce needed for a small static list
  const matches = value.trim()
    ? suggestions
        .filter(s => s.toLowerCase().includes(value.toLowerCase()) && !usedValues.includes(s))
        .slice(0, 6)
    : suggestions.filter(s => !usedValues.includes(s)).slice(0, 5);

  const pick = (s: string) => { onChange(s); setOpen(false); setSelIdx(-1); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, matches.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i - 1, -1)); }
    if (e.key === 'Escape')    { setOpen(false); }
    if (e.key === 'Enter'&& selIdx >= 0 && matches[selIdx]) { e.preventDefault(); pick(matches[selIdx]); }
  };

  return (
    <div className="flex items-start gap-3 group">
      {/* Number badge */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center mt-2">
        <span className="text-xs font-bold text-purple-600">{index + 1}</span>
      </div>

      {/* Input + dropdown */}
      <div className="flex-1 relative">
        <div className="relative">
          <Target size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400 pointer-events-none" />
          <input
            type="text"
            value={value}
            onChange={e => { onChange(e.target.value); setOpen(true); setSelIdx(-1); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKey}
            className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent ${
              !value.trim() ? 'border-red-300 bg-red-50': 'border-gray-200 bg-white hover:border-purple-300'
            }`}
            placeholder="e.g., Demonstrate ability to debug production issues…"
          />
          {!value.trim() && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-400 font-medium">required</span>
          )}
        </div>

        {/* Dropdown */}
        {open && matches.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-[100] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            <div className="px-3 py-1.5 bg-purple-50 border-b border-purple-100 flex items-center gap-1.5">
              <Sparkles size={11} className="text-purple-500" />
              <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
                {value.trim() ? 'Matching suggestions': 'Suggestions'}
              </span>
            </div>
            {matches.map((m, i) => (
              <div
                key={m}
                onMouseDown={e => { e.preventDefault(); pick(m); }}
                className={`px-4 py-2.5 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                  selIdx === i ? 'bg-purple-50 text-purple-800': 'text-gray-700 hover:bg-purple-50'
                }`}
              >
                <Target size={12} className="text-purple-400 shrink-0" />
                <span className="line-clamp-2">{m}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 mt-2 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};

// ── Main step component ───────────────────────────────────────────────────────

const Step2Objectives: React.FC<Props> = ({ simulation, setSimulation, suggestions = [] }) => {
  const allSuggestions = [...new Set([...suggestions, ...STATIC_SUGGESTIONS])];

  const setObjectives = (objectives: string[]) =>
    setSimulation(prev => (prev ? { ...prev, objectives } : null));

  const addObjective = () => setObjectives([...simulation.objectives, '']);
  const updateObjective = (i: number, v: string) => {
    const next = [...simulation.objectives];
    next[i] = v;
    setObjectives(next);
  };
  const removeObjective = (i: number) =>
    setObjectives(simulation.objectives.filter((_, idx) => idx !== i));

  // Quick-add from suggestions not already used
  const unusedSuggestions = allSuggestions
    .filter(s => !simulation.objectives.includes(s))
    .slice(0, 5);

  const totalObjectives = simulation.objectives.length;
  const filledObjectives = simulation.objectives.filter(o => o.trim()).length;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Learning Objectives</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Define what candidates should demonstrate during this practical assessment.
          </p>
        </div>
        {totalObjectives > 0 && (
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
            filledObjectives === totalObjectives
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-orange-50 text-orange-700 border border-orange-200'
          }`}>
            {filledObjectives} / {totalObjectives} filled
          </span>
        )}
      </div>

      {/* Validation hint */}
      {simulation.objectives.length === 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <Search size={16} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">Add at least one objective to continue to the next step.</p>
        </div>
      )}

      {/* Objectives list */}
      <div className="space-y-3">
        {simulation.objectives.map((obj, index) => (
          <ObjectiveInput
            key={index}
            value={obj}
            index={index}
            suggestions={allSuggestions}
            usedValues={simulation.objectives.filter((_, i) => i !== index)}
            onChange={v => updateObjective(index, v)}
            onRemove={() => removeObjective(index)}
          />
        ))}
      </div>

      {/* Add button */}
      <button
        onClick={addObjective}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors"
      >
        <Plus size={16} />
        Add Objective
      </button>

      {/* Quick-pick suggestions */}
      {unusedSuggestions.length > 0 && (
        <div className="border border-dashed border-purple-200 rounded-xl p-4 bg-purple-50/40">
          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Sparkles size={12} /> Quick add from suggestions
          </p>
          <div className="flex flex-wrap gap-2">
            {unusedSuggestions.map(s => (
              <button
                key={s}
                onClick={() => setObjectives([...simulation.objectives, s])}
                className="text-xs px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-purple-700 hover:bg-purple-100 transition-colors text-left"
              >
                + {s.length > 60 ? s.slice(0, 60) + '…': s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Step2Objectives;
