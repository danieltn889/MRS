// components/DashboardHome/StatsCards.tsx
import React from 'react';
import { Target, Star, TrendingUp, Cpu } from 'lucide-react';

interface StatsCardsProps {
  aiMatches: Array<{ matchScore?: number }>;
}

interface CardConfig {
  label: string;
  value: string | number;
  sub: string;
  badge: string;
  barPct: number | null;
  icon: React.ReactNode;
  colorKey: 'blue'| 'green'| 'amber'| 'purple';
}

const colorMap = {
  blue:   { icon: 'bg-blue-50 text-blue-700',   val: 'text-blue-700',   badge: 'bg-blue-50 text-blue-900',   bar: 'bg-blue-500'},
  green:  { icon: 'bg-green-50 text-green-700',  val: 'text-green-700',  badge: 'bg-green-50 text-green-900',  bar: 'bg-green-500'},
  amber:  { icon: 'bg-amber-50 text-amber-700',  val: 'text-amber-700',  badge: 'bg-amber-50 text-amber-900',  bar: 'bg-amber-500'},
  purple: { icon: 'bg-violet-50 text-violet-700', val: 'text-violet-700', badge: 'bg-violet-50 text-violet-900', bar: 'bg-violet-500'},
};

const StatsCards: React.FC<StatsCardsProps> = ({ aiMatches }) => {
  if (aiMatches.length === 0) return null;

  const total = aiMatches.length;
  const excellent = aiMatches.filter(m => (m.matchScore || 0) >= 90).length;
  const avg = Math.round(aiMatches.reduce((s, m) => s + (m.matchScore || 0), 0) / total);
  const excellentPct = Math.round((excellent / total) * 100);

  const cards: CardConfig[] = [
    {
      label: 'Total matches',
      value: total,
      sub: 'candidates analysed',
      badge: 'active',
      barPct: 100,
      icon: <Target className="w-[17px] h-[17px]" />,
      colorKey: 'blue',
    },
    {
      label: 'Excellent matches',
      value: excellent,
      sub: `${excellentPct}% of total`,
      badge: '≥90% score',
      barPct: excellentPct,
      icon: <Star className="w-[17px] h-[17px]" />,
      colorKey: 'green',
    },
    {
      label: 'Average match score',
      value: `${avg}%`,
      sub: 'across all candidates',
      badge: avg >= 80 ? 'strong': 'moderate',
      barPct: avg,
      icon: <TrendingUp className="w-[17px] h-[17px]" />,
      colorKey: 'amber',
    },
    {
      label: 'AI engine',
      value: 'WordNet',
      sub: 'NLTK · semantic match',
      badge: 'live',
      barPct: null,
      icon: <Cpu className="w-[17px] h-[17px]" />,
      colorKey: 'purple',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {cards.map((card) => {
        const c = colorMap[card.colorKey];
        return (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-2.5"
          >
            <div className="flex items-center justify-between">
              <div className={`w-[34px] h-[34px] rounded-lg flex items-center justify-center ${c.icon}`}>
                {card.icon}
              </div>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
                {card.badge}
              </span>
            </div>

            <div>
              <p className={`text-[26px] font-medium leading-none tabular-nums ${c.val}`}>
                {card.value}
              </p>
              <p className="text-xs text-gray-500 mt-1">{card.label}</p>
            </div>

            {card.barPct !== null ? (
              <div>
                <div className="h-[3px] bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${card.barPct}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">{card.sub}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400">{card.sub}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StatsCards;