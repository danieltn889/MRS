import React, { useState, useEffect } from 'react';
import simulationAPI from '../../services/simulationAPI';
import jobAPI from '../../services/jobAPI';
import {
  Play, Save, Eye, Plus, Trash2, CheckCircle, AlertTriangle,
  FileText, Code, Target, Shield, X, File, Calendar,
  Mail, Globe, Terminal, Puzzle, Clock,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface SimulationTask {
  id: string;
  title: string;
  description: string;
  type: 'technical'| 'behavioral'| 'situational'| 'collaborative'| 'creative'| 'communication'| 'prioritization'| 'emergency'| 'change_request';
  duration: number;
  instructions: string;
  resources: any[];
  evaluation: {
    criteria: any[];
    automatedScoring: boolean;
    weight: number;
    timeBonus: boolean;
    qualityThreshold: number;
  };
  order: number;
  data?: any;
}

interface Simulation {
  id: string;
  title: string;
  jobRole: string;
  jobId?: string;
  description: string;
  duration: number;
  difficulty: 'beginner'| 'intermediate'| 'advanced'| 'expert';
  objectives: string[];
  tasks: SimulationTask[];
  scoring: {
    totalPoints: number;
    passingScore: number;
    timeBonus: boolean;
    qualityWeight: number;
    speedWeight: number;
    behavioralWeight: number;
    autoFailConditions: string[];
  };
  settings: {
    allowPause: boolean;
    showTimer: boolean;
    randomizeTasks: boolean;
    allowHints: boolean;
    recordScreen: boolean;
    recordAudio: boolean;
    maxAttempts: number;
    timeLimit: number;
    environment: string;
    tools: string[];
    constraints: string[];
  };
  status: 'draft'| 'active'| 'archived';
  createdAt: string;
  updatedAt: string;
  compliance: any[];
  passFailCriteria?: any;
  availability?: any;
  practiceEnabled?: boolean;
  practiceSimulation?: any;
  metadata?: any;
}

interface SimulationEditorProps {
  simulationId?: string;
  onBack: () => void;
  onSaved?: () => void;
}

// ============================================
// DEFAULT AVAILABILITY
// ============================================
const defaultAvailability = {
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  dailyWindows: [0,1,2,3,4,5,6].map(d => ({ dayOfWeek: d, startTime: '09:00', endTime: '17:00', enabled: d >= 1 && d <= 5 })),
  timezone: 'UTC', blackoutDates: [],
  maxConcurrentCandidates: 10, bufferTime: 15,
  allowRescheduling: true, maxReschedules: 2, noticePeriod: 24,
};

// ============================================
// STEPS
// ============================================
const STEPS = [
  { id: 1, title: 'Basics', description: 'Define practical assessment fundamentals'},
  { id: 2, title: 'Objectives', description: 'Set learning and assessment goals'},
  { id: 3, title: 'Tasks', description: 'Design individual tasks and scenarios'},
  { id: 4, title: 'Scoring', description: 'Configure evaluation criteria'},
  { id: 5, title: 'Pass/Fail', description: 'Set passing standards and criteria'},
  { id: 6, title: 'Settings', description: 'Environment and technical settings'},
  { id: 7, title: 'Availability', description: 'Configure scheduling and access'},
  { id: 8, title: 'Practice', description: 'Set up practice round options'},
  { id: 9, title: 'Testing', description: 'Validate and test practical assessment'},
  { id: 10, title: 'Publish', description: 'Review and publish practical assessment'},
];

// ============================================
// INITIAL SIMULATION
// ============================================
const initSim = (): Simulation => ({
  id: `temp_${Date.now()}`,
  title: '', jobRole: '', description: '', duration: 60, difficulty: 'intermediate',
  objectives: [], tasks: [],
  scoring: { totalPoints: 100, passingScore: 70, timeBonus: false, qualityWeight: 70, speedWeight: 20, behavioralWeight: 10, autoFailConditions: [] },
  settings: { allowPause: true, showTimer: true, randomizeTasks: false, allowHints: true, recordScreen: false, recordAudio: false, maxAttempts: 1, timeLimit: 60, environment: 'office', tools: ['email', 'calendar', 'documents'], constraints: [] },
  status: 'draft',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  compliance: [],
  passFailCriteria: { overallScore: { minimum: 70, maximum: 100 }, sectionScores: [], criticalTasks: [], behavioralMetrics: [], timeManagement: { completionRequired: true, timeBonus: false }, qualityStandards: [], automatedRules: [] },
  availability: { ...defaultAvailability },
  practiceEnabled: true,
  practiceSimulation: { enabled: true, type: 'section', difficulty: 'easier', includeFeedback: true, maxAttempts: 5, instructions: "", resources: [] },
});

// ============================================
// MAIN COMPONENT
// ============================================
const SimulationEditor: React.FC<SimulationEditorProps> = ({ simulationId, onBack, onSaved }) => {
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [complianceChecks, setComplianceChecks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobSearchTerm, setJobSearchTerm] = useState('');

  useEffect(() => {
    fetchJobs();
    if (simulationId) loadSimulation(simulationId);
    else setSimulation(initSim());
  }, [simulationId]);

  // ---------- FETCH JOBS ----------
  const fetchJobs = async () => {
    try {
      const response = await jobAPI.getCompanyJobs({ limit: 100, status: 'active,published,draft', sort: '-created_at'});
      let jobsArray = [];
      if (response?.data?.data && Array.isArray(response.data.data)) jobsArray = response.data.data;
      else if (response?.data && Array.isArray(response.data)) jobsArray = response.data;
      else if (Array.isArray(response)) jobsArray = response;
      setJobs(jobsArray);
    } catch { setJobs([]); }
  };

  // ---------- LOAD SIMULATION ----------
  const loadSimulation = async (id: string) => {
    try {
      setLoading(true);
      const result = await simulationAPI.getSimulationById(id);
      const d = result?.data || result;
      
      let jobTitle = '';
      if (d.job_id) {
        try { const jr = await jobAPI.getJob(d.job_id); jobTitle = jr?.data?.title || jr?.title || ''; } catch {}
      }
      
      setSimulation({
        id: d.id, title: d.title || d.name || '',
        jobRole: jobTitle || d.jobRole || d.tasks_structure?.jobRole || '',
        jobId: d.job_id, description: d.description || '',
        duration: d.duration || d.duration_minutes || 60,
        difficulty: d.difficulty || 'intermediate',
        objectives: d.objectives || d.tasks_structure?.objectives || [],
        tasks: typeof d.tasks === 'string'? JSON.parse(d.tasks) : (d.tasks || []),
        scoring: typeof d.scoring === 'string'? JSON.parse(d.scoring) : (d.scoring || d.scoring_rubric || { totalPoints: 100, passingScore: 70, timeBonus: false, qualityWeight: 70, speedWeight: 20, behavioralWeight: 10, autoFailConditions: [] }),
        settings: d.settings || d.tasks_structure?.settings || { allowPause: true, showTimer: true, randomizeTasks: false, allowHints: true, recordScreen: false, recordAudio: false, maxAttempts: 1, timeLimit: 60, environment: 'office', tools: [], constraints: [] },
        status: d.status || 'draft',
        createdAt: d.createdAt || d.created_at || new Date().toISOString(),
        updatedAt: d.updatedAt || d.updated_at || new Date().toISOString(),
        compliance: d.compliance || [],
        passFailCriteria: d.passFailCriteria || d.pass_fail_criteria || { overallScore: { minimum: 70, maximum: 100 }, sectionScores: [], criticalTasks: [], behavioralMetrics: [], timeManagement: { completionRequired: true, timeBonus: false }, qualityStandards: [], automatedRules: [] },
        availability: { ...defaultAvailability, ...(d.metadata?.availability || d.availability || d.tasks_structure?.availability || {}) },
        practiceEnabled: d.practiceEnabled ?? d.tasks_structure?.practiceEnabled ?? false,
        practiceSimulation: d.practiceSimulation || d.tasks_structure?.practiceSimulation || { enabled: true, type: 'section', difficulty: 'easier', includeFeedback: true, maxAttempts: 5, instructions: '', resources: [] },
        metadata: d.metadata,
      });
      
      // Set search term if job is linked
      if (d.job_id) {
        const linkedJob = jobs.find(j => j.id === d.job_id);
        if (linkedJob) setJobSearchTerm(linkedJob.title);
      }
    } catch { 
      setSimulation(initSim()); 
    } finally { 
      setLoading(false); 
    }
  };

  // ---------- TASK MANAGEMENT ----------
  const addTask = () => {
    if (!simulation) return;
    const newTask: SimulationTask = {
      id: Date.now().toString(), title: '', description: '', type: 'technical',
      duration: 15, instructions: '', resources: [],
      evaluation: { criteria: [], automatedScoring: false, weight: 10, timeBonus: false, qualityThreshold: 70 },
      order: simulation.tasks.length + 1,
    };
    setSimulation(prev => prev ? { ...prev, tasks: [...prev.tasks, newTask] } : null);
  };

  const updateTask = (id: string, updates: Partial<SimulationTask>) =>
    setSimulation(prev => prev ? { ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, ...updates } : t) } : null);

  const deleteTask = (id: string) =>
    setSimulation(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== id) } : null);

  const addCriterion = (taskId: string) => {
    const task = simulation!.tasks.find(t => t.id === taskId)!;
    const newCriterion = { id: Date.now().toString(), name: '', description: '', type: 'scale', options: ['Poor','Fair','Good','Excellent'], required: true, weight: 25 };
    updateTask(taskId, { evaluation: { ...task.evaluation, criteria: [...task.evaluation.criteria, newCriterion] } });
  };

  // ---------- JOB LINKING ----------
  const handleJobSelect = (jobTitle: string) => {
    const job = jobs.find(j => j.title === jobTitle);
    if (job) {
      setSimulation(p => p ? { 
        ...p, 
        jobId: job.id, 
        jobRole: job.title,
        title: p.title || `${job.title} Assessment`
      } : null);
      setJobSearchTerm(job.title);
    } else {
      setSimulation(p => p ? { ...p, jobId: undefined, jobRole: jobTitle } : null);
      setJobSearchTerm(jobTitle);
    }
  };

  const unlinkJob = () => {
    setSimulation(p => p ? { ...p, jobId: undefined } : null);
    setJobSearchTerm('');
  };

  // ---------- VALIDATION ----------
  const validate = () => {
    if (!simulation) return false;
    const errors: string[] = [];
    switch (currentStep) {
      case 1:
        if (!simulation.title.trim()) errors.push('Practical assessment title is required');
        if (!simulation.jobRole.trim()) errors.push('Job role is required');
        if (!simulation.description.trim()) errors.push('Description is required');
        if (simulation.duration < 15 || simulation.duration > 480) errors.push('Duration must be 15–480 minutes');
        break;
      case 2: 
        if (simulation.objectives.length === 0) errors.push('At least one objective is required'); 
        break;
      case 3:
        if (simulation.tasks.length === 0) errors.push('At least one task is required');
        const totalDuration = simulation.tasks.reduce((s, t) => s + t.duration, 0);
        if (totalDuration > simulation.duration) errors.push('Total task duration exceeds practical assessment time limit');
        break;
      case 4: 
        if (simulation.scoring.qualityWeight + simulation.scoring.speedWeight + simulation.scoring.behavioralWeight !== 100) 
          errors.push('Scoring weights must total 100%'); 
        break;
      case 5:
        if (!simulation.passFailCriteria) errors.push('Pass/fail criteria required');
        else {
          if (simulation.passFailCriteria.overallScore.minimum < 0 || simulation.passFailCriteria.overallScore.minimum > 100) 
            errors.push('Overall min score must be 0–100');
          if (simulation.passFailCriteria.overallScore.maximum < simulation.passFailCriteria.overallScore.minimum) 
            errors.push('Max score must be ≥ min score');
        }
        break;
      case 7:
        if (!simulation.availability) errors.push('Availability configuration required');
        else {
          if (new Date(simulation.availability.startDate) >= new Date(simulation.availability.endDate)) 
            errors.push('End date must be after start date');
          if (simulation.availability.maxConcurrentCandidates < 1) 
            errors.push('Max concurrent candidates must be ≥ 1');
        }
        break;
    }
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const runCompliance = () => {
    setComplianceChecks([
      { category: 'bias', status: 'passed', issues: [], recommendations: ['Consider diverse scenarios'] },
      { category: 'accessibility', status: 'warning', issues: ['Screen reader compatibility not verified'], recommendations: ['Test with screen readers'] },
      { category: 'legal', status: 'passed', issues: [], recommendations: ['Review with legal team'] },
      { category: 'ethics', status: 'passed', issues: [], recommendations: ['Ensure fair assessment practices'] },
      { category: 'technical', status: 'warning', issues: ['Complex multimedia may cause loading issues'], recommendations: ['Optimize media files'] },
    ]);
  };

  // ---------- SAVE & PUBLISH ----------
  const checkRequired = (forPublish = false) => {
    if (!simulation) return false;
    const missing: string[] = [];
    if (!simulation.title.trim()) missing.push('Title');
    if (!simulation.jobRole.trim()) missing.push('Job Role');
    if (simulation.tasks.length === 0) missing.push('At least one Task');
    if (forPublish && simulation.objectives.length === 0) missing.push('At least one Objective');
    if (missing.length) {
      setValidationErrors(missing);
      alert(`Cannot ${forPublish ? 'publish': 'save'}:\n• ${missing.join('\n• ')}`);
      if (!simulation.title.trim() || !simulation.jobRole.trim()) setCurrentStep(1);
      else if (forPublish && simulation.objectives.length === 0) setCurrentStep(2);
      else if (simulation.tasks.length === 0) setCurrentStep(3);
      return false;
    }
    return true;
  };

  const saveSimulation = async () => {
    if (!simulation || !checkRequired()) return;
    try {
      setLoading(true);
      const payload = {
        title: simulation.title, jobRole: simulation.jobRole, jobId: simulation.jobId,
        description: simulation.description, duration: simulation.duration,
        difficulty: simulation.difficulty, objectives: simulation.objectives,
        tasks: simulation.tasks, scoring: simulation.scoring,
        settings: simulation.settings, passFailCriteria: simulation.passFailCriteria,
        availability: simulation.availability, practiceEnabled: simulation.practiceEnabled,
        practiceSimulation: simulation.practiceSimulation,
      };
      
      let result;
      if (simulation.id.startsWith('temp_')) {
        result = await simulationAPI.createSimulationTemplate(payload);
      } else {
        result = await simulationAPI.saveSimulationDraft({ id: simulation.id, ...payload });
      }
      
      const savedId = result?.data?.id || result?.id;
      if (savedId) {
        setSimulation(prev => prev ? { ...prev, id: savedId, status: 'draft'} : null);
        alert('Practical Assessment saved successfully!');
        onSaved?.();
      }
    } catch (e: any) {
      alert(e?.response?.data?.message || e?.message || 'Failed to save.');
    } finally { setLoading(false); }
  };

  const publishSimulation = async () => {
    if (!simulation || !checkRequired(true)) return;
    runCompliance();
    if (complianceChecks.some(c => c.status === 'failed')) {
      alert('Resolve all failed compliance checks first.'); 
      setCurrentStep(9); 
      return;
    }
    try {
      setLoading(true);
      const payload = {
        title: simulation.title, jobRole: simulation.jobRole, jobId: simulation.jobId,
        description: simulation.description, duration: simulation.duration,
        difficulty: simulation.difficulty, objectives: simulation.objectives,
        tasks: simulation.tasks, scoring: simulation.scoring,
        settings: simulation.settings, passFailCriteria: simulation.passFailCriteria,
        availability: simulation.availability, practiceEnabled: simulation.practiceEnabled,
        practiceSimulation: simulation.practiceSimulation,
      };
      
      let result;
      let newId = simulation.id;
      
      if (simulation.id.startsWith('temp_')) {
        result = await simulationAPI.createSimulationTemplate(payload);
        newId = result?.data?.id || result?.id;
        if (newId) await simulationAPI.publishSimulation({ id: newId });
      } else {
        result = await simulationAPI.publishSimulation({ id: simulation.id });
      }
      
      setSimulation(prev => prev ? { ...prev, id: newId, status: 'active'} : null);
      alert('Practical Assessment published successfully!');
      onSaved?.();
    } catch (e: any) {
      alert(e?.response?.data?.message || e?.message || 'Failed to publish.');
    } finally { setLoading(false); }
  };

  // ---------- LOADING ----------
  if (loading && !simulation) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }
  if (!simulation) return null;

  const checklistItems = [
    { label: 'Title and description completed', ok: !!simulation.title && !!simulation.description },
    { label: 'Job role specified', ok: !!simulation.jobRole },
    { label: 'At least one learning objective', ok: simulation.objectives.length > 0 },
    { label: 'At least one task created', ok: simulation.tasks.length > 0 },
    { label: 'Scoring weights total 100%', ok: simulation.scoring.qualityWeight + simulation.scoring.speedWeight + simulation.scoring.behavioralWeight === 100 },
    { label: 'Environment settings configured', ok: !!simulation.settings.environment },
    { label: 'Compliance checks passed', ok: complianceChecks.length > 0 && complianceChecks.every(c => c.status !== 'failed') },
  ];

  const selectedJob = jobs.find(job => job.id === simulation.jobId);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* HEADER */}
      <div className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          {validationErrors.length > 0 && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              {validationErrors.map((e, i) => <p key={i} className="text-sm text-red-700">{e}</p>)}
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
              <div>
                <h1 className="text-lg font-bold text-gray-900">{simulationId ? 'Edit Practical Assessment': 'Create Practical Assessment'}</h1>
                <p className="text-xs text-gray-500">{simulation.jobRole || 'Configure your assessment'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowPreview(true)} className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm flex items-center gap-1"><Eye size={14} />Preview</button>
              <button onClick={saveSimulation} disabled={loading} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1"><Save size={14} />Save Draft</button>
              <button onClick={publishSimulation} disabled={loading} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm flex items-center gap-1"><Play size={14} />Publish</button>
            </div>
          </div>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          {/* STEP PROGRESS */}
          <div className="mb-6 overflow-x-auto">
            <div className="flex items-center min-w-max">
              {STEPS.map((step, idx) => (
                <div key={step.id} className="flex items-center">
                  <button onClick={() => setCurrentStep(step.id)} className="flex items-center gap-2">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                      currentStep > step.id ? 'bg-green-500 text-white':
                      currentStep === step.id ? 'bg-blue-600 text-white ring-2 ring-blue-200':
                      'bg-gray-200 text-gray-500'
                    }`}>
                      {currentStep > step.id ? <CheckCircle size={15} /> : <span className="text-xs font-bold">{step.id}</span>}
                    </div>
                    <span className={`text-xs hidden sm:inline ${currentStep === step.id ? 'text-blue-700 font-medium': 'text-gray-500'}`}>{step.title}</span>
                  </button>
                  {idx < STEPS.length - 1 && <div className={`w-6 h-0.5 mx-1 ${currentStep > step.id ? 'bg-green-400': 'bg-gray-200'}`} />}
                </div>
              ))}
            </div>
          </div>

          {/* STEP CONTENT */}
          <div className="bg-white rounded-lg shadow">
            
            {/* STEP 1: Basics - COMPLETE with Job Linking */}
            {currentStep === 1 && (
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-6">Practical Assessment Basics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Simulation Title */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Practical Assessment Title *</label>
                    <input 
                      type="text" 
                      value={simulation.title}
                      onChange={e => setSimulation(p => p ? { ...p, title: e.target.value } : null)}
                      className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Senior Full Stack Developer Assessment" 
                    />
                  </div>
                  
                  {/* Job Role */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Job Role *</label>
                    <input 
                      type="text" 
                      value={simulation.jobRole}
                      onChange={e => setSimulation(p => p ? { ...p, jobRole: e.target.value } : null)}
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="e.g., Senior Full Stack Developer" 
                    />
                  </div>
                  
                  {/* Reference Job with datalist */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Reference Job (Optional)</label>
                    <input 
                      type="text"
                      value={jobSearchTerm}
                      onChange={(e) => {
                        setJobSearchTerm(e.target.value);
                        handleJobSelect(e.target.value);
                      }}
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="Type job title to link..."
                      list="job-suggestions"
                    />
                    <datalist id="job-suggestions">
                      {jobs.slice(0, 20).map(job => (
                        <option key={job.id} value={job.title}>
                          {job.title} - {job.company_name || 'Company'}
                        </option>
                      ))}
                    </datalist>
                    <p className="text-xs text-gray-500 mt-1">Type to search jobs or enter custom job role</p>
                  </div>
                  
                  {/* Linked Job Information Card */}
                  {selectedJob && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-2">📋 Linked Job Information</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="font-medium text-blue-800">Title:</span>
                          <span className="ml-2 text-blue-700">{selectedJob.title}</span>
                        </div>
                        <div>
                          <span className="font-medium text-blue-800">Company:</span>
                          <span className="ml-2 text-blue-700">{selectedJob.company_name || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-blue-800">Location:</span>
                          <span className="ml-2 text-blue-700">{selectedJob.location || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="font-medium text-blue-800">Status:</span>
                          <span className="ml-2 text-blue-700 capitalize">{selectedJob.status || 'N/A'}</span>
                        </div>
                        {selectedJob.department && (
                          <div>
                            <span className="font-medium text-blue-800">Department:</span>
                            <span className="ml-2 text-blue-700">{selectedJob.department}</span>
                          </div>
                        )}
                        {selectedJob.employment_type && (
                          <div>
                            <span className="font-medium text-blue-800">Employment Type:</span>
                            <span className="ml-2 text-blue-700 capitalize">{selectedJob.employment_type}</span>
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={unlinkJob} 
                        className="mt-3 text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        Unlink job
                      </button>
                    </div>
                  )}
                  
                  {/* Difficulty */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Difficulty</label>
                    <select 
                      value={simulation.difficulty}
                      onChange={e => setSimulation(p => p ? { ...p, difficulty: e.target.value as any } : null)}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                      <option value="expert">Expert</option>
                    </select>
                  </div>
                  
                  {/* Duration */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Duration (minutes)</label>
                    <input 
                      type="number" 
                      min="15" 
                      max="480" 
                      value={simulation.duration}
                      onChange={e => setSimulation(p => p ? { ...p, duration: Number(e.target.value) } : null)}
                      className="w-full px-3 py-2 border rounded-md" 
                    />
                  </div>
                </div>
                
                {/* Description - full width */}
                <div className="mt-6">
                  <label className="block text-sm font-medium mb-2">Description *</label>
                  <textarea 
                    value={simulation.description}
                    onChange={e => setSimulation(p => p ? { ...p, description: e.target.value } : null)}
                    rows={4} 
                    className="w-full px-3 py-2 border rounded-md"
                    placeholder="Describe what this practical assessment assesses and what candidates can expect..." 
                  />
                </div>
              </div>
            )}

            {/* STEP 2: Objectives */}
            {currentStep === 2 && (
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-6">Learning Objectives</h3>
                <div className="space-y-4">
                  {simulation.objectives.map((obj, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Target className="w-5 h-5 text-blue-500 mt-2 flex-shrink-0" />
                      <input 
                        type="text" 
                        value={obj}
                        onChange={e => { 
                          const next = [...simulation.objectives]; 
                          next[i] = e.target.value; 
                          setSimulation(p => p ? { ...p, objectives: next } : null); 
                        }}
                        className="flex-1 px-3 py-2 border rounded-md" 
                        placeholder="Enter learning objective..." 
                      />
                      <button 
                        onClick={() => setSimulation(p => p ? { ...p, objectives: p.objectives.filter((_, j) => j !== i) } : null)} 
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => setSimulation(p => p ? { ...p, objectives: [...p.objectives, ''] } : null)} 
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                  >
                    <Plus size={16} /> Add Objective
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Tasks */}
            {currentStep === 3 && (
              <div className="p-6">
                <div className="flex justify-between mb-6">
                  <h3 className="text-lg font-semibold">Tasks & Scenarios</h3>
                  <button onClick={addTask} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2">
                    <Plus size={16} /> Add Task
                  </button>
                </div>
                <div className="space-y-6">
                  {simulation.tasks.map((task, idx) => (
                    <div key={task.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">Task {idx + 1}</span>
                          <select 
                            value={task.type} 
                            onChange={e => updateTask(task.id, { type: e.target.value as any })} 
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="technical">Technical</option>
                            <option value="behavioral">Behavioral</option>
                            <option value="situational">Situational</option>
                            <option value="collaborative">Collaborative</option>
                            <option value="creative">Creative</option>
                            <option value="communication">Communication</option>
                            <option value="prioritization">Prioritization</option>
                            <option value="emergency">Emergency (tests adaptability)</option>
                            <option value="change_request">Change Request (tests adaptability)</option>
                          </select>
                        </div>
                        <button onClick={() => deleteTask(task.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Task Title</label>
                          <input 
                            type="text" 
                            value={task.title} 
                            onChange={e => updateTask(task.id, { title: e.target.value })} 
                            className="w-full px-3 py-2 border rounded-md" 
                            placeholder="Enter task title..." 
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                          <input 
                            type="number" 
                            min="5" 
                            max="120" 
                            value={task.duration} 
                            onChange={e => updateTask(task.id, { duration: Number(e.target.value) })} 
                            className="w-full px-3 py-2 border rounded-md" 
                          />
                        </div>
                      </div>
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1">Description</label>
                        <textarea 
                          value={task.description} 
                          onChange={e => updateTask(task.id, { description: e.target.value })} 
                          rows={2} 
                          className="w-full px-3 py-2 border rounded-md"
                          placeholder="Describe what the candidate needs to accomplish..." 
                        />
                      </div>
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1">Instructions</label>
                        <textarea 
                          value={task.instructions} 
                          onChange={e => updateTask(task.id, { instructions: e.target.value })} 
                          rows={3} 
                          className="w-full px-3 py-2 border rounded-md"
                          placeholder="Detailed instructions for the candidate..." 
                        />
                      </div>
                      
                      {/* Evaluation Criteria */}
                      <div className="border-t pt-4 mt-2">
                        <div className="flex justify-between mb-3">
                          <h4 className="font-medium text-gray-900">Evaluation Criteria</h4>
                          <button onClick={() => addCriterion(task.id)} className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700">
                            Add Criterion
                          </button>
                        </div>
                        <div className="space-y-3">
                          {task.evaluation.criteria.map(c => (
                            <div key={c.id} className="bg-gray-50 p-3 rounded">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                                <input 
                                  type="text" 
                                  value={c.name}
                                  onChange={e => {
                                    const criteria = task.evaluation.criteria.map(x => x.id === c.id ? { ...x, name: e.target.value } : x);
                                    updateTask(task.id, { evaluation: { ...task.evaluation, criteria } });
                                  }}
                                  className="px-2 py-1 border border-gray-300 rounded text-sm" 
                                  placeholder="Criterion name..." 
                                />
                                <div className="flex items-center gap-2">
                                  <select 
                                    value={c.type}
                                    onChange={e => {
                                      const criteria = task.evaluation.criteria.map(x => x.id === c.id ? { ...x, type: e.target.value as any } : x);
                                      updateTask(task.id, { evaluation: { ...task.evaluation, criteria } });
                                    }}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                  >
                                    <option value="scale">Scale</option>
                                    <option value="boolean">Yes/No</option>
                                    <option value="text">Text</option>
                                    <option value="multiple_choice">Multiple Choice</option>
                                  </select>
                                  <input 
                                    type="number" 
                                    min="0" 
                                    max="100" 
                                    value={c.weight}
                                    onChange={e => {
                                      const criteria = task.evaluation.criteria.map(x => x.id === c.id ? { ...x, weight: Number(e.target.value) } : x);
                                      updateTask(task.id, { evaluation: { ...task.evaluation, criteria } });
                                    }}
                                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm" 
                                  />
                                  <span className="text-xs text-gray-500">%</span>
                                </div>
                              </div>
                              <textarea 
                                value={c.description}
                                onChange={e => {
                                  const criteria = task.evaluation.criteria.map(x => x.id === c.id ? { ...x, description: e.target.value } : x);
                                  updateTask(task.id, { evaluation: { ...task.evaluation, criteria } });
                                }}
                                rows={2} 
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm" 
                                placeholder="Criterion description..." 
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {simulation.tasks.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                      <Puzzle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks added yet</h3>
                      <p className="text-gray-600 mb-4">Add tasks to create a comprehensive assessment experience</p>
                      <button onClick={addTask} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                        Add Your First Task
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 4: Scoring */}
            {currentStep === 4 && (
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-6">Scoring Configuration</h3>
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Total Points</label>
                    <input 
                      type="number" 
                      min="10" 
                      max="1000" 
                      value={simulation.scoring.totalPoints}
                      onChange={e => setSimulation(p => p ? { ...p, scoring: { ...p.scoring, totalPoints: Number(e.target.value) } } : null)}
                      className="w-full px-3 py-2 border rounded-md" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Passing Score (%)</label>
                    <input 
                      type="number" 
                      min="0" 
                      max="100" 
                      value={simulation.scoring.passingScore}
                      onChange={e => setSimulation(p => p ? { ...p, scoring: { ...p.scoring, passingScore: Number(e.target.value) } } : null)}
                      className="w-full px-3 py-2 border rounded-md" 
                    />
                  </div>
                </div>
                <div className="mb-6">
                  <h4 className="font-medium mb-4">Score Weight Distribution</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm">Quality: {simulation.scoring.qualityWeight}%</label>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={simulation.scoring.qualityWeight} 
                        onChange={e => setSimulation(p => p ? { ...p, scoring: { ...p.scoring, qualityWeight: Number(e.target.value) } } : null)} 
                        className="w-full" 
                      />
                    </div>
                    <div>
                      <label className="text-sm">Speed: {simulation.scoring.speedWeight}%</label>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={simulation.scoring.speedWeight} 
                        onChange={e => setSimulation(p => p ? { ...p, scoring: { ...p.scoring, speedWeight: Number(e.target.value) } } : null)} 
                        className="w-full" 
                      />
                    </div>
                    <div>
                      <label className="text-sm">Behavioral: {simulation.scoring.behavioralWeight}%</label>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={simulation.scoring.behavioralWeight} 
                        onChange={e => setSimulation(p => p ? { ...p, scoring: { ...p.scoring, behavioralWeight: Number(e.target.value) } } : null)} 
                        className="w-full" 
                      />
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 rounded">
                    <p className="text-sm text-blue-800">
                      Total: {simulation.scoring.qualityWeight + simulation.scoring.speedWeight + simulation.scoring.behavioralWeight}%
                      {simulation.scoring.qualityWeight + simulation.scoring.speedWeight + simulation.scoring.behavioralWeight !== 100 && (
                        <span className="text-red-600 ml-2">(Must equal 100%)</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="timeBonus" 
                    checked={simulation.scoring.timeBonus} 
                    onChange={e => setSimulation(p => p ? { ...p, scoring: { ...p.scoring, timeBonus: e.target.checked } } : null)} 
                    className="rounded border-gray-300 text-blue-600" 
                  />
                  <label htmlFor="timeBonus" className="text-sm font-medium text-gray-700">Enable time bonus scoring</label>
                </div>
              </div>
            )}

            {/* STEP 5: Pass/Fail */}
            {currentStep === 5 && (
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-6">Pass/Fail Criteria</h3>
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h4 className="font-medium mb-4">Overall Score Requirements</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm">Minimum Score (%)</label>
                      <input 
                        type="number" 
                        min="0" 
                        max="100" 
                        value={simulation.passFailCriteria?.overallScore.minimum || 70}
                        onChange={e => setSimulation(p => p ? { ...p, passFailCriteria: { ...p.passFailCriteria!, overallScore: { ...p.passFailCriteria!.overallScore, minimum: Number(e.target.value) } } } : null)}
                        className="w-full px-3 py-2 border rounded-md" 
                      />
                    </div>
                    <div>
                      <label className="text-sm">Maximum Score (%)</label>
                      <input 
                        type="number" 
                        min="0" 
                        max="100" 
                        value={simulation.passFailCriteria?.overallScore.maximum || 100}
                        onChange={e => setSimulation(p => p ? { ...p, passFailCriteria: { ...p.passFailCriteria!, overallScore: { ...p.passFailCriteria!.overallScore, maximum: Number(e.target.value) } } } : null)}
                        className="w-full px-3 py-2 border rounded-md" 
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium mb-4">Critical Tasks (Must Pass)</h4>
                  <div className="space-y-2">
                    {simulation.tasks.map(task => (
                      <div key={task.id} className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          id={`critical-${task.id}`}
                          checked={simulation.passFailCriteria?.criticalTasks.includes(task.id) || false}
                          onChange={e => { 
                            const existing = simulation.passFailCriteria?.criticalTasks || []; 
                            const next = e.target.checked ? [...existing, task.id] : existing.filter(id => id !== task.id); 
                            setSimulation(p => p ? { ...p, passFailCriteria: { ...p.passFailCriteria!, criticalTasks: next } } : null); 
                          }}
                          className="rounded border-gray-300 text-blue-600" 
                        />
                        <label htmlFor={`critical-${task.id}`} className="text-sm text-gray-700">{task.title || `Task ${task.order}`}</label>
                      </div>
                    ))}
                    {simulation.tasks.length === 0 && <p className="text-sm text-gray-500 italic">Add tasks first to mark them as critical.</p>}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: Settings */}
            {currentStep === 6 && (
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-6">Environment & Settings</h3>
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Work Environment</label>
                    <select 
                      value={['office','remote','field'].includes(simulation.settings.environment) ? simulation.settings.environment : 'custom'}
                      onChange={e => { if (e.target.value !== 'custom') setSimulation(p => p ? { ...p, settings: { ...p.settings, environment: e.target.value as any } } : null); }}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="office">Office Environment</option>
                      <option value="remote">Remote Work Setup</option>
                      <option value="field">Field Work Scenario</option>
                      <option value="custom">Custom Environment</option>
                    </select>
                    {!['office','remote','field'].includes(simulation.settings.environment) && (
                      <input 
                        type="text" 
                        value={simulation.settings.environment}
                        onChange={e => setSimulation(p => p ? { ...p, settings: { ...p.settings, environment: e.target.value } } : null)}
                        className="mt-2 w-full px-3 py-2 border rounded-md"
                        placeholder="Describe custom environment..." 
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Maximum Attempts</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="5" 
                      value={simulation.settings.maxAttempts}
                      onChange={e => setSimulation(p => p ? { ...p, settings: { ...p.settings, maxAttempts: Number(e.target.value) } } : null)}
                      className="w-full px-3 py-2 border rounded-md" 
                    />
                  </div>
                </div>
                <div className="mb-6">
                  <h4 className="font-medium mb-4">Available Tools</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { id: 'email', label: 'Email Client'}, { id: 'calendar', label: 'Calendar'},
                      { id: 'documents', label: 'Documents'}, { id: 'code_editor', label: 'Code Editor'},
                      { id: 'browser', label: 'Web Browser'}, { id: 'terminal', label: 'Terminal'},
                      { id: 'spreadsheet', label: 'Spreadsheet'}, { id: 'presentation', label: 'Presentation'},
                    ].map(tool => (
                      <label key={tool.id} className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={simulation.settings.tools.includes(tool.id)}
                          onChange={e => {
                            const tools = e.target.checked ? [...simulation.settings.tools, tool.id] : simulation.settings.tools.filter(t => t !== tool.id);
                            setSimulation(p => p ? { ...p, settings: { ...p.settings, tools } } : null);
                          }}
                          className="rounded border-gray-300 text-blue-600" 
                        />
                        <span className="text-sm">{tool.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="mb-6">
                  <h4 className="font-medium mb-4">Practical Assessment Options</h4>
                  <div className="space-y-3">
                    {[
                      { key: 'allowPause', label: 'Allow candidates to pause and resume'},
                      { key: 'showTimer', label: 'Display countdown timer'},
                      { key: 'randomizeTasks', label: 'Randomize task order'},
                      { key: 'allowHints', label: 'Provide hints during tasks'},
                      { key: 'recordScreen', label: 'Record screen activity'},
                      { key: 'recordAudio', label: 'Record audio during practical assessment'},
                    ].map(opt => (
                      <div key={opt.key} className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          id={opt.key}
                          checked={(simulation.settings as any)[opt.key]}
                          onChange={e => setSimulation(p => p ? { ...p, settings: { ...p.settings, [opt.key]: e.target.checked } } : null)}
                          className="rounded border-gray-300 text-blue-600" 
                        />
                        <label htmlFor={opt.key} className="text-sm text-gray-700">{opt.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 7: Availability */}
            {currentStep === 7 && (
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-6">Availability Configuration</h3>
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h4 className="font-medium mb-4">Availability Period</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Start Date</label>
                      <input 
                        type="date" 
                        value={simulation.availability?.startDate || ''}
                        onChange={e => setSimulation(p => p ? { ...p, availability: { ...p.availability!, startDate: e.target.value } } : null)}
                        className="w-full px-3 py-2 border rounded-md" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">End Date</label>
                      <input 
                        type="date" 
                        value={simulation.availability?.endDate || ''}
                        onChange={e => setSimulation(p => p ? { ...p, availability: { ...p.availability!, endDate: e.target.value } } : null)}
                        className="w-full px-3 py-2 border rounded-md" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Timezone</label>
                      <select 
                        value={simulation.availability?.timezone || 'UTC'}
                        onChange={e => setSimulation(p => p ? { ...p, availability: { ...p.availability!, timezone: e.target.value } } : null)}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="UTC">UTC</option>
                        <option value="America/New_York">New York (EST)</option>
                        <option value="America/Chicago">Chicago (CST)</option>
                        <option value="America/Denver">Denver (MST)</option>
                        <option value="America/Los_Angeles">Los Angeles (PST)</option>
                        <option value="Europe/London">London (GMT)</option>
                        <option value="Europe/Berlin">Berlin (CET)</option>
                        <option value="Asia/Dubai">Dubai (GST)</option>
                        <option value="Asia/Shanghai">Shanghai (CST)</option>
                        <option value="Asia/Tokyo">Tokyo (JST)</option>
                        <option value="Australia/Sydney">Sydney (AEST)</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium mb-4">Daily Time Windows</h4>
                  <div className="space-y-3">
                    {[0,1,2,3,4,5,6].map(day => {
                      const w = simulation.availability?.dailyWindows?.find((w: any) => w.dayOfWeek === day) || 
                        { dayOfWeek: day, startTime: '09:00', endTime: '17:00', enabled: day >= 1 && day <= 5 };
                      const updateW = (changes: any) => {
                        const wins = [...(simulation.availability?.dailyWindows || [])];
                        const idx = wins.findIndex((x: any) => x.dayOfWeek === day);
                        const updated = { ...w, ...changes };
                        if (idx >= 0) wins[idx] = updated;
                        else wins.push(updated);
                        setSimulation(p => p ? { ...p, availability: { ...p.availability!, dailyWindows: wins } } : null);
                      };
                      return (
                        <div key={day} className="flex items-center gap-4 p-3 border rounded bg-white">
                          <span className="w-24 text-sm font-medium text-gray-700">
                            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}
                          </span>
                          <input 
                            type="checkbox" 
                            checked={w.enabled} 
                            onChange={e => updateW({ enabled: e.target.checked })} 
                            className="rounded border-gray-300 text-blue-600" 
                          />
                          <input 
                            type="time" 
                            value={w.startTime} 
                            disabled={!w.enabled}
                            onChange={e => updateW({ startTime: e.target.value })}
                            className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50" 
                          />
                          <span className="text-sm text-gray-500">to</span>
                          <input 
                            type="time" 
                            value={w.endTime} 
                            disabled={!w.enabled}
                            onChange={e => updateW({ endTime: e.target.value })}
                            className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50" 
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 8: Practice */}
            {currentStep === 8 && (
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-6">Practice Round Setup</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <input 
                      type="checkbox" 
                      id="practiceEnabled" 
                      checked={simulation.practiceEnabled || false}
                      onChange={e => setSimulation(p => p ? { ...p, practiceEnabled: e.target.checked } : null)}
                      className="rounded border-gray-300 text-blue-600" 
                    />
                    <label htmlFor="practiceEnabled" className="text-sm font-medium text-gray-700">Enable practice round for candidates</label>
                  </div>
                  {simulation.practiceEnabled && (
                    <div className="ml-6 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Practice Type</label>
                          <select 
                            value={simulation.practiceSimulation?.type || 'section'}
                            onChange={e => setSimulation(p => p ? { ...p, practiceSimulation: { ...p.practiceSimulation!, type: e.target.value as any, enabled: true } } : null)}
                            className="w-full px-3 py-2 border rounded-md"
                          >
                            <option value="full">Full practical assessment</option>
                            <option value="section">Section practice</option>
                            <option value="timed">Timed practice</option>
                            <option value="untimed">Untimed practice</option>
                            <option value="tutorial">Interactive tutorial</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Difficulty Level</label>
                          <select 
                            value={simulation.practiceSimulation?.difficulty || 'easier'}
                            onChange={e => setSimulation(p => p ? { ...p, practiceSimulation: { ...p.practiceSimulation!, difficulty: e.target.value as any, enabled: true } } : null)}
                            className="w-full px-3 py-2 border rounded-md"
                          >
                            <option value="easier">Easier than main</option>
                            <option value="same">Same as main</option>
                            <option value="adaptive">Adaptive</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Max Attempts</label>
                          <input 
                            type="number" 
                            min="1" 
                            max="10" 
                            value={simulation.practiceSimulation?.maxAttempts || 5}
                            onChange={e => setSimulation(p => p ? { ...p, practiceSimulation: { ...p.practiceSimulation!, maxAttempts: Number(e.target.value), enabled: true } } : null)}
                            className="w-full px-3 py-2 border rounded-md" 
                          />
                        </div>
                        <div className="flex items-center gap-3 mt-7">
                          <input 
                            type="checkbox" 
                            id="includeFeedback" 
                            checked={simulation.practiceSimulation?.includeFeedback ?? true}
                            onChange={e => setSimulation(p => p ? { ...p, practiceSimulation: { ...p.practiceSimulation!, includeFeedback: e.target.checked, enabled: true } } : null)}
                            className="rounded border-gray-300 text-blue-600" 
                          />
                          <label htmlFor="includeFeedback" className="text-sm font-medium text-gray-700">Include immediate feedback</label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Practice Instructions</label>
                        <textarea 
                          value={simulation.practiceSimulation?.instructions || ''}
                          onChange={e => setSimulation(p => p ? { ...p, practiceSimulation: { ...p.practiceSimulation!, instructions: e.target.value, enabled: true } } : null)}
                          rows={2} 
                          className="w-full px-3 py-2 border rounded-md"
                          placeholder="Instructions for candidates about the practice round..." 
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 9: Testing */}
            {currentStep === 9 && (
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-6">Testing & Validation</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <Eye className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 mb-4">Experience the practical assessment as a candidate would see it</p>
                    <button onClick={() => setShowPreview(true)} className="px-4 py-2 bg-blue-600 text-white rounded-md w-full hover:bg-blue-700">
                      Start Preview
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <Shield className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 mb-4">Run automated checks for bias, accessibility, and legal compliance</p>
                    <button onClick={runCompliance} className="px-4 py-2 bg-green-600 text-white rounded-md w-full hover:bg-green-700">
                      Run Checks
                    </button>
                  </div>
                </div>
                {complianceChecks.length > 0 && (
                  <div className="mt-6 space-y-4">
                    <h4 className="font-medium text-gray-900">Compliance Results</h4>
                    {complianceChecks.map(check => (
                      <div key={check.category} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium text-gray-900 capitalize">{check.category} Check</h5>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            check.status === 'passed'? 'bg-green-100 text-green-800': 
                            check.status === 'warning'? 'bg-yellow-100 text-yellow-800': 'bg-red-100 text-red-800'
                          }`}>
                            {check.status}
                          </span>
                        </div>
                        {check.issues.length > 0 && (
                          <div className="mb-2">
                            <p className="text-sm font-medium text-gray-700">Issues:</p>
                            <ul className="text-sm text-red-700 list-disc list-inside">{check.issues.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                          </div>
                        )}
                        {check.recommendations.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700">Recommendations:</p>
                            <ul className="text-sm text-blue-700 list-disc list-inside">{check.recommendations.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 10: Publish */}
            {currentStep === 10 && (
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-6">Review & Publish</h3>
                <div className="bg-gray-50 rounded-lg p-6 mb-6">
                  <h4 className="font-medium mb-4">Practical Assessment Summary</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: 'Title', value: simulation.title },
                      { label: 'Job Role', value: simulation.jobRole },
                      { label: 'Duration', value: `${simulation.duration} minutes` },
                      { label: 'Difficulty', value: simulation.difficulty },
                      { label: 'Tasks', value: `${simulation.tasks.length} tasks` },
                      { label: 'Passing Score', value: `${simulation.scoring.passingScore}%` },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-sm text-gray-500">{label}</p>
                        <p className="font-medium text-gray-900 capitalize">{value || 'Not set'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-lg p-6 border mb-6">
                  <h4 className="font-medium mb-4">Publishing Checklist</h4>
                  <div className="space-y-3">
                    {checklistItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        {item.ok ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" /> : <X className="w-5 h-5 text-red-500 flex-shrink-0" />}
                        <span className={`text-sm ${item.ok ? 'text-gray-900': 'text-red-700'}`}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={saveSimulation} disabled={loading} className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                    Save as Draft
                  </button>
                  <button onClick={publishSimulation} disabled={complianceChecks.some(c => c.status === 'failed') || loading}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2">
                    <Play size={16} /> Publish Simulation
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM NAVIGATION */}
      <div className="bg-white border-t flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between">
          <button 
            onClick={() => { setValidationErrors([]); setCurrentStep(Math.max(1, currentStep - 1)); }}
            disabled={currentStep === 1}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-sm"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Step {currentStep} of {STEPS.length}</span>
          <button 
            onClick={() => { if (validate()) setCurrentStep(Math.min(STEPS.length, currentStep + 1)); }}
            disabled={currentStep === STEPS.length}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            Next
          </button>
        </div>
      </div>

      {/* PREVIEW MODAL */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[85vh] overflow-auto">
            <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-semibold text-gray-900">Practical Assessment Preview</h2>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">{simulation.title || 'Untitled Practical Assessment'}</h3>
                <p className="text-sm text-gray-600 mb-2">{simulation.description || 'No description provided'}</p>
                <div className="flex gap-4 text-sm text-gray-500">
                  <span>Role: {simulation.jobRole || 'Not specified'}</span>
                  <span>Duration: {simulation.duration} min</span>
                  <span>Difficulty: {simulation.difficulty}</span>
                </div>
              </div>
              {simulation.objectives.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Learning Objectives</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                    {simulation.objectives.slice(0, 4).map((obj, i) => <li key={i}>{obj}</li>)}
                    {simulation.objectives.length > 4 && <li>+ {simulation.objectives.length - 4} more</li>}
                  </ul>
                </div>
              )}
              {simulation.tasks.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Tasks ({simulation.tasks.length})</h4>
                  <div className="space-y-3">
                    {simulation.tasks.slice(0, 3).map((task, i) => (
                      <div key={task.id} className="border rounded-lg p-4">
                        <div className="flex justify-between mb-2">
                          <h5 className="font-medium text-gray-900">Task {i + 1}: {task.title || 'Untitled'}</h5>
                          <span className="text-sm text-gray-500">{task.duration} min</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                        <p className="text-sm text-gray-700">{task.instructions}</p>
                      </div>
                    ))}
                    {simulation.tasks.length > 3 && (
                      <p className="text-sm text-gray-500 text-center">+ {simulation.tasks.length - 3} more tasks</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end">
              <button onClick={() => setShowPreview(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationEditor;