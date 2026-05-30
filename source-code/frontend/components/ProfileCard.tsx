// src/components/ProfileCard.tsx
import React, { useState } from 'react';

interface ProfileCardProps {
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  isLoading: boolean;
}

const ProfileCard: React.FC<ProfileCardProps> = ({
  name,
  email,
  role,
  avatarUrl,
  isLoading,
}) => {
  const [isFollowing, setIsFollowing] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full mx-auto">
        <div className="flex flex-col items-center">
          {/* Loading Spinner */}
          <div className="relative w-24 h-24 mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-gray-700"></div>
            <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
          </div>
          <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2"></div>
          <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-3"></div>
          <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4"></div>
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
            <span className="text-gray-500 dark:text-gray-400">Loading profile...</span>
          </div>
        </div>
      </div>
    );
  }

  const handleFollowClick = () => {
    setIsFollowing(!isFollowing);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden max-w-md w-full mx-auto transition-all duration-300 hover:shadow-xl">
      {/* Cover Image / Avatar Section */}
      <div className="relative h-32 bg-gradient-to-r from-blue-500 to-purple-600">
        <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2">
          <img
            src={avatarUrl || 'https://via.placeholder.com/96'}
            alt={`${name}'s avatar`}
            className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 object-cover bg-white shadow-lg"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/96?text=User';
            }}
          />
        </div>
      </div>

      {/* Profile Information */}
      <div className="pt-14 pb-6 px-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{name}</h2>
          <p className="text-blue-600 dark:text-blue-400 text-sm font-medium mt-1">{role}</p>
          <div className="flex items-center justify-center gap-2 mt-2 text-gray-500 dark:text-gray-400 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>{email}</span>
          </div>
        </div>

        {/* Stats Section */}
        <div className="flex justify-around mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <p className="text-xl font-bold text-gray-900 dark:text-white">124</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Posts</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-gray-900 dark:text-white">3.2k</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Followers</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-gray-900 dark:text-white">284</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Following</p>
          </div>
        </div>

        {/* Follow Button */}
        <button
          onClick={handleFollowClick}
          className={`w-full mt-6 py-2.5 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
            isFollowing
              ? 'bg-green-500 hover:bg-green-600 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          {isFollowing ? (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Following
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Follow
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ProfileCard;