import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Puzzle, Code, Search, Sparkles } from 'lucide-react';
import { Simulation, SimulationTask, EvaluationCriterion } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  setSimulation: React.Dispatch<React.SetStateAction<Simulation | null>>;
  taskSuggestions?: string[];
}

const STATIC_TASK_TITLES = [
  'Build a User Profile Card Component',
  'Create a GET API Endpoint for User List',
  'Fix the Broken Todo List Application',
  'Complete End-to-End Feature Implementation',
  'Debug a production API error',
  'Design a database schema for an e-commerce system',
  'Review and refactor legacy code for readability',
  'Write unit tests for a given module',
  'Resolve a customer escalation under time pressure',
  'Prioritise a backlog of feature requests',
  'Write a technical post-mortem report',
  'Onboard a new team member using provided documentation',
  'Optimise a slow SQL query',
  'Create a deployment pipeline using CI/CD',
  'Respond to a security incident and document findings',
  'Lead a 15-minute standup meeting',
  'Analyse user feedback and propose product improvements',
  'Set up a development environment from scratch',
];

// ── Task title input with live suggestions ────────────────────────────────────
const TaskTitleInput: React.FC<{
  value: string;
  suggestions: string[];
  usedTitles: string[];
  onChange: (v: string) => void;
  hasError: boolean;
}> = ({ value, suggestions, usedTitles, onChange, hasError }) => {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<string[]>([]);
  const [selIdx, setSelIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const debRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleChange = (val: string) => {
    onChange(val);
    setSelIdx(-1);
    clearTimeout(debRef.current);
    if (!val.trim()) { setOpen(false); setMatches([]); return; }
    debRef.current = setTimeout(() => {
      setMatches(
        suggestions
          .filter(s => s.toLowerCase().includes(val.toLowerCase()) && !usedTitles.includes(s))
          .slice(0, 6)
      );
      setOpen(true);
    }, 180);
  };

  const pick = (s: string) => { onChange(s); setOpen(false); setMatches([]); setSelIdx(-1); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, matches.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i - 1, -1)); }
    if (e.key === 'Escape')    { setOpen(false); }
    if (e.key === 'Enter' && selIdx >= 0 && matches[selIdx]) { e.preventDefault(); pick(matches[selIdx]); }
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => { if (value.trim() && matches.length) setOpen(true); }}
          onKeyDown={onKey}
          className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm transition-all focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent ${
            hasError ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
          }`}
          placeholder="Task title…"
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
            <Sparkles size={10} className="text-purple-500" />
            <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Suggestions</span>
          </div>
          {matches.map((m, i) => (
            <div
              key={m}
              onMouseDown={() => pick(m)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                selIdx === i ? 'bg-purple-50 text-purple-800' : 'text-gray-700 hover:bg-purple-50'
              }`}
            >
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TASK_TYPES = [
  'technical', 'behavioral', 'situational',
  'collaborative', 'creative', 'communication', 'prioritization',
] as const;

const LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'csharp', 'cpp',
  'php', 'ruby', 'go', 'rust', 'swift', 'kotlin', 'sql', 'html', 'css', 'bash',
];

