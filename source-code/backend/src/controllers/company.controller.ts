import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { logger } from '../utils/logger.js';
import { query, getClient } from '../config/database.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

// Company Profile Management (Story 26)

// Update company profile
// In your company.controller.ts - update the updateCompanyProfile function:

export const updateCompanyProfile = async (req: AuthenticatedRequest, res: Response) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Log what's coming from frontend for debugging
    console.log('🔍 Received update data:', {
      legalName: req.body.legalName,
      foundedYear: req.body.foundedYear,
      name: req.body.name,
      // ... other fields
    });

    let {
      name,
      legalName,
      industry,
      industries,
      size,
      foundedYear,
      headquartersLocation,
      website,
      description,
      shortDescription,
      mission,
      vision,
      values,
      culture,
      socialLinks
    } = req.body;

    // 🔧 CRITICAL FIX: Convert empty strings to NULL for optional fields
    // This ensures COALESCE works correctly
    legalName = (legalName === undefined || legalName === '') ? null : legalName;
    foundedYear = (foundedYear === undefined || foundedYear === '') ? null : foundedYear;
    shortDescription = (shortDescription === undefined || shortDescription === '') ? null : shortDescription;
    mission = (mission === undefined || mission === '') ? null : mission;
    vision = (vision === undefined || vision === '') ? null : vision;
    
    // Handle number conversion for foundedYear
    if (foundedYear !== null && foundedYear !== undefined) {
      foundedYear = parseInt(foundedYear);
      // Validate year is reasonable
      if (isNaN(foundedYear)) {
        foundedYear = null;
      }
    }

    // Get user's company (using company_team join for better security)
    const companyResult = await client.query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Update company profile with NULLIF to handle empty strings
    const updateResult = await client.query(`
      UPDATE companies
      SET
        name = COALESCE(NULLIF($1, ''), name),
        legal_name = COALESCE(NULLIF($2, ''), legal_name),
        industry = COALESCE(NULLIF($3, ''), industry),
        industries = COALESCE($4, industries),
        size = COALESCE(NULLIF($5, ''), size),
        founded_year = COALESCE($6, founded_year),
        headquarters_location = COALESCE($7, headquarters_location),
        website = COALESCE(NULLIF($8, ''), website),
        description = COALESCE(NULLIF($9, ''), description),
        short_description = COALESCE(NULLIF($10, ''), short_description),
        mission = COALESCE(NULLIF($11, ''), mission),
        vision = COALESCE(NULLIF($12, ''), vision),
        values = COALESCE($13, values),
        culture = COALESCE($14, culture),
        social_links = COALESCE($15, social_links),
        updated_at = NOW()
      WHERE id = $16
      RETURNING *
    `, [
      name, 
      legalName, 
      industry, 
      industries, 
      size, 
      foundedYear,
      headquartersLocation ? JSON.stringify(headquartersLocation) : null,
      website, 
      description, 
      shortDescription, 
      mission, 
      vision,
      values, 
      culture ? JSON.stringify(culture) : null,
      socialLinks ? JSON.stringify(socialLinks) : null,
      companyId
    ]);

    await client.query('COMMIT');

    console.log('✅ Updated company:', {
      id: updateResult.rows[0].id,
      legal_name: updateResult.rows[0].legal_name,
      founded_year: updateResult.rows[0].founded_year
    });

    return res.json({
      success: true,
      message: 'Company profile updated successfully',
      data: updateResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating company profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update company profile'
    });
  } finally {
    client.release();
  }
};

// Upload company logo
export const uploadCompanyLogo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No logo file provided'
      });
    }

    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;
    const logoUrl = `/uploads/company/${req.file.filename}`;
    const logoKey = req.file.filename;

    // Update company logo
    await query(`
      UPDATE companies
      SET logo_url = $1, logo_key = $2, updated_at = NOW()
      WHERE id = $3
    `, [logoUrl, logoKey, companyId]);

    return res.json({
      success: true,
      message: 'Company logo uploaded successfully',
      data: { logoUrl, logoKey }
    });

  } catch (error) {
    logger.error('Error uploading company logo:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload company logo'
    });
  }
};

// Upload company banner
export const uploadCompanyBanner = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No banner file provided'
      });
    }

    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;
    const bannerUrl = `/uploads/company/${req.file.filename}`;
    const bannerKey = req.file.filename;

    // Update company banner
    await query(`
      UPDATE companies
      SET banner_url = $1, banner_key = $2, updated_at = NOW()
      WHERE id = $3
    `, [bannerUrl, bannerKey, companyId]);

    return res.json({
      success: true,
      message: 'Company banner uploaded successfully',
      data: { bannerUrl, bannerKey }
    });

  } catch (error) {
    logger.error('Error uploading company banner:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload company banner'
    });
  }
};

// Get company profile
export const getCompanyProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get user's company
    const companyResult = await query(`
      SELECT c.* FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    return res.json({
      success: true,
      data: companyResult.rows[0]
    });

  } catch (error) {
    logger.error('Error getting company profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get company profile'
    });
  }
};

// Company Locations Management (Story 27)

// Add company location with geocoding
// Add company location
export const addCompanyLocation = async (req: AuthenticatedRequest, res: Response) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      name,
      type,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      latitude,
      longitude,
      phone,
      email,
      hours,
      amenities,
      isHiring,
      employeeCount
    } = req.body;

    // Get user's company
    const companyResult = await client.query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // 🔧 FIX: Handle coordinates properly
    let finalLatitude = latitude;
    let finalLongitude = longitude;
    let finalLocation = null;

    // If coordinates are provided, create location JSONB
    if (finalLatitude !== null && finalLatitude !== undefined && 
        finalLongitude !== null && finalLongitude !== undefined) {
      finalLocation = JSON.stringify({ lat: finalLatitude, lng: finalLongitude });
    }
    // If coordinates are not provided but address is, geocode
    else if (addressLine1 && city && country) {
      try {
        const address = `${addressLine1} ${addressLine2 || ''} ${city} ${state || ''} ${country}`;
        const coords = await geocodeAddress(address);
        if (coords) {
          finalLatitude = coords.lat;
          finalLongitude = coords.lng;
          finalLocation = JSON.stringify({ lat: coords.lat, lng: coords.lng });
        }
      } catch (geoError) {
        logger.warn('Geocoding failed during insert:', geoError);
      }
    }

    // If this is headquarters, unset other headquarters
    if (type === 'headquarters') {
      await client.query(`
        UPDATE company_locations
        SET type = 'branch'
        WHERE company_id = $1 AND type = 'headquarters'
      `, [companyId]);
    }

    // Add location with proper coordinate handling
    const locationResult = await client.query(`
      INSERT INTO company_locations (
        company_id, name, type, address_line1, address_line2, city, state,
        postal_code, country, latitude, longitude, location, phone, email,
        hours, amenities, is_hiring, employee_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      companyId, name, type, addressLine1, addressLine2, city, state,
      postalCode, country, finalLatitude, finalLongitude, finalLocation,
      phone, email, hours ? JSON.stringify(hours) : null,
      amenities || [], isHiring !== undefined ? isHiring : true, employeeCount
    ]);

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Company location added successfully',
      data: locationResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding company location:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add company location'
    });
  } finally {
    client.release();
  }
};



// Update company location
// Update company location
export const updateCompanyLocation = async (req: AuthenticatedRequest, res: Response) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const {
      name,
      type,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      latitude,
      longitude,
      phone,
      email,
      hours,
      amenities,
      isHiring,
      employeeCount
    } = req.body;

    console.log('🔍 Updating location with data:', { id, ...req.body });

    // Get user's company
    const companyResult = await client.query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Build dynamic update query based on what fields are provided
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    // Only add fields that are provided
    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(name);
    }
    if (type !== undefined) {
      updateFields.push(`type = $${paramIndex++}`);
      updateValues.push(type);
    }
    if (addressLine1 !== undefined) {
      updateFields.push(`address_line1 = $${paramIndex++}`);
      updateValues.push(addressLine1);
    }
    if (addressLine2 !== undefined) {
      updateFields.push(`address_line2 = $${paramIndex++}`);
      updateValues.push(addressLine2);
    }
    if (city !== undefined) {
      updateFields.push(`city = $${paramIndex++}`);
      updateValues.push(city);
    }
    if (state !== undefined) {
      updateFields.push(`state = $${paramIndex++}`);
      updateValues.push(state);
    }
    if (postalCode !== undefined) {
      updateFields.push(`postal_code = $${paramIndex++}`);
      updateValues.push(postalCode);
    }
    if (country !== undefined) {
      updateFields.push(`country = $${paramIndex++}`);
      updateValues.push(country);
    }
    
    // ✅ FIX: Handle coordinates properly - update BOTH latitude and longitude when provided
    if (latitude !== undefined && longitude !== undefined) {
      // Both provided - update both columns and location JSONB
      updateFields.push(`latitude = $${paramIndex++}`);
      updateValues.push(latitude);
      updateFields.push(`longitude = $${paramIndex++}`);  // ✅ ADD THIS LINE
      updateValues.push(longitude);
      updateFields.push(`location = $${paramIndex++}`);
      updateValues.push(JSON.stringify({ lat: latitude, lng: longitude }));
    } else if (latitude !== undefined && longitude === undefined) {
      // Only latitude provided - update latitude only
      updateFields.push(`latitude = $${paramIndex++}`);
      updateValues.push(latitude);
      // Also try to update location JSONB if possible
      const existingLongitude = await client.query(
        'SELECT longitude FROM company_locations WHERE id = $1',
        [id]
      );
      if (existingLongitude.rows.length > 0 && existingLongitude.rows[0].longitude !== null) {
        updateFields.push(`location = $${paramIndex++}`);
        updateValues.push(JSON.stringify({ lat: latitude, lng: existingLongitude.rows[0].longitude }));
      }
    } else if (latitude === undefined && longitude !== undefined) {
      // Only longitude provided - update longitude only
      updateFields.push(`longitude = $${paramIndex++}`);
      updateValues.push(longitude);
      // Also try to update location JSONB if possible
      const existingLatitude = await client.query(
        'SELECT latitude FROM company_locations WHERE id = $1',
        [id]
      );
      if (existingLatitude.rows.length > 0 && existingLatitude.rows[0].latitude !== null) {
        updateFields.push(`location = $${paramIndex++}`);
        updateValues.push(JSON.stringify({ lat: existingLatitude.rows[0].latitude, lng: longitude }));
      }
    }
    
    if (phone !== undefined) {
      updateFields.push(`phone = $${paramIndex++}`);
      updateValues.push(phone);
    }
    if (email !== undefined) {
      updateFields.push(`email = $${paramIndex++}`);
      updateValues.push(email);
    }
    if (hours !== undefined) {
      updateFields.push(`hours = $${paramIndex++}`);
      updateValues.push(hours ? JSON.stringify(hours) : null);
    }
    if (amenities !== undefined) {
      updateFields.push(`amenities = $${paramIndex++}`);
      updateValues.push(amenities);
    }
    if (isHiring !== undefined) {
      updateFields.push(`is_hiring = $${paramIndex++}`);
      updateValues.push(isHiring);
    }
    if (employeeCount !== undefined) {
      updateFields.push(`employee_count = $${paramIndex++}`);
      updateValues.push(employeeCount);
    }

    // Always update the updated_at timestamp
    updateFields.push(`updated_at = NOW()`);

    if (updateFields.length === 1) {
      // Only updated_at was added, no fields to update
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Build and execute the update query
    const updateQuery = `
      UPDATE company_locations 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramIndex} AND company_id = $${paramIndex + 1} 
      RETURNING *
    `;
    
    updateValues.push(id, companyId);
    
    console.log('📝 Update query:', updateQuery);
    console.log('📝 Update values:', updateValues);

    const updateResult = await client.query(updateQuery, updateValues);

    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Company location updated successfully',
      data: updateResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating company location:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update company location'
    });
  } finally {
    client.release();
  }
};

// DELETE THIS ENTIRE BLOCK - it's the duplicate:
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'RecruitmentPlatform/1.0' // Required by Nominatim
        }
      }
    );
    
    // Type-safe check
    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lng: parseFloat(response.data[0].lon)
      };
    }
    return null;
  } catch (error) {
    logger.error('Geocoding error:', error);
    return null;
  }
}


// Delete company location
export const deleteCompanyLocation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Delete location
    const deleteResult = await query(`
      DELETE FROM company_locations
      WHERE id = $1 AND company_id = $2
      RETURNING *
    `, [id, companyId]);

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    return res.json({
      success: true,
      message: 'Company location deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting company location:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete company location'
    });
  }
};

// Get company locations
export const getCompanyLocations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Get locations
    const locationsResult = await query(`
      SELECT * FROM company_locations
      WHERE company_id = $1
      ORDER BY type = 'headquarters' DESC, created_at ASC
    `, [companyId]);

    return res.json({
      success: true,
      data: locationsResult.rows
    });

  } catch (error) {
    logger.error('Error getting company locations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get company locations'
    });
  }
};

export const updateCompanyCulture = async (req: AuthenticatedRequest, res: Response) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    let {
      attributes,
      values,
      description,
      workEnvironment,
      teamDynamics,
      communicationStyle,
      decisionMaking,
      feedbackCulture,
      workLifeBalance,
      diversityInclusion,
      employeeTestimonials
    } = req.body;

    console.log('📝 Received culture data:', {
      attributes,
      values,
      description,
      workEnvironment,
      teamDynamics,
      communicationStyle,
      decisionMaking,
      workLifeBalance,
      diversityInclusion,
      employeeTestimonials
    });

    // ✅ Convert attributes array to object if needed
    let processedAttributes = attributes;
    if (Array.isArray(attributes)) {
      // Convert array of strings to object
      processedAttributes = {};
      attributes.forEach((attr: string) => {
        if (typeof attr === 'string') {
          const key = attr.toLowerCase().replace(/\s+/g, '_');
          processedAttributes[key] = 1;
        }
      });
    }
    
    // If attributes is empty or null, use default
    if (!processedAttributes || Object.keys(processedAttributes).length === 0) {
      processedAttributes = {
        collaborative: 0,
        innovative: 0,
        structured: 0,
        fast_paced: 0,
        employee_focused: 0,
        customer_focused: 0,
        results_driven: 0,
        learning_oriented: 0
      };
    }

    // Get user's company
    const companyResult = await client.query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Check if culture record exists
    const existingCulture = await client.query(
      'SELECT company_id FROM company_culture WHERE company_id = $1',
      [companyId]
    );

    let result;
    if (existingCulture.rows.length === 0) {
      // Insert new culture record
      result = await client.query(`
        INSERT INTO company_culture (
          company_id, attributes, values, description, work_environment,
          team_dynamics, communication_style, decision_making, feedback_culture,
          work_life_balance, diversity_info, employee_testimonials
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        companyId,
        JSON.stringify(processedAttributes),
        JSON.stringify(values || []),
        description || null,
        workEnvironment || null,
        teamDynamics || null,
        communicationStyle || null,
        decisionMaking || null,
        feedbackCulture || null,
        workLifeBalance || null,
        diversityInclusion || null,
        JSON.stringify(employeeTestimonials || [])
      ]);
    } else {
      // Update existing culture record
      result = await client.query(`
        UPDATE company_culture
        SET
          attributes = COALESCE($1, attributes),
          values = COALESCE($2, values),
          description = COALESCE($3, description),
          work_environment = COALESCE($4, work_environment),
          team_dynamics = COALESCE($5, team_dynamics),
          communication_style = COALESCE($6, communication_style),
          decision_making = COALESCE($7, decision_making),
          feedback_culture = COALESCE($8, feedback_culture),
          work_life_balance = COALESCE($9, work_life_balance),
          diversity_info = COALESCE($10, diversity_info),
          employee_testimonials = COALESCE($11, employee_testimonials),
          updated_at = NOW()
        WHERE company_id = $12
        RETURNING *
      `, [
        JSON.stringify(processedAttributes),
        JSON.stringify(values || []),
        description || null,
        workEnvironment || null,
        teamDynamics || null,
        communicationStyle || null,
        decisionMaking || null,
        feedbackCulture || null,
        workLifeBalance || null,
        diversityInclusion || null,
        JSON.stringify(employeeTestimonials || []),
        companyId
      ]);
    }

    await client.query('COMMIT');

    console.log('✅ Culture updated successfully for company:', companyId);

    return res.json({
      success: true,
      message: 'Company culture updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating company culture:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update company culture',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  } finally {
    client.release();
  }
};

// Get company culture
export const getCompanyCulture = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Get culture data
    const cultureResult = await query(`
      SELECT
        attributes, values, description, work_environment as "workEnvironment",
        team_dynamics as "teamDynamics", communication_style as "communicationStyle",
        decision_making as "decisionMaking", feedback_culture as "feedbackCulture",
        work_life_balance as "workLifeBalance",
        diversity_info as "diversityInclusion", employee_testimonials as "employeeTestimonials"
      FROM company_culture
      WHERE company_id = $1
    `, [companyId]);

    if (cultureResult.rows.length === 0) {
      // ✅ FIX: Return object instead of array for attributes
      return res.json({
        success: true,
        data: {
          attributes: {  // ✅ Changed from [] to {}
            collaborative: 0,
            innovative: 0,
            structured: 0,
            fast_paced: 0,
            employee_focused: 0,
            customer_focused: 0,
            results_driven: 0,
            learning_oriented: 0
          },
          values: [],
          description: '',
          workEnvironment: '',
          teamDynamics: '',
          communicationStyle: '',
          decisionMaking: '',
          feedbackCulture: '',
          workLifeBalance: '',
          diversityInclusion: '',
          employeeTestimonials: []
        }
      });
    }

    // ✅ Ensure attributes is an object, not an array
    const data = cultureResult.rows[0];
    if (Array.isArray(data.attributes)) {
      data.attributes = {};
    }

    return res.json({
      success: true,
      data: data
    });

  } catch (error) {
    logger.error('Error getting company culture:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get company culture'
    });
  }
};

// ─── Team Member Field Validation Helper ─────────────────────────────────────

const VALID_ROLES = ['admin', 'recruiter', 'reviewer', 'viewer'] as const;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_REGEX = /^[+\d\s\-().]{7,25}$/;

interface TeamMemberFieldErrors {
  [field: string]: string;
}

function validateTeamMemberFields(
  fields: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    bio?: string;
    linkedinUrl?: string;
    role?: string;
    displayOrder?: any;
    expertise?: any;
  },
  options: { requireName?: boolean; requireTitle?: boolean; requireEmail?: boolean } = {}
): TeamMemberFieldErrors {
  const errors: TeamMemberFieldErrors = {};

  // name
  if (options.requireName && (!fields.name || !fields.name.trim())) {
    errors.name = 'Name is required';
  } else if (fields.name !== undefined && fields.name.trim().length > 0) {
    if (fields.name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
    else if (fields.name.trim().length > 150) errors.name = 'Name must be 150 characters or less';
  }

  // title
  if (options.requireTitle && (!fields.title || !fields.title.trim())) {
    errors.title = 'Job title is required';
  } else if (fields.title !== undefined && fields.title.trim().length > 0) {
    if (fields.title.trim().length < 2) errors.title = 'Title must be at least 2 characters';
    else if (fields.title.trim().length > 150) errors.title = 'Title must be 150 characters or less';
  }

  // email
  if (options.requireEmail && (!fields.email || !fields.email.trim())) {
    errors.email = 'Email address is required';
  } else if (fields.email && fields.email.trim()) {
    if (!EMAIL_REGEX.test(fields.email.trim())) errors.email = 'Enter a valid email address (e.g. john@company.com)';
    else if (fields.email.trim().length > 255) errors.email = 'Email must be 255 characters or less';
  }

  // phone
  if (fields.phone && fields.phone.trim()) {
    if (!PHONE_REGEX.test(fields.phone.trim())) errors.phone = 'Enter a valid phone number (7–25 digits, may include +, spaces, dashes)';
  }

  // bio
  if (fields.bio && fields.bio.length > 500) {
    errors.bio = 'Bio must be 500 characters or less';
  }

  // linkedinUrl
  if (fields.linkedinUrl && fields.linkedinUrl.trim()) {
    try {
      const url = fields.linkedinUrl.trim().startsWith('http')
        ? fields.linkedinUrl.trim()
        : `https://${fields.linkedinUrl.trim()}`;
      new URL(url);
    } catch {
      errors.linkedinUrl = 'Enter a valid LinkedIn URL';
    }
  }

  // role
  if (fields.role !== undefined) {
    if (!VALID_ROLES.includes(fields.role as any)) {
      errors.role = `Role must be one of: ${VALID_ROLES.join(', ')}`;
    }
  }

  // displayOrder
  if (fields.displayOrder !== undefined && fields.displayOrder !== null && fields.displayOrder !== '') {
    const n = parseInt(fields.displayOrder);
    if (isNaN(n) || n < 0) errors.displayOrder = 'Display order must be a non-negative integer';
  }

  // expertise
  if (fields.expertise !== undefined) {
    if (!Array.isArray(fields.expertise)) {
      errors.expertise = 'Expertise must be an array of strings';
    } else if (fields.expertise.length > 30) {
      errors.expertise = 'Maximum 30 expertise items allowed';
    } else if (fields.expertise.some((s: any) => typeof s !== 'string' || s.length > 100)) {
      errors.expertise = 'Each expertise item must be a string of 100 characters or less';
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────

// Company Team Management (Story 29)

// Add team member - Now sends invitation email instead of direct addition
export const addTeamMember = async (req: AuthenticatedRequest, res: Response) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      name,
      title,
      department,
      email,
      phone,
      bio,
      expertise,
      linkedinUrl,
      role,
      displayOnProfile,
      isLeadership,
      displayOrder
    } = req.body;

    // Validate all fields before touching the DB
    const fieldErrors = validateTeamMemberFields(
      { name, title, email, phone, bio, linkedinUrl, role, displayOrder, expertise },
      { requireEmail: true }
    );
    if (Object.keys(fieldErrors).length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: fieldErrors
      });
    }

    // Get user's company and verify they are admin
    const companyResult = await client.query(`
      SELECT c.id, c.name FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const company = companyResult.rows[0];

    // Check if email already exists in team
    const existingMember = await client.query(`
      SELECT id FROM company_team
      WHERE company_id = $1 AND email = $2
    `, [company.id, email]);

    if (existingMember.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'A team member with this email already exists'
      });
    }

    // Check for pending invitations
    const pendingInvitation = await client.query(`
      SELECT id FROM team_invitations
      WHERE company_id = $1 AND email = $2 AND status = 'pending'
    `, [company.id, email]);

    if (pendingInvitation.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'A pending invitation already exists for this email'
      });
    }

    // Generate invitation token
    const crypto = require('crypto');
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Split name into first and last name if provided
    const nameParts = name ? name.trim().split(' ') : [];
    const firstName = nameParts[0] || null;
    const lastName = nameParts.slice(1).join(' ') || null;

    // Create invitation record - REMOVED metadata column
    const invitationResult = await client.query(`
      INSERT INTO team_invitations (
        company_id, invited_by, email, role, invitation_token, expires_at,
        first_name, last_name, personal_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, invitation_token
    `, [
      company.id,
      req.user!.id,
      email,
      role,
      invitationToken,
      expiresAt,
      firstName,
      lastName,
      bio || 'Welcome to our team!' // Use bio as personal message
    ]);

    await client.query('COMMIT');

    // Send invitation email
    try {
      const emailService = require('../services/email.service').default;
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      await emailService.sendEmail({
        to: email,
        subject: `Invitation to join ${company.name} team`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb; text-align: center;">You're Invited to Join Our Team!</h1>
            <h2 style="color: #374151; text-align: center;">${company.name}</h2>
            <p>Hi${firstName ? ` ${firstName}` : ''},</p>
            <p>You've been invited to join <strong>${company.name}</strong> as a <strong>${role}</strong>.</p>
            ${bio ? `<p><em>"${bio}"</em></p>` : ''}
            <div style="text-align: center; margin: 30px 0;">
              <a href="${frontendUrl}/accept-invitation?token=${invitationToken}"
                 style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Accept Invitation & Register
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">Or copy this link:</p>
            <p style="color: #2563eb; word-break: break-all; font-size: 12px;">${frontendUrl}/accept-invitation?token=${invitationToken}</p>
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #374151; margin-top: 0;">Your Role: ${role.charAt(0).toUpperCase() + role.slice(1)}</h3>
              <ul style="color: #4b5563;">
                ${role === 'admin' ? '<li>Full access to company settings and team management</li><li>Post and manage jobs</li><li>Review candidates</li>' :
                  role === 'recruiter' ? '<li>Post and manage jobs</li><li>Review and manage candidates</li>' :
                  role === 'reviewer' ? '<li>Review and assess candidates</li><li>Provide feedback on applications</li>' :
                  '<li>View company dashboard and candidates</li><li>Read-only access</li>'}
              </ul>
              ${title ? `<p><strong>Title:</strong> ${title}</p>` : ''}
              ${department ? `<p><strong>Department:</strong> ${department}</p>` : ''}
            </div>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              <strong>⏰ This invitation expires in 7 days</strong>
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
              If you didn't expect this invitation, you can ignore this email.
            </p>
          </div>
        `,
        text: `You're Invited to Join ${company.name}!

Hi${firstName ? ` ${firstName}` : ''},

You've been invited to join ${company.name} as a ${role}.

${bio ? `"${bio}"` : ''}

Accept the invitation and register here:
${frontendUrl}/accept-invitation?token=${invitationToken}

Your Role: ${role.charAt(0).toUpperCase() + role.slice(1)}
${role === 'admin' ? '- Full access to company settings and team management\n- Post and manage jobs\n- Review candidates' :
  role === 'recruiter' ? '- Post and manage jobs\n- Review and manage candidates' :
  role === 'reviewer' ? '- Review and assess candidates\n- Provide feedback on applications' :
  '- View company dashboard and candidates\n- Read-only access'}
${title ? `Title: ${title}` : ''}
${department ? `Department: ${department}` : ''}

This invitation expires in 7 days.`
      });

      return res.status(201).json({
        success: true,
        message: 'Team member invitation sent successfully',
        data: {
          invitationId: invitationResult.rows[0].id,
          email: email,
          role: role,
          expiresAt: expiresAt
        }
      });

    } catch (emailError) {
      logger.error('Error sending invitation email:', emailError);
      // Don't rollback since the invitation was created successfully
      return res.status(201).json({
        success: true,
        message: 'Team member invitation created but email failed to send',
        data: {
          invitationId: invitationResult.rows[0].id,
          email: email,
          role: role,
          expiresAt: expiresAt
        },
        warning: 'Email delivery failed'
      });
    }

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating team member invitation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create team member invitation'
    });
  } finally {
    client.release();
  }
};

