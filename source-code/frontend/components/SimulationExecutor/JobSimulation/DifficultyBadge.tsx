import React from 'react';

interface DifficultyConfig {
  color: string;
  stars: number;
}

interface DifficultyBadgeProps {
  difficulty: string;
}

const DIFFICULTY_CONFIG: Record<string, DifficultyConfig> = {
  beginner: { color: 'text-green-700 bg-green-100', stars: 1 },
  intermediate: { color: 'text-blue-700 bg-blue-100', stars: 2 },
  advanced: { color: 'text-orange-700 bg-orange-100', stars: 3 },
  expert: { color: 'text-red-700 bg-red-100', stars: 4 },
};

const DifficultyBadge: React.FC<DifficultyBadgeProps> = ({ difficulty }) => {
  const cfg = DIFFICULTY_CONFIG[difficulty] ?? { color: 'text-gray-700 bg-gray-100', stars: 1 };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      {Array.from({ length: cfg.stars }).map((_, i) => (
        <span key={i} style={{ fontSize: 10, lineHeight: 1 }}>★</span>
      ))}
      {difficulty}
    </span>
  );
};

export default DifficultyBadge;
