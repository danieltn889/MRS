import React, { useState, useEffect } from 'react';
import { 
  Plus, Copy, Trash2, Archive, FileText, Puzzle, Clock, Target, 
  RefreshCw, ChevronRight, Users, Edit, Eye, MoreVertical, CheckCircle, 
  XCircle, AlertCircle, Calendar, BarChart3, Star, GitBranch, Play, 
  Settings, Download, Filter, PauseCircle, AlertTriangle, Clock as ClockIcon,
  MessageCircle
} from 'lucide-react';
import simulationAPI from '../../services/simulationAPI';
import CandidatePerformance from '../CandidatePerformance';

interface Simulation {
  id: string;
  title: string;
  jobRole: string;
  jobId?: string;
  description: string;
  duration: number;
  difficulty: 'beginner'| 'intermediate'| 'advanced'| 'expert';
  objectives: string[];
  tasks: any[];
  scoring: any;
  settings: any;
  status: 'scheduled'| 'in_progress'| 'paused'| 'completed'| 'expired'| 'cancelled'| 'failed'| 'not_started'| null;
  latest_simulation_status: string | null;
  createdAt: string;
  updatedAt: string;
  compliance: any[];
  passFailCriteria?: any;
  availability?: any;
  practiceEnabled?: boolean;
  practiceSimulation?: any;
  metadata?: any;
  company_name?: string;
  logo_url?: string;
  avg_score?: string | number;
  usage_count?: number;
  total_instances?: number;
  is_active?: boolean;
}

interface SimulationListProps {
  onBack: () => void;
  onEditSimulation: (simulationId: string) => void;
  onCreateNew: () => void;
  onOpenChat?: (simulationId: string, simulationTitle: string) => void;
}

const SimulationList: React.FC<SimulationListProps> = ({ onBack, onEditSimulation, onCreateNew, onOpenChat }) => {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all'| 'scheduled'| 'in_progress'| 'paused'| 'completed'| 'expired'| 'cancelled'| 'failed'| 'not_started'>('all');
  const [showAllSimulations, setShowAllSimulations] = useState(false);
  const [selectedSimulation, setSelectedSimulation] = useState<Simulation | null>(null);
  const [showCandidatePerformance, setShowCandidatePerformance] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date'| 'name'| 'score'>('date');

  useEffect(() => {
    fetchSimulations();
  }, []);

  const fetchSimulations = async () => {
    try {
      setLoading(true);
      const response = await simulationAPI.getAllSimulations({ limit: 100, sort: '-updated_at'});
      let simulationsArray = [];
      if (response?.data?.data && Array.isArray(response.data.data)) simulationsArray = response.data.data;
      else if (response?.data && Array.isArray(response.data)) simulationsArray = response.data;
      else if (response?.data?.simulations && Array.isArray(response.data.simulations)) simulationsArray = response.data.simulations;
      else if (Array.isArray(response)) simulationsArray = response;

      const mappedSimulations: Simulation[] = simulationsArray.map((data: any) => ({
        id: data.id,
        title: data.title || data.name || '',
        jobRole: data.jobRole || data.tasks_structure?.jobRole || '',
        jobId: data.job_id || undefined,
        description: data.description || '',
        duration: data.duration || data.duration_minutes || 60,
        difficulty: data.difficulty || 'intermediate',
        objectives: data.objectives || data.tasks_structure?.objectives || [],
        tasks: typeof data.tasks === 'string'? JSON.parse(data.tasks) : (data.tasks || []),
        scoring: typeof data.scoring === 'string'? JSON.parse(data.scoring) : (data.scoring || data.scoring_rubric || {}),
        settings: data.settings || data.tasks_structure?.settings || {
          allowPause: true, showTimer: true, randomizeTasks: false, allowHints: true,
          recordScreen: false, recordAudio: false, maxAttempts: 1, timeLimit: 60,
          environment: 'office', tools: [], constraints: [],
        },
        latest_simulation_status: data.latest_simulation_status || null,
        status: data.latest_simulation_status === null ? 'not_started': (data.latest_simulation_status || 'not_started'),
        createdAt: data.createdAt || data.created_at || new Date().toISOString(),
        updatedAt: data.updatedAt || data.updated_at || new Date().toISOString(),
        compliance: data.compliance || data.tasks_structure?.compliance || [],
        passFailCriteria: data.passFailCriteria || data.pass_fail_criteria || undefined,
        availability: data.metadata?.availability || data.availability || data.tasks_structure?.availability || undefined,
        practiceEnabled: data.practiceEnabled ?? data.tasks_structure?.practiceEnabled ?? false,
        practiceSimulation: data.practiceSimulation || data.tasks_structure?.practiceSimulation || undefined,
        company_name: data.company_name,
        logo_url: data.logo_url,
        avg_score: data.avg_score,
        usage_count: data.usage_count,
        total_instances: data.total_instances,
        is_active: data.is_active,
      }));

      setSimulations(mappedSimulations);
    } catch (error) {
      console.error('Error fetching simulations:', error);
      setSimulations([]);
    } finally {
      setLoading(false);
    }
  };

  const duplicateSimulation = async (simId: string) => {
    try {
      setLoading(true);
      await simulationAPI.duplicateSimulation(simId);
      await fetchSimulations();
      alert('Practical Assessment duplicated successfully!');
    } catch (error: any) {
      alert(` Error duplicating practical assessment: ${error?.message || 'Failed.'}`);
    } finally {
      setLoading(false);
    }
  };

  const archiveSimulation = async (simId: string) => {
    if (!confirm('📦 Archive this practical assessment? It can be restored later.')) return;
    try {
      setLoading(true);
      await simulationAPI.archiveSimulation(simId);
      await fetchSimulations();
      alert('Practical Assessment archived!');
    } catch (error: any) {
      alert(` Error: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteSimulation = async (simId: string) => {
    if (!confirm(' Permanently delete? This cannot be undone.')) return;
    try {
      setLoading(true);
      await simulationAPI.deleteSimulation(simId);
      await fetchSimulations();
      alert('Practical Assessment deleted!');
    } catch (error: any) {
      alert(` Error: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  };

  const viewCandidates = (sim: Simulation) => {
    setSelectedSimulation(sim);
    setShowCandidatePerformance(true);
  };

  const getFilteredSimulations = () => {
    let filtered = simulations.filter(s => {
      // ''FIX: Handle null status by converting to string for comparison
      const simStatus = s.status || 'not_started';
      if (statusFilter !== 'all'&& simStatus !== statusFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return s.title.toLowerCase().includes(term) || 
               s.jobRole.toLowerCase().includes(term) ||
               s.description.toLowerCase().includes(term);
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'date') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sortBy === 'name') return a.title.localeCompare(b.title);
      if (sortBy === 'score') return Number(b.avg_score || 0) - Number(a.avg_score || 0);
      return 0;
    });

    return filtered;
  };

  // ''FIX: Add type safety for status parameter
  const getStatusColor = (status: string | null) => {
    const safeStatus = status || 'not_started';
    switch (safeStatus) {
      case 'scheduled':
      case 'not_started':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in_progress':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'expired':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  // ''FIX: Add type safety for status parameter
  const getStatusIcon = (status: string | null) => {
    const safeStatus = status || 'not_started';
    switch (safeStatus) {
      case 'scheduled':
      case 'not_started':
        return <Calendar size={14} className="text-blue-600" />;
      case 'in_progress':
        return <Play size={14} className="text-purple-600" />;
      case 'paused':
        return <PauseCircle size={14} className="text-yellow-600" />;
      case 'completed':
        return <CheckCircle size={14} className="text-green-600" />;
      case 'expired':
        return <ClockIcon size={14} className="text-gray-500" />;
      case 'cancelled':
        return <XCircle size={14} className="text-red-600" />;
      case 'failed':
        return <AlertCircle size={14} className="text-red-600" />;
      default:
        return <Puzzle size={14} className="text-gray-500" />;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-emerald-100 text-emerald-800';
      case 'intermediate': return 'bg-blue-100 text-blue-800';
      case 'advanced': return 'bg-purple-100 text-purple-800';
      case 'expert': return 'bg-rose-100 text-rose-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score > 0) return 'text-red-600';
    return 'text-gray-400';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const filteredSims = getFilteredSimulations();
  const displaySims = showAllSimulations ? filteredSims : filteredSims.slice(0, 10);
  
  // ''FIX: Handle null status in counts
  const counts = {
    all: simulations.length,
    scheduled: simulations.filter(s => s.status === 'scheduled'|| s.status === 'not_started'|| s.status === null).length,
    in_progress: simulations.filter(s => s.status === 'in_progress').length,
    paused: simulations.filter(s => s.status === 'paused').length,
    completed: simulations.filter(s => s.status === 'completed').length,
    expired: simulations.filter(s => s.status === 'expired').length,
    cancelled: simulations.filter(s => s.status === 'cancelled').length,
    failed: simulations.filter(s => s.status === 'failed').length,
  };

  // Helper function to get display status text
  const getDisplayStatus = (status: string | null) => {
    const safeStatus = status || 'not_started';
    return safeStatus === 'not_started'? 'scheduled': safeStatus.replace('_', '');
  };

  if (showCandidatePerformance && selectedSimulation) {
    return (
      <CandidatePerformance
        simulation={selectedSimulation}
        onBack={() => {
          setShowCandidatePerformance(false);
          setSelectedSimulation(null);
        }}
      />
    );
  }

  if (loading && simulations.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading practical assessments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm mb-1 flex items-center gap-1">
                ← Back to Dashboard
              </button>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                Practical Assessment Management
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">Create and manage candidate assessment practical assessments</p>
            </div>
            <button
              onClick={onCreateNew}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2 font-medium"
            >
              <Plus size={18} />
              <span>Create Practical Assessment</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-600">Filter:</span>
              {(['all', 'scheduled', 'in_progress', 'paused', 'completed', 'expired', 'cancelled', 'failed'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => { setStatusFilter(filter); setShowAllSimulations(false); }}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-all capitalize flex items-center gap-1 ${
                    statusFilter === filter
                      ? filter === 'completed'? 'bg-green-600 text-white shadow-sm'
                        : filter === 'in_progress'? 'bg-purple-600 text-white shadow-sm'
                        : filter === 'paused'? 'bg-yellow-600 text-white shadow-sm'
                        : filter === 'scheduled'? 'bg-blue-600 text-white shadow-sm'
                        : filter === 'expired'? 'bg-gray-600 text-white shadow-sm'
                        : filter === 'cancelled'|| filter === 'failed'? 'bg-red-600 text-white shadow-sm'
                        : 'bg-purple-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {filter === 'scheduled'&& <Calendar size={10} />}
                  {filter === 'in_progress'&& <Play size={10} />}
                  {filter === 'paused'&& <PauseCircle size={10} />}
                  {filter === 'completed'&& <CheckCircle size={10} />}
                  {filter === 'expired'&& <ClockIcon size={10} />}
                  {filter === 'cancelled'&& <XCircle size={10} />}
                  {filter === 'failed'&& <AlertCircle size={10} />}
                  {filter === 'all'&& <Puzzle size={10} />}
                  {filter === 'all'? 'All': filter.replace('_', '')} 
                  <span className="opacity-80 text-[10px]">({counts[filter]})</span>
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-3">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500"
              >
                <option value="date">Sort by Date</option>
                <option value="name">Sort by Name</option>
                <option value="score">Sort by Score</option>
              </select>
              
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search practical assessments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <Filter className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              </div>
              
              <button 
                onClick={fetchSimulations} 
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Simulation Cards - ONE CARD PER LINE */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-12">
        {filteredSims.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <Puzzle className="mx-auto h-16 w-16 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No practical assessments found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? 'No practical assessments match your search.':
               statusFilter !== 'all'? `No ${statusFilter} practical assessments.` : 'Get started by creating your first practical assessment.'}
            </p>
            {statusFilter !== 'all'&& (
              <button onClick={() => setStatusFilter('all')} className="mt-4 text-purple-600 hover:text-purple-700 text-sm">
                View all practical assessments
              </button>
            )}
            {statusFilter === 'all'&& !searchTerm && (
              <button onClick={onCreateNew} className="mt-6 inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                <Plus size={16} className="mr-2" />
                Create New Practical Assessment
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {displaySims.map((sim) => (
                <div
                  key={sim.id}
                  className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-purple-200 transition-all duration-300"
                >
                  {/* ''FIX: Handle null status in status bar */}
                  <div className={`h-1 w-full ${
                    (sim.status === 'completed') ? 'bg-gradient-to-r from-green-400 to-emerald-500':
                    (sim.status === 'in_progress') ? 'bg-gradient-to-r from-purple-400 to-indigo-500':
                    (sim.status === 'scheduled'|| sim.status === 'not_started'|| sim.status === null) ? 'bg-gradient-to-r from-blue-400 to-cyan-500':
                    (sim.status === 'paused') ? 'bg-gradient-to-r from-yellow-400 to-amber-500':
                    (sim.status === 'expired') ? 'bg-gradient-to-r from-gray-400 to-gray-500':
                    (sim.status === 'cancelled'|| sim.status === 'failed') ? 'bg-gradient-to-r from-red-400 to-rose-500':
                    'bg-gradient-to-r from-gray-400 to-gray-500'
                  }`} />

                  <div className="p-5">
                    {/* Header Row */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center bg-gray-100">
                          <Puzzle size={28} className="text-purple-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-xl text-gray-900 group-hover:text-purple-600 transition-colors">
                            {sim.title || 'Untitled Practical Assessment'}
                          </h3>
                          <p className="text-sm text-gray-500 mt-0.5">{sim.jobRole || 'No job role assigned'}</p>
                        </div>
                      </div>
                      <span className={`flex-shrink-0 text-xs px-3 py-1 rounded-full capitalize font-medium border ${getStatusColor(sim.status)}`}>
                        <span className="flex items-center gap-1.5">
                          {getStatusIcon(sim.status)}
                          {getDisplayStatus(sim.status)}
                        </span>
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-gray-600 mb-4 leading-relaxed">
                      {sim.description || 'No description provided for this practical assessment.'}
                    </p>

                    {/* Stats Row */}
                    <div className="flex flex-wrap items-center gap-6 mb-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <Clock size={16} />
                        <span className="font-medium">{sim.duration}</span> minutes
                      </span>
                      <span className="flex items-center gap-1.5">
                        <FileText size={16} />
                        <span className="font-medium">{sim.tasks?.length || 0}</span> tasks
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDifficultyColor(sim.difficulty)}`}>
                        {sim.difficulty.charAt(0).toUpperCase() + sim.difficulty.slice(1)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Target size={16} />
                        <span className="font-medium">{sim.total_instances || 0}</span> candidates taken
                      </span>
                      {sim.avg_score && Number(sim.avg_score) > 0 && (
                        <span className="flex items-center gap-1.5">
                          <Star size={16} className="text-yellow-500" />
                          <span className={`font-bold ${getScoreColor(Number(sim.avg_score))}`}>
                            {Number(sim.avg_score).toFixed(0)}% avg score
                          </span>
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-gray-400 text-xs">
                        <Calendar size={14} />
                        Updated {formatDate(sim.updatedAt)}
                      </span>
                    </div>

                    {/* Action Buttons - WITH CHAT BUTTON ADDED */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => onEditSimulation(sim.id)}
                        className="px-4 py-2 flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 text-sm font-medium rounded-lg transition-colors"
                      >
                        <Edit size={16} />
                        Edit
                      </button>                      
                      <button
                        onClick={() => viewCandidates(sim)}
                        title={`${sim.total_instances || 0} candidate(s) took this practical assessment`}
                        className="px-4 py-2 flex items-center justify-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-600 text-sm font-medium rounded-lg transition-colors"
                      >
                        <Users size={16} />
                        Candidates
                        <span className="ml-1 inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 bg-gray-900 text-white text-xs font-bold rounded-full">
                          {sim.total_instances || 0}
                        </span>
                      </button>
                      <button
                        onClick={() => duplicateSimulation(sim.id)}
                        className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors"
                        title="Duplicate"
                      >
                        <Copy size={18} />
                      </button>
                      <button
                        onClick={() => archiveSimulation(sim.id)}
                        className="p-2 bg-gray-50 hover:bg-amber-50 hover:text-amber-600 text-gray-600 rounded-lg transition-colors"
                        title="Archive"
                      >
                        <Archive size={18} />
                      </button>
                      <button
                        onClick={() => deleteSimulation(sim.id)}
                        className="p-2 bg-gray-50 hover:bg-red-50 hover:text-red-600 text-gray-600 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Show More Button */}
            {!showAllSimulations && filteredSims.length > 10 && (
              <div className="mt-8 text-center">
                <button 
                  onClick={() => setShowAllSimulations(true)} 
                  className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 shadow-sm text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-all"
                >
                  Show More ({filteredSims.length - 10} remaining)
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* Total count */}
            <div className="mt-6 text-center text-xs text-gray-400">
              Showing {displaySims.length} of {filteredSims.length} practical assessments
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SimulationList;