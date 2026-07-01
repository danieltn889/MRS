import React from 'react';
import { BookOpen, Play, Timer, CheckCircle } from 'lucide-react';
import { IconType } from 'lucide-react';

interface StatusOption {
  id: string;
  label: string;
  icon: IconType;
}

interface StatusFilterProps {
  selectedStatus: string;
  onStatusChange: (status: string) => void;
}

const statusOptions: StatusOption[] = [
  { id: 'all', label: 'All Practical Assessments', icon: BookOpen },
  { id: 'not_started', label: 'Not Started', icon: Play },
  { id: 'in_progress', label: 'In Progress', icon: Timer },
  { id: 'completed', label: 'Completed', icon: CheckCircle },
];

const StatusFilter: React.FC<StatusFilterProps> = ({ selectedStatus, onStatusChange }) => {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {statusOptions.map((option) => (
        <button
          key={option.id}
          onClick={() => onStatusChange(option.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedStatus === option.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <option.icon className="w-4 h-4" />
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default StatusFilter;