// Update team member
export const updateTeamMember = async (req: AuthenticatedRequest, res: Response) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const {
      name,
      title,
      department,
      email,
      phone,
      bio,
      expertise,
      linkedinUrl,
      role,
      displayOnProfile,
      isLeadership,
      displayOrder
    } = req.body;

    // Validate all supplied fields
    const fieldErrors = validateTeamMemberFields(
      { name, title, email, phone, bio, linkedinUrl, role, displayOrder, expertise }
    );
    if (Object.keys(fieldErrors).length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: fieldErrors
      });
    }

    // Get user's company
    const companyResult = await client.query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Check if email already exists in team (excluding current member)
    if (email) {
      const existingMember = await client.query(`
        SELECT id FROM company_team
        WHERE company_id = $1 AND email = $2 AND id != $3
      `, [companyId, email, id]);

      if (existingMember.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'A team member with this email already exists'
        });
      }
    }

    // Update team member
    const updateResult = await client.query(`
      UPDATE company_team
      SET
        name = COALESCE($1, name),
        title = COALESCE($2, title),
        department = COALESCE($3, department),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        bio = COALESCE($6, bio),
        expertise = COALESCE($7, expertise),
        linkedin_url = COALESCE($8, linkedin_url),
        role = COALESCE($9, role),
        display_on_profile = COALESCE($10, display_on_profile),
        is_leadership = COALESCE($11, is_leadership),
        display_order = COALESCE($12, display_order),
        updated_at = NOW()
      WHERE id = $13 AND company_id = $14
      RETURNING *
    `, [
      name, title, department, email, phone, bio, expertise,
      linkedinUrl, role, displayOnProfile, isLeadership,
      displayOrder, id, companyId
    ]);

    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Team member updated successfully',
      data: updateResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating team member:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update team member'
    });
  } finally {
    client.release();
  }
};

