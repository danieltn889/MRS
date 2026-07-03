// TaskList.tsx - WITH CHAT AND ANALYTICS BUTTONS

import React from 'react';
import { CheckCircle, Clock, Circle, ChevronRight, Edit, BarChart3, Play, MessageCircle, Github, Lock } from 'lucide-react';

interface SimulationTask {
  id: string;
  title: string;
}

interface TaskProgress {
  task_index: number;
  status?: string;
}

interface TaskListProps {
  tasks: SimulationTask[];
  taskProgress: TaskProgress[];
  selectedTaskIndex: number;
  onSelectTask: (index: number) => void;
  onOpenCompletion: (index: number) => void;  // For Complete/Edit
  onStartTask?: (index: number) => void;       // For Start button
  onOpenGitHubStats?: (taskIndex: number) => void;
  hasGitHubRepoForTask?: (taskIndex: number) => boolean;
  // ✅ NEW PROPS
  onOpenChat?: () => void;
  onOpenGitHubAnalytics?: (taskIndex: number) => void;
  unreadCount?: number;
  priorityMode?: 'sequential' | 'parallel' | 'weighted';
  elapsedTasks?: Set<number>;
}

const TaskList: React.FC<TaskListProps> = ({
  tasks,
  taskProgress,
  selectedTaskIndex,
  onSelectTask,
  onOpenCompletion,
  onStartTask,
  onOpenGitHubStats,
  hasGitHubRepoForTask,
  // ✅ NEW PROPS
  onOpenChat,
  onOpenGitHubAnalytics,
  unreadCount = 0,
  priorityMode,
  elapsedTasks,
}) => {
  const getTaskStatus = (index: number): 'not_started' | 'in_progress' | 'completed' => {
    const progress = taskProgress.find(p => p.task_index === index);
    const status = progress?.status || 'not_started';
    
    if (status === 'completed') return 'completed';
    if (status === 'in_progress') return 'in_progress';
    return 'not_started';
  };

  const completedCount = tasks.filter((_, i) => getTaskStatus(i) === 'completed').length;

  // Sequential mode: task N is locked if task N-1 is not completed
  const isTaskLocked = (index: number): boolean => {
    if (priorityMode !== 'sequential') return false;
    if (index === 0) return false;
    return getTaskStatus(index - 1) !== 'completed';
  };

  // Handle Start button click
  const handleStartClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('▶️ Starting task:', index);
    
    if (onStartTask) {
      onStartTask(index);
    } else {
      onOpenCompletion(index);
    }
  };

  // Handle Complete/Edit button click
  const handleCompleteClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('✅ Opening completion dialog for task:', index);
    onOpenCompletion(index);
  };

  const handleTaskClick = (index: number) => {
    console.log('🖱️ Task clicked - index:', index, 'Current selected:', selectedTaskIndex);
    onSelectTask(index);
  };

  const handleGitHubStatsClick = (e: React.MouseEvent, taskIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('📊 Opening GitHub stats for task:', taskIndex);
    onOpenGitHubStats?.(taskIndex);
  };

  // ✅ Handle Chat button click
  const handleChatClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('💬 Opening chat from TaskList');
    onOpenChat?.();
  };

  // ✅ Handle GitHub Analytics button click
  const handleGitHubAnalyticsClick = (e: React.MouseEvent, taskIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('📊 Opening GitHub Analytics for task:', taskIndex);
    onOpenGitHubAnalytics?.(taskIndex);
  };

  // Get status icon and color
  const getStatusIcon = (status: 'not_started' | 'in_progress' | 'completed') => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={12} className="text-green-400 flex-shrink-0" />;
      case 'in_progress':
        return <Clock size={12} className="text-blue-400 animate-pulse flex-shrink-0" />;
      default:
        return <Circle size={12} className="text-gray-500 flex-shrink-0" />;
    }
  };

  const getStatusColor = (status: 'not_started' | 'in_progress' | 'completed', isActive: boolean) => {
    if (isActive) return 'bg-blue-600 text-white shadow-md ring-1 ring-blue-400';
    
    switch (status) {
      case 'completed':
        return 'bg-green-900/50 text-green-300 hover:bg-green-800/50';
      case 'in_progress':
        return 'bg-blue-900/50 text-blue-300 hover:bg-blue-800/50';
      default:
        return 'bg-gray-700 text-gray-300 hover:bg-gray-600';
    }
  };

  // Format task label - TASK_1, TASK_2, etc.
  const getTaskLabel = (index: number): string => {
    return `TASK_${index + 1}`;
  };

  return (
    <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex-shrink-0">
      {/* Top Row: Progress + Action Buttons */}
      <div className="flex items-center justify-between mb-2">
        {/* Progress Bar */}
        <div className="flex items-center gap-3 flex-1 mr-4">
          <span className="text-white text-xs font-medium">
            Progress: {completedCount}/{tasks.length} Tasks
          </span>
          <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden max-w-[200px]">
            <div 
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${(completedCount / tasks.length) * 100}%` }}
            />
          </div>
        </div>

        {/* ✅ CHAT BUTTON */}
        <button
          onClick={handleChatClick}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-all duration-200 shadow-md flex-shrink-0"
          title="Chat with recruiter or admin"
        >
          <MessageCircle size={14} />
          Chat
          {unreadCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* ✅ GITHUB ANALYTICS BUTTON */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            // Open GitHub Analytics for the currently selected task
            if (selectedTaskIndex !== undefined && selectedTaskIndex !== null) {
              onOpenGitHubAnalytics?.(selectedTaskIndex);
            } else {
              onOpenGitHubAnalytics?.(0);
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-all duration-200 shadow-md flex-shrink-0 ml-2"
          title="View GitHub repository analytics"
        >
          <BarChart3 size={14} />
          Analytics
        </button>
      </div>
      
      {/* Horizontal Task List */}
      <div className="flex gap-1 overflow-x-auto pb-1 whitespace-nowrap">
        {tasks.map((task, i) => {
          const status = getTaskStatus(i);
          const isCompleted = status === 'completed';
          const isActive = selectedTaskIndex === i;
          const isInProgress = status === 'in_progress';
          const isNotStarted = status === 'not_started';
          const hasRepo = hasGitHubRepoForTask?.(i) || false;
          const taskLabel = getTaskLabel(i);
          const locked = isTaskLocked(i);
          const timeElapsed = !isCompleted && (elapsedTasks?.has(i) ?? false);

          return (
            <div
              key={i}
              onClick={() => !locked && handleTaskClick(i)}
              title={locked ? `Complete Task ${i} first (Sequential mode)` : timeElapsed ? `⏰ Time elapsed — ${task.title}` : task.title}
              className={`
                flex items-center gap-1 px-2 py-1 rounded-lg transition-all duration-200 flex-shrink-0
                ${locked ? 'cursor-not-allowed opacity-50 border border-red-700/40' : 'cursor-pointer'}
                ${timeElapsed && !locked ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-gray-800' : ''}
                ${getStatusColor(status, isActive)}
              `}
            >
              {locked
                ? <Lock size={12} className="text-red-400 flex-shrink-0" />
                : getStatusIcon(status)}
              
              <span className="text-xs font-mono font-bold tracking-wide truncate">
                {taskLabel}
              </span>

              {/* ⏰ Time-elapsed badge — persists after toast dismisses */}
              {timeElapsed && (
                <span
                  className="flex-shrink-0 text-[10px] font-bold text-amber-300 bg-amber-800/70 px-1 py-0.5 rounded leading-none"
                  title="Time allocated for this task has elapsed"
                >
                  ⏰
                </span>
              )}

              {/* ✅ GitHub Stats Button (per task) - shows if repo exists */}
              {hasRepo && (
                <button
                  onClick={(e) => handleGitHubStatsClick(e, i)}
                  className={`
                    text-xs px-0.5 py-0.5 rounded transition-colors flex-shrink-0
                    ${isActive 
                      ? 'bg-purple-500 text-white hover:bg-purple-400' 
                      : 'bg-purple-700 text-purple-200 hover:bg-purple-600'
                    }
                  `}
                  title="GitHub Stats"
                >
                  <Github size={10} />
                </button>
              )}
              
              {/* ✅ GitHub Analytics Button (per task) */}
              <button
                onClick={(e) => handleGitHubAnalyticsClick(e, i)}
                className={`
                  text-xs px-0.5 py-0.5 rounded transition-colors flex-shrink-0
                  ${isActive 
                    ? 'bg-purple-500 text-white hover:bg-purple-400' 
                    : 'bg-purple-700 text-purple-200 hover:bg-purple-600'
                  }
                `}
                title="GitHub Analytics"
              >
                <BarChart3 size={10} />
              </button>
              
              {/* Edit Button for Completed Tasks */}
              {isCompleted && (
                <button
                  onClick={(e) => handleCompleteClick(e, i)}
                  className="px-1 py-0.5 rounded bg-yellow-700 text-yellow-200 hover:bg-yellow-600 transition-colors flex-shrink-0"
                  title={`Edit ${taskLabel}`}
                >
                  <Edit size={9} />
                </button>
              )}
              
              {/* Complete Button for In Progress Tasks */}
              {isInProgress && !isCompleted && (
                <button
                  onClick={(e) => handleCompleteClick(e, i)}
                  className="px-1 py-0.5 rounded bg-green-700 text-green-200 hover:bg-green-600 transition-colors flex-shrink-0 text-xs"
                  title={`Complete ${taskLabel}`}
                >
                  ✓
                </button>
              )}
              
              {/* Start Button for Not Started Tasks */}
              {isNotStarted && !locked && (
                <button
                  onClick={(e) => handleStartClick(e, i)}
                  className="px-1 py-0.5 rounded bg-blue-700 text-blue-200 hover:bg-blue-600 transition-colors flex-shrink-0 text-xs flex items-center gap-0.5"
                  title={`Start ${taskLabel}`}
                >
                  <Play size={8} /> ▶
                </button>
              )}
              {/* Lock badge for sequential-locked tasks */}
              {locked && (
                <span className="text-[10px] text-red-400 px-1 font-mono" title="Finish the previous task first">
                  locked
                </span>
              )}
              
              {isActive && (
                <ChevronRight size={10} className="text-blue-300 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* ✅ Helpful Info Bar */}
      <div className="mt-1.5 pt-1.5 border-t border-gray-700 flex items-center gap-4 text-[10px] text-gray-500 flex-wrap">
        {priorityMode === 'sequential' && (
          <span className="flex items-center gap-1 text-red-400 font-medium">
            <Lock size={10} />
            Sequential — finish each task before starting the next
          </span>
        )}
        {priorityMode === 'parallel' && (
          <span className="flex items-center gap-1 text-green-400 font-medium">
            <Play size={10} />
            Parallel — start any task at any time
          </span>
        )}
        {priorityMode === 'weighted' && (
          <span className="flex items-center gap-1 text-yellow-400 font-medium">
            ⚖ Weighted — tasks have custom importance
          </span>
        )}
        <span className="flex items-center gap-1">
          <MessageCircle size={10} className="text-blue-400" />
          <span className="text-gray-400">Chat: Ask questions</span>
        </span>
        <span className="flex items-center gap-1">
          <BarChart3 size={10} className="text-purple-400" />
          <span className="text-gray-400">Analytics: View repo stats</span>
        </span>
      </div>
    </div>
  );
};

export default TaskList;