import React, { useState } from 'react';
import { Plus, Edit, Trash2, Save, X, ExternalLink, Globe, Github, Linkedin, Briefcase } from 'lucide-react';
import { addPortfolioLink, updatePortfolioLink, deletePortfolioLink } from '../../services/candidateAPI';

// =====================================================
// TYPESCRIPT INTERFACES
// =====================================================
interface PortfolioLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  platform: string;
  display_order?: number;
  is_primary?: boolean;
  is_verified?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface PortfolioSectionProps {
  profile: { 
    portfolioLinks?: PortfolioLink[];
    portfolio?: PortfolioLink[];
  } | null;
  onUpdate: () => void;
}

interface PortfolioFormData {
  title: string;
  url: string;
  description: string;
  platform: string;
  displayOrder: number;
  isPrimary: boolean;
}

// =====================================================
// COMPONENT
// =====================================================
const PortfolioSection: React.FC<PortfolioSectionProps> = ({ profile, onUpdate }) => {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PortfolioFormData>({
    title: '',
    url: '',
    description: '',
    platform: 'personal',
    displayOrder: 0,
    isPrimary: false
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [urlError, setUrlError] = useState<string>('');

  // FIX: Use portfolioLinks from the correct field
  const portfolioLinks = profile?.portfolioLinks || profile?.portfolio || [];

  const resetForm = (): void => {
    setFormData({
      title: '',
      url: '',
      description: '',
      platform: 'personal',
      displayOrder: 0,
      isPrimary: false
    });
    setUrlError('');
  };

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      alert('Please enter a title');
      return;
    }
    
    if (!formData.url.trim()) {
      alert('Please enter a URL');
      return;
    }

    if (!validateUrl(formData.url)) {
      setUrlError('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    setUrlError('');
    setLoading(true);

    try {
      const submitData = {
        title: formData.title,
        url: formData.url,
        description: formData.description,
        platform: formData.platform || 'personal',
        displayOrder: formData.displayOrder,
        isPrimary: formData.isPrimary
      };

      if (editingId) {
        await updatePortfolioLink(editingId, submitData);
      } else {
        await addPortfolioLink(submitData);
      }

      onUpdate();
      setIsAdding(false);
      setEditingId(null);
      resetForm();
    } catch (error: any) {
      alert('Error saving portfolio link: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (link: PortfolioLink): void => {
    setFormData({
      title: link.title || '',
      url: link.url || '',
      description: link.description || '',
      platform: link.platform || 'personal',
      displayOrder: link.display_order || 0,
      isPrimary: link.is_primary || false
    });
    setEditingId(link.id);
    setIsAdding(true);
    setUrlError('');
  };

  const handleDelete = async (linkId: string): Promise<void> => {
    if (!confirm('Are you sure you want to remove this portfolio link?')) return;

    try {
      await deletePortfolioLink(linkId);
      onUpdate();
    } catch (error: any) {
      alert('Error removing portfolio link: ' + (error.message || 'Unknown error'));
    }
  };

  const handleCancel = (): void => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const getTypeIcon = (type: string): React.ElementType => {
    const icons: Record<string, React.ElementType> = {
      personal: Globe,
      github: Github,
      linkedin: Linkedin,
      professional: Briefcase,
      portfolio: Globe,
      behance: ExternalLink,
      dribbble: ExternalLink,
      medium: ExternalLink,
      other: ExternalLink
    };
    return icons[type] || ExternalLink;
  };

  const getTypeLabel = (platform: string): string => {
    const labels: Record<string, string> = {
      personal: 'Personal Website',
      github: 'GitHub',
      linkedin: 'LinkedIn',
      professional: 'Professional',
      portfolio: 'Portfolio',
      behance: 'Behance',
      dribbble: 'Dribbble',
      medium: 'Medium',
      other: 'Other'
    };
    return labels[platform] || 'Other';
  };

  const getTypeColor = (platform: string): string => {
    const colors: Record<string, string> = {
      personal: 'bg-blue-100 text-blue-800',
      github: 'bg-gray-100 text-gray-800',
      linkedin: 'bg-blue-100 text-blue-800',
      professional: 'bg-green-100 text-green-800',
      portfolio: 'bg-purple-100 text-purple-800',
      behance: 'bg-indigo-100 text-indigo-800',
      dribbble: 'bg-pink-100 text-pink-800',
      medium: 'bg-yellow-100 text-yellow-800',
      other: 'bg-gray-100 text-gray-800'
    };
    return colors[platform] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Portfolio & Links</h2>
          <p className="text-sm text-gray-600">Showcase your work and connect your online presence</p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            Add Link
          </button>
        )}
      </div>

      {/* Portfolio Form */}
      {isAdding && (
        <div className="bg-gray-50 p-6 rounded-lg border">
          <h3 className="text-lg font-medium mb-4">
            {editingId ? 'Edit Portfolio Link' : 'Add Portfolio Link'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., My Portfolio Website"
                required
              />
            </div>

            {/* URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL *
              </label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => {
                  setFormData({...formData, url: e.target.value});
                  setUrlError('');
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  urlError ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="https://example.com"
                required
              />
              {urlError && (
                <p className="mt-1 text-sm text-red-600">{urlError}</p>
              )}
            </div>

            {/* Platform */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Platform
              </label>
              <select
                value={formData.platform}
                onChange={(e) => setFormData({...formData, platform: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="personal">Personal Website</option>
                <option value="github">GitHub</option>
                <option value="linkedin">LinkedIn</option>
                <option value="professional">Professional Portfolio</option>
                <option value="portfolio">Portfolio</option>
                <option value="behance">Behance</option>
                <option value="dribbble">Dribbble</option>
                <option value="medium">Medium</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Brief description of this link..."
              />
            </div>

            {/* Primary Link */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPrimary"
                checked={formData.isPrimary}
                onChange={(e) => setFormData({...formData, isPrimary: e.target.checked})}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isPrimary" className="text-sm text-gray-700">
                This is my primary portfolio link
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={18} />
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                <X size={18} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Portfolio Links List */}
      <div className="space-y-4">
        {portfolioLinks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Globe size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No portfolio links added yet</p>
            <p className="text-sm">Add links to your portfolio, GitHub, LinkedIn, or other professional profiles</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {portfolioLinks.map((link) => {
              const IconComponent = getTypeIcon(link.platform);
              return (
                <div key={link.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <IconComponent size={20} className="text-gray-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{link.title}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(link.platform)}`}>
                            {getTypeLabel(link.platform)}
                          </span>
                          {link.is_primary && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                              Primary
                            </span>
                          )}
                          {link.is_verified && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                              ✓ Verified
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(link)}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(link.id)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium break-all"
                    >
                      <ExternalLink size={14} />
                      {link.url.length > 50 ? link.url.substring(0, 50) + '...' : link.url}
                    </a>

                    {link.description && (
                      <p className="text-sm text-gray-700 mt-2">{link.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioSection;