import React, { useState, useEffect } from 'react';
import {
  Users,
  MessageSquare,
  Share2,
  UserPlus,
  Settings,
  Eye,
  Edit,
  Trash2,
  Send,
  Paperclip,
  Search,
  Filter,
  Bell,
  Clock,
  CheckCircle,
  AlertCircle,
  Star,
  ThumbsUp,
  Reply,
  MoreHorizontal,
  Calendar,
  FileText,
  Link,
  AtSign
} from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
  lastActive: string;
}

interface Comment {
  id: string;
  author: TeamMember;
  content: string;
  timestamp: string;
  mentions: string[];
  attachments?: { name: string; url: string; type: string }[];
  replies?: Comment[];
  likes: number;
  isLiked: boolean;
}

interface CandidateDiscussion {
  id: string;
  candidateName: string;
  candidateId: string;
  jobTitle: string;
  status: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo: TeamMember[];
  comments: Comment[];
  lastActivity: string;
  tags: string[];
}

interface TeamCollaborationProps {
  onBack: () => void;
}

const TeamCollaboration = ({ onBack }: TeamCollaborationProps) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [discussions, setDiscussions] = useState<CandidateDiscussion[]>([]);
  const [selectedDiscussion, setSelectedDiscussion] = useState<CandidateDiscussion | null>(null);
  const [newComment, setNewComment] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeamData();
    loadDiscussions();
  }, []);

  const loadTeamData = async () => {
    try {
      // Simulate API call - replace with actual API
      const mockTeamMembers: TeamMember[] = [
        {
          id: '1',
          name: 'Sarah Johnson',
          email: 'sarah.johnson@company.com',
          role: 'Senior Recruiter',
          status: 'online',
          lastActive: new Date().toISOString()
        },
        {
          id: '2',
          name: 'Mike Chen',
          email: 'mike.chen@company.com',
          role: 'Technical Recruiter',
          status: 'online',
          lastActive: new Date().toISOString()
        },
        {
          id: '3',
          name: 'Emily Davis',
          email: 'emily.davis@company.com',
          role: 'HR Manager',
          status: 'away',
          lastActive: new Date(Date.now() - 30 * 60 * 1000).toISOString()
        },
        {
          id: '4',
          name: 'Alex Rodriguez',
          email: 'alex.rodriguez@company.com',
          role: 'Recruiting Coordinator',
          status: 'offline',
          lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        }
      ];

      setTeamMembers(mockTeamMembers);
    } catch (error) {
      console.error('Error loading team data:', error);
    }
  };

  const loadDiscussions = async () => {
    try {
      setLoading(true);
      // Simulate API call - replace with actual API
      const mockDiscussions: CandidateDiscussion[] = [
        {
          id: '1',
          candidateName: 'John Doe',
          candidateId: '1',
          jobTitle: 'Senior Full Stack Developer',
          status: 'under_review',
          priority: 'high',
          assignedTo: [teamMembers[0], teamMembers[1]],
          lastActivity: new Date().toISOString(),
          tags: ['technical', 'urgent'],
          comments: [
            {
              id: '1',
              author: teamMembers[0],
              content: 'Great candidate! Strong React and Node.js experience. Should we schedule a technical interview?',
              timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              mentions: ['@mike.chen'],
              likes: 2,
              isLiked: false,
              replies: [
                {
                  id: '2',
                  author: teamMembers[1],
                  content: 'Agreed! His portfolio looks impressive. Let me check his GitHub profile.',
                  timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
                  mentions: [],
                  likes: 1,
                  isLiked: true
                }
              ]
            },
            {
              id: '3',
              author: teamMembers[2],
              content: 'His salary expectations are a bit high, but we have room in the budget. What do you think?',
              timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
              mentions: ['@sarah.johnson', '@mike.chen'],
              likes: 0,
              isLiked: false
            }
          ]
        },
        {
          id: '2',
          candidateName: 'Jane Smith',
          candidateId: '2',
          jobTitle: 'DevOps Engineer',
          status: 'shortlisted',
          priority: 'medium',
          assignedTo: [teamMembers[1], teamMembers[3]],
          lastActivity: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          tags: ['devops', 'kubernetes'],
          comments: [
            {
              id: '4',
              author: teamMembers[1],
              content: 'Jane has excellent AWS and Kubernetes experience. Her previous projects align well with our infrastructure needs.',
              timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
              mentions: ['@alex.rodriguez'],
              likes: 1,
              isLiked: false
            }
          ]
        },
        {
          id: '3',
          candidateName: 'Mike Johnson',
          candidateId: '3',
          jobTitle: 'Frontend Developer',
          status: 'interview',
          priority: 'urgent',
          assignedTo: [teamMembers[0]],
          lastActivity: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          tags: ['frontend', 'react', 'urgent'],
          comments: [
            {
              id: '5',
              author: teamMembers[0],
              content: 'Mike\'s interview went very well! He demonstrated strong problem-solving skills and excellent React knowledge. I recommend moving forward with an offer.',
              timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              mentions: ['@emily.davis'],
              likes: 3,
              isLiked: true,
              attachments: [
                { name: 'interview_notes.pdf', url: '/attachments/interview_notes.pdf', type: 'pdf' }
              ]
            }
          ]
        }
      ];

      setDiscussions(mockDiscussions);
    } catch (error) {
      console.error('Error loading discussions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredDiscussions = () => {
    return discussions.filter(discussion => {
      const matchesSearch = searchTerm === '' ||
        discussion.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        discussion.jobTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        discussion.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = filterStatus === 'all' || discussion.status === filterStatus;
      const matchesPriority = filterPriority === 'all' || discussion.priority === filterPriority;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  };

  const addComment = async () => {
    if (!newComment.trim() || !selectedDiscussion) return;

    try {
      const comment: Comment = {
        id: Date.now().toString(),
        author: teamMembers[0], // Current user
        content: newComment,
        timestamp: new Date().toISOString(),
        mentions: extractMentions(newComment),
        likes: 0,
        isLiked: false
      };

      setDiscussions(prev => prev.map(d =>
        d.id === selectedDiscussion.id
          ? { ...d, comments: [...d.comments, comment], lastActivity: new Date().toISOString() }
          : d
      ));

      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const extractMentions = (content: string): string[] => {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }
    return mentions;
  };

  const toggleLike = (discussionId: string, commentId: string) => {
    setDiscussions(prev => prev.map(d =>
      d.id === discussionId
        ? {
            ...d,
            comments: d.comments.map(c =>
              c.id === commentId
                ? {
                    ...c,
                    likes: c.isLiked ? c.likes - 1 : c.likes + 1,
                    isLiked: !c.isLiked
                  }
                : c
            )
          }
        : d
    ));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'under_review': return 'bg-yellow-100 text-yellow-800';
      case 'shortlisted': return 'bg-green-100 text-green-800';
      case 'interview': return 'bg-purple-100 text-purple-800';
      case 'offer': return 'bg-indigo-100 text-indigo-800';
      case 'hired': return 'bg-emerald-100 text-emerald-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted': return <FileText size={14} />;
      case 'under_review': return <Clock size={14} />;
      case 'shortlisted': return <CheckCircle size={14} />;
      case 'interview': return <Users size={14} />;
      case 'offer': return <Star size={14} />;
      case 'hired': return <CheckCircle size={14} />;
      case 'rejected': return <AlertCircle size={14} />;
      default: return <FileText size={14} />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const filteredDiscussions = getFilteredDiscussions();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Team Collaboration</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowTeamManagement(!showTeamManagement)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
              >
                <Users size={16} />
                <span>Team</span>
              </button>
              <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2">
                <UserPlus size={16} />
                <span>New Discussion</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Discussions List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              {/* Search and Filters */}
              <div className="p-4 border-b border-gray-200">
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search discussions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="flex space-x-2">
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      <option value="all">All Status</option>
                      <option value="submitted">Submitted</option>
                      <option value="under_review">Under Review</option>
                      <option value="shortlisted">Shortlisted</option>
                      <option value="interview">Interview</option>
                      <option value="offer">Offer</option>
                      <option value="hired">Hired</option>
                      <option value="rejected">Rejected</option>
                    </select>

                    <select
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      <option value="all">All Priority</option>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Discussions List */}
              <div className="max-h-96 overflow-y-auto">
                {filteredDiscussions.map((discussion) => (
                  <div
                    key={discussion.id}
                    onClick={() => setSelectedDiscussion(discussion)}
                    className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
                      selectedDiscussion?.id === discussion.id ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900">
                        {discussion.candidateName}
                      </h4>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(discussion.priority)}`}>
                        {discussion.priority}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 mb-2">{discussion.jobTitle}</p>

                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(discussion.status)}`}>
                        {getStatusIcon(discussion.status)}
                        <span className="ml-1">{discussion.status.replace('_', ' ')}</span>
                      </span>

                      <div className="flex items-center space-x-2">
                        <MessageSquare size={12} className="text-gray-400" />
                        <span className="text-xs text-gray-500">{discussion.comments.length}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex -space-x-1">
                        {discussion.assignedTo.slice(0, 3).map((member) => (
                          <div
                            key={member.id}
                            className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium"
                            title={member.name}
                          >
                            {member.name.charAt(0)}
                          </div>
                        ))}
                        {discussion.assignedTo.length > 3 && (
                          <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-xs">
                            +{discussion.assignedTo.length - 3}
                          </div>
                        )}
                      </div>

                      <span className="text-xs text-gray-500">
                        {formatTimestamp(discussion.lastActivity)}
                      </span>
                    </div>

                    {discussion.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {discussion.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {filteredDiscussions.length === 0 && (
                <div className="p-8 text-center">
                  <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No discussions found</h3>
                  <p className="text-gray-600">
                    {searchTerm || filterStatus !== 'all' || filterPriority !== 'all'
                      ? 'Try adjusting your filters.'
                      : 'Start a new discussion to collaborate with your team.'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Discussion Detail */}
          <div className="lg:col-span-2">
            {selectedDiscussion ? (
              <div className="bg-white rounded-lg shadow">
                {/* Discussion Header */}
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        {selectedDiscussion.candidateName}
                      </h2>
                      <p className="text-sm text-gray-600">{selectedDiscussion.jobTitle}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedDiscussion.status)}`}>
                        {getStatusIcon(selectedDiscussion.status)}
                        <span className="ml-1">{selectedDiscussion.status.replace('_', ' ')}</span>
                      </span>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(selectedDiscussion.priority)}`}>
                        {selectedDiscussion.priority}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Users size={16} className="text-gray-400" />
                        <span className="text-sm text-gray-600">Assigned to:</span>
                        <div className="flex -space-x-1">
                          {selectedDiscussion.assignedTo.map((member) => (
                            <div
                              key={member.id}
                              className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium"
                              title={member.name}
                            >
                              {member.name.charAt(0)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm">
                        <Share2 size={14} className="mr-1" />
                        Share
                      </button>
                      <button className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm">
                        <Settings size={14} className="mr-1" />
                        Settings
                      </button>
                    </div>
                  </div>
                </div>

                {/* Comments */}
                <div className="max-h-96 overflow-y-auto p-6">
                  {selectedDiscussion.comments.map((comment) => (
                    <div key={comment.id} className="mb-6">
                      <div className="flex items-start space-x-3">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">
                          {comment.author.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-medium text-gray-900">{comment.author.name}</span>
                            <span className="text-sm text-gray-500">{formatTimestamp(comment.timestamp)}</span>
                          </div>

                          <p className="text-gray-700 mb-3">{comment.content}</p>

                          {comment.attachments && comment.attachments.length > 0 && (
                            <div className="mb-3">
                              {comment.attachments.map((attachment, index) => (
                                <div key={index} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                                  <FileText size={16} className="text-gray-400" />
                                  <span className="text-sm text-gray-700">{attachment.name}</span>
                                  <button className="text-blue-600 hover:text-blue-800 text-sm">
                                    Download
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center space-x-4">
                            <button
                              onClick={() => toggleLike(selectedDiscussion.id, comment.id)}
                              className={`flex items-center space-x-1 text-sm ${
                                comment.isLiked ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              <ThumbsUp size={14} />
                              <span>{comment.likes}</span>
                            </button>
                            <button className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700">
                              <Reply size={14} />
                              <span>Reply</span>
                            </button>
                          </div>

                          {comment.replies && comment.replies.map((reply) => (
                            <div key={reply.id} className="mt-4 ml-8 border-l-2 border-gray-200 pl-4">
                              <div className="flex items-start space-x-3">
                                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                  {reply.author.name.charAt(0)}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <span className="font-medium text-gray-900">{reply.author.name}</span>
                                    <span className="text-sm text-gray-500">{formatTimestamp(reply.timestamp)}</span>
                                  </div>
                                  <p className="text-gray-700 text-sm">{reply.content}</p>
                                  <div className="flex items-center space-x-4 mt-2">
                                    <button
                                      onClick={() => toggleLike(selectedDiscussion.id, reply.id)}
                                      className={`flex items-center space-x-1 text-sm ${
                                        reply.isLiked ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
                                      }`}
                                    >
                                      <ThumbsUp size={12} />
                                      <span>{reply.likes}</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Comment */}
                <div className="p-6 border-t border-gray-200">
                  <div className="flex space-x-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">
                      {teamMembers[0].name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment... Use @ to mention team members"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-none"
                        rows={3}
                      />
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center space-x-2">
                          <button className="text-gray-500 hover:text-gray-700">
                            <Paperclip size={16} />
                          </button>
                          <button className="text-gray-500 hover:text-gray-700">
                            <AtSign size={16} />
                          </button>
                        </div>
                        <button
                          onClick={addComment}
                          disabled={!newComment.trim()}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
                        >
                          <Send size={16} />
                          <span>Comment</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">Select a discussion</h3>
                <p className="text-gray-600">
                  Choose a candidate discussion from the list to view and participate in the conversation.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Team Management Modal */}
        {showTeamManagement && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Team Management</h3>
                  <button
                    onClick={() => setShowTeamManagement(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-4">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">
                          {member.name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{member.name}</h4>
                          <p className="text-sm text-gray-600">{member.role}</p>
                          <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${
                            member.status === 'online' ? 'bg-green-500' :
                            member.status === 'away' ? 'bg-yellow-500' : 'bg-gray-400'
                          }`} />
                          <span className="text-sm text-gray-600 capitalize">{member.status}</span>
                        </div>

                        <div className="flex space-x-1">
                          <button className="p-1 text-gray-400 hover:text-gray-600">
                            <Edit size={16} />
                          </button>
                          <button className="p-1 text-gray-400 hover:text-red-600">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center space-x-2">
                    <UserPlus size={16} />
                    <span>Invite Team Member</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamCollaboration;