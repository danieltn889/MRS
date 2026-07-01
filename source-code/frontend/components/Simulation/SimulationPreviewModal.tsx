import React, { useState } from 'react';
import {
  X, Briefcase, Clock, Zap, Target, CheckCircle, Award, Brain,
  Code, Settings, Calendar, Users, BookOpen, ChevronDown, ChevronUp,
  Play, Pause, Eye, Shuffle, Lightbulb, Monitor, Mic, Star,
  AlertCircle, Globe, FileText,
} from 'lucide-react';
import { Simulation } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  onClose: () => void;
}

// ── Small helpers ────────────────────────────────────────────────────────────

const Badge = ({ text, color = 'purple' }: { text: string; color?: string }) => {
  const map: Record<string, string> = {
    purple: 'bg-purple-100 text-purple-800',
    blue:   'bg-blue-100   text-blue-800',
    green:  'bg-green-100  text-green-800',
    amber:  'bg-amber-100  text-amber-800',
    indigo: 'bg-indigo-100 text-indigo-800',
    gray:   'bg-gray-100   text-gray-700',
    red:    'bg-red-100    text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${map[color] || map.gray}`}>
      {text}
    </span>
  );
};

const Section = ({ title, icon: Icon, iconColor = 'text-purple-500', children, defaultOpen = true }: {
  title: string; icon: any; iconColor?: string; children: React.ReactNode; defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-gray-800">
          <Icon size={15} className={iconColor} />
          {title}
        </span>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>
      {open && <div className="px-5 py-4">{children}</div>}
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between py-1.5 border-b border-gray-50 last:border-0">
    <span className="text-xs text-gray-500 shrink-0 w-40">{label}</span>
    <span className="text-xs font-medium text-gray-800 text-right">{value}</span>
  </div>
);

const taskTypeColor: Record<string, string> = {
  technical:      'blue',
  behavioral:     'purple',
  situational:    'indigo',
  collaborative:  'green',
  creative:       'amber',
  communication:  'pink',
  prioritization: 'orange',
};

// ── Main component ───────────────────────────────────────────────────────────

const SimulationPreviewModal: React.FC<Props> = ({ simulation, onClose }) => {
  const s = simulation;
  const weightTotal = s.scoring.qualityWeight + s.scoring.speedWeight + s.scoring.behavioralWeight;
  const totalTaskMins = s.tasks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const pfc = s.passFailCriteria;
  const avail = s.availability;
  const practice = s.practiceSimulation;
  const settings = s.settings;

  const fmtDate = (d: any) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* ── Sticky header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white rounded-t-2xl sticky top-0 z-10 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Practical Assessment Preview</h2>
            <p className="text-xs text-gray-500">Everything filled in — candidate-facing view</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* ── Hero card ── */}
          <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-6 text-white">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold mb-1 leading-snug">{s.title || 'Untitled Practical Assessment'}</h3>
                {s.jobRole && (
                  <div className="flex items-center gap-1.5 text-purple-200 text-sm mb-3">
                    <Briefcase size={13} /> {s.jobRole}
                  </div>
                )}
                <p className="text-purple-100 text-sm leading-relaxed">{s.description || '—'}</p>
              </div>
              <div className="text-right shrink-0 space-y-1.5">
                <Badge text={s.status}    color="gray"   />
                <br />
                <Badge text={s.difficulty} color="amber" />
              </div>
            </div>
            <div className="flex flex-wrap gap-5 mt-5 pt-4 border-t border-white/20 text-sm text-purple-100">
              <span className="flex items-center gap-1.5"><Clock size={13} /> {s.duration} min total</span>
              <span className="flex items-center gap-1.5"><Target size={13} /> {s.tasks.length} task{s.tasks.length !== 1 ? 's' : ''}</span>
              <span className="flex items-center gap-1.5"><Users size={13} /> {totalTaskMins} min task time</span>
              {settings?.timeLimit > 0 && <span className="flex items-center gap-1.5"><Clock size={13} /> {settings.timeLimit} min time limit</span>}
              {s.jobId && <span className="flex items-center gap-1.5"><Briefcase size={13} /> Job linked</span>}
            </div>
          </div>

          {/* ── Learning Objectives ── */}
          {s.objectives.filter(o => o?.trim()).length > 0 && (
            <Section title={`Learning Objectives (${s.objectives.filter(o => o?.trim()).length})`} icon={BookOpen} iconColor="text-purple-500">
              <ul className="space-y-2">
                {s.objectives.filter(o => o?.trim()).map((obj, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                    <span className="text-sm text-gray-700">{obj}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* ── Tasks ── */}
          {s.tasks.length > 0 && (
            <Section title={`Tasks & Scenarios (${s.tasks.length})`} icon={FileText} iconColor="text-blue-500">
              <div className="space-y-3">
                {s.tasks.map((task, i) => (
                  <div key={task.id} className="border border-gray-100 rounded-xl overflow-hidden">
                    {/* Task header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <span className="text-sm font-semibold text-gray-800">{task.title || 'Untitled task'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge text={task.type} color={taskTypeColor[task.type] || 'gray'} />
                        <span className="text-xs text-gray-400">{task.duration} min</span>
                      </div>
                    </div>
                    {/* Task body */}
                    <div className="px-4 py-3 space-y-2">
                      {task.description && <p className="text-sm text-gray-600">{task.description}</p>}
                      {task.instructions && (
                        <div className="mt-1 p-3 bg-blue-50 rounded-lg border border-blue-100">
                          <p className="text-xs font-semibold text-blue-700 mb-1">Instructions</p>
                          <p className="text-xs text-gray-700 whitespace-pre-line">{task.instructions}</p>
                        </div>
                      )}
                      {/* Technical config */}
                      {task.type === 'technical' && task.data && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {task.data.language   && <Badge text={task.data.language.toUpperCase()} color="blue" />}
                          {task.data.projectType && <Badge text={task.data.projectType.replace('_', ' ')} color="indigo" />}
                          {task.data.codeMode   && <Badge text={task.data.codeMode.replace('_', ' ')} color="gray" />}
                        </div>
                      )}
                      {/* Evaluation criteria */}
                      {task.evaluation?.criteria?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-gray-500 mb-1.5">Evaluation Criteria</p>
                          <div className="space-y-1">
                            {task.evaluation.criteria.map(c => (
                              <div key={c.id} className="flex items-center justify-between text-xs">
                                <span className="text-gray-600">{c.name || '—'}</span>
                                <span className="text-purple-600 font-medium">{c.weight}% · {c.type}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Scoring ── */}
          <Section title="Scoring Configuration" icon={Award} iconColor="text-amber-500">
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total Points',  value: s.scoring.totalPoints,     icon: Star },
                  { label: 'Passing Score', value: `${s.scoring.passingScore}%`, icon: CheckCircle },
                  { label: 'Time Bonus',    value: s.scoring.timeBonus ? 'Yes' : 'No', icon: Zap },
                  { label: 'Max Attempts',  value: settings?.maxAttempts ?? 1, icon: Users },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <Icon size={16} className="mx-auto text-gray-400 mb-1" />
                    <p className="text-lg font-bold text-gray-900">{value}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>

              {/* Weight bars */}
              <div className="rounded-xl overflow-hidden border border-gray-100">
                <div className="flex h-3">
                  <div className="bg-purple-500 transition-all" style={{ width: `${s.scoring.qualityWeight}%` }} title={`Quality ${s.scoring.qualityWeight}%`} />
                  <div className="bg-blue-500 transition-all"   style={{ width: `${s.scoring.speedWeight}%`    }} title={`Speed ${s.scoring.speedWeight}%`} />
                  <div className="bg-cyan-500 transition-all"   style={{ width: `${s.scoring.behavioralWeight}%` }} title={`Behavioral ${s.scoring.behavioralWeight}%`} />
                  {weightTotal < 100 && <div className="bg-gray-200 flex-1" />}
                </div>
                <div className="flex text-xs divide-x divide-gray-100">
                  <div className="flex-1 px-3 py-1.5 text-center"><span className="text-purple-600 font-semibold">{s.scoring.qualityWeight}%</span> Quality</div>
                  <div className="flex-1 px-3 py-1.5 text-center"><span className="text-blue-600 font-semibold">{s.scoring.speedWeight}%</span> Speed</div>
                  <div className="flex-1 px-3 py-1.5 text-center"><span className="text-cyan-600 font-semibold">{s.scoring.behavioralWeight}%</span> Behavioral</div>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Pass / Fail Criteria ── */}
          {pfc && (
            <Section title="Pass / Fail Criteria" icon={Target} iconColor="text-green-500" defaultOpen={false}>
              <div className="space-y-1">
                <Row label="Minimum Score"        value={`${pfc.overallScore?.minimum ?? '—'}%`} />
                <Row label="Maximum Score"        value={`${pfc.overallScore?.maximum ?? '—'}%`} />
                <Row label="Completion required"  value={pfc.timeManagement?.completionRequired ? 'Yes' : 'No'} />
                {pfc.criticalTasks?.length > 0 && (
                  <Row label="Critical tasks" value={`${pfc.criticalTasks.length} task(s)`} />
                )}
              </div>
            </Section>
          )}

          {/* ── Settings ── */}
          {settings && (
            <Section title="Environment & Settings" icon={Settings} iconColor="text-gray-500" defaultOpen={false}>
              <div className="space-y-1 mb-3">
                <Row label="Environment"    value={<span className="capitalize">{settings.environment || '—'}</span>} />
                <Row label="Max Attempts"   value={settings.maxAttempts} />
                {settings.timeLimit > 0 && <Row label="Time Limit" value={`${settings.timeLimit} min`} />}
              </div>
              {/* Option flags */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[
                  { key: 'allowPause',     label: 'Can pause',       icon: Pause  },
                  { key: 'showTimer',      label: 'Timer shown',     icon: Clock  },
                  { key: 'randomizeTasks', label: 'Tasks randomised',icon: Shuffle },
                  { key: 'allowHints',     label: 'Hints allowed',   icon: Lightbulb },
                  { key: 'recordScreen',   label: 'Screen recorded', icon: Monitor },
                  { key: 'recordAudio',    label: 'Audio recorded',  icon: Mic   },
                ].map(({ key, label, icon: Icon }) => (
                  <div key={key} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${(settings as any)[key] ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                    <Icon size={12} />
                    {label}: <strong>{(settings as any)[key] ? 'Yes' : 'No'}</strong>
                  </div>
                ))}
              </div>
              {/* Tools */}
              {settings.tools?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Available Tools</p>
                  <div className="flex flex-wrap gap-2">
                    {settings.tools.map(t => <Badge key={t} text={t.replace('_', ' ')} color="indigo" />)}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* ── Availability ── */}
          {avail && (
            <Section title="Availability & Scheduling" icon={Calendar} iconColor="text-blue-500" defaultOpen={false}>
              <div className="space-y-1 mb-3">
                <Row label="Start Date"           value={fmtDate(avail.startDate)} />
                <Row label="End Date"             value={fmtDate(avail.endDate)} />
                <Row label="Timezone"             value={avail.timezone || '—'} />
                <Row label="Max concurrent"       value={avail.maxConcurrentCandidates} />
                <Row label="Buffer time"          value={`${avail.bufferTime} min`} />
                <Row label="Allow rescheduling"   value={avail.allowRescheduling ? 'Yes' : 'No'} />
                {avail.allowRescheduling && <Row label="Max reschedules" value={avail.maxReschedules} />}
                <Row label="Notice period"        value={`${avail.noticePeriod} hr`} />
              </div>
              {/* Active day windows */}
              {avail.dailyWindows?.filter(w => w.enabled).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Active Windows</p>
                  <div className="space-y-1">
                    {avail.dailyWindows.filter(w => w.enabled).map(w => {
                      const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][w.dayOfWeek];
                      return (
                        <div key={w.dayOfWeek} className="flex items-center justify-between text-xs bg-blue-50 rounded-lg px-3 py-1.5">
                          <span className="font-medium text-blue-800">{day}</span>
                          <span className="text-blue-600">{w.startTime} – {w.endTime}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* ── Practice Simulation ── */}
          {practice?.enabled && (
            <Section title="Practice Round" icon={Play} iconColor="text-indigo-500" defaultOpen={false}>
              <div className="space-y-1 mb-3">
                <Row label="Type"             value={<span className="capitalize">{practice.type}</span>} />
                <Row label="Difficulty"       value={<span className="capitalize">{practice.difficulty}</span>} />
                <Row label="Max attempts"     value={practice.maxAttempts} />
                <Row label="Includes feedback"value={practice.includeFeedback ? 'Yes' : 'No'} />
                {practice.timeLimit && <Row label="Time limit" value={`${practice.timeLimit} min`} />}
              </div>
              {practice.instructions && (
                <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                  <p className="text-xs text-gray-700 leading-relaxed">{practice.instructions}</p>
                </div>
              )}
            </Section>
          )}

          {/* ── Readiness summary ── */}
          <div className="rounded-xl border border-gray-100 p-4 bg-gray-50">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Readiness at a Glance</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'Title & description',  ok: !!(s.title?.trim() && s.description?.trim()) },
                { label: 'Job linked',           ok: !!s.jobId },
                { label: 'Objectives added',     ok: s.objectives.filter(o => o?.trim()).length > 0 },
                { label: 'Tasks added',          ok: s.tasks.length > 0 },
                { label: 'Tasks have content',   ok: s.tasks.every(t => t.title?.trim() && t.description?.trim()) },
                { label: 'Weights = 100%',       ok: weightTotal === 100 },
              ].map(({ label, ok }) => (
                <div key={label} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg ${ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                  {label}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">
            Close Preview
          </button>
        </div>

      </div>
    </div>
  );
};

export default SimulationPreviewModal;
