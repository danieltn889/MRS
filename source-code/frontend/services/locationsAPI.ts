// Read-only reference data for the candidate signup location section:
// Rwanda's administrative hierarchy (province -> village) and the country list.

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

const get = async (path: string): Promise<string[]> => {
  const response = await fetch(`${API_BASE_URL}/locations/${path}`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to load location data');
  }
  return data.data;
};

export interface Country {
  code: string;
  name: string;
}

export const getCountries = async (): Promise<Country[]> => {
  const response = await fetch(`${API_BASE_URL}/locations/countries`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to load countries');
  }
  return data.data;
};

export const getProvinces = (): Promise<string[]> => get('provinces');

export const getDistricts = (province: string): Promise<string[]> =>
  get(`districts?province=${encodeURIComponent(province)}`);

export const getSectors = (district: string): Promise<string[]> =>
  get(`sectors?district=${encodeURIComponent(district)}`);

export const getCells = (district: string, sector: string): Promise<string[]> =>
  get(`cells?district=${encodeURIComponent(district)}&sector=${encodeURIComponent(sector)}`);

export const getVillages = (district: string, sector: string, cell: string): Promise<string[]> =>
  get(`villages?district=${encodeURIComponent(district)}&sector=${encodeURIComponent(sector)}&cell=${encodeURIComponent(cell)}`);
