import { Play, Timer, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { IconType } from 'lucide-react';

export interface StatusBadge {
  label: string;
  color: string;
  icon: IconType;
}

export interface DailyWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export interface AvailabilityInfo {
  timezone?: string;
  startDate?: string;
  endDate?: string;
  dailyWindows?: DailyWindow[];
}

export interface SimulationMetadata {
  availability?: AvailabilityInfo;
}

export interface Simulation {
  id?: string | null;
  status?: string;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
  score?: number;
  applicationId?: string;
  metadata?: SimulationMetadata;
}

export function nowInTimezone(tz: string): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
}

export function getStatusBadge(status: string): StatusBadge {
  switch (status) {
    case 'completed':
      return { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle };
    case 'in_progress':
      return { label: 'In Progress', color: 'bg-orange-100 text-orange-800', icon: Timer };
    case 'not_started':
      return { label: 'Not Started', color: 'bg-blue-100 text-blue-800', icon: Play };
    case 'expired':
      return { label: 'Expired', color: 'bg-red-100 text-red-800', icon: AlertCircle };
    case 'no_template':
      return { label: 'Coming Soon', color: 'bg-yellow-100 text-yellow-800', icon: FileText };
    default:
      return { label: 'Available', color: 'bg-green-100 text-green-800', icon: Play };
  }
}

export function isWithinDailyWindow(simulation: Simulation, currentDateTime: Date): boolean {
  const windows = simulation.metadata?.availability?.dailyWindows;
  if (!windows || windows.length === 0) return true;

  const tz = simulation.metadata?.availability?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const local = nowInTimezone(tz);
  const currentDay = local.getDay();
  const currentMins = local.getHours() * 60 + local.getMinutes();

  const todayWindow = windows.find(w => w.dayOfWeek === currentDay && w.enabled);
  if (!todayWindow) return false;

  const [sh, sm] = todayWindow.startTime.split(':').map(Number);
  const [eh, em] = todayWindow.endTime.split(':').map(Number);

  return currentMins >= sh * 60 + sm && currentMins <= eh * 60 + em;
}

export function getNextAvailableLabel(simulation: Simulation): string {
  const windows = simulation.metadata?.availability?.dailyWindows;
  if (!windows || windows.length === 0) return 'Available now';

  const tz = simulation.metadata?.availability?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const local = nowInTimezone(tz);
  const currentDay = local.getDay();
  const currentMins = local.getHours() * 60 + local.getMinutes();

  const todayWindow = windows.find(w => w.dayOfWeek === currentDay && w.enabled);
  if (todayWindow) {
    const [eh, em] = todayWindow.endTime.split(':').map(Number);
    if (currentMins < eh * 60 + em) return `Today until ${todayWindow.endTime}`;
  }

  for (let i = 1; i <= 7; i++) {
    const nextDay = (currentDay + i) % 7;
    const nextWindow = windows.find(w => w.dayOfWeek === nextDay && w.enabled);
    if (nextWindow) {
      const future = new Date(local);
      future.setDate(local.getDate() + i);
      const dayName = future.toLocaleDateString('en-US', { weekday: 'long' });
      return `${dayName} ${nextWindow.startTime}–${nextWindow.endTime}`;
    }
  }

  return 'No available slots';
}

export interface AvailabilityStatus {
  available: boolean;
  message: string;
  canStart: boolean;
}

export function getAvailabilityStatus(simulation: Simulation, currentDateTime: Date): AvailabilityStatus {
  if (!simulation.metadata?.availability) {
    return { available: true, message: 'Available now', canStart: true };
  }

  const { startDate, endDate } = simulation.metadata.availability;
  const today = new Date(currentDateTime);
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate || '');
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate || '');
  end.setHours(23, 59, 59, 999);

  if (today < start) {
    return { available: false, message: `Available from ${start.toLocaleDateString()}`, canStart: false };
  }
  if (today > end) {
    return { available: false, message: `Expired on ${end.toLocaleDateString()}`, canStart: false };
  }

  if (!isWithinDailyWindow(simulation, currentDateTime)) {
    return { available: false, message: `Next: ${getNextAvailableLabel(simulation)}`, canStart: false };
  }

  return { available: true, message: `Available until ${end.toLocaleDateString()}`, canStart: true };
}

export function getCurrentTimeInTz(simulation: Simulation, currentDateTime: Date): string {
  const tz = simulation.metadata?.availability?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return currentDateTime.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz
  } as Intl.DateTimeFormatOptions);
}

export function getCurrentDayInTz(simulation: Simulation, currentDateTime: Date): string {
  const tz = simulation.metadata?.availability?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return currentDateTime.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz } as Intl.DateTimeFormatOptions);
}

export function resolveStatus(sim: Simulation): string {
  if (sim.id === null || sim.id === 'null') return 'no_template';
  if (sim.sessionId && sim.startedAt && !sim.completedAt) return 'in_progress';
  if (sim.completedAt || (sim.score !== undefined && sim.score !== null)) return 'completed';
  if (sim.status === 'expired') return 'expired';
  return 'not_started';
}

export function deduplicateSimulations(sims: Simulation[]): Simulation[] {
  const map = new Map<string | undefined, Simulation>();
  for (const sim of sims) {
    const key = sim.applicationId;
    if (!map.has(key)) {
      map.set(key, sim);
      continue;
    }
    const existing = map.get(key);
    if (existing && !existing.sessionId && sim.sessionId) map.set(key, sim);
    else if (sim.status === 'in_progress' && existing && existing.status !== 'in_progress') map.set(key, sim);
    else if (sim.status === 'completed' && existing && existing.status === 'not_started') map.set(key, sim);
    else if (sim.startedAt && existing && existing.startedAt && new Date(sim.startedAt) > new Date(existing.startedAt)) map.set(key, sim);
  }
  return Array.from(map.values());
}
