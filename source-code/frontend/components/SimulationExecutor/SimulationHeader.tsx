// SimulationHeader.tsx - COMPLETE WITH RIGHT SIDEBAR TOGGLE
import React from 'react';
import { 
  Clock, Eye, EyeOff, Save, Pause, Send, BarChart3, Menu, 
  UploadCloud, Download, Code, X, Bell, MessageCircle
} from 'lucide-react';

interface SimulationHeaderProps {
  currentTask: any;
  currentTaskIndex: number;
  totalTasks: number;
  timeSpent: number;           // Elapsed time
  timeLimit?: number | null;   // Time limit (optional)
  timeRemaining?: number | null;   // Countdown remaining (optional)
  isExpired?: boolean;             // Whether the countdown reached zero
  showTimer: boolean;
  setShowTimer: (show: boolean) => void;
  formatTime: (seconds: number) => string;
  getTimeColor: (seconds: number) => string;
  getCountdownColor?: (seconds: number | null) => string;
  editorTheme: string;
  setEditorTheme: (theme: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  showMinimap: boolean;
  setShowMinimap: (show: boolean) => void;
  showSidebar: boolean;
  setShowSidebar: (show: boolean) => void;
  syncStatus: 'idle'| 'syncing'| 'success'| 'error';
  syncMessage: string;
  onPushToLocal: () => void;
  onPullFromLocal: () => void;
  onSave: () => void;
  onPause: () => void;
  onSubmit: () => void;
  minSubmitRemainingSeconds?: number;
  // NEW PROPS FOR RIGHT SIDEBAR
  onToggleRightSidebar?: () => void;
  showRightSidebar?: boolean;
  chatUnreadCount?: number;
  onOpenChat?: () => void;
}

const SimulationHeader: React.FC<SimulationHeaderProps> = ({
  currentTask,
  currentTaskIndex,
  totalTasks,
  timeSpent,
  timeLimit,
  timeRemaining = null,
  isExpired = false,
  showTimer,
  setShowTimer,
  formatTime,
  getTimeColor,
  getCountdownColor,
  editorTheme,
  setEditorTheme,
  fontSize,
  setFontSize,
  showMinimap,
  setShowMinimap,
  showSidebar,
  setShowSidebar,
  syncStatus,
  syncMessage,
  onPushToLocal,
  onPullFromLocal,
  onSave,
  onPause,
  onSubmit,
  minSubmitRemainingSeconds = 0,
  onToggleRightSidebar,
  showRightSidebar = true,
  chatUnreadCount = 0,
  onOpenChat,
}) => {
  const getSyncButtonClass = () => {
    switch (syncStatus) {
      case 'syncing': return 'bg-yellow-600 opacity-70 cursor-wait';
      case 'success': return 'bg-green-600';
      case 'error': return 'bg-red-600';
      default: return 'bg-purple-600 hover:bg-purple-700';
    }
  };

  return (
    <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between flex-shrink-0">
      {/* Left section - Task info */}
      <div className="flex items-center space-x-3">
        <Code className="h-5 w-5 text-blue-400" />
        <h1 className="text-white font-semibold text-sm">
          {currentTask?.title ?? 'Practical Assessment'}
        </h1>
        <span className="text-gray-400 text-xs">
          Task {currentTaskIndex + 1} / {totalTasks}
        </span>
      </div>

      {/* Right section - Controls */}
      <div className="flex items-center space-x-3">
        {/* Timer - Shows elapsed time */}
        {onOpenChat && (
          <button
            onClick={onOpenChat}
            className="relative p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Open chat"
            aria-label="Open chat"
          >
            {chatUnreadCount > 0 ? <Bell size={16} /> : <MessageCircle size={16} />}
            {chatUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 bg-red-500 rounded-full text-[10px] leading-[17px] text-white text-center font-bold">
                {chatUnreadCount > 9 ? '9+': chatUnreadCount}
              </span>
            )}
          </button>
        )}

        {/* Timer - Countdown remaining when a limit exists, else elapsed */}
        {showTimer && (
          <div className="flex items-center space-x-2">
            {timeLimit ? (
              isExpired ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-600/20 text-red-400 font-semibold text-sm">
                  <Clock size={16} /> Time Expired
                </span>
              ) : (
                <span className={`flex items-center gap-2 ${getCountdownColor ? getCountdownColor(timeRemaining) : getTimeColor(timeSpent)}`}>
                  <Clock size={16} />
                  <span className="font-mono font-semibold">{formatTime(timeRemaining ?? 0)}</span>
                  <span className="text-xs text-gray-500">left</span>
                </span>
              )
            ) : (
              <span className={`flex items-center gap-2 ${getTimeColor(timeSpent)}`}>
                <Clock size={16} />
                <span className="font-mono font-semibold">{formatTime(timeSpent)}</span>
                <span className="text-xs text-gray-500">elapsed</span>
              </span>
            )}
            <button
              onClick={() => setShowTimer(false)}
              className="text-gray-500 hover:text-gray-300 ml-1"
            >
              <EyeOff size={13} />
            </button>
          </div>
        )}
        {!showTimer && (
          <button 
            onClick={() => setShowTimer(true)} 
            className="text-gray-500 hover:text-white p-1"
          >
            <Eye size={13} />
          </button>
        )}

        {/* Editor Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditorTheme(editorTheme === 'vs-dark'? 'light': 'vs-dark')}
            className="p-1.5 text-gray-400 hover:text-white rounded text-sm"
            title="Toggle theme"
          >
            {editorTheme === 'vs-dark'? '☀️': '🌙'}
          </button>
          <button
            onClick={() => setFontSize(Math.max(10, fontSize - 2))}
            className="p-1.5 text-gray-400 hover:text-white rounded text-xs"
            title="Decrease font size"
          >
            A-
          </button>
          <span className="text-white text-xs w-5 text-center">{fontSize}</span>
          <button
            onClick={() => setFontSize(Math.min(24, fontSize + 2))}
            className="p-1.5 text-gray-400 hover:text-white rounded text-xs"
            title="Increase font size"
          >
            A+
          </button>
          <button
            onClick={() => setShowMinimap(!showMinimap)}
            className={`p-1.5 rounded ${showMinimap ? 'text-blue-400': 'text-gray-400 hover:text-white'}`}
            title="Toggle minimap"
          >
            <BarChart3 size={13} />
          </button>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-1.5 rounded ${showSidebar ? 'text-blue-400': 'text-gray-400 hover:text-white'}`}
            title="Toggle left sidebar"
          >
            <Menu size={13} />
          </button>
          {/* Right Sidebar Toggle Button */}
          {onToggleRightSidebar && (
            <button
              onClick={onToggleRightSidebar}
              className={`p-1.5 rounded ${showRightSidebar ? 'text-green-400': 'text-gray-400 hover:text-white'}`}
              title={showRightSidebar ? "Hide repository stats" : "Show repository stats"}
            >
              {showRightSidebar ? <X size={13} /> : <BarChart3 size={13} />}
            </button>
          )}
        </div>
        {syncMessage && (
          <span className={`text-xs ${syncStatus === 'success'? 'text-green-400': syncStatus === 'error'? 'text-red-400': 'text-yellow-400'} ml-1`}>
            {syncMessage}
          </span>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onSave}
            className="px-2.5 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 text-xs"
            title="Save progress"
          >
            <Save size={13} />
            Save
          </button>
          <button
            onClick={onPause}
            className="px-2.5 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700 flex items-center gap-1 text-xs"
            title="Pause practical assessment"
          >
            <Pause size={13} />
            Pause
          </button>
          <button
            onClick={onSubmit}
            className="px-2.5 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1 text-xs"
            title={minSubmitRemainingSeconds > 0 ? `Submit available in ${formatTime(minSubmitRemainingSeconds)}` : 'Submit practical assessment'}
          >
            <Send size={13} />
            Submit
          </button>
        </div>
      </div>
    </div>
  );
};

export default SimulationHeader;
