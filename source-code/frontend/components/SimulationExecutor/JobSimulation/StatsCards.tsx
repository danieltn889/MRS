import React from 'react';
import { Briefcase, CheckCircle, Timer, Play, TrendingUp } from 'lucide-react';
import { IconType } from 'lucide-react';

interface StatsData {
  total_applications_with_simulations: number;
  completed_simulations: number;
  in_progress_simulations: number;
  pending_simulations: number;
  average_score?: number;
}

interface StatsCardsProps {
  stats: StatsData | null;
}

interface StatCard {
  label: string;
  value: string | number;
  color: string;
  icon: IconType;
  iconColor: string;
}

const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  if (!stats) return null;

  const cards: StatCard[] = [
    { label: 'Applications', value: stats.total_applications_with_simulations, color: 'text-gray-900', icon: Briefcase, iconColor: 'text-gray-600'},
    { label: 'Completed', value: stats.completed_simulations, color: 'text-green-600', icon: CheckCircle, iconColor: 'text-green-600'},
    { label: 'In Progress', value: stats.in_progress_simulations, color: 'text-orange-600', icon: Timer, iconColor: 'text-orange-600'},
    { label: 'Pending', value: stats.pending_simulations, color: 'text-blue-600', icon: Play, iconColor: 'text-blue-600'},
    { label: 'Avg. Score', value: `${stats.average_score ?? 0}%`, color: 'text-purple-600', icon: TrendingUp, iconColor: 'text-purple-600'},
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
      {cards.map(({ label, value, color, icon: Icon, iconColor }) => (
        <div key={label} className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
            <Icon className={`w-8 h-8 ${iconColor}`} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsCards;