// Delete team member
export const deleteTeamMember = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Delete team member
    const deleteResult = await query(`
      DELETE FROM company_team
      WHERE id = $1 AND company_id = $2
      RETURNING *
    `, [id, companyId]);

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    return res.json({
      success: true,
      message: 'Team member deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting team member:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete team member'
    });
  }
};

// Get company team
export const getCompanyTeam = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Get team members
    const teamResult = await query(`
      SELECT * FROM company_team
      WHERE company_id = $1
      ORDER BY is_leadership DESC, display_order ASC, joined_at ASC
    `, [companyId]);

    return res.json({
      success: true,
      data: teamResult.rows
    });

  } catch (error) {
    logger.error('Error getting company team:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get company team'
    });
  }
};

// Upload team member photo
export const uploadTeamMemberPhoto = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No photo file provided'
      });
    }

    const { id } = req.params;

    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;
    const photoUrl = `/uploads/company/${req.file.filename}`;
    const photoKey = req.file.filename;

    // Update team member photo
    const updateResult = await query(`
      UPDATE company_team
      SET photo_url = $1, photo_key = $2, updated_at = NOW()
      WHERE id = $3 AND company_id = $4
      RETURNING *
    `, [photoUrl, photoKey, id, companyId]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    return res.json({
      success: true,
      message: 'Team member photo uploaded successfully',
      data: { photoUrl, photoKey }
    });

  } catch (error) {
    logger.error('Error uploading team member photo:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload team member photo'
    });
  }
};

