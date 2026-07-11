import express, { Router } from 'express';
const router: Router = express.Router();

import {
  getCountries,
  getProvinces,
  getDistricts,
  getSectors,
  getCells,
  getVillages
} from '../../controllers/locations.controller.js';

// Public read-only reference data used by the candidate signup cascading
// location dropdowns and the country selector. No auth required.

// @route   GET /api/v1/locations/countries
router.get('/countries', getCountries);

// @route   GET /api/v1/locations/provinces
router.get('/provinces', getProvinces);

// @route   GET /api/v1/locations/districts?province=
router.get('/districts', getDistricts);

// @route   GET /api/v1/locations/sectors?district=
router.get('/sectors', getSectors);

// @route   GET /api/v1/locations/cells?district=&sector=
router.get('/cells', getCells);

// @route   GET /api/v1/locations/villages?district=&sector=&cell=
router.get('/villages', getVillages);

export default router;