const Step3Tasks: React.FC<Props> = ({ simulation, setSimulation, taskSuggestions = [] }) => {
  const allTaskSuggestions = [...new Set([...taskSuggestions, ...STATIC_TASK_TITLES])];
  
  // FIX: Create a map of used titles excluding the current task
  const getUsedTitlesExcept = (currentTaskId: string) => 
    simulation.tasks.filter(t => t.id !== currentTaskId).map(t => t.title);
  
  const updateTask = (taskId: string, updates: Partial<SimulationTask>) =>
    setSimulation(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tasks: prev.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
      };
    });

  const deleteTask = (taskId: string) =>
    setSimulation(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== taskId) } : null);

  const addTask = () => {
    const newTask: SimulationTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: '',
      description: '',
      type: 'technical',
      duration: 15,
      instructions: '',
      resources: [],
      evaluation: { 
        criteria: [], 
        automatedScoring: false, 
        weight: 10, 
        timeBonus: false, 
        qualityThreshold: 70 
      },
      order: simulation.tasks.length + 1,
    };
    setSimulation(prev => prev ? { ...prev, tasks: [...prev.tasks, newTask] } : null);
  };

  const addCriterion = (taskId: string) => {
    const task = simulation.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const criterion: EvaluationCriterion = {
      id: `criterion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: '',
      description: '',
      type: 'scale',
      options: ['Poor', 'Fair', 'Good', 'Excellent'],
      required: true,
      weight: 25,
    };
    updateTask(taskId, { 
      evaluation: { 
        ...task.evaluation, 
        criteria: [...(task.evaluation?.criteria || []), criterion] 
      } 
    });
  };

  const updateCriterion = (taskId: string, criterionId: string, patch: Partial<EvaluationCriterion>) => {
    const task = simulation.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    updateTask(taskId, {
      evaluation: {
        ...task.evaluation,
        criteria: (task.evaluation?.criteria || []).map(c => 
          c.id === criterionId ? { ...c, ...patch } : c
        ),
      },
    });
  };

  const deleteCriterion = (taskId: string, criterionId: string) => {
    const task = simulation.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    updateTask(taskId, {
      evaluation: {
        ...task.evaluation,
        criteria: (task.evaluation?.criteria || []).filter(c => c.id !== criterionId),
      },
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Tasks & Scenarios</h3>
          <p className="text-sm text-gray-500 mt-0.5">Build the assessment activities candidates will complete.</p>
        </div>
        <button
          onClick={addTask}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm"
        >
          <Plus size={16} />
          Add Task
        </button>
      </div>

      {simulation.tasks.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Puzzle size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">No tasks yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">Add tasks to create a comprehensive assessment experience.</p>
          <button
            onClick={addTask}
            className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Add First Task
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {simulation.tasks.map((task, index) => (
            <div key={task.id} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Task header */}
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">
                    Task {index + 1}
                  </span>
                  <select
                    value={task.type}
                    onChange={e => updateTask(task.id, { type: e.target.value as SimulationTask['type'] })}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-purple-500"
                  >
                    {TASK_TYPES.map(t => (
                      <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Task Title <span className="text-red-400">*</span>
                    </label>
                    <TaskTitleInput
                      value={task.title || ''}
                      suggestions={allTaskSuggestions}
                      usedTitles={getUsedTitlesExcept(task.id)}
                      onChange={v => updateTask(task.id, { title: v })}
                      hasError={!task.title?.trim()}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Duration (minutes)</label>
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={task.duration || 15}
                      onChange={e => updateTask(task.id, { duration: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Description <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={task.description || ''}
                    onChange={e => updateTask(task.id, { description: e.target.value })}
                    rows={2}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none ${
                      !task.description?.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                    placeholder="What does the candidate need to accomplish?"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Instructions</label>
                  <textarea
                    value={task.instructions || ''}
                    onChange={e => updateTask(task.id, { instructions: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    placeholder="Detailed step-by-step instructions for the candidate…"
                  />
                </div>

                {/* ── Code Task Configuration ── */}
                {task.type === 'technical' && (
                  <div className="rounded-xl overflow-hidden border border-blue-200">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600">
                      <Code size={14} className="text-white" />
                      <h4 className="text-sm font-semibold text-white">Code Task Configuration</h4>
                    </div>
                    <div className="p-4 bg-blue-50 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-blue-800 mb-1.5">Project Type</label>
                          <select
                            value={task.data?.projectType || 'single_file'}
                            onChange={e => updateTask(task.id, { data: { ...(task.data || {}), projectType: e.target.value } })}
                            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                          >
                            <option value="single_file">Single File</option>
                            <option value="multi_file">Multi-File Project</option>
                            <option value="full_project">Full Project</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-800 mb-1.5">Language</label>
                          <select
                            value={task.data?.language || 'javascript'}
                            onChange={e => updateTask(task.id, { data: { ...(task.data || {}), language: e.target.value } })}
                            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                          >
                            {LANGUAGES.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-blue-800 mb-1.5">Code Mode</label>
                          <select
                            value={task.data?.codeMode || 'starter_code'}
                            onChange={e => updateTask(task.id, { data: { ...(task.data || {}), codeMode: e.target.value } })}
                            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                          >
                            <option value="starter_code">Provide Starter Code</option>
                            <option value="candidate_creates">Candidate Creates From Scratch</option>
                          </select>
                        </div>
                      </div>
                      {task.data?.codeMode !== 'candidate_creates' && (
                        <div>
                          <label className="block text-xs font-semibold text-blue-800 mb-1.5">Starter Code</label>
                          <textarea
                            value={task.data?.starterCode || ''}
                            onChange={e => updateTask(task.id, { data: { ...(task.data || {}), starterCode: e.target.value } })}
                            rows={5}
                            className="w-full px-3 py-2 border border-blue-200 rounded-xl text-sm font-mono bg-gray-900 text-green-400 focus:ring-2 focus:ring-blue-400 resize-none placeholder:text-gray-600"
                            placeholder="// Paste or type your starter code here…"
                            spellCheck={false}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Evaluation Criteria ── */}
                <div className="rounded-xl overflow-hidden border border-gray-200">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600">
                    <h4 className="text-sm font-semibold text-white">Evaluation Criteria</h4>
                    <button
                      onClick={() => addCriterion(task.id)}
                      className="text-xs font-semibold text-purple-200 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors"
                    >
                      + Add Criterion
                    </button>
                  </div>
                  {!task.evaluation?.criteria || task.evaluation.criteria.length === 0 ? (
                    <div className="p-6 text-center bg-purple-50">
                      <p className="text-xs text-purple-400">No criteria yet — add one to define how this task is scored.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {task.evaluation.criteria.map((criterion, ci) => {
                        const totalWeight = (task.evaluation?.criteria || []).reduce((s, c) => s + (c.weight || 0), 0);
                        return (
                          <div key={criterion.id} className="p-4 bg-white hover:bg-gray-50 transition-colors">
                            <div className="flex items-start gap-3">
                              {/* Index badge */}
                              <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                {ci + 1}
                              </div>
                              <div className="flex-1 space-y-2">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                  <input
                                    type="text"
                                    value={criterion.name || ''}
                                    onChange={e => updateCriterion(task.id, criterion.id, { name: e.target.value })}
                                    className={`col-span-1 md:col-span-2 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent ${!criterion.name?.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                    placeholder="Criterion name (e.g. Code quality)…"
                                  />
                                  <select
                                    value={criterion.type || 'scale'}
                                    onChange={e => updateCriterion(task.id, criterion.id, { type: e.target.value as EvaluationCriterion['type'] })}
                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-400"
                                  >
                                    <option value="scale">Scale (1–5)</option>
                                    <option value="boolean">Yes / No</option>
                                    <option value="text">Text answer</option>
                                    <option value="multiple_choice">Multiple choice</option>
                                  </select>
                                </div>
                                <textarea
                                  value={criterion.description || ''}
                                  onChange={e => updateCriterion(task.id, criterion.id, { description: e.target.value })}
                                  rows={1}
                                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 resize-none"
                                  placeholder="What does this criterion measure?"
                                />
                                {/* Weight row */}
                                <div className="flex items-center gap-3">
                                  <label className="text-xs font-medium text-gray-500 shrink-0">Weight</label>
                                  <input
                                    type="range" min={0} max={100}
                                    value={criterion.weight ?? 25}
                                    onChange={e => updateCriterion(task.id, criterion.id, { weight: Number(e.target.value) })}
                                    className="flex-1 accent-purple-600"
                                  />
                                  <div className="flex items-center gap-1 shrink-0">
                                    <input
                                      type="number" min={0} max={100}
                                      value={criterion.weight ?? 25}
                                      onChange={e => updateCriterion(task.id, criterion.id, { weight: Number(e.target.value) })}
                                      className="w-14 text-center px-1.5 py-1 border border-gray-200 rounded-lg text-sm font-bold text-purple-700 focus:ring-2 focus:ring-purple-400"
                                    />
                                    <span className="text-xs text-gray-400">%</span>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => deleteCriterion(task.id, criterion.id)}
                                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Weight total indicator */}
                  {task.evaluation?.criteria && task.evaluation.criteria.length > 0 && (() => {
                    const total = task.evaluation.criteria.reduce((s, c) => s + (c.weight || 0), 0);
                    return (
                      <div className={`px-4 py-2 text-xs font-semibold flex items-center justify-between ${total === 100 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        <span>Total weight: {total}%</span>
                        {total !== 100 && <span>Adjust weights to reach 100%</span>}
                        {total === 100 && <span>✓ Balanced</span>}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Step3Tasks;