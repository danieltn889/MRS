import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Heart, Plus, X, Save, Users, Lightbulb, Target, HeartHandshake, MessageSquare, BarChart2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { NotifyFn } from './CompanyProfile';
import { getCompanyCulture, updateCompanyCulture } from '../../services/companyAPI';

interface CultureData {
  attributes?: Record<string, number>;
  values?: string[];
  description?: string;
  workEnvironment?: string;
  teamDynamics?: string;
  communicationStyle?: string;
  decisionMaking?: string;
  feedbackCulture?: string;
  workLifeBalance?: string;
  diversityInclusion?: string;
  employeeTestimonials?: any[];
}

const PRESET_VALUES = [
  'Innovation', 'Integrity', 'Collaboration', 'Excellence', 'Diversity',
  'Transparency', 'Ownership', 'Growth', 'Customer-first', 'Sustainability',
  'Agility', 'Respect', 'Learning', 'Impact', 'Trust',
];

const cultureSections = [
  { id: 'description', title: 'Culture Overview', icon: Heart, color: 'pink', max: 1000, placeholder: 'Describe your company culture overall — what candidates can expect day to day…' },
  { id: 'workEnvironment', title: 'Work Environment', icon: Users, color: 'blue', max: 600, placeholder: 'Describe the physical workspace, remote flexibility, open-plan vs private offices…' },
  { id: 'teamDynamics', title: 'Team Dynamics', icon: Users, color: 'indigo', max: 600, placeholder: 'How do teams collaborate, pair, conduct stand-ups, handle disagreements…' },
  { id: 'communicationStyle', title: 'Communication Style', icon: MessageSquare, color: 'cyan', max: 600, placeholder: 'Async vs sync, Slack vs email, meeting cadence, documentation culture…' },
  { id: 'decisionMaking', title: 'Decision Making', icon: Target, color: 'amber', max: 600, placeholder: 'Top-down vs consensus, who has ownership, how proposals are raised…' },
  { id: 'feedbackCulture', title: 'Feedback Culture', icon: BarChart2, color: 'orange', max: 600, placeholder: 'Performance reviews, 360 feedback, recognition practices, psychological safety…' },
  { id: 'workLifeBalance', title: 'Work-Life Balance', icon: Heart, color: 'green', max: 600, placeholder: 'Working hours, flexible scheduling, PTO policy, parental leave…' },
  { id: 'diversityInclusion', title: 'Diversity & Inclusion', icon: HeartHandshake, color: 'purple', max: 600, placeholder: 'DEI initiatives, affinity groups, hiring practices, belonging programmes…' },
];

const iconColorMap: Record<string, string> = {
  pink: 'bg-pink-100 text-pink-600',
  blue: 'bg-blue-100 text-blue-600',
  indigo: 'bg-indigo-100 text-indigo-600',
  cyan: 'bg-cyan-100 text-cyan-600',
  amber: 'bg-amber-100 text-amber-600',
  orange: 'bg-orange-100 text-orange-600',
  green: 'bg-green-100 text-green-600',
  purple: 'bg-purple-100 text-purple-600',
};

const CompanyCulture: React.FC<{ onNotify?: NotifyFn }> = ({ onNotify }) => {
  const [cultureData, setCultureData] = useState<CultureData>({ attributes: {}, values: [], employeeTestimonials: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [newValue, setNewValue] = useState('');
  const [newAttribute, setNewAttribute] = useState('');
  const [valueError, setValueError] = useState('');

  useEffect(() => { loadCulture(); }, []);
  useEffect(() => {
    if (notification) { const t = setTimeout(() => setNotification(null), 4000); return () => clearTimeout(t); }
  }, [notification]);

  const loadCulture = async () => {
    try {
      setLoading(true);
      const response = await getCompanyCulture();
      const data = response.data || {};
      if (!data.attributes || Array.isArray(data.attributes)) data.attributes = {};
      setCultureData(data);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load culture data' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateCompanyCulture({ ...cultureData, attributes: cultureData.attributes || {}, values: cultureData.values || [], employeeTestimonials: cultureData.employeeTestimonials || [] });
      const valCount = (cultureData.values || []).length;
      const attrCount = Object.keys(cultureData.attributes || {}).length;
      setNotification({ type: 'success', message: 'Culture & values saved successfully!' });
      onNotify?.('success', 'Culture Saved', `Culture & values saved.`, `${valCount} values · ${attrCount} attributes`);
    } catch (err: any) {
      const msg = err.message || 'Failed to save culture data';
      setNotification({ type: 'error', message: msg });
      onNotify?.('error', 'Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof CultureData, value: any) => setCultureData(prev => ({ ...prev, [field]: value }));

  const addValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.length > 50) { setValueError('Value must be 50 characters or less'); return; }
    const current = cultureData.values || [];
    if (current.map(v => v.toLowerCase()).includes(trimmed.toLowerCase())) { setValueError('This value already exists'); return; }
    updateField('values', [...current, trimmed]);
    setNewValue('');
    setValueError('');
  };

  const removeValue = (value: string) => updateField('values', (cultureData.values || []).filter(v => v !== value));

  const addAttribute = (attr: string) => {
    const trimmed = attr.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase().replace(/\s+/g, '_');
    const current = { ...(cultureData.attributes || {}) };
    if (current[key] !== undefined) return;
    current[key] = 3;
    updateField('attributes', current);
    setNewAttribute('');
  };

  const removeAttribute = (key: string) => {
    const current = { ...(cultureData.attributes || {}) };
    delete current[key];
    updateField('attributes', current);
  };

  const updateAttributeScore = (key: string, score: number) => {
    updateField('attributes', { ...(cultureData.attributes || {}), [key]: score });
  };

  const getAttributesArray = () =>
    Object.entries(cultureData.attributes || {}).map(([key, value]) => ({
      key,
      name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      score: value as number,
    }));

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center min-h-[300px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Loading culture data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-900">Culture &amp; Values</h2>
        <p className="text-sm text-gray-500 mt-0.5">Define your company culture to attract the right candidates</p>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`flex items-start gap-3 p-4 rounded-lg border ${notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {notification.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />}
          <span className="text-sm font-medium">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-auto opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Core Values */}
      <section className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 bg-pink-100 rounded-lg flex items-center justify-center">
            <Heart className="h-5 w-5 text-pink-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Core Values</h3>
            <p className="text-xs text-gray-500">What principles guide your company?</p>
          </div>
          <span className="ml-auto text-sm text-gray-500">{(cultureData.values || []).length} value{(cultureData.values || []).length !== 1 ? 's' : ''}</span>
        </div>

        {/* Quick-add presets */}
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Quick add:</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_VALUES.filter(v => !(cultureData.values || []).map(x => x.toLowerCase()).includes(v.toLowerCase())).slice(0, 10).map(preset => (
              <button key={preset} onClick={() => addValue(preset)}
                className="px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-blue-100 hover:text-blue-700 transition-colors border border-transparent hover:border-blue-200">
                + {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <input type="text" value={newValue} onChange={e => { setNewValue(e.target.value); setValueError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addValue(newValue); } }}
            placeholder="Type a custom value and press Enter"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <button onClick={() => addValue(newValue)}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1 text-sm">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {valueError && <p className="text-xs text-red-600 flex items-center gap-1 mb-2"><AlertCircle className="h-3 w-3" />{valueError}</p>}

        {(cultureData.values || []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(cultureData.values || []).map((value, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-pink-50 text-pink-800 border border-pink-200">
                {value}
                <button onClick={() => removeValue(value)} className="text-pink-400 hover:text-pink-700 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Cultural Attributes */}
      <section className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 bg-amber-100 rounded-lg flex items-center justify-center">
            <Lightbulb className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Cultural Attributes</h3>
            <p className="text-xs text-gray-500">Rate how strongly each attribute describes your culture (1–5)</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <input type="text" value={newAttribute} onChange={e => setNewAttribute(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAttribute(newAttribute); } }}
            placeholder="e.g., Innovative, Fast-paced, Data-driven"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <button onClick={() => addAttribute(newAttribute)}
            className="px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-1 text-sm">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>

        {getAttributesArray().length > 0 ? (
          <div className="space-y-2">
            {getAttributesArray().map(attr => (
              <div key={attr.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-sm font-medium text-gray-700">{attr.name}</span>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => updateAttributeScore(attr.key, n)}
                        className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${attr.score >= n ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-500 hover:bg-amber-100'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => removeAttribute(attr.key)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No attributes added yet. Add one above.</p>
        )}
      </section>

      {/* Culture Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {cultureSections.map(section => {
          const Icon = section.icon;
          const val = (cultureData[section.id as keyof CultureData] as string) || '';
          const overLimit = val.length > section.max;
          return (
            <motion.div key={section.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl border p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconColorMap[section.color]}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <h4 className="text-sm font-semibold text-gray-900">{section.title}</h4>
              </div>
              <textarea value={val} onChange={e => updateField(section.id as keyof CultureData, e.target.value)}
                rows={4} maxLength={section.max + 50}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${overLimit ? 'border-orange-400' : 'border-gray-300'}`}
                placeholder={section.placeholder} />
              <p className={`text-xs mt-1 text-right ${overLimit ? 'text-orange-500 font-medium' : val.length > section.max * 0.85 ? 'text-amber-500' : 'text-gray-400'}`}>
                {val.length}/{section.max}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm">
          <Save className="h-4 w-4" />
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save Culture</>}
        </button>
      </div>
    </div>
  );
};

export default CompanyCulture;
