// components/DashboardHome/StatsCards.tsx
import React from 'react';
import { Target, Star, TrendingUp, Award } from 'lucide-react';

interface StatsCardsProps {
  aiMatches: Array<{ matchScore?: number }>;
}

const StatsCards: React.FC<StatsCardsProps> = ({ aiMatches }) => {
  if (aiMatches.length === 0) return null;
  
  const avgScore = Math.round(aiMatches.reduce((sum, m) => sum + (m.matchScore || 0), 0) / aiMatches.length);
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-600">
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-gray-600">Total Matches</p><p className="text-2xl font-bold text-gray-900">{aiMatches.length}</p></div>
          <Target className="w-8 h-8 text-blue-600" />
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-600">
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-gray-600">Excellent (90%+)</p><p className="text-2xl font-bold text-green-600">{aiMatches.filter(m => (m.matchScore || 0) >= 90).length}</p></div>
          <Star className="w-8 h-8 text-green-600" />
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-600">
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-gray-600">Average Score</p><p className="text-2xl font-bold text-blue-600">{avgScore}%</p></div>
          <TrendingUp className="w-8 h-8 text-blue-600" />
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-purple-600">
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-gray-600">AI Engine</p><p className="text-lg font-bold text-purple-600">WordNet NLTK</p></div>
          <Award className="w-8 h-8 text-purple-600" />
        </div>
      </div>
    </div>
  );
};

export default StatsCards;
