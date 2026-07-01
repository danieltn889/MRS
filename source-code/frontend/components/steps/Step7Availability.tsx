import React from 'react';
import { Simulation, AvailabilityConfig, DailyWindow } from '../types/simulationTypes';

interface Props {
  simulation: Simulation;
  setSimulation: React.Dispatch<React.SetStateAction<Simulation | null>>;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const Step7Availability: React.FC<Props> = ({ simulation, setSimulation }) => {
  const avail = simulation.availability!;

  const setAvail = (patch: Partial<AvailabilityConfig>) =>
    setSimulation(prev => prev ? { ...prev, availability: { ...prev.availability!, ...patch } } : null);

  const updateWindow = (dayOfWeek: number, changes: Partial<DailyWindow>) => {
    const currentWindow = avail.dailyWindows.find(w => w.dayOfWeek === dayOfWeek) || {
      dayOfWeek,
      startTime: '09:00',
      endTime: '17:00',
      enabled: dayOfWeek >= 1 && dayOfWeek <= 5,
    };
    const newWindows = [...avail.dailyWindows];
    const idx = newWindows.findIndex(w => w.dayOfWeek === dayOfWeek);
    const updated = { ...currentWindow, ...changes };
    if (idx >= 0) newWindows[idx] = updated;
    else newWindows.push(updated);
    setAvail({ dailyWindows: newWindows });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Availability Configuration</h3>
        <p className="text-sm text-gray-500 mt-0.5">Control when and how candidates can access this practical assessment.</p>
      </div>

      {/* Date range + Timezone */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">Availability Period</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Start Date</label>
            <input
              type="date"
              value={avail.startDate || ''}
              onChange={e => setAvail({ startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">End Date</label>
            <input
              type="date"
              value={avail.endDate || ''}
              onChange={e => setAvail({ endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Timezone</label>
            <select
              value={avail.timezone || 'UTC'}
              onChange={e => setAvail({ timezone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="UTC">UTC / GMT (±0:00)</option>
              <optgroup label="Africa">
                <option value="Africa/Cairo">Cairo (EET +2)</option>
                <option value="Africa/Johannesburg">Johannesburg (SAST +2)</option>
                <option value="Africa/Lagos">Lagos (WAT +1)</option>
                <option value="Africa/Nairobi">Nairobi (EAT +3)</option>
              </optgroup>
              <optgroup label="Americas">
                <option value="America/New_York">New York — Eastern (EST −5)</option>
                <option value="America/Chicago">Chicago — Central (CST −6)</option>
                <option value="America/Denver">Denver — Mountain (MST −7)</option>
                <option value="America/Los_Angeles">Los Angeles — Pacific (PST −8)</option>
                <option value="America/Sao_Paulo">São Paulo (BRT −3)</option>
                <option value="America/Toronto">Toronto (EST −5)</option>
              </optgroup>
              <optgroup label="Asia">
                <option value="Asia/Dubai">Dubai (GST +4)</option>
                <option value="Asia/Kolkata">Kolkata / Mumbai (IST +5:30)</option>
                <option value="Asia/Singapore">Singapore (SGT +8)</option>
                <option value="Asia/Tokyo">Tokyo (JST +9)</option>
                <option value="Asia/Shanghai">Shanghai (CST +8)</option>
              </optgroup>
              <optgroup label="Europe">
                <option value="Europe/London">London (GMT +0)</option>
                <option value="Europe/Paris">Paris (CET +1)</option>
                <option value="Europe/Berlin">Berlin (CET +1)</option>
                <option value="Europe/Moscow">Moscow (MSK +3)</option>
              </optgroup>
              <optgroup label="Oceania">
                <option value="Australia/Sydney">Sydney (AEST +10)</option>
                <option value="Pacific/Auckland">Auckland (NZST +12)</option>
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Daily windows */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">Daily Time Windows</h4>
        {[0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => {
          const w = avail.dailyWindows?.find(x => x.dayOfWeek === dayOfWeek) || {
            dayOfWeek,
            startTime: '09:00',
            endTime: '17:00',
            enabled: dayOfWeek >= 1 && dayOfWeek <= 5,
          };
          return (
            <div key={dayOfWeek} className="flex items-center gap-4 bg-white border border-gray-100 rounded-lg px-4 py-3">
              <span className="w-28 text-sm font-medium text-gray-700 flex-shrink-0">
                {DAY_NAMES[dayOfWeek]}
              </span>
              <input
                type="checkbox"
                checked={w.enabled}
                onChange={e => updateWindow(dayOfWeek, { enabled: e.target.checked })}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
              />
              <input
                type="time"
                value={w.startTime}
                disabled={!w.enabled}
                onChange={e => updateWindow(dayOfWeek, { startTime: e.target.value })}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="time"
                value={w.endTime}
                disabled={!w.enabled}
                onChange={e => updateWindow(dayOfWeek, { endTime: e.target.value })}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 focus:ring-2 focus:ring-purple-500"
              />
            </div>
          );
        })}
      </div>

      {/* Capacity */}
      <div className="bg-gray-50 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">Capacity & Scheduling Policies</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: 'maxConcurrentCandidates', label: 'Max Concurrent Candidates', min: 1,  max: 100 },
            { key: 'bufferTime',              label: 'Buffer Time (minutes)',       min: 0,  max: 60  },
            { key: 'maxReschedules',          label: 'Max Reschedules',             min: 0,  max: 5   },
            { key: 'noticePeriod',            label: 'Notice Period (hours)',       min: 1,  max: 168 },
          ].map(({ key, label, min, max }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
              <input
                type="number"
                min={min}
                max={max}
                value={(avail as any)[key] ?? 0}
                onChange={e => setAvail({ [key]: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          ))}
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={avail.allowRescheduling ?? true}
            onChange={e => setAvail({ allowRescheduling: e.target.checked })}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
          />
          <span className="text-sm text-gray-700">Allow candidates to reschedule</span>
        </label>
      </div>
    </div>
  );
};

export default Step7Availability;