// Company Projects Management (Story 30)

// Add company project
export const addCompanyProject = async (req: AuthenticatedRequest, res: Response) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      name,
      client: clientName,
      industry,
      description,
      startDate,
      endDate,
      projectType,
      teamSize,
      technologies,
      results,
      impact,
      awards,
      websiteUrl,
      githubUrl,
      featured,
      displayOrder
    } = req.body;

    // Get user's company
    const companyResult = await client.query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Add project
    const projectResult = await client.query(`
      INSERT INTO company_projects (
        company_id, name, client, client_industry, timeframe, project_type,
        description, results, technologies, skills, featured,
        display_order, team_size, website_url, github_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      companyId, name, clientName, industry,
      JSON.stringify({ start: startDate, end: endDate }),
      projectType, description,
      results || impact || (awards && awards.length)
        ? JSON.stringify({ impact: impact || results || null, awards: awards || [] })
        : null,
      technologies || [], technologies || [], featured || false,
      displayOrder || 0,
      teamSize ? parseInt(teamSize) : null,
      websiteUrl || null,
      githubUrl || null
    ]);

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Company project added successfully',
      data: projectResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding company project:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add company project'
    });
  } finally {
    client.release();
  }
};

// Update company project
export const updateCompanyProject = async (req: AuthenticatedRequest, res: Response) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const {
      name,
      client: clientName,
      industry,
      description,
      startDate,
      endDate,
      projectType,
      teamSize,
      technologies,
      results,
      impact,
      awards,
      websiteUrl,
      githubUrl,
      featured,
      displayOrder
    } = req.body;

    // Get user's company
    const companyResult = await client.query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Get current project to merge timeframe and results
    const currentProject = await client.query(`
      SELECT timeframe, results FROM company_projects
      WHERE id = $1 AND company_id = $2
    `, [id, companyId]);

    if (currentProject.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Update project
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex}`);
      updateValues.push(name);
      paramIndex++;
    }
    if (clientName !== undefined) {
      updateFields.push(`client = $${paramIndex}`);
      updateValues.push(clientName);
      paramIndex++;
    }
    if (industry !== undefined) {
      updateFields.push(`client_industry = $${paramIndex}`);
      updateValues.push(industry);
      paramIndex++;
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      updateValues.push(description);
      paramIndex++;
    }
    if (startDate !== undefined || endDate !== undefined) {
      const currentTimeframe = currentProject.rows[0].timeframe || {};
      const newTimeframe = {
        ...currentTimeframe,
        ...(startDate !== undefined && { start: startDate }),
        ...(endDate !== undefined && { end: endDate })
      };
      updateFields.push(`timeframe = $${paramIndex}`);
      updateValues.push(JSON.stringify(newTimeframe));
      paramIndex++;
    }
    if (projectType !== undefined) {
      updateFields.push(`project_type = $${paramIndex}`);
      updateValues.push(projectType);
      paramIndex++;
    }
    if (technologies !== undefined) {
      updateFields.push(`technologies = $${paramIndex}`);
      updateFields.push(`skills = $${paramIndex + 1}`);
      updateValues.push(technologies, technologies);
      paramIndex += 2;
    }
    if (results !== undefined || impact !== undefined || awards !== undefined) {
      const currentResults = currentProject.rows[0].results || {};
      const newResults = {
        ...currentResults,
        ...(impact !== undefined && { impact }),
        ...(awards !== undefined && { awards })
      };
      updateFields.push(`results = $${paramIndex}`);
      updateValues.push(JSON.stringify(newResults));
      paramIndex++;
    }
    if (featured !== undefined) {
      updateFields.push(`featured = $${paramIndex}`);
      updateValues.push(featured);
      paramIndex++;
    }
    if (displayOrder !== undefined) {
      updateFields.push(`display_order = $${paramIndex}`);
      updateValues.push(displayOrder);
      paramIndex++;
    }
    if (teamSize !== undefined) {
      updateFields.push(`team_size = $${paramIndex}`);
      updateValues.push(teamSize ? parseInt(teamSize) : null);
      paramIndex++;
    }
    if (websiteUrl !== undefined) {
      updateFields.push(`website_url = $${paramIndex}`);
      updateValues.push(websiteUrl || null);
      paramIndex++;
    }
    if (githubUrl !== undefined) {
      updateFields.push(`github_url = $${paramIndex}`);
      updateValues.push(githubUrl || null);
      paramIndex++;
    }

    if (updateFields.length > 0) {
      updateFields.push(`updated_at = NOW()`);
      const updateQuery = `UPDATE company_projects SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND company_id = $${paramIndex + 1} RETURNING *`;
      updateValues.push(id, companyId);

      const updateResult = await client.query(updateQuery, updateValues);

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      await client.query('COMMIT');

      return res.json({
        success: true,
        message: 'Company project updated successfully',
        data: updateResult.rows[0]
      });
    } else {
      await client.query('COMMIT');
      return res.json({
        success: true,
        message: 'No changes to update'
      });
    }

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating company project:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update company project'
    });
  } finally {
    client.release();
  }
};

