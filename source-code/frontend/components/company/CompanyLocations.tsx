import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Plus, Edit3, Trash2, Building2, Phone, Mail, Users, Loader2 } from 'lucide-react';
import type { NotifyFn } from './CompanyProfile';
import { getCompanyLocations, addCompanyLocation, updateCompanyLocation, deleteCompanyLocation } from '../../services/companyAPI';

interface Location {
  id: string;
  name?: string;
  type: 'headquarters' | 'branch' | 'remote_hub' | 'coworking' | 'office';
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  location?: { lat: number; lng: number };
  phone?: string;
  email?: string;
  hours?: any;
  amenities?: string[];
  isHiring?: boolean;
  employeeCount?: number;
  createdAt: string;
  updatedAt: string;
}

type FormData = {
  name: string;
  type: Location['type'];
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude: string;
  longitude: string;
  phone: string;
  email: string;
  hours: object;
  amenities: string[];
  isHiring: boolean;
  employeeCount: string;
};

const emptyForm: FormData = {
  name: '',
  type: 'office',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  latitude: '',
  longitude: '',
  phone: '',
  email: '',
  hours: {},
  amenities: [],
  isHiring: false,
  employeeCount: '',
};

const locationToForm = (location: Location): FormData => ({
  name: location.name || '',
  type: location.type || 'office',
  addressLine1: location.addressLine1 || '',
  addressLine2: location.addressLine2 || '',
  city: location.city || '',
  state: location.state || '',
  postalCode: location.postalCode || '',
  country: location.country || '',
  latitude: location.latitude != null ? parseFloat(location.latitude.toString()).toString() : '',
  longitude: location.longitude != null ? parseFloat(location.longitude.toString()).toString() : '',
  phone: location.phone || '',
  email: location.email || '',
  hours: location.hours || {},
  amenities: location.amenities || [],
  isHiring: location.isHiring === true,
  employeeCount: location.employeeCount != null && location.employeeCount > 0
    ? location.employeeCount.toString()
    : '',
});

