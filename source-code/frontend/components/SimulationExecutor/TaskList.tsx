// TaskList.tsx - Fixed with separate handlers for Start, Complete, and Edit

import React from 'react';
import { CheckCircle, Clock, Circle, ChevronRight, Edit, BarChart3, Play } from 'lucide-react';

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
}) => {
  const getTaskStatus = (index: number): 'not_started' | 'in_progress' | 'completed' => {
    const progress = taskProgress.find(p => p.task_index === index);
    const status = progress?.status || 'not_started';
    
    // Handle any unexpected status values
    if (status === 'completed') return 'completed';
    if (status === 'in_progress') return 'in_progress';
    return 'not_started';
  };

  const completedCount = tasks.filter((_, i) => getTaskStatus(i) === 'completed').length;

  // Handle Start button click
  const handleStartClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('▶️ Starting task:', index);
    
    if (onStartTask) {
      onStartTask(index);
    } else {
      // Fallback: open completion dialog which should show start screen
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
      {/* Progress Bar */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-white text-xs font-medium">
          Progress: {completedCount}/{tasks.length} Tasks
        </span>
        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${(completedCount / tasks.length) * 100}%` }}
          />
        </div>
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

          return (
            <div
              key={i}
              onClick={() => handleTaskClick(i)}
              className={`
                flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition-all duration-200 flex-shrink-0
                ${getStatusColor(status, isActive)}
              `}
            >
              {getStatusIcon(status)}
              
              <span className="text-xs font-mono font-bold tracking-wide truncate">
                {taskLabel}
              </span>
              
              {/* GitHub Stats Button */}
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
                  <BarChart3 size={10} />
                </button>
              )}
              
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
              {isNotStarted && (
                <button
                  onClick={(e) => handleStartClick(e, i)}
                  className="px-1 py-0.5 rounded bg-blue-700 text-blue-200 hover:bg-blue-600 transition-colors flex-shrink-0 text-xs flex items-center gap-0.5"
                  title={`Start ${taskLabel}`}
                >
                  <Play size={8} /> ▶
                </button>
              )}
              
              {isActive && (
                <ChevronRight size={10} className="text-blue-300 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TaskList;