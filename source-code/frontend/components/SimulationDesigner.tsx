import React, { useState, useEffect } from 'react';
import { Eye, Save, CheckCircle, ChevronLeft, AlertCircle, X, Briefcase, Clock, Layers, Target, Play, FileCheck } from 'lucide-react';

import simulationAPI from '../services/simulationAPI';
import jobAPI from '../services/jobAPI';

import {
  Simulation,
  ComplianceCheck,
  SimulationTask,
  STEPS,
  defaultAvailability,
  DailyWindow,
} from './types/simulationTypes';

// ── Step components ──────────────────────────────────────────────────────────
import Step1Basics       from './steps/Step1Basics';
import Step2Objectives   from './steps/Step2Objectives';
import Step3Tasks        from './steps/Step3Tasks';
import Step4Scoring      from './steps/Step4Scoring';
import Step5PassFail     from './steps/Step5PassFail';
import Step6Settings     from './steps/Step6Settings';
import Step7Availability from './steps/Step7Availability';
import Step8Practice     from './steps/Step8Practice';
import Step10Publish     from './steps/Step10Publish';

// ── Shared components ────────────────────────────────────────────────────────
import SimulationPreviewModal from './Simulation/SimulationPreviewModal';

// ── Standalone list (imported, NOT inlined) ─────────────────────────────────
import SimulationList from './Simulation/SimulationList';

// ─────────────────────────────────────────────────────────────────────────────

interface SimulationDesignerProps {
  onBack: () => void;
  simulationId?: string;
}

// ─── Save / Publish Success Modal ────────────────────────────────────────────

interface SaveResult {
  action: 'draft' | 'published';
  simulation: Simulation;
}

const SaveSuccessModal: React.FC<{ result: SaveResult; onClose: () => void; onBackToList: () => void }> = ({
  result, onClose, onBackToList,
}) => {
  const { action, simulation: sim } = result;
  const isDraft = action === 'draft';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Colour header */}
        <div className={`px-6 py-5 ${isDraft ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : 'bg-gradient-to-r from-green-500 to-emerald-600'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              {isDraft ? <Save size={20} className="text-white" /> : <Play size={20} className="text-white" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {isDraft ? 'Draft Saved!' : 'Simulation Published!'}
              </h3>
              <p className="text-xs text-white/80">
                {isDraft ? 'Your simulation has been saved as a draft.' : 'Your simulation is now live for candidates.'}
              </p>
            </div>
          </div>
        </div>

        {/* Simulation summary */}
        <div className="px-6 py-5 space-y-3">
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
            <FileCheck size={18} className={isDraft ? 'text-blue-500 shrink-0 mt-0.5' : 'text-green-500 shrink-0 mt-0.5'} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{sim.title || 'Untitled Simulation'}</p>
              {sim.jobRole && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Briefcase size={11} /> {sim.jobRole}
                </p>
              )}
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${isDraft ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
              {isDraft ? 'Draft' : 'Published'}
            </span>
          </div>

          {/* Key stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Clock,  label: 'Duration',   value: `${sim.duration} min` },
              { icon: Layers, label: 'Tasks',       value: `${sim.tasks.length}` },
              { icon: Target, label: 'Pass score',  value: `${sim.scoring?.passingScore ?? '—'}%` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="text-center bg-gray-50 rounded-xl py-3 px-2">
                <Icon size={15} className="mx-auto text-gray-400 mb-1" />
                <p className="text-sm font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-400">{label}</p>
              </div>
            ))}
          </div>

          {/* Objectives count */}
          {sim.objectives.filter(o => o?.trim()).length > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
              <CheckCircle size={13} className="text-green-500" />
              {sim.objectives.filter(o => o?.trim()).length} learning objective{sim.objectives.filter(o => o?.trim()).length !== 1 ? 's' : ''} defined
            </div>
          )}
          {sim.jobId && (
            <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
              <CheckCircle size={13} className="text-green-500" />
              Linked to job
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
          >
            Keep Editing
          </button>
          <button
            onClick={onBackToList}
            className={`flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-xl transition-all shadow-sm ${
              isDraft
                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
            }`}
          >
            Go to List
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const SimulationDesigner: React.FC<SimulationDesignerProps> = ({ onBack, simulationId }) => {
  const [simulation, setSimulation]         = useState<Simulation | null>(null);
  const [currentStep, setCurrentStep]       = useState(1);
  const [showPreview, setShowPreview]       = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>([]);
  const [loading, setLoading]               = useState(false);
  const [jobs, setJobs]                     = useState<any[]>([]);

  // ── view mode: 'list' shows SimulationList, 'edit' shows the stepper ────────
  const [viewMode, setViewMode]             = useState<'list' | 'edit'>(simulationId ? 'edit' : 'list');
  const [editingId, setEditingId]           = useState<string | undefined>(simulationId);
  const [objectiveSuggestions, setObjectiveSuggestions] = useState<string[]>([]);

  // Auto-calculate the simulation duration from the SUM of all task durations
  // (each task contributes its own minutes). Keeps duration in sync whenever any
  // task's duration changes; only overrides once at least one task has a duration.
  const taskDurationSignature = (simulation?.tasks || []).map((t: any) => t?.duration).join(',');
  useEffect(() => {
    if (!simulation) return;
    const total = (simulation.tasks || []).reduce((sum: number, t: any) => sum + (Number(t?.duration) || 0), 0);
    if (total > 0 && total !== simulation.duration) {
      setSimulation(prev => (prev ? { ...prev, duration: total } : prev));
    }
  }, [taskDurationSignature]);
  const [taskSuggestions,      setTaskSuggestions]      = useState<string[]>([]);
  const [saveResult,           setSaveResult]           = useState<SaveResult | null>(null);
  const [visitedSteps,         setVisitedSteps]         = useState<Set<number>>(new Set([1]));

  // ── bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchJobs();
    fetchSuggestions();
    if (simulationId) {
      setViewMode('edit');
      loadSimulation(simulationId);
    }
  }, [simulationId]);

  // ✅ FIXED: fetchSuggestions - API returns { objectives: [], taskTitles: [] } directly
  const fetchSuggestions = async () => {
    try {
      const result = await simulationAPI.getSuggestions();
      // The API returns { objectives: [], taskTitles: [] } directly
      if (result?.objectives?.length) setObjectiveSuggestions(result.objectives);
      if (result?.taskTitles?.length) setTaskSuggestions(result.taskTitles);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      // use static fallbacks in step components
    }
  };

  // ── helpers ───────────────────────────────────────────────────────────────

  const initializeNew = () => {
    setSimulation({
      id: Date.now().toString(),
      title: '', jobRole: '', description: '',
      duration: 60, difficulty: 'intermediate',
      objectives: [], tasks: [],
      scoring: { totalPoints: 100, passingScore: 70, timeBonus: false, qualityWeight: 70, speedWeight: 20, behavioralWeight: 10, autoFailConditions: [] },
      settings: { allowPause: true, showTimer: true, randomizeTasks: false, allowHints: true, recordScreen: false, recordAudio: false, maxAttempts: 1, timeLimit: 60, environment: 'office', tools: ['email', 'calendar', 'documents'], constraints: [] },
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      compliance: [],
      passFailCriteria: { overallScore: { minimum: 70, maximum: 100 }, sectionScores: [], criticalTasks: [], behavioralMetrics: [], timeManagement: { completionRequired: true, timeBonus: false }, qualityStandards: [], automatedRules: [] },
      availability: { ...defaultAvailability },
      practiceEnabled: true,
      practiceSimulation: { enabled: true, type: 'section', difficulty: 'easier', includeFeedback: true, maxAttempts: 5, instructions: "This practice simulation will help you understand the format and types of tasks you'll encounter.", resources: [] },
    });
  };

  const fetchJobs = async () => {
    try {
      const response = await jobAPI.getCompanyJobs({ limit: 50, status: 'active,published,draft', sort: '-created_at' });
      let arr: any[] = [];
      if (response?.data?.data && Array.isArray(response.data.data))         arr = response.data.data;
      else if (response?.data && Array.isArray(response.data))               arr = response.data;
      else if (response?.data?.jobs && Array.isArray(response.data.jobs))    arr = response.data.jobs;
      else if (Array.isArray(response))                                       arr = response;
      setJobs(arr);
    } catch { 
      setJobs([]); 
    }
  };

  const loadSimulation = async (id: string) => {
    try {
      setLoading(true);
      const result = await simulationAPI.getSimulationById(id);
      const data = result?.data || result;

      let jobTitle = '';
      if (data.job_id) {
        try {
          const jr = await jobAPI.getJob(data.job_id);
          jobTitle = jr?.data?.title || jr?.title || '';
        } catch { 
          /* ignore */ 
        }
      }

      const availabilityFromAPI =
        data.metadata?.availability ||
        data.availability ||
        data.tasks_structure?.availability ||
        null;

      const loaded: Simulation = {
        id: data.id,
        title:       data.title || data.name || '',
        jobRole:     jobTitle || data.jobRole || data.tasks_structure?.jobRole || '',
        jobId:       data.job_id || undefined,
        description: data.description || '',
        duration:    data.duration || data.duration_minutes || 60,
        difficulty:  data.difficulty || 'intermediate',
        objectives:  data.objectives || data.tasks_structure?.objectives || [],
        tasks:       typeof data.tasks === 'string' ? JSON.parse(data.tasks) : (data.tasks || []),
        scoring:     typeof data.scoring === 'string' ? JSON.parse(data.scoring) : (data.scoring || data.scoring_rubric || { totalPoints: 100, passingScore: 70, timeBonus: false, qualityWeight: 70, speedWeight: 20, behavioralWeight: 10, autoFailConditions: [] }),
        settings:    data.settings || data.tasks_structure?.settings || { allowPause: true, showTimer: true, randomizeTasks: false, allowHints: true, recordScreen: false, recordAudio: false, maxAttempts: 1, timeLimit: 60, environment: 'office', tools: [], constraints: [] },
        status:      data.status || 'draft',
        createdAt:   data.createdAt || data.created_at || new Date().toISOString(),
        updatedAt:   data.updatedAt || data.updated_at || new Date().toISOString(),
        compliance:  data.compliance || data.tasks_structure?.compliance || [],
        passFailCriteria: data.passFailCriteria || data.pass_fail_criteria || { overallScore: { minimum: 70, maximum: 100 }, sectionScores: [], criticalTasks: [], behavioralMetrics: [], timeManagement: { completionRequired: true, timeBonus: false }, qualityStandards: [], automatedRules: [] },
        availability: availabilityFromAPI
          ? {
              ...defaultAvailability,
              ...availabilityFromAPI,
              dailyWindows: [0, 1, 2, 3, 4, 5, 6].map(day => {
                const saved = (availabilityFromAPI.dailyWindows || []).find((w: DailyWindow) => w.dayOfWeek === day);
                return saved || defaultAvailability.dailyWindows.find(w => w.dayOfWeek === day)!;
              }),
            }
          : { ...defaultAvailability },
        practiceEnabled:    data.practiceEnabled ?? data.tasks_structure?.practiceEnabled ?? false,
        practiceSimulation: data.practiceSimulation || data.tasks_structure?.practiceSimulation || { enabled: true, type: 'section', difficulty: 'easier', includeFeedback: true, maxAttempts: 5, instructions: '', resources: [] },
        metadata:    data.metadata,
      };

      setSimulation(loaded);
    } catch (error) {
      console.error('Error loading simulation:', error);
      initializeNew();
    } finally {
      setLoading(false);
    }
  };

  // ── validation ────────────────────────────────────────────────────────────

  const getStepErrors = (sim: typeof simulation, step: number): string[] => {
    if (!sim) return [];
    const errors: string[] = [];
    switch (step) {
      case 1:
        if (!sim.jobId?.trim())              errors.push('A linked job is required');
        if (!(sim.title ?? '').trim())       errors.push('Simulation title is required');
        if (!(sim.jobRole ?? '').trim())     errors.push('Job role is required');
        if (!(sim.description ?? '').trim()) errors.push('Description is required');
        if ((sim.duration ?? 0) < 15)        errors.push('Duration must be at least 15 minutes');
        if ((sim.duration ?? 0) > 480)       errors.push('Duration cannot exceed 480 minutes');
        break;
      case 2:
        if (sim.objectives.length === 0)
          errors.push('Add at least one learning objective');
        else if (sim.objectives.some(o => !o?.trim()))
          errors.push('All objectives must have text');
        break;
      case 3:
        if (sim.tasks.length === 0)
          errors.push('Add at least one task');
        else {
          if (sim.tasks.some(t => !t.title?.trim()))
            errors.push('Every task must have a title');
          if (sim.tasks.some(t => !t.description?.trim()))
            errors.push('Every task must have a description');
        }
        break;
      case 4:
        if (sim.scoring.qualityWeight + sim.scoring.speedWeight + sim.scoring.behavioralWeight !== 100)
          errors.push('Scoring weights must total exactly 100%');
        if (sim.scoring.passingScore < 1 || sim.scoring.passingScore > 100)
          errors.push('Passing score must be between 1% and 100%');
        break;
      case 5:
        if (!sim.passFailCriteria)
          errors.push('Pass/fail criteria must be configured');
        else if ((sim.passFailCriteria.overallScore?.minimum ?? 0) < 0 ||
                 (sim.passFailCriteria.overallScore?.minimum ?? 0) > 100)
          errors.push('Minimum score must be between 0 and 100');
        break;
      case 6: {
        const tl = sim.settings?.timeLimit ?? 0;
        const totalTaskTime = sim.tasks.reduce((s, t) => s + (t.duration || 0), 0);
        if (tl > 0 && tl < totalTaskTime)
          errors.push(`Time limit (${tl} min) must be ≥ total task duration (${totalTaskTime} min)`);
        break;
      }
      case 7:
        if (!sim.availability)
          errors.push('Availability configuration is required');
        else if (new Date(sim.availability.startDate) >= new Date(sim.availability.endDate))
          errors.push('End date must be after start date');
        break;
    }
    return errors;
  };

  const validateCurrentStep = (): boolean => {
    if (!simulation) return false;
    const errors = getStepErrors(simulation, currentStep);
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const isStepComplete = (stepId: number): boolean =>
    simulation ? getStepErrors(simulation, stepId).length === 0 : false;

  const canNavigateTo = (targetStep: number): boolean => {
    if (!simulation) return false;
    // Allow navigating to any already-completed step or the next one
    for (let s = 1; s < targetStep; s++) {
      const requiredSteps = [1, 2, 3, 4, 5]; // steps that must be valid before proceeding
      if (requiredSteps.includes(s) && !isStepComplete(s)) return false;
    }
    return true;
  };

  // ── API actions ───────────────────────────────────────────────────────────

  const runComplianceChecks = () => {
    setComplianceChecks([
      { category: 'bias',          status: 'passed',  issues: [], recommendations: ['Consider diverse scenarios in task design'] },
      { category: 'accessibility', status: 'warning', issues: ['Screen reader compatibility not verified'], recommendations: ['Test with screen readers', 'Ensure keyboard navigation works'] },
      { category: 'legal',         status: 'passed',  issues: [], recommendations: ['Review with legal team before publishing'] },
      { category: 'ethics',        status: 'passed',  issues: [], recommendations: ['Ensure fair assessment practices'] },
      { category: 'technical',     status: 'warning', issues: ['Complex multimedia may cause loading issues'], recommendations: ['Optimize media files', 'Test on various devices'] },
    ]);
  };

  const withMetadata = (sim: Simulation) => ({
    ...sim,
    metadata: { ...sim.metadata, availability: sim.availability },
  });

  const saveSimulation = async () => {
    if (!simulation) return;
    // Step 1 must always be valid before saving
    const step1Errors = getStepErrors(simulation, 1);
    if (step1Errors.length > 0) {
      setValidationErrors(['Fix step 1 errors before saving: ' + step1Errors.join(' · ')]);
      setCurrentStep(1);
      return;
    }
    try {
      setLoading(true);
      setValidationErrors([]);
      const payload = withMetadata(simulation);
      const result = await simulationAPI.saveSimulationDraft(payload);
      const savedId = result?.data?.id || result?.data?.data?.id || result?.id;
      const updated = { ...simulation, id: savedId || simulation.id, status: 'draft' as const };
      setSimulation(updated);
      setValidationErrors([]);
      setSaveResult({ action: 'draft', simulation: updated });
    } catch (error: any) {
      const msg = error?.message || 'Failed to save simulation.';
      setValidationErrors([`Save failed: ${msg}`]);
    } finally {
      setLoading(false);
    }
  };

  const publishSimulation = async () => {
    if (!simulation) return;
    // Validate all required steps before publishing
    const requiredSteps = [1, 2, 3, 4, 5];
    const allErrors: string[] = [];
    requiredSteps.forEach(s => {
      const errs = getStepErrors(simulation, s);
      if (errs.length > 0) allErrors.push(...errs);
    });
    if (allErrors.length > 0) {
      setValidationErrors(allErrors);
      // Navigate to first failing step
      const firstFail = requiredSteps.find(s => getStepErrors(simulation, s).length > 0) ?? 1;
      setCurrentStep(firstFail);
      return;
    }
    try {
      setLoading(true);
      setValidationErrors([]);
      const payload = withMetadata(simulation);
      const result = await simulationAPI.publishSimulation(payload);
      const savedId = result?.data?.id || result?.data?.data?.id || result?.id;
      const updated = { ...simulation, id: savedId || simulation.id, status: 'published' as const };
      setSimulation(updated);
      setSaveResult({ action: 'published', simulation: updated });
    } catch (error: any) {
      setValidationErrors([`Publish failed: ${error?.message || 'Unknown error'}`]);
    } finally {
      setLoading(false);
    }
  };

  const duplicateSimulation = async () => {
    if (!simulation || String(simulation.id).match(/^\d{13}$/)) {
      alert('Save the simulation before duplicating.');
      return;
    }
    try {
      setLoading(true);
      await simulationAPI.duplicateSimulation(simulation.id);
      alert('Simulation duplicated!');
      handleBackToList();
    } catch (error: any) {
      alert(`Error duplicating: ${error?.message || 'Failed.'}`);
    } finally {
      setLoading(false);
    }
  };

  const archiveSimulation = async () => {
    if (!simulation || !confirm('Archive this simulation?')) return;
    try {
      setLoading(true);
      if (!String(simulation.id).match(/^\d{13}$/)) await simulationAPI.archiveSimulation(simulation.id);
      alert('Simulation archived!');
      handleBackToList();
    } catch (error: any) {
      alert(`Error archiving: ${error?.message || 'Failed.'}`);
    } finally {
      setLoading(false);
    }
  };

  // ── navigation ────────────────────────────────────────────────────────────

  const handleBackToList = () => {
    setViewMode('list');
    setSimulation(null);
    setEditingId(undefined);
    setCurrentStep(1);
    setValidationErrors([]);
    setComplianceChecks([]);
  };

  const handleCreateNew = () => {
    setEditingId(undefined);
    setCurrentStep(1);
    setViewMode('edit');
    setVisitedSteps(new Set([1]));
    initializeNew();
  };

  const handleEditSimulation = (id: string) => {
    setEditingId(id);
    setCurrentStep(1);
    setViewMode('edit');
    setVisitedSteps(new Set(STEPS.map(s => s.id)));  // editing: all steps considered visited
    loadSimulation(id);
  };

  // ─── Render: list view delegates entirely to SimulationList ────────────────

  if (viewMode === 'list') {
    return (
      <SimulationList
        onBack={onBack}
        onEditSimulation={handleEditSimulation}
        onCreateNew={handleCreateNew}
      />
    );
  }

  // ─── Loading spinner ───────────────────────────────────────────────────────

  if (loading && !simulation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading simulation…</p>
        </div>
      </div>
    );
  }

  if (!simulation) return null;

  // ─── Edit view ─────────────────────────────────────────────────────────────

  const stepProps = { simulation, setSimulation };

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1Basics       {...stepProps} jobs={jobs} />;
      case 2: return <Step2Objectives   {...stepProps} suggestions={objectiveSuggestions} />;
      case 3: return <Step3Tasks        {...stepProps} taskSuggestions={taskSuggestions} />;
      case 4: return <Step4Scoring      {...stepProps} />;
      case 5: return <Step5PassFail     {...stepProps} />;
      case 6: return <Step6Settings     {...stepProps} />;
      case 7: return <Step7Availability {...stepProps} />;
      case 8: return <Step8Practice     {...stepProps} />;
      case 9: return (
        <Step10Publish
          simulation={simulation}
          complianceChecks={complianceChecks}
          simulationId={editingId}
          onSave={saveSimulation}
          onPublish={publishSimulation}
          onDuplicate={duplicateSimulation}
          onArchive={archiveSimulation}
        />
      );
      default: return null;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">

      {/* ── Top Header ── */}
      <div className="bg-white border-b border-gray-100 shadow-sm flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          {validationErrors.length > 0 && (
            <div className="mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                {validationErrors.map((e, i) => (
                  <p key={i} className="text-sm text-red-600 font-medium">{e}</p>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={handleBackToList}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
              >
                <ChevronLeft size={16} />
                Back to List
              </button>
              <div className="h-5 w-px bg-gray-200 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent truncate">
                  {editingId ? 'Edit Simulation' : 'Create Simulation'}
                </h1>
                {simulation.jobRole && (
                  <p className="text-xs text-gray-500 truncate">{simulation.jobRole}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <Eye size={15} /> Preview
              </button>
              <button
                onClick={saveSimulation}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm disabled:opacity-50"
              >
                <Save size={15} /> Save Draft
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">

          {/* Step progress bar */}
          <div className="mb-5">
            <div className="overflow-x-auto pb-1">
              <div className="flex items-center min-w-max">
                {STEPS.map((step, index) => {
                  const done      = visitedSteps.has(step.id) && isStepComplete(step.id) && currentStep !== step.id;
                  const active    = currentStep === step.id;
                  const canGo     = canNavigateTo(step.id);
                  return (
                    <React.Fragment key={step.id}>
                      <button
                        onClick={() => {
                          if (!canGo) {
                            setValidationErrors(['Complete the required steps before jumping ahead.']);
                            return;
                          }
                          setValidationErrors([]);
                          setVisitedSteps(prev => new Set(prev).add(currentStep));
                          setCurrentStep(step.id);
                          setVisitedSteps(prev => new Set(prev).add(step.id));
                        }}
                        title={!canGo ? 'Complete required steps first' : step.title}
                        className={`flex items-center gap-2 group focus:outline-none ${!canGo ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 transition-all ${
                          done   ? 'bg-green-500 text-white' :
                          active ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white ring-2 ring-purple-200' :
                                   'bg-gray-200 text-gray-500 group-hover:bg-gray-300'
                        }`}>
                          {done ? <CheckCircle size={13} /> : step.id}
                        </div>
                        <span className={`text-xs font-medium whitespace-nowrap transition-colors ${
                          active ? 'text-purple-700' :
                          done   ? 'text-green-600 hidden sm:inline' :
                                   'text-gray-400 hidden sm:inline'
                        }`}>
                          {step.title}
                        </span>
                      </button>
                      {index < STEPS.length - 1 && (
                        <div className={`w-5 sm:w-8 h-px mx-1 sm:mx-1.5 flex-shrink-0 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Step {currentStep} of {STEPS.length} —{' '}
              <span className="text-gray-600 font-medium">{STEPS[currentStep - 1]?.description}</span>
            </p>
          </div>

          {/* Step content */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            {renderStep()}
          </div>

          <div className="h-4" />
        </div>
      </div>

      {/* ── Sticky bottom nav ── */}
      <div className="bg-white border-t border-gray-100 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              setValidationErrors([]);
              setVisitedSteps(prev => new Set(prev).add(currentStep));
              setCurrentStep(s => Math.max(1, s - 1));
            }}
            disabled={currentStep === 1}
            className="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Previous
          </button>
          <span className="text-xs text-gray-400">{currentStep} / {STEPS.length}</span>
          <button
            onClick={() => {
              if (validateCurrentStep()) {
                setVisitedSteps(prev => new Set(prev).add(currentStep));
                setCurrentStep(s => {
                  const next = Math.min(STEPS[STEPS.length - 1].id, s + 1);
                  setVisitedSteps(p => new Set(p).add(next));
                  return next;
                });
              }
            }}
            disabled={currentStep === STEPS.length}
            className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Next →
          </button>
        </div>
      </div>

      {/* ── Preview modal ── */}
      {showPreview && (
        <SimulationPreviewModal
          simulation={simulation}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* ── Save / Publish success modal ── */}
      {saveResult && (
        <SaveSuccessModal
          result={saveResult}
          onClose={() => setSaveResult(null)}
          onBackToList={() => { setSaveResult(null); handleBackToList(); }}
        />
      )}
    </div>
  );
};

export default SimulationDesigner;