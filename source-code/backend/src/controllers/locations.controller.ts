import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Country reference list is public-domain factual data (names/ISO codes),
// trimmed from the mledoze/countries dataset (ODbL)   see backend/src/data/countries.json.
let countriesCache: { code: string; name: string }[] | null = null;
const loadCountries = (): { code: string; name: string }[] => {
  if (!countriesCache) {
    const dataPath = path.join(__dirname, '../data/countries.json');
    countriesCache = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }
  return countriesCache!;
};

export const getCountries = (_req: Request, res: Response): void => {
  res.json({ success: true, data: loadCountries() });
};

export const getProvinces = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<{ province_name: string }>(
      'SELECT DISTINCT province_name FROM rw_locations ORDER BY province_name'
    );
    res.json({ success: true, data: result.rows.map(r => r.province_name) });
  } catch (error) {
    logger.error('getProvinces error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch provinces'});
  }
};

export const getDistricts = async (req: Request, res: Response): Promise<void> => {
  try {
    const province = String(req.query.province || '').trim();
    if (!province) {
      res.status(400).json({ success: false, message: 'province query parameter is required'});
      return;
    }
    const result = await query<{ district_name: string }>(
      'SELECT DISTINCT district_name FROM rw_locations WHERE province_name = $1 ORDER BY district_name',
      [province]
    );
    res.json({ success: true, data: result.rows.map(r => r.district_name) });
  } catch (error) {
    logger.error('getDistricts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch districts'});
  }
};

// District names are globally unique across Rwanda (verified against the
// source dataset), so filtering by district alone is unambiguous here.
export const getSectors = async (req: Request, res: Response): Promise<void> => {
  try {
    const district = String(req.query.district || '').trim();
    if (!district) {
      res.status(400).json({ success: false, message: 'district query parameter is required'});
      return;
    }
    const result = await query<{ sector_name: string }>(
      'SELECT DISTINCT sector_name FROM rw_locations WHERE district_name = $1 ORDER BY sector_name',
      [district]
    );
    res.json({ success: true, data: result.rows.map(r => r.sector_name) });
  } catch (error) {
    logger.error('getSectors error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sectors'});
  }
};

// Sector names DO repeat across different districts (e.g. "Nyarugenge" sector
// exists in more than one district), so district must be included to
// disambiguate   sector name alone is not a safe filter.
export const getCells = async (req: Request, res: Response): Promise<void> => {
  try {
    const district = String(req.query.district || '').trim();
    const sector = String(req.query.sector || '').trim();
    if (!district || !sector) {
      res.status(400).json({ success: false, message: 'district and sector query parameters are required'});
      return;
    }
    const result = await query<{ cell_name: string }>(
      'SELECT DISTINCT cell_name FROM rw_locations WHERE district_name = $1 AND sector_name = $2 ORDER BY cell_name',
      [district, sector]
    );
    res.json({ success: true, data: result.rows.map(r => r.cell_name) });
  } catch (error) {
    logger.error('getCells error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch cells'});
  }
};

// Cell names repeat heavily across different sectors, so the full
// district+sector ancestor chain is required to disambiguate.
export const getVillages = async (req: Request, res: Response): Promise<void> => {
  try {
    const district = String(req.query.district || '').trim();
    const sector = String(req.query.sector || '').trim();
    const cell = String(req.query.cell || '').trim();
    if (!district || !sector || !cell) {
      res.status(400).json({ success: false, message: 'district, sector and cell query parameters are required'});
      return;
    }
    const result = await query<{ village_name: string }>(
      'SELECT DISTINCT village_name FROM rw_locations WHERE district_name = $1 AND sector_name = $2 AND cell_name = $3 ORDER BY village_name',
      [district, sector, cell]
    );
    res.json({ success: true, data: result.rows.map(r => r.village_name) });
  } catch (error) {
    logger.error('getVillages error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch villages'});
  }
};