// Delete company project
export const deleteCompanyProject = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Delete project
    const deleteResult = await query(`
      DELETE FROM company_projects
      WHERE id = $1 AND company_id = $2
      RETURNING *
    `, [id, companyId]);

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    return res.json({
      success: true,
      message: 'Company project deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting company project:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete company project'
    });
  }
};

// Get company projects
export const getCompanyProjects = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Get projects
    const projectsResult = await query(`
      SELECT * FROM company_projects
      WHERE company_id = $1
      ORDER BY featured DESC, created_at DESC
    `, [companyId]);

    // Transform the data to match frontend expectations
    const transformedProjects = projectsResult.rows.map(project => {
      // Parse results if it's a string, otherwise use as is
      let resultsObj = project.results;
      if (typeof project.results === 'string') {
        try {
          resultsObj = JSON.parse(project.results);
        } catch (e) {
          resultsObj = null;
        }
      }

      return {
        id: project.id,
        name: project.name,
        client: project.client,
        industry: project.client_industry,
        description: project.description,
        startDate: project.timeframe?.start,
        endDate: project.timeframe?.end,
        projectType: project.project_type,
        teamSize: project.team_size,
        technologies: project.technologies || [],
        results: resultsObj?.impact || null,
        impact: resultsObj?.impact || null,
        awards: resultsObj?.awards || [],
        media: project.media || [],
        websiteUrl: project.website_url,
        githubUrl: project.github_url,
        featured: project.featured,
        displayOrder: project.display_order || 0,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        // Keep original fields for compatibility
        timeframe: project.timeframe,
        client_industry: project.client_industry,
        challenge: project.challenge,
        solution: project.solution
      };
    });

    return res.json({
      success: true,
      data: transformedProjects
    });

  } catch (error) {
    logger.error('Error getting company projects:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get company projects'
    });
  }
};

