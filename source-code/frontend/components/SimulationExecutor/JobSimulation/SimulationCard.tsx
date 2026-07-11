import React, { useEffect } from 'react';
import {
  Play, Clock, CheckCircle, Timer, Briefcase, Calendar, Target,
  ClipboardList, Trophy, Settings, Eye, FileText, AlertCircle,
  ChevronDown, ChevronUp
} from 'lucide-react';
import DifficultyBadge from './DifficultyBadge';
import { getStatusBadge, getCurrentDayInTz, getCurrentTimeInTz, nowInTimezone, AvailabilityStatus, Simulation } from './simulationHelpers';

interface TaskStructure {
  objectives?: string[];
  practiceEnabled?: boolean;
}

interface Task {
  title?: string;
  duration?: number;
  description?: string;
  type?: string;
  evaluation?: {
    weight?: number;
  };
}

interface ScoringRubric {
  totalPoints?: number;
  passingScore?: number;
  qualityWeight?: number;
  speedWeight?: number;
}

// Helper to convert score to number
const toNumber = (value: number | string | undefined | null): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const num = typeof value === 'string'? parseFloat(value) : value;
  return isNaN(num) ? undefined : num;
};

interface SimulationCardProps {
  simulation: Simulation & {
    companyLogo?: string;
    companyName?: string;
    simulationName?: string;
    jobTitle?: string;
    difficulty?: string;
    duration?: number;
    description?: string;
    tasksStructure?: TaskStructure;
    tasks?: Task[];
    scoringRubric?: ScoringRubric;
    matchScore?: number;
    score?: number | string;
    appliedAt?: string;
    applicationStatus?: string;
    sessionId?: string | null;
    startedAt?: string | null;
    status?: string;
    metadata?: {
      availability?: {
        timezone?: string;
        dailyWindows?: Array<{
          enabled: boolean;
          dayOfWeek: number;
          startTime: string;
          endTime: string;
        }>;
      };
    };
  };
  isTemplateMissing: boolean;
  isCompleted: boolean;
  isInProgress: boolean;
  isNotStarted: boolean;
  availability: AvailabilityStatus;
  startingSimulation: string | null;
  showTasks: boolean;
  onToggleTasks: (applicationId: string | undefined) => void;
  onStartSimulation: (simulation: any, forceNew?: boolean) => void;
  onReviewSimulation: (simulation: any) => void;
  getCurrentDayInTz: (sim: Simulation) => string;
  getCurrentTimeInTz: (sim: Simulation) => string;
  maxAttempts?: number;
  usedAttempts?: number;
}

const SimulationCard: React.FC<SimulationCardProps> = ({
  simulation,
  isTemplateMissing,
  isCompleted,
  isInProgress,
  isNotStarted,
  availability,
  startingSimulation,
  showTasks,
  onToggleTasks,
  onStartSimulation,
  onReviewSimulation,
  getCurrentDayInTz,
  getCurrentTimeInTz,
  maxAttempts,
  usedAttempts = 0,
}) => {
  const statusBadge = getStatusBadge(simulation.status || '');
  // Attempts remaining check
  const attemptsLimit = maxAttempts ?? (simulation as any)?.settings?.maxAttempts ?? 0;
  const attemptsExhausted = attemptsLimit > 0 && usedAttempts >= attemptsLimit;
  const remainingAttempts = attemptsLimit > 0 ? Math.max(0, attemptsLimit - usedAttempts) : null;
  const StatusIcon = statusBadge.icon;
  const objectives = simulation.tasksStructure?.objectives ?? [];
  const tasks = simulation.tasks ?? [];
  
  // Convert score to number for display
  const numericScore = toNumber(simulation.score);

  // Debug logging - moved outside return
  useEffect(() => {
    console.log(`🎨 SimulationCard ${simulation.id} render:`, {
      isInProgress,
      isCompleted,
      isNotStarted,
      isTemplateMissing,
      hasSessionId: !!simulation.sessionId,
      score: simulation.score,
      numericScore,
      status: simulation.status,
      canStart: availability.canStart,
      availableMessage: availability.message
    });
    
    console.log('Button render decision:', {
      id: simulation.id,
      isTemplateMissing,
      isInProgress,
      isCompleted,
      isNotStarted,
      canStart: availability.canStart
    });
  }, [simulation.id, isInProgress, isCompleted, isNotStarted, isTemplateMissing, simulation.sessionId, simulation.score, numericScore, simulation.status, availability]);

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden">
      <div className="p-6">
        {/* Card header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            {simulation.companyLogo ? (
              <img
                src={simulation.companyLogo}
                alt={simulation.companyName}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <Briefcase className="w-5 h-5 text-gray-400" />
            )}
            <span className="text-sm font-medium text-gray-600">
              {simulation.companyName}
            </span>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">
            {simulation.simulationName}
          </h3>
          <p className="text-sm text-gray-500 mb-3">{simulation.jobTitle}</p>

          <div className="flex flex-wrap items-center gap-2">
            {!isTemplateMissing && (
              <>
                {simulation.difficulty && <DifficultyBadge difficulty={simulation.difficulty} />}
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                  <Clock className="w-3 h-3" />
                  {simulation.duration} min
                </span>
                {simulation.scoringRubric && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                    <Trophy className="w-3 h-3" />
                    {simulation.scoringRubric.passingScore}% to pass
                  </span>
                )}
              </>
            )}
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusBadge.color}`}
            >
              <StatusIcon className="w-3 h-3" />
              {statusBadge.label}
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
          {isTemplateMissing
            ? "The employer is currently preparing the assessment for this position. You'll be notified when it's ready."
            : simulation.description}
        </p>

        {/* Current time in simulation's timezone */}
        <div className="text-xs mb-3 p-2 rounded bg-gray-50 border border-gray-200">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-gray-500" />
            <span className="text-gray-600">
              Current ({simulation.metadata?.availability?.timezone ?? 'local'}):{''}
              {getCurrentDayInTz(simulation)} {getCurrentTimeInTz(simulation)}
            </span>
          </div>
        </div>

        {/* Availability banner */}
        {simulation.metadata?.availability && !isTemplateMissing && (
          <div
            className={`text-xs mb-3 p-2 rounded ${
              availability.canStart
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
            }`}
          >
            <Calendar className="w-3 h-3 inline mr-1" />
            {availability.message}
          </div>
        )}

        {/* Daily windows */}
        {simulation.metadata?.availability?.dailyWindows && !isTemplateMissing && (
          <div className="text-xs mb-3 p-2 bg-gray-50 rounded border border-gray-200">
            <div className="font-medium mb-1">
              📅 Available Hours ({simulation.metadata.availability.timezone}):
            </div>
            <div className="grid grid-cols-2 gap-1">
              {simulation.metadata.availability.dailyWindows
                .filter((w) => w.enabled)
                .map((w, idx) => {
                  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                  const tz = simulation.metadata?.availability?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
                  const local = nowInTimezone(tz);
                  const isToday = local.getDay() === w.dayOfWeek;
                  return (
                    <div key={idx} className={isToday ? 'text-blue-600 font-medium': 'text-gray-600'}>
                      {dayNames[w.dayOfWeek]}: {w.startTime}–{w.endTime}
                      {isToday && <span className="ml-1 text-green-500">●</span>}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Objectives */}
        {objectives.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-blue-500" />
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Learning Objectives
              </h4>
            </div>
            <ul className="text-xs text-gray-600 space-y-1 pl-6">
              {objectives.slice(0, 2).map((obj: string, i: number) => (
                <li key={i} className="list-disc">{obj}</li>
              ))}
              {objectives.length > 2 && (
                <li className="text-gray-500 list-none pl-4">
                  +{objectives.length - 2} more objectives
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Tasks */}
        {tasks.length > 0 && !isTemplateMissing && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList className="w-4 h-4 text-green-500" />
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Tasks ({tasks.length})
              </h4>
            </div>
            <div className="space-y-2">
              {tasks.slice(0, showTasks ? tasks.length : 1).map((task: Task, i: number) => (
                <div key={i} className="text-xs text-gray-600 p-2 bg-gray-50 rounded">
                  <div className="font-medium flex items-center justify-between">
                    <span>{task.title ?? `Task ${i + 1}`}</span>
                    <span className="text-gray-400">{task.duration} min</span>
                  </div>
                  {task.description && (
                    <div className="text-gray-500 mt-1">
                      {task.description.substring(0, 100)}
                    </div>
                  )}
                  {task.type && (
                    <div className="text-gray-400 mt-1">
                      Type: {task.type} · Weight: {task.evaluation?.weight ?? 0}%
                    </div>
                  )}
                </div>
              ))}
              {tasks.length > 1 && (
                <button
                  onClick={() => onToggleTasks(simulation.applicationId)}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  {showTasks ? (
                    <>Show less <ChevronUp className="w-3 h-3" /></>
                  ) : (
                    <>Show {tasks.length - 1} more task{tasks.length - 1 > 1 ? 's': ''} <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scoring info */}
        {simulation.scoringRubric && !isTemplateMissing && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Scoring
              </h4>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="bg-gray-50 px-2 py-1 rounded">
                Total: {simulation.scoringRubric.totalPoints}
              </span>
              <span className="bg-green-50 px-2 py-1 rounded text-green-700">
                Pass: {simulation.scoringRubric.passingScore}%
              </span>
              <span className="bg-gray-50 px-2 py-1 rounded">
                Quality: {simulation.scoringRubric.qualityWeight}%
              </span>
              <span className="bg-gray-50 px-2 py-1 rounded">
                Speed: {simulation.scoringRubric.speedWeight}%
              </span>
            </div>
          </div>
        )}

        {/* Attempts info */}
        {attemptsLimit > 0 && !isTemplateMissing && (
          <div className={`mb-4 flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
            attemptsExhausted
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-blue-50 border-blue-200 text-blue-700'
          }`}>
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {attemptsExhausted
              ? `All ${attemptsLimit} attempt${attemptsLimit !== 1 ? 's': ''} used   no more retakes allowed`
              : `Attempt ${usedAttempts + 1} of ${attemptsLimit}   ${remainingAttempts} remaining`
            }
          </div>
        )}

        {/* Practice mode badge */}
        {simulation.tasksStructure?.practiceEnabled && !isTemplateMissing && (
          <div className="mb-4 bg-blue-50 rounded-lg p-2">
            <div className="flex items-center gap-2">
              <Settings className="w-3 h-3 text-blue-600" />
              <span className="text-xs font-medium text-blue-700">
                Practice Mode Available
              </span>
            </div>
          </div>
        )}

        {/* Match score */}
        {simulation.matchScore != null && (
          <div className="bg-blue-50 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-blue-800 font-medium">Match Score</span>
              <span className="font-bold text-blue-600">{simulation.matchScore}%</span>
            </div>
            <div className="bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${simulation.matchScore}%` }}
              />
            </div>
          </div>
        )}

        {/* Completed score - using numericScore */}
        {isCompleted && numericScore != null && (
          <div className="bg-green-50 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-green-800">Your Score</span>
              <span className="text-lg font-bold text-green-600">{numericScore}%</span>
            </div>
            <div className="bg-green-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{ width: `${numericScore}%` }}
              />
            </div>
          </div>
        )}

        {/* In-progress status - Only show if in progress and NOT completed */}
        {isInProgress && !isCompleted && simulation.startedAt && (
          <div className="bg-orange-50 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-orange-800">
              <Timer className="w-4 h-4" />
              <span className="text-sm font-medium">In Progress</span>
            </div>
            <p className="text-xs text-orange-700">
              Started on {new Date(simulation.startedAt).toLocaleDateString()}
            </p>
            {simulation.sessionId && (
              <p className="text-xs text-orange-600 mt-1">
                Session ID: {simulation.sessionId.substring(0, 8)}...
              </p>
            )}
          </div>
        )}

        {/* Application info footer */}
        <div className="mb-4 flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
          <span>Applied: {new Date(simulation.appliedAt || '').toLocaleDateString()}</span>
          <span className="capitalize px-2 py-1 bg-gray-100 rounded-full">
            {simulation.applicationStatus}
          </span>
        </div>

        {/* CTA BUTTONS */}
        <div className="flex flex-col gap-2">
          {isTemplateMissing ? (
            <button disabled className="w-full px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2">
              <FileText className="w-4 h-4" />
              Assessment Coming Soon
            </button>
          ) : isInProgress ? (
            availability.canStart ? (
              <button
                onClick={() => onStartSimulation(simulation)}
                disabled={startingSimulation === simulation.id}
                className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {startingSimulation === simulation.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Timer className="w-4 h-4" />
                    Resume Practical Assessment
                  </>
                )}
              </button>
            ) : (
              <button disabled className="w-full px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" />
                {availability.message}
              </button>
            )
          ) : isCompleted ? (
            <>
              <button
                onClick={() => onReviewSimulation(simulation)}
                disabled={startingSimulation === simulation.id}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {startingSimulation === simulation.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    Review Results
                  </>
                )}
              </button>
              {availability.canStart && (
                attemptsExhausted ? (
                  <button
                    disabled
                    className="w-full px-4 py-2 bg-red-100 text-red-600 border border-red-300 rounded-lg cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4" />
                    All Attempts Used
                  </button>
                ) : (
                  <button
                    onClick={() => onStartSimulation(simulation, true)}
                    disabled={startingSimulation === simulation.id}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {startingSimulation === simulation.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Start New Session {remainingAttempts !== null && `(${remainingAttempts} left)`}
                      </>
                    )}
                  </button>
                )
              )}
            </>
          ) : isNotStarted ? (
            availability.canStart ? (
              <button
                onClick={() => onStartSimulation(simulation)}
                disabled={startingSimulation === simulation.id}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {startingSimulation === simulation.id ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start Practical Assessment
                  </>
                )}
              </button>
            ) : (
              <button
                disabled
                className="w-full px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4" />
                {availability.message}
              </button>
            )
          ) : (
            <button
              disabled
              className="w-full px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2"
            >
              <AlertCircle className="w-4 h-4" />
              Not Available
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimulationCard;