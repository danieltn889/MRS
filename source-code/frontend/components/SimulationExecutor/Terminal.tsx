// Terminal.tsx
import React from 'react';
import { Terminal as TerminalIcon, PlayCircle, X } from 'lucide-react';

interface TerminalProps {
  output: string;
  onRun?: () => void;
  isRunning?: boolean;
  onClear?: () => void;
  className?: string;
}

const Terminal: React.FC<TerminalProps> = ({
  output,
  onRun,
  isRunning = false,
  onClear,
  className = '',
}) => {
  return (
    <div className={`h-44 bg-black border-t border-gray-700 flex flex-col flex-shrink-0 ${className}`}>
      <div className="bg-gray-800 px-3 py-1.5 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2">
          <TerminalIcon size={13} className="text-green-400" />
          <span className="text-white text-xs font-mono">TERMINAL</span>
        </div>
        <div className="flex gap-2">
          {onRun && (
            <button
              onClick={onRun}
              disabled={isRunning}
              className="px-2 py-0.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
            >
              <PlayCircle size={11} />
              Run
            </button>
          )}
          {onClear && (
            <button
              onClick={onClear}
              className="px-2 py-0.5 bg-gray-700 text-white text-xs rounded hover:bg-gray-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
        {output ? (
          <pre className="text-green-400 whitespace-pre-wrap break-all">{output}</pre>
        ) : (
          <p className="text-gray-600">Click "Run" to execute your code.</p>
        )}
      </div>
    </div>
  );
};

export default Terminal;