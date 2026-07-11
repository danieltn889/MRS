import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RwLocationRow = {
  province_code: string; province_name: string;
  district_code: string; district_name: string;
  sector_code: string; sector_name: string;
  cell_code: string; cell_name: string;
  village_code: string; village_name: string;
};

const dataPath = path.join(__dirname, '../rwanda-locations.json');
const locations: RwLocationRow[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Mirrors the WHERE clause in isValidRwandaLocationChain (src/utils/rwandaLocation.ts)
// as a pure in-memory check   exercises the same matching rule without a live DB.
const chainExists = (chain: Omit<RwLocationRow, 'province_code'| 'district_code'| 'sector_code'| 'cell_code'| 'village_code'>): boolean =>
  locations.some(r =>
    r.province_name === chain.province_name &&
    r.district_name === chain.district_name &&
    r.sector_name === chain.sector_name &&
    r.cell_name === chain.cell_name &&
    r.village_name === chain.village_name
  );

test('dataset covers the real Rwanda administrative hierarchy counts', () => {
  // Codes are unique identifiers per level; names are NOT   e.g. a "Nyarugenge"
  // sector exists in more than one district, and village names repeat even
  // more heavily. Counting by code (not name) is the correct measure here.
  const provinceCodes = new Set(locations.map(r => r.province_code));
  const districtCodes = new Set(locations.map(r => r.district_code));
  const sectorCodes = new Set(locations.map(r => r.sector_code));
  const cellCodes = new Set(locations.map(r => r.cell_code));
  const villageCodes = new Set(locations.map(r => r.village_code));

  assert.equal(provinceCodes.size, 5);
  assert.equal(districtCodes.size, 30);
  assert.equal(sectorCodes.size, 416);
  assert.equal(cellCodes.size, 2148);
  assert.equal(villageCodes.size, locations.length); // village_code is unique per row
});

test('sector/cell/village NAMES are not globally unique   confirms the API and\n   isValidRwandaLocationChain must scope lookups by ancestor, not name alone', () => {
  const districtNames = new Set(locations.map(r => r.district_name));
  const sectorNames = new Set(locations.map(r => r.sector_name));
  // District names ARE globally unique (safe to filter sectors by district alone).
  assert.equal(districtNames.size, 30);
  // Sector names are NOT (fewer unique names than actual sectors)   this is
  // exactly why getCells()/getVillages() require the full ancestor chain.
  assert.ok(sectorNames.size < 416);
});

test('province names match the exact set requested for signup', () => {
  const provinces = new Set(locations.map(r => r.province_name));
  assert.deepEqual(
    [...provinces].sort(),
    ['Eastern Province', 'Kigali City', 'Northern Province', 'Southern Province', 'Western Province'].sort()
  );
});

test('a real, complete province -> village chain is accepted', () => {
  const real = locations[0]!;
  assert.equal(chainExists({
    province_name: real.province_name,
    district_name: real.district_name,
    sector_name: real.sector_name,
    cell_name: real.cell_name,
    village_name: real.village_name,
  }), true);
});

test('a village paired with the wrong cell is rejected', () => {
  const real = locations[0]!;
  // Find a village from a different cell to build an inconsistent chain.
  const otherCellRow = locations.find(r => r.cell_name !== real.cell_name)!;
  assert.equal(chainExists({
    province_name: real.province_name,
    district_name: real.district_name,
    sector_name: real.sector_name,
    cell_name: real.cell_name,
    village_name: otherCellRow.village_name, // belongs to a different cell
  }), false);
});

test('a real district paired with a mismatched province is rejected', () => {
  const real = locations[0]!;
  const otherProvinceRow = locations.find(r => r.province_name !== real.province_name)!;
  assert.equal(chainExists({
    province_name: otherProvinceRow.province_name,
    district_name: real.district_name, // belongs to a different province
    sector_name: real.sector_name,
    cell_name: real.cell_name,
    village_name: real.village_name,
  }), false);
});
