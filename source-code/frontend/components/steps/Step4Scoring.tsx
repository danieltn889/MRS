import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Award, Zap, Brain } from 'lucide-react';
import { Simulation, ScoringConfig } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  setSimulation: React.Dispatch<React.SetStateAction<Simulation | null>>;
}

const WEIGHT_CONFIG = [
  { key: 'qualityWeight'   as keyof ScoringConfig, label: 'Quality',    icon: Award,  color: '#7c3aed', bg: '#f5f3ff', defaultWeight: 70 },
  { key: 'speedWeight'     as keyof ScoringConfig, label: 'Speed',      icon: Zap,    color: '#2563eb', bg: '#eff6ff', defaultWeight: 20 },
  { key: 'behavioralWeight'as keyof ScoringConfig, label: 'Behavioral', icon: Brain,  color: '#0891b2', bg: '#ecfeff', defaultWeight: 10 },
];

const Step4Scoring: React.FC<Props> = ({ simulation, setSimulation }) => {
  // Initialize weights if they are undefined or sum to 0
  React.useEffect(() => {
    const { qualityWeight, speedWeight, behavioralWeight } = simulation.scoring;
    const sum = (qualityWeight || 0) + (speedWeight || 0) + (behavioralWeight || 0);
    
    if (sum === 0) {
      setSimulation(prev => prev ? {
        ...prev,
        scoring: {
          ...prev.scoring,
          qualityWeight: 70,
          speedWeight: 20,
          behavioralWeight: 10,
          totalPoints: prev.scoring?.totalPoints ?? 100,
          passingScore: prev.scoring?.passingScore ?? 70,
          timeBonus: prev.scoring?.timeBonus ?? false,
        }
      } : null);
    }
  }, [simulation.scoring, setSimulation]);

  const setScoring = (patch: Partial<ScoringConfig>) =>
    setSimulation(prev => prev ? { ...prev, scoring: { ...prev.scoring, ...patch } } : null);

  // Ensure all values are numbers with proper defaults
  const totalPoints = typeof simulation.scoring.totalPoints === 'number'? simulation.scoring.totalPoints : 100;
  const passingScore = typeof simulation.scoring.passingScore === 'number'? simulation.scoring.passingScore : 70;
  const qualityWeight = typeof simulation.scoring.qualityWeight === 'number'? simulation.scoring.qualityWeight : 70;
  const speedWeight = typeof simulation.scoring.speedWeight === 'number'? simulation.scoring.speedWeight : 20;
  const behavioralWeight = typeof simulation.scoring.behavioralWeight === 'number'? simulation.scoring.behavioralWeight : 10;
  const timeBonus = typeof simulation.scoring.timeBonus === 'boolean'? simulation.scoring.timeBonus : false;
  
  const weightTotal = qualityWeight + speedWeight + behavioralWeight;
  const weightsOk = weightTotal === 100;
  const passingPts = Math.round((passingScore / 100) * totalPoints);

  return (
    <div className="p-6 space-y-7">

      {/* Header */}
      <div>
        <h3 className="text-lg font-bold text-gray-900">Scoring Configuration</h3>
        <p className="text-sm text-gray-500 mt-0.5">Set point totals, passing thresholds, and how scores are weighted.</p>
      </div>

      {/* ── Point totals ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Total Points <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            min={10}
            max={1000}
            value={totalPoints}
            onChange={e => setScoring({ totalPoints: Number(e.target.value) })}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent"
          />
          <p className="text-xs text-gray-400 mt-1.5">Maximum points a candidate can earn (10 – 1000)</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Passing Score (%) <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={1}
              max={100}
              value={passingScore}
              onChange={e => setScoring({ passingScore: Number(e.target.value) })}
              className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent ${
                passingScore < 1 || passingScore > 100 ? 'border-red-300 bg-red-50': 'border-gray-200'
              }`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Candidates must score at least {passingScore}% to pass</p>
        </div>
      </div>

      {/* ── Pass / Fail visual preview ── */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">Score Threshold Preview</h4>
        <div className="relative h-10 bg-gray-200 rounded-full overflow-hidden">
          {/* Fail zone */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-400 to-red-500 rounded-l-full transition-all duration-300"
            style={{ width: `${passingScore}%` }}
          />
          {/* Pass zone */}
          <div
            className="absolute inset-y-0 bg-gradient-to-r from-green-400 to-green-500 rounded-r-full transition-all duration-300"
            style={{ left: `${passingScore}%`, right: 0 }}
          />
          {/* Threshold marker */}
          <div
            className="absolute inset-y-0 w-1.5 bg-white shadow-md rounded-full transition-all duration-300"
            style={{ left: `${passingScore}%`, transform: 'translateX(-50%)'}}
          />
          {/* Labels */}
          <div className="absolute inset-0 flex items-center justify-between px-4">
            <span className="text-xs font-bold text-white drop-shadow">Fail</span>
            <span className="text-xs font-bold text-white drop-shadow">Pass</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <XCircle size={16} className="text-red-500" />
            <span className="text-gray-600">
              Below <strong>{passingScore}%</strong>   {passingPts > 0 ? `< ${passingPts} pts` : ' '}   <span className="text-red-600 font-semibold">FAIL</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-500" />
            <span className="text-gray-600">
              ≥ <strong>{passingScore}%</strong>   {passingPts > 0 ? `≥ ${passingPts} pts` : ' '}   <span className="text-green-600 font-semibold">PASS</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Weight sliders ── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">Score Weight Distribution</h4>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${
            weightsOk ? 'bg-green-50 text-green-700 border border-green-200': 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {weightTotal}% {weightsOk ? '✓ balanced': '  must equal 100%'}
          </span>
        </div>

        {/* Visual weight bar */}
        <div className="h-4 rounded-full overflow-hidden flex">
          {WEIGHT_CONFIG.map(({ key, color }) => {
            let weight = 0;
            if (key === 'qualityWeight') weight = qualityWeight;
            else if (key === 'speedWeight') weight = speedWeight;
            else weight = behavioralWeight;
            return (
              <div
                key={key as string}
                className="transition-all duration-300 h-full"
                style={{ width: `${weight}%`, background: color }}
              />
            );
          })}
          {!weightsOk && <div className="flex-1 bg-gray-200" />}
        </div>

        {WEIGHT_CONFIG.map(({ key, label, icon: Icon, color, bg, defaultWeight }) => {
          let currentWeight = defaultWeight;
          if (key === 'qualityWeight') currentWeight = qualityWeight;
          else if (key === 'speedWeight') currentWeight = speedWeight;
          else currentWeight = behavioralWeight;
          
          return (
            <div key={key as string} className="rounded-xl p-4" style={{ background: bg }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '20'}}>
                    <Icon size={14} style={{ color }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={currentWeight}
                    onChange={e => setScoring({ [key]: Number(e.target.value) })}
                    className="w-16 text-center px-2 py-1 border border-gray-200 rounded-lg text-sm font-bold bg-white focus:ring-2 focus:ring-purple-400"
                    style={{ color }}
                  />
                  <span className="text-sm text-gray-400">%</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={currentWeight}
                onChange={e => setScoring({ [key]: Number(e.target.value) })}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: color }}
              />
              <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{ width: `${currentWeight}%`, background: color }}
                />
              </div>
            </div>
          );
        })}

        {!weightsOk && (
          <div className="flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">
              Weights total <strong>{weightTotal}%</strong>   adjust them so they add up to exactly <strong>100%</strong>.
            </p>
          </div>
        )}

        {weightsOk && (
          <div className="flex items-center gap-2.5 p-3.5 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
            <p className="text-sm text-green-700">
              ✓ Weights balanced! Total: <strong>{weightTotal}%</strong>
            </p>
          </div>
        )}
      </div>

      {/* ── Time bonus ── */}
      <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50/30 transition-colors">
        <input
          type="checkbox"
          checked={timeBonus}
          onChange={e => setScoring({ timeBonus: e.target.checked })}
          className="rounded border-gray-300 text-purple-600 focus:ring-purple-400 w-4 h-4"
        />
        <div>
          <span className="text-sm font-semibold text-gray-700">Enable time bonus scoring</span>
          <p className="text-xs text-gray-500 mt-0.5">Candidates who finish faster earn extra points on top of their base score.</p>
        </div>
      </label>

    </div>
  );
};

export default Step4Scoring;