const CompanyLocations: React.FC<{ onNotify?: NotifyFn }> = ({ onNotify }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoGeocode, setAutoGeocode] = useState(true);
  const skipGeocode = useRef(false);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const response = await getCompanyLocations();

      const mappedLocations = (response.data || []).map((loc: any) => ({
        id: loc.id || '',
        name: loc.name || '',
        type: loc.type || 'office',
        // Support both camelCase (already transformed) and snake_case (raw API)
        addressLine1: loc.addressLine1 || loc.address_line1 || '',
        addressLine2: loc.addressLine2 || loc.address_line2 || '',
        city: loc.city || '',
        state: loc.state || '',
        postalCode: loc.postalCode || loc.postal_code || '',
        country: loc.country || '',
        latitude: loc.latitude,
        longitude: loc.longitude,
        location: loc.location,
        phone: loc.phone || '',
        email: loc.email || '',
        hours: loc.hours || {},
        amenities: loc.amenities || [],
        isHiring: loc.isHiring ?? loc.is_hiring ?? false,
        employeeCount: loc.employeeCount != null
          ? Number(loc.employeeCount)
          : loc.employee_count != null
            ? Number(loc.employee_count)
            : 0,
        createdAt: loc.createdAt || loc.created_at || '',
        updatedAt: loc.updatedAt || loc.updated_at || '',
      }));

      setLocations(mappedLocations);
    } catch (err: any) {
      setError(err.message || 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (skipGeocode.current) return;
    if (!autoGeocode) return;
    if (!formData.addressLine1 || !formData.city || !formData.country) return;

    const id = setTimeout(async () => {
      if (skipGeocode.current) return;
      try {
        const q = encodeURIComponent(
          `${formData.addressLine1} ${formData.addressLine2} ${formData.city} ${formData.state} ${formData.country}`.trim()
        );
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
          { headers: { 'User-Agent': 'RecruitmentPlatform/1.0' } }
        );
        const data = await res.json();
        if (data?.[0]) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            setFormData(prev => ({ ...prev, latitude: lat.toString(), longitude: lng.toString() }));
            setSuccess('Coordinates found!');
            setTimeout(() => setSuccess(null), 3000);
          }
        }
      } catch (e) {
        console.error('Geocode error:', e);
      }
    }, 1000);

    return () => clearTimeout(id);
  }, [formData.addressLine1, formData.addressLine2, formData.city, formData.state, formData.country, autoGeocode]);

  const openAddForm = () => {
    skipGeocode.current = false;
    setEditingLocation(null);
    setFormData(emptyForm);
    setAutoGeocode(true);
    setShowAddForm(true);
  };

  const closeForm = () => {
    skipGeocode.current = false;
    setShowAddForm(false);
    setEditingLocation(null);
    setFormData(emptyForm);
    setAutoGeocode(true);
  };

  const handleEdit = (location: Location) => {
    skipGeocode.current = true;
    const hasCoords = location.latitude != null && location.longitude != null;
    setAutoGeocode(!hasCoords);
    setEditingLocation(location);
    setFormData(locationToForm(location));
    setShowAddForm(true);
    setTimeout(() => { skipGeocode.current = false; }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);

      const latitude = formData.latitude ? parseFloat(formData.latitude) : undefined;
      const longitude = formData.longitude ? parseFloat(formData.longitude) : undefined;

      if (
        (latitude !== undefined && longitude === undefined) ||
        (latitude === undefined && longitude !== undefined)
      ) {
        setError('Both latitude and longitude must be provided together, or neither');
        setSaving(false);
        return;
      }

      const locationData: any = {
        name: formData.name || undefined,
        type: formData.type,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2 || undefined,
        city: formData.city,
        state: formData.state || undefined,
        postalCode: formData.postalCode || undefined,
        country: formData.country,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        isHiring: formData.isHiring,
        employeeCount: formData.employeeCount ? parseInt(formData.employeeCount, 10) : undefined,
        latitude,
        longitude,
      };

      Object.keys(locationData).forEach(key => {
        if (locationData[key] === undefined) delete locationData[key];
      });

      if (editingLocation) {
        await updateCompanyLocation(editingLocation.id, locationData);
        setSuccess('Location updated successfully!');
        onNotify?.('success', 'Location Updated', `"${locationData.name || locationData.city}" has been updated.`);
      } else {
        await addCompanyLocation(locationData);
        setSuccess('Location added successfully!');
        onNotify?.('success', 'Location Added', `"${locationData.name || locationData.city}" has been added.`);
      }

      await loadLocations();
      closeForm();
    } catch (err: any) {
      const msg = err.message || 'Failed to save location';
      setError(msg);
      onNotify?.('error', 'Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (locationId: string) => {
    if (!confirm('Are you sure you want to delete this location?')) return;
    try {
      await deleteCompanyLocation(locationId);
      setSuccess('Location deleted successfully!');
      onNotify?.('info', 'Location Deleted', 'The location has been removed.');
      await loadLocations();
    } catch (err: any) {
      const msg = err.message || 'Failed to delete location';
      setError(msg);
      onNotify?.('error', 'Delete Failed', msg);
    }
  };

  const locationTypes = [
    { value: 'headquarters', label: 'Headquarters', icon: Building2 },
    { value: 'branch', label: 'Branch Office', icon: MapPin },
    { value: 'remote_hub', label: 'Remote Hub', icon: MapPin },
    { value: 'coworking', label: 'Coworking Space', icon: MapPin },
    { value: 'office', label: 'Office', icon: MapPin },
  ];

  const getLocationTypeInfo = (type: string) =>
    locationTypes.find(t => t.value === type) || locationTypes[4];

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <p className="mt-2 text-gray-600">Loading locations...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Company Locations</h2>
          <p className="text-gray-600 mt-1">Manage your office locations and addresses</p>
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span>Add Location</span>
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      {showAddForm && (
        <motion.div
          key={editingLocation?.id || 'new'}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-8 bg-gray-50 rounded-lg p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingLocation ? 'Edit Location' : 'Add New Location'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Location Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Main Office, Downtown Branch"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Location Type *</label>
                <select
                  value={formData.type}
                  onChange={e => setFormData(p => ({ ...p, type: e.target.value as Location['type'] }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  {locationTypes.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address Line 1 *</label>
                <input
                  type="text"
                  value={formData.addressLine1}
                  onChange={e => setFormData(p => ({ ...p, addressLine1: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Street address"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address Line 2</label>
                <input
                  type="text"
                  value={formData.addressLine2}
                  onChange={e => setFormData(p => ({ ...p, addressLine2: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Apartment, suite, etc."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">City *</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={e => setFormData(p => ({ ...p, city: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">State/Province</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={e => setFormData(p => ({ ...p, state: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Postal Code</label>
                  <input
                    type="text"
                    value={formData.postalCode}
                    onChange={e => setFormData(p => ({ ...p, postalCode: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Country *</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={e => setFormData(p => ({ ...p, country: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Country name"
                  required
                />
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-medium text-gray-700">Coordinates (Optional)</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="autoGeocode"
                    checked={autoGeocode}
                    onChange={e => setAutoGeocode(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <label htmlFor="autoGeocode" className="text-sm text-gray-600">Auto-detect from address</label>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Latitude</label>
                  <input
                    type="text"
                    value={formData.latitude}
                    onChange={e => setFormData(p => ({ ...p, latitude: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="-90 to 90"
                  />
                  {formData.latitude && (parseFloat(formData.latitude) < -90 || parseFloat(formData.latitude) > 90) && (
                    <p className="text-xs text-red-600 mt-1">Latitude must be between -90 and 90</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Longitude</label>
                  <input
                    type="text"
                    value={formData.longitude}
                    onChange={e => setFormData(p => ({ ...p, longitude: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="-180 to 180"
                  />
                  {formData.longitude && (parseFloat(formData.longitude) < -180 || parseFloat(formData.longitude) > 180) && (
                    <p className="text-xs text-red-600 mt-1">Longitude must be between -180 and 180</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="contact@company.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Employee Count</label>
                <input
                  type="number"
                  value={formData.employeeCount}
                  onChange={e => setFormData(p => ({ ...p, employeeCount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Number of employees at this location"
                  min="0"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isHiring"
                  checked={formData.isHiring}
                  onChange={e => setFormData(p => ({ ...p, isHiring: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="isHiring" className="ml-2 text-sm text-gray-700">
                  Currently hiring at this location
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors min-w-[140px] justify-center">
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : editingLocation ? 'Update Location' : 'Add Location'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="space-y-4">
        {locations.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No locations added yet</h3>
            <p className="text-gray-600 mb-4">Add your first office location to get started</p>
            <button onClick={openAddForm} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              Add Location
            </button>
          </div>
        ) : (
          locations.map(location => {
            const typeInfo = getLocationTypeInfo(location.type);
            const Icon = typeInfo.icon;
            return (
              <motion.div
                key={location.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Icon className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {location.name || `${typeInfo.label} - ${location.city}`}
                        </h3>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          location.type === 'headquarters' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {typeInfo.label}
                        </span>
                        {location.isHiring && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Hiring
                          </span>
                        )}
                      </div>
                      <div className="text-gray-600 space-y-1">
                        <p>{location.addressLine1}</p>
                        {location.addressLine2 && <p>{location.addressLine2}</p>}
                        <p>{location.city}{location.state ? `, ${location.state}` : ''} {location.postalCode}</p>
                        <p>{location.country}</p>
                      </div>
                      <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
                        {location.phone && (
                          <div className="flex items-center space-x-1">
                            <Phone className="h-4 w-4" />
                            <span>{location.phone}</span>
                          </div>
                        )}
                        {location.email && (
                          <div className="flex items-center space-x-1">
                            <Mail className="h-4 w-4" />
                            <span>{location.email}</span>
                          </div>
                        )}
                        {(location.employeeCount ?? 0) > 0 && (
                          <div className="flex items-center space-x-1">
                            <Users className="h-4 w-4" />
                            <span>{location.employeeCount} employees</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEdit(location)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit3 className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(location.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CompanyLocations;