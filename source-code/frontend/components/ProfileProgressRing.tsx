import React from 'react';

const ProfileProgressRing = ({
  percentage = 0,
  sections = null,
  completionMessage = null,
  appliedJobsCount = 0,
  careerStatus = null
}) => {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Get color based on percentage
  const getColor = (percent) => {
    if (percent >= 100) return { label: 'Complete', textColor: 'text-green-600', bgColor: 'bg-green-100', stroke: '#22c55e' };
    if (percent >= 80) return { label: 'Excellent', textColor: 'text-blue-600', bgColor: 'bg-blue-100', stroke: '#3b82f6' };
    if (percent >= 60) return { label: 'Good', textColor: 'text-indigo-600', bgColor: 'bg-indigo-100', stroke: '#6366f1' };
    if (percent >= 40) return { label: 'In Progress', textColor: 'text-yellow-600', bgColor: 'bg-yellow-100', stroke: '#eab308' };
    if (percent >= 20) return { label: 'Getting Started', textColor: 'text-orange-600', bgColor: 'bg-orange-100', stroke: '#f97316' };
    return { label: 'Not Started', textColor: 'text-gray-600', bgColor: 'bg-gray-100', stroke: '#9ca3af' };
  };

  const colorInfo = getColor(percentage);

  // Define all possible sections that come from backend (MATCH BACKEND NAMES)
  const sectionConfigs = [
    { key: 'basicInfo', label: 'Basic Info' },        // Changed from personalInfo
    { key: 'skills', label: 'Skills' },
    { key: 'experience', label: 'Experience' },
    { key: 'education', label: 'Education' },
    { key: 'resume', label: 'Resume' },
    { key: 'portfolio', label: 'Portfolio' },
    { key: 'preferences', label: 'Preferences' },     // ADDED
    { key: 'privacy', label: 'Privacy' }              // ADDED
  ];

  // Use sections from props if provided, otherwise use default (all false)
  const getSectionStatus = (sectionKey) => {
    if (sections && sections[sectionKey] !== undefined) {
      return sections[sectionKey];
    }
    return false;
  };

  // Calculate completed count
  const getCompletedCount = () => {
    if (!sections) return 0;
    return sectionConfigs.filter(config => sections[config.key] === true).length;
  };

  const completedCount = getCompletedCount();
  const totalSections = sectionConfigs.length;

  // Get completion message
  const getDefaultCompletionMessage = () => {
    if (percentage === 100) return '🎉 Complete - Ready for applications!';
    if (percentage >= 80) return '👍 Great progress! Almost there!';
    if (percentage >= 60) return '📝 Halfway there! Keep going!';
    if (percentage >= 40) return '🚀 Making progress! Add more details.';
    if (percentage >= 20) return '✨ Getting started! Complete your profile.';
    return '📋 Start building your profile to get matched!';
  };

  const displayMessage = completionMessage || getDefaultCompletionMessage();

  return (
    <div className="flex flex-col items-center justify-center py-4 sm:py-6 px-2">
      {/* SVG Progress Ring */}
      <div className="relative w-32 sm:w-40 h-32 sm:h-40 flex items-center justify-center flex-shrink-0">
        <svg width="100%" height="100%" viewBox="0 0 160 160" className="transform -rotate-90">
          {/* Background Circle */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          {/* Progress Circle */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={colorInfo.stroke}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>

        {/* Center Text */}
        <div className="absolute flex flex-col items-center">
          <span className="text-2xl sm:text-4xl font-bold text-gray-800 leading-none">
            {percentage}%
          </span>
          <span className="text-xs text-gray-600 font-medium mt-1">Complete</span>
        </div>
      </div>

      {/* Completion Message */}
      <div className="mt-4 text-center">
        <p className="text-sm font-medium text-gray-700">
          {displayMessage}
        </p>
      </div>

      {/* Percentage and Section Count */}
      <div className="mt-2 text-center">
        <p className="text-xs text-gray-500">
          {percentage}% Complete
        </p>
        {sections && (
          <p className="text-xs text-gray-400 mt-1">
            {completedCount} of {totalSections} sections complete
          </p>
        )}
      </div>

      {/* Status Badge */}
      <div className={`mt-3 px-3 sm:px-4 py-1 sm:py-2 rounded-full text-xs sm:text-sm font-semibold ${colorInfo.bgColor} ${colorInfo.textColor}`}>
        {colorInfo.label} Profile
      </div>

      {/* Applied Jobs & Career Status */}
      {(appliedJobsCount > 0 || careerStatus) && (
        <div className="mt-4 space-y-2">
          {appliedJobsCount > 0 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-gray-700 font-medium">
                {appliedJobsCount} Job{appliedJobsCount !== 1 ? 's' : ''} Applied
              </span>
            </div>
          )}
          {careerStatus && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-gray-700 font-medium">
                Career Status: {careerStatus}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Progress Details - Dynamic from backend (8 sections) */}
      {sections && (
        <div className="mt-4 w-full space-y-2 sm:space-y-3">
          {sectionConfigs.map((config, index) => {
            const isCompleted = getSectionStatus(config.key);
            return (
              <div key={index} className="flex items-center gap-2 sm:gap-3">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isCompleted
                    ? 'bg-green-500 border-green-500'
                    : 'border-2 border-gray-300 bg-white'
                }`}>
                  {isCompleted && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <span className={`text-xs sm:text-sm font-medium ${
                  isCompleted ? 'text-gray-800' : 'text-gray-500'
                }`}>
                  {config.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProfileProgressRing;