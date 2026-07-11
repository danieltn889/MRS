import { query } from '../config/database.js';

export interface RwandaLocationChain {
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
}

// Confirms the full province -> district -> sector -> cell -> village chain
// exists together as a real row in rw_locations, rejecting mismatched
// combinations (e.g. a real sector paired with a district it doesn't belong to).
export const isValidRwandaLocationChain = async (chain: RwandaLocationChain): Promise<boolean> => {
  const { province, district, sector, cell, village } = chain;
  if (!province || !district || !sector || !cell || !village) return false;

  const result = await query(
    `SELECT 1 FROM rw_locations
     WHERE province_name = $1 AND district_name = $2 AND sector_name = $3
       AND cell_name = $4 AND village_name = $5
     LIMIT 1`,
    [province, district, sector, cell, village]
  );
  return (result.rowCount ?? 0) > 0;
};