// Upload project media
export const uploadProjectMedia = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No media file provided'
      });
    }

    const { id } = req.params;

    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;
    const mediaUrl = `/uploads/company/${req.file.filename}`;
    const mediaKey = req.file.filename;
    const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';

    // Get current media array
    const currentMediaResult = await query(`
      SELECT media FROM company_projects
      WHERE id = $1 AND company_id = $2
    `, [id, companyId]);

    if (currentMediaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const currentMedia = currentMediaResult.rows[0].media || [];
    const newMediaItem = {
      url: mediaUrl,
      key: mediaKey,
      type: mediaType,
      uploaded_at: new Date().toISOString()
    };

    // Append new media to existing array
    const updatedMedia = [...currentMedia, newMediaItem];

    // Update project's media JSONB field
    await query(`
      UPDATE company_projects
      SET media = $1, updated_at = NOW()
      WHERE id = $2 AND company_id = $3
    `, [JSON.stringify(updatedMedia), id, companyId]);

    return res.json({
      success: true,
      message: 'Project media uploaded successfully',
      data: newMediaItem
    });

  } catch (error) {
    logger.error('Error uploading project media:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload project media'
    });
  }
};

// Delete project media
export const deleteProjectMedia = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, mediaKey } = req.params;

    // Get user's company
    const companyResult = await query(`
      SELECT c.id FROM companies c
      JOIN company_team ct ON c.id = ct.company_id
      WHERE ct.user_id = $1 AND ct.role = 'admin'
    `, [req.user!.id]);

    if (companyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or user is not an admin'
      });
    }

    const companyId = companyResult.rows[0].id;

    // Get current media array
    const currentMediaResult = await query(`
      SELECT media FROM company_projects
      WHERE id = $1 AND company_id = $2
    `, [id, companyId]);

    if (currentMediaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const currentMedia = currentMediaResult.rows[0].media || [];
    const updatedMedia = currentMedia.filter((item: any) => item.key !== mediaKey);

    // Update project's media JSONB field
    await query(`
      UPDATE company_projects
      SET media = $1, updated_at = NOW()
      WHERE id = $2 AND company_id = $3
    `, [JSON.stringify(updatedMedia), id, companyId]);

    return res.json({
      success: true,
      message: 'Project media deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting project media:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete project media'
    });
  }
};

export const setWorkHoursPolicies = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Placeholder: Set work hours/policies logic here
    logger.info(`User ${req.user!.id} setting work hours/policies`);
    res.status(200).json({
      success: true,
      message: 'Work hours/policies set successfully'
    });
  } catch (error) {
    logger.error('Error setting work hours/policies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set work hours/policies'
    });
  }
};

export const verifyCompanyRegistration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Placeholder: Verify company registration logic here
    logger.info(`User ${req.user!.id} verifying company registration`);
    res.status(200).json({
      success: true,
      message: 'Company registration verified successfully'
    });
  } catch (error) {
    logger.error('Error verifying company registration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify company registration'
    });
  }
};

export const setupJobPostingApprovalWorkflows = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Placeholder: Setup job posting approval workflows logic here
    logger.info(`User ${req.user!.id} setting up job posting approval workflows`);
    res.status(200).json({
      success: true,
      message: 'Job posting approval workflows set up successfully'
    });
  } catch (error) {
    logger.error('Error setting up job posting approval workflows:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set up job posting approval workflows'
    });
  }
};

export const archiveOldCompanyProfiles = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Placeholder: Archive old company profiles logic here
    logger.info(`User ${req.user!.id} archiving old company profiles`);
    res.status(200).json({
      success: true,
      message: 'Old company profiles archived successfully'
    });
  } catch (error) {
    logger.error('Error archiving old company profiles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive old company profiles'
    });
  }
};