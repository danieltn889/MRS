import React, { useState, useEffect } from 'react';
import {
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Calendar,
  User,
  Building,
  Eye,
  Edit,
  Download,
  Mail,
  Phone,
  MessageSquare,
  Star,
  Plus,
  Search,
  Settings,
  Bell
} from 'lucide-react';

interface Offer {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  companyName: string;
  status: 'draft'| 'sent'| 'viewed'| 'accepted'| 'declined'| 'expired'| 'withdrawn';
  salary: number;
  bonus?: number;
  equity?: string;
  benefits: string[];
  startDate: string;
  location: string;
  employmentType: 'full_time'| 'part_time'| 'contract'| 'internship';
  createdAt: string;
  sentAt?: string;
  expiresAt: string;
  acceptedAt?: string;
  declinedAt?: string;
  notes?: string;
  attachments?: { name: string; url: string; type: string }[];
  followUps: FollowUp[];
}

interface FollowUp {
  id: string;
  type: 'email'| 'call'| 'meeting';
  scheduledAt: string;
  completedAt?: string;
  notes: string;
  outcome?: string;
}

interface OfferManagementProps {
  onBack: () => void;
}

const OfferManagement = ({ onBack }: OfferManagementProps) => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Form states
  const [newOffer, setNewOffer] = useState({
    candidateId: '',
    candidateName: '',
    candidateEmail: '',
    jobTitle: '',
    salary: 0,
    bonus: 0,
    equity: '',
    benefits: [] as string[],
    startDate: '',
    location: '',
    employmentType: 'full_time'as const,
    expiresAt: '',
    notes: ''
  });

  const [newFollowUp, setNewFollowUp] = useState({
    type: 'email'as const,
    scheduledAt: '',
    notes: ''
  });

  useEffect(() => {
    loadOffers();
  }, []);

  const loadOffers = async () => {
    try {
      setLoading(true);
      // Simulate API call - replace with actual API
      const mockOffers: Offer[] = [
        {
          id: '1',
          candidateId: '1',
          candidateName: 'John Doe',
          candidateEmail: 'john.doe@email.com',
          jobTitle: 'Senior Full Stack Developer',
          companyName: 'TechCorp Inc.',
          status: 'sent',
          salary: 140000,
          bonus: 10000,
          equity: '0.5%',
          benefits: ['Health Insurance', '401k Matching', 'Remote Work', 'Professional Development'],
          startDate: '2024-03-01',
          location: 'San Francisco, CA',
          employmentType: 'full_time',
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          notes: 'Strong candidate with excellent technical skills. Competitive offer to secure quickly.',
          followUps: [
            {
              id: '1',
              type: 'email',
              scheduledAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
              completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
              notes: 'Follow-up email sent asking for status update',
              outcome: 'No response yet'
            }
          ]
        },
        {
          id: '2',
          candidateId: '2',
          candidateName: 'Jane Smith',
          candidateEmail: 'jane.smith@email.com',
          jobTitle: 'DevOps Engineer',
          companyName: 'CloudTech Solutions',
          status: 'accepted',
          salary: 120000,
          bonus: 8000,
          equity: '0.3%',
          benefits: ['Health Insurance', 'Dental', 'Vision', 'Stock Options'],
          startDate: '2024-02-15',
          location: 'Remote',
          employmentType: 'full_time',
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          sentAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          acceptedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          notes: 'Accepted offer! Excited to join the team.',
          followUps: []
        },
        {
          id: '3',
          candidateId: '3',
          candidateName: 'Mike Johnson',
          candidateEmail: 'mike.johnson@email.com',
          jobTitle: 'Frontend Developer',
          companyName: 'StartupXYZ',
          status: 'declined',
          salary: 95000,
          bonus: 5000,
          benefits: ['Health Insurance', 'Flexible Hours'],
          startDate: '2024-03-15',
          location: 'Austin, TX',
          employmentType: 'full_time',
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          sentAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          declinedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          notes: 'Declined due to higher offer from competitor',
          followUps: []
        },
        {
          id: '4',
          candidateId: '4',
          candidateName: 'Sarah Wilson',
          candidateEmail: 'sarah.wilson@email.com',
          jobTitle: 'Senior Full Stack Developer',
          companyName: 'TechCorp Inc.',
          status: 'draft',
          salary: 135000,
          bonus: 12000,
          equity: '0.4%',
          benefits: ['Health Insurance', '401k Matching', 'Remote Work', 'Learning Budget'],
          startDate: '2024-04-01',
          location: 'Remote',
          employmentType: 'full_time',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          notes: 'Draft offer for review before sending',
          followUps: []
        }
      ];

      setOffers(mockOffers);
    } catch (error) {
      console.error('Error loading offers:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredOffers = () => {
    return offers.filter(offer => {
      const matchesSearch = searchTerm === ''||
        offer.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        offer.jobTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        offer.candidateEmail.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'all'|| offer.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  };

  const createOffer = async () => {
    try {
      const offer: Offer = {
        id: Date.now().toString(),
        candidateId: newOffer.candidateId,
        candidateName: newOffer.candidateName,
        candidateEmail: newOffer.candidateEmail,
        jobTitle: newOffer.jobTitle,
        companyName: 'Current Company', // Would come from context
        status: 'draft',
        salary: newOffer.salary,
        bonus: newOffer.bonus,
        equity: newOffer.equity,
        benefits: newOffer.benefits,
        startDate: newOffer.startDate,
        location: newOffer.location,
        employmentType: newOffer.employmentType,
        createdAt: new Date().toISOString(),
        expiresAt: newOffer.expiresAt,
        notes: newOffer.notes,
        followUps: []
      };

      setOffers(prev => [...prev, offer]);
      setShowCreateForm(false);
      setNewOffer({
        candidateId: '',
        candidateName: '',
        candidateEmail: '',
        jobTitle: '',
        salary: 0,
        bonus: 0,
        equity: '',
        benefits: [],
        startDate: '',
        location: '',
        employmentType: 'full_time',
        expiresAt: '',
        notes: ''
      });

      console.log('Offer created successfully');
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  const sendOffer = async (offerId: string) => {
    try {
      setOffers(prev => prev.map(offer =>
        offer.id === offerId
          ? {
              ...offer,
              status: 'sent',
              sentAt: new Date().toISOString()
            }
          : offer
      ));

      // Simulate sending email
      console.log('Offer sent via email');
    } catch (error) {
      console.error('Error sending offer:', error);
    }
  };

  const updateOfferStatus = async (offerId: string, status: Offer['status']) => {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date().toISOString()
      };

      if (status === 'accepted') {
        updateData.acceptedAt = new Date().toISOString();
      } else if (status === 'declined') {
        updateData.declinedAt = new Date().toISOString();
      }

      setOffers(prev => prev.map(offer =>
        offer.id === offerId
          ? { ...offer, ...updateData }
          : offer
      ));
    } catch (error) {
      console.error('Error updating offer status:', error);
    }
  };

  const addFollowUp = async () => {
    if (!selectedOffer) return;

    try {
      const followUp: FollowUp = {
        id: Date.now().toString(),
        type: newFollowUp.type,
        scheduledAt: newFollowUp.scheduledAt,
        notes: newFollowUp.notes
      };

      setOffers(prev => prev.map(offer =>
        offer.id === selectedOffer.id
          ? { ...offer, followUps: [...offer.followUps, followUp] }
          : offer
      ));

      setShowFollowUpForm(false);
      setNewFollowUp({
        type: 'email',
        scheduledAt: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error adding follow-up:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'viewed': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'declined': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-orange-100 text-orange-800';
      case 'withdrawn': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText size={14} />;
      case 'sent': return <Send size={14} />;
      case 'viewed': return <Eye size={14} />;
      case 'accepted': return <CheckCircle size={14} />;
      case 'declined': return <XCircle size={14} />;
      case 'expired': return <Clock size={14} />;
      case 'withdrawn': return <XCircle size={14} />;
      default: return <FileText size={14} />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  const filteredOffers = getFilteredOffers();

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
              <h1 className="text-2xl font-bold text-gray-900">Offer Management</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus size={16} />
                <span>Create Offer</span>
              </button>
              <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2">
                <Download size={16} />
                <span>Export</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Offers</p>
                <p className="text-3xl font-bold text-gray-900">{offers.length}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Accepted</p>
                <p className="text-3xl font-bold text-green-600">
                  {offers.filter(o => o.status === 'accepted').length}
                </p>
                <p className="text-sm text-gray-600">
                  {offers.length > 0 ? Math.round((offers.filter(o => o.status === 'accepted').length / offers.length) * 100) : 0}% acceptance rate
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Response</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {offers.filter(o => ['sent', 'viewed'].includes(o.status)).length}
                </p>
                <p className="text-sm text-gray-600">Awaiting decision</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Average Salary</p>
                <p className="text-3xl font-bold text-purple-600">
                  {formatCurrency(Math.round(offers.reduce((sum, o) => sum + o.salary, 0) / offers.length))}
                </p>
                <p className="text-sm text-gray-600">Across all offers</p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search offers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
              <option value="expired">Expired</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>
        </div>

        {/* Offers Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Offers ({filteredOffers.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Candidate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Salary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOffers.map((offer) => (
                  <tr key={offer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {offer.candidateName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {offer.candidateEmail}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {offer.jobTitle}
                      </div>
                      <div className="text-sm text-gray-500">
                        {offer.location}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(offer.salary)}
                        </div>
                        {offer.bonus && offer.bonus > 0 && (
                          <div className="text-sm text-gray-500">
                            +{formatCurrency(offer.bonus)} bonus
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(offer.status)}`}>
                        {getStatusIcon(offer.status)}
                        <span className="ml-1 capitalize">{offer.status.replace('_', '')}</span>
                      </span>
                      {isExpired(offer.expiresAt) && offer.status === 'sent'&& (
                        <div className="text-xs text-red-600 mt-1">Expired</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(offer.expiresAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedOffer(offer)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Eye size={16} />
                        </button>
                        {offer.status === 'draft'&& (
                          <button
                            onClick={() => sendOffer(offer.id)}
                            className="text-green-600 hover:text-green-800"
                          >
                            <Send size={16} />
                          </button>
                        )}
                        {offer.status === 'sent'&& (
                          <>
                            <button
                              onClick={() => {
                                setSelectedOffer(offer);
                                setShowFollowUpForm(true);
                              }}
                              className="text-purple-600 hover:text-purple-800"
                            >
                              <MessageSquare size={16} />
                            </button>
                            <button
                              onClick={() => updateOfferStatus(offer.id, 'accepted')}
                              className="text-green-600 hover:text-green-800"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => updateOfferStatus(offer.id, 'declined')}
                              className="text-red-600 hover:text-red-800"
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredOffers.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No offers found</h3>
              <p className="text-gray-600">
                {searchTerm || filterStatus !== 'all'
                  ? 'Try adjusting your filters or search terms.'
                  : 'Create your first offer to get started.'
                }
              </p>
            </div>
          )}
        </div>

        {/* Offer Detail Modal */}
        {selectedOffer && !showFollowUpForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-96 overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Offer Details - {selectedOffer.candidateName}
                  </h3>
                  <button
                    onClick={() => setSelectedOffer(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-4">Candidate Information</h4>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <User size={16} className="text-gray-400" />
                        <span className="text-gray-700">{selectedOffer.candidateName}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Mail size={16} className="text-gray-400" />
                        <span className="text-gray-700">{selectedOffer.candidateEmail}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Building size={16} className="text-gray-400" />
                        <span className="text-gray-700">{selectedOffer.jobTitle}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Calendar size={16} className="text-gray-400" />
                        <span className="text-gray-700">Start: {formatDate(selectedOffer.startDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-4">Offer Details</h4>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <DollarSign size={16} className="text-gray-400" />
                        <div>
                          <span className="text-gray-700 font-medium">{formatCurrency(selectedOffer.salary)}</span>
                          {selectedOffer.bonus && selectedOffer.bonus > 0 && (
                            <span className="text-sm text-gray-600 ml-2">+{formatCurrency(selectedOffer.bonus)} bonus</span>
                          )}
                        </div>
                      </div>
                      {selectedOffer.equity && (
                        <div className="flex items-center space-x-3">
                          <Star size={16} className="text-gray-400" />
                          <span className="text-gray-700">{selectedOffer.equity} equity</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-3">
                        <MapPin size={16} className="text-gray-400" />
                        <span className="text-gray-700">{selectedOffer.location}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Clock size={16} className="text-gray-400" />
                        <span className="text-gray-700 capitalize">{selectedOffer.employmentType.replace('_', '')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedOffer.benefits.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-3">Benefits</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedOffer.benefits.map((benefit, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                        >
                          {benefit}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedOffer.followUps.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-3">Follow-ups</h4>
                    <div className="space-y-3">
                      {selectedOffer.followUps.map((followUp) => (
                        <div key={followUp.id} className="bg-gray-50 p-3 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              {followUp.type === 'email'&& <Mail size={16} className="text-blue-500" />}
                              {followUp.type === 'call'&& <Phone size={16} className="text-green-500" />}
                              {followUp.type === 'meeting'&& <Users size={16} className="text-purple-500" />}
                              <span className="text-sm font-medium text-gray-900 capitalize">
                                {followUp.type}
                              </span>
                            </div>
                            <span className="text-sm text-gray-500">
                              {formatDate(followUp.scheduledAt)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{followUp.notes}</p>
                          {followUp.outcome && (
                            <p className="text-sm text-gray-600 mt-1">Outcome: {followUp.outcome}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedOffer.notes && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Notes</h4>
                    <p className="text-gray-700 text-sm">{selectedOffer.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Create Offer Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Create Offer</h3>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Candidate Name
                    </label>
                    <input
                      type="text"
                      value={newOffer.candidateName}
                      onChange={(e) => setNewOffer(prev => ({ ...prev, candidateName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter candidate name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={newOffer.candidateEmail}
                      onChange={(e) => setNewOffer(prev => ({ ...prev, candidateEmail: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="candidate@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Job Title
                    </label>
                    <input
                      type="text"
                      value={newOffer.jobTitle}
                      onChange={(e) => setNewOffer(prev => ({ ...prev, jobTitle: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter job title"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Location
                    </label>
                    <input
                      type="text"
                      value={newOffer.location}
                      onChange={(e) => setNewOffer(prev => ({ ...prev, location: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="City, State"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Base Salary ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={newOffer.salary}
                      onChange={(e) => setNewOffer(prev => ({ ...prev, salary: Number(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Signing Bonus ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={newOffer.bonus}
                      onChange={(e) => setNewOffer(prev => ({ ...prev, bonus: Number(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={newOffer.startDate}
                      onChange={(e) => setNewOffer(prev => ({ ...prev, startDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Expires At
                    </label>
                    <input
                      type="date"
                      value={newOffer.expiresAt}
                      onChange={(e) => setNewOffer(prev => ({ ...prev, expiresAt: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Employment Type
                  </label>
                  <select
                    value={newOffer.employmentType}
                    onChange={(e) => setNewOffer(prev => ({ ...prev, employmentType: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={newOffer.notes}
                    onChange={(e) => setNewOffer(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Additional notes about the offer..."
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createOffer}
                    disabled={!newOffer.candidateName || !newOffer.jobTitle || !newOffer.salary || !newOffer.startDate}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Create Offer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Follow-up Modal */}
        {showFollowUpForm && selectedOffer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Schedule Follow-up</h3>
                  <button
                    onClick={() => {
                      setShowFollowUpForm(false);
                      setSelectedOffer(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Follow-up Type
                    </label>
                    <select
                      value={newFollowUp.type}
                      onChange={(e) => setNewFollowUp(prev => ({ ...prev, type: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="email">Email</option>
                      <option value="call">Phone Call</option>
                      <option value="meeting">Meeting</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Scheduled Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={newFollowUp.scheduledAt}
                      onChange={(e) => setNewFollowUp(prev => ({ ...prev, scheduledAt: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={newFollowUp.notes}
                      onChange={(e) => setNewFollowUp(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Follow-up details..."
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => {
                      setShowFollowUpForm(false);
                      setSelectedOffer(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addFollowUp}
                    disabled={!newFollowUp.scheduledAt || !newFollowUp.notes.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Schedule Follow-up
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

export default OfferManagement;