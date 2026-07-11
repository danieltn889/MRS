import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Loader2, CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { SOCKET_BASE_URL } from '../../services/simulationAPI';

// Canonical evaluation stages   keys match the backend `evaluation_progress`
// events emitted during submitSimulation. This makes the evaluation transparent
// (no "black box") by showing the candidate exactly what is being analyzed.
const STAGES: Array<{ key: string; label: string }> = [
  { key: 'saving', label: 'Saving submission'},
  { key: 'repository', label: 'Analyzing repository & commit history'},
  { key: 'communication', label: 'Calculating communication score'},
  { key: 'code_quality', label: 'Evaluating code quality & task completion'},
  { key: 'technical', label: 'Measuring technical implementation'},
  { key: 'feedback', label: 'Generating AI feedback'},
  { key: 'finalizing', label: 'Finalizing report'},
];

interface EvaluationProgressProps {
  sessionId?: string;
  userId?: string;
}

const EvaluationProgress: React.FC<EvaluationProgressProps> = ({ sessionId, userId }) => {
  const [percent, setPercent] = useState(0);
  const [currentStage, setCurrentStage] = useState<string>('saving');
  const [hasError, setHasError] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const socket = io(SOCKET_BASE_URL, {
      transports: ['websocket', 'polling'],
      auth: {
        token: localStorage.getItem('authToken') || undefined,
        userId,
      },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_session', sessionId);
      if (userId) socket.emit('join_user', userId);
    });

    socket.on('evaluation_progress', (p: any) => {
      if (p?.sessionId && p.sessionId !== sessionId) return;
      if (p?.error || p?.stage === 'error') {
        setHasError(true);
        return;
      }
      if (typeof p?.percent === 'number') setPercent(p.percent);
      if (p?.stage) setCurrentStage(p.stage);
    });

    return () => {
      socket.emit('leave_session', sessionId);
      socket.disconnect();
    };
  }, [sessionId, userId]);

  const currentIndex = STAGES.findIndex((s) => s.key === currentStage);
  const isComplete = currentStage === 'complete'|| percent >= 100;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-gray-800 border border-gray-700 p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white text-center mb-1">Evaluating your submission</h3>
        <p className="text-xs text-gray-400 text-center mb-5">
          Our AI is analyzing your work   repository, code, tasks and communication. This usually takes a few seconds.
        </p>

        {hasError ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <AlertCircle size={28} className="text-red-400" />
            <p className="text-sm text-red-300">Evaluation hit a problem. Your work was saved   please check your results.</p>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <div className="h-2 w-full rounded-full bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
              <p className="mt-1 text-right text-xs text-gray-400">{Math.min(100, Math.round(percent))}%</p>
            </div>

            <ul className="space-y-2.5">
              {STAGES.map((s, i) => {
                const done = isComplete || (currentIndex >= 0 && i < currentIndex);
                const active = !isComplete && i === currentIndex;
                return (
                  <li key={s.key} className="flex items-center gap-3 text-sm">
                    {done ? (
                      <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
                    ) : active ? (
                      <Loader2 size={18} className="text-blue-400 animate-spin flex-shrink-0" />
                    ) : (
                      <Circle size={18} className="text-gray-600 flex-shrink-0" />
                    )}
                    <span className={done ? 'text-gray-300': active ? 'text-white font-medium': 'text-gray-500'}>
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

export default EvaluationProgress;
