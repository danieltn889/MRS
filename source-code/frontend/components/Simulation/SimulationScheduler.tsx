import React, { useState, useEffect } from 'react';
import { Play, Calendar, Clock, CheckCircle, AlertCircle, Timer, RefreshCw } from 'lucide-react';
import { getMySimulations } from '../../services/simulationAPI';

// Proper interface for the simulation object
interface Simulation {
  id: string;
  simulationName?: string;
  title?: string;
  description?: string;
  duration?: number;
  status?: 'completed'| 'in_progress'| 'not_started'| 'expired';
  score?: number;
  scheduledAt?: string;
  appliedAt?: string;
  companyName?: string;
  jobTitle?: string;
  progress?: number;
  completedAt?: string;
  startedAt?: string;
  sessionId?: string;
}

interface SimulationSchedulerProps {
  simulations?: Simulation[];
  onStartSimulation?: (simulation: any) => void;
  onRefresh?: () => void;
}

const SimulationScheduler: React.FC<SimulationSchedulerProps> = ({ 
  simulations: propSimulations = [], 
  onStartSimulation, 
  onRefresh 
}) => {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSim, setActiveSim] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch simulations from API
  const fetchSimulations = async () => {
    try {
      setLoading(true);
      const response = await getMySimulations({ page: 1, limit: 10 });
      
      if (response.success && response.data) {
        const rawData = response.data.data || response.data;
        const mappedSimulations: Simulation[] = (Array.isArray(rawData) ? rawData : []).map((sim, index) => ({
          id: sim.id || `sim-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          simulationName: sim.simulationName || sim.title || 'Untitled Practical Assessment',
          title: sim.simulationName || sim.title || 'Untitled Practical Assessment',
          description: sim.description || '',
          duration: sim.duration || 45,
          status: resolveStatus(sim),
          score: sim.score,
          scheduledAt: sim.scheduledAt,
          appliedAt: sim.appliedAt,
          companyName: sim.companyName,
          jobTitle: sim.jobTitle,
          progress: calculateProgress(sim),
          completedAt: sim.completedAt,
          startedAt: sim.startedAt,
          sessionId: sim.sessionId
        }));
        setSimulations(mappedSimulations);
        
        // Set first simulation as active if available
        if (mappedSimulations.length > 0) {
          const firstActive = mappedSimulations.find(s => s.status !== 'completed'&& s.status !== 'expired');
          setActiveSim(firstActive?.id || mappedSimulations[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching simulations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to resolve status
  const resolveStatus = (sim: any): Simulation['status'] => {
    if (sim.completedAt || (sim.score !== undefined && sim.score !== null && sim.score > 0)) return 'completed';
    if (sim.sessionId && sim.startedAt && !sim.completedAt) return 'in_progress';
    if (sim.status === 'expired') return 'expired';
    return 'not_started';
  };

  // Helper to calculate progress
  const calculateProgress = (sim: any): number => {
    if (sim.completedAt || sim.score) return 100;
    if (sim.startedAt && !sim.completedAt) return 50;
    return 0;
  };

  // Handle start simulation
  const handleStartSimulation = (sim: Simulation) => {
    console.log('Starting simulation:', sim.id);
    if (onStartSimulation) {
      onStartSimulation(sim);
    }
  };

  // Handle resume simulation
  const handleResumeSimulation = (sim: Simulation) => {
    console.log('Resuming simulation:', sim.id);
    if (onStartSimulation) {
      onStartSimulation(sim);
    }
  };

  // Handle review simulation
  const handleReviewSimulation = (sim: Simulation) => {
    console.log('Reviewing simulation:', sim.id);
    // Navigate to results with simulation ID
    window.location.href = `/results?simulationId=${sim.id}`;
  };

  // Load simulations on mount and when refreshKey changes
  useEffect(() => {
    fetchSimulations();
  }, [refreshKey]);

  // Helper function to format date
  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Date not set';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Date not set';
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Date not set';
    }
  };

  // Helper function to get status color and icon
  const getStatusInfo = (sim: Simulation) => {
    if (sim.status === 'completed') {
      return { color: 'green', icon: CheckCircle, label: 'Completed', bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-700'};
    }
    if (sim.status === 'in_progress') {
      return { color: 'orange', icon: Timer, label: 'In Progress', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', textColor: 'text-orange-700'};
    }
    if (sim.status === 'expired') {
      return { color: 'red', icon: AlertCircle, label: 'Expired', bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-700'};
    }
    return { color: 'blue', icon: Play, label: 'Available', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-700'};
  };

  // Refresh simulations
  const handleRefresh = async () => {
    setRefreshKey(prev => prev + 1);
    if (onRefresh) onRefresh();
  };

  // Use prop simulations if provided, otherwise use fetched ones
  const displaySimulations: Simulation[] = propSimulations.length > 0 ? propSimulations : simulations;

  // Generate a unique key for each simulation
  const getSimulationKey = (sim: Simulation, index: number): string => {
    if (sim && sim.id) {
      return sim.id;
    }
    if (sim && sim.simulationName) {
      return `${sim.simulationName}-${index}`;
    }
    if (sim && sim.title) {
      return `${sim.title}-${index}`;
    }
    return `sim-${index}-${Date.now()}`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">Upcoming Practical Assessments</h3>
          <button 
            onClick={handleRefresh} 
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            disabled={loading}
          >
            <RefreshCw size={16} className={`text-gray-500 ${loading ? 'animate-spin': ''}`} />
          </button>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!displaySimulations || displaySimulations.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">Upcoming Practical Assessments</h3>
          <button 
            onClick={handleRefresh} 
            className="p-1 hover:bg-gray-100 rounded-full transition-colors" 
            title="Refresh"
          >
            <RefreshCw size={16} className="text-gray-500 hover:text-blue-600 transition-colors" />
          </button>
        </div>
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">
            <Calendar size={48} className="mx-auto" />
          </div>
          <p className="text-sm text-gray-500">No practical assessments available</p>
          <p className="text-xs text-gray-400 mt-1">Complete job applications to get practical assessments</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-800">Upcoming Practical Assessments</h3>
        <button 
          onClick={handleRefresh} 
          className="p-1 hover:bg-gray-100 rounded-full transition-colors" 
          title="Refresh"
        >
          <RefreshCw size={16} className="text-gray-500 hover:text-blue-600 transition-colors" />
        </button>
      </div>

      <div className="space-y-3 sm:space-y-4 max-h-96 overflow-y-auto">
        {displaySimulations.map((sim, index) => {
          // Skip if sim is null or undefined
          if (!sim) return null;
          
          const isActive = sim.id === activeSim;
          const statusInfo = getStatusInfo(sim);
          const StatusIcon = statusInfo.icon;
          const progress = sim.progress || 0;
          const isCompleted = sim.status === 'completed';
          const isExpired = sim.status === 'expired';
          const isInProgress = sim.status === 'in_progress';
          
          // Generate unique key safely
          const uniqueKey = getSimulationKey(sim, index);

          return (
            <div
              key={uniqueKey}
              onClick={() => !isCompleted && !isExpired && setActiveSim(sim.id)}
              className={`p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
                isActive && !isCompleted && !isExpired
                  ? 'border-blue-500 bg-blue-50'
                  : isCompleted
                  ? 'border-green-200 bg-green-50'
                  : isExpired
                  ? 'border-red-200 bg-red-50'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300'
              }`}
            >
              {/* Simulation Header */}
              <div className="flex items-start justify-between gap-2 sm:gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-sm sm:text-base text-gray-800 line-clamp-2">
                      {sim.simulationName || sim.title || 'Untitled Practical Assessment'}
                    </h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${statusInfo.bgColor} ${statusInfo.textColor}`}>
                      <StatusIcon size={10} />
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 mt-2 text-xs text-gray-600 flex-wrap">
                    {sim.scheduledAt ? (
                      <div className="flex items-center gap-1 truncate">
                        <Calendar size={12} className="flex-shrink-0" />
                        <span className="truncate">{formatDate(sim.scheduledAt)}</span>
                      </div>
                    ) : sim.appliedAt ? (
                      <div className="flex items-center gap-1 truncate">
                        <Calendar size={12} className="flex-shrink-0" />
                        <span className="truncate">Applied: {formatDate(sim.appliedAt)}</span>
                      </div>
                    ) : null}
                    {sim.duration && (
                      <div className="flex items-center gap-1">
                        <Clock size={12} className="flex-shrink-0" />
                        <span>{sim.duration} min</span>
                      </div>
                    )}
                    {sim.companyName && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">•</span>
                        <span className="truncate">{sim.companyName}</span>
                      </div>
                    )}
                    {sim.jobTitle && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">•</span>
                        <span className="truncate">{sim.jobTitle}</span>
                      </div>
                    )}
                  </div>
                </div>
                {isCompleted && (
                  <CheckCircle className="text-green-500 flex-shrink-0" size={20} />
                )}
              </div>

              {/* Progress Bar - Only show for non-expired simulations */}
              {!isExpired && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-600">
                      {isCompleted ? 'Completed': isInProgress ? 'In Progress': 'Progress'}
                    </span>
                    <span className="text-xs font-bold text-gray-800">
                      {progress}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isCompleted
                          ? 'bg-green-500'
                          : isInProgress
                          ? 'bg-orange-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Description */}
              {sim.description && (
                <p className="text-xs text-gray-600 mb-3 line-clamp-2">
                  {sim.description}
                </p>
              )}

              {/* Score Display for Completed */}
              {isCompleted && sim.score !== undefined && (
                <div className="mb-3 p-2 bg-green-100 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-green-800">Your Score</span>
                    <span className="text-sm font-bold text-green-600">{sim.score}%</span>
                  </div>
                </div>
              )}

              {/* Start Button (Only for active, not completed, not expired, not in progress) */}
              {isActive && !isCompleted && !isExpired && !isInProgress && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartSimulation(sim);
                  }}
                  className="w-full py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 text-sm"
                >
                  <Play size={14} />
                  Start Practical Assessment
                </button>
              )}

              {/* Resume Button for In Progress */}
              {isActive && isInProgress && !isCompleted && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResumeSimulation(sim);
                  }}
                  className="w-full py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg font-semibold hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 text-sm"
                >
                  <Timer size={14} />
                  Resume Practical Assessment
                </button>
              )}

              {/* View Results Button for Completed */}
              {isCompleted && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReviewSimulation(sim);
                  }}
                  className="w-full py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                >
                  <CheckCircle size={14} />
                  View Results
                </button>
              )}

              {/* Expired State */}
              {isExpired && (
                <button
                  disabled
                  className="w-full py-2 bg-gray-300 text-gray-500 rounded-lg font-semibold cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                >
                  <AlertCircle size={14} />
                  Practical Assessment Expired
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="mt-4 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-xs text-blue-900">
          💡 <span className="font-semibold">Tip:</span> Complete practical assessments to showcase your skills and improve your job match scores.
        </p>
      </div>
    </div>
  );
};

export default SimulationScheduler;