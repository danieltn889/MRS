// components/DashboardHome/AIMatchBanner.tsx
import React from 'react';
import { Zap } from 'lucide-react';

interface AIMatchBannerProps {
  matchFilter: string;
  onSetMatchFilter: (filter: string) => void;
  aiMatchesCount: number;
  appliedJobsCount: number;
  filteredMatchesLength: number;
}

const AIMatchBanner: React.FC<AIMatchBannerProps> = ({ 
  matchFilter, 
  onSetMatchFilter, 
  aiMatchesCount, 
  appliedJobsCount, 
  filteredMatchesLength 
}) => {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-4 mb-6 text-white">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-3 rounded-full">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">AI-Powered Job feed</h3>
            <p className="text-sm text-blue-100">Get personalized job recommendations based on your skills and experience,job preferences,etc.</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onSetMatchFilter('all')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              matchFilter === 'all'
                ? 'bg-white text-blue-600'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            All ({filteredMatchesLength})
          </button>
          <button
            onClick={() => onSetMatchFilter('applied')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              matchFilter === 'applied'
                ? 'bg-white text-green-600'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            Applied ({appliedJobsCount})
          </button>
          <button
            onClick={() => onSetMatchFilter('high')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              matchFilter === 'high'
                ? 'bg-white text-green-600'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            High Match ({aiMatchesCount})
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIMatchBanner;