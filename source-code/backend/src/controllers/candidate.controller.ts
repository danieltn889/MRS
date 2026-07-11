import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { logger } from '../utils/logger.js';
import { query, getClient } from '../config/database.js';
import { getFullFileUrl } from '../utils/fileUrl.js';
import RecommendationSyncService from '../services/recommendation-sync.service.js';
import { resolveIdentityDocumentPath } from '../utils/identityDocumentStorage.js';
import { isValidRwandaLocationChain } from '../utils/rwandaLocation.js';
import { validateIdentityDocument, DocumentType } from '../validators/identityDocument.js';
import { recalculateYearsExperience } from '../utils/experienceCalculator.js';
import path from 'path';
import fs from 'fs';

// Helper function to convert camelCase to snake_case
const camelToSnake = (str: string): string => {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
};

// Field mapping from camelCase to snake_case
const fieldMapping: { [key: string]: string } = {
  proficiencyLevel: 'proficiency_level',
  yearsExperience: 'years_experience',
  isPrimary: 'is_primary',
  lastUsed: 'last_used',
  skillContext: 'skill_context',
  displayOrder: 'display_order',
  fieldOfStudy: 'field_of_study',
  startDate: 'start_date',
  endDate: 'end_date',
  isCurrent: 'is_current',
  gradeScale: 'grade_scale',
  employmentType: 'employment_type',
  locationType: 'location_type',
  teamSize: 'team_size',
  reportsTo: 'reports_to',
  reasonForLeaving: 'reason_for_leaving',
  verificationMethod: 'verification_method',
  skillId: 'skill_id',
  skillName: 'name'
};

const queueCandidateProfileUpdate = (candidateId: string, operation: 'insert'| 'update'| 'delete', payload: Record<string, any> = {}): void => {
  RecommendationSyncService.queueEvent({
    event_type: 'recommendation_update',
    entity_type: 'candidate_profiles',
    operation,
    candidate_id: candidateId,
    entity_id: candidateId,
    payload,
    source: 'backend',
  });
};

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

const cleanupDuplicateProfileRows = async (userId: string): Promise<void> => {
  // Keep only the newest profile row for this user
  // FIXED: candidate_profiles uses user_id, not id
  await query(`
    WITH ranked AS (
      SELECT user_id,
             ROW_NUMBER() OVER (
               PARTITION BY user_id
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
             ) AS rn
      FROM candidate_profiles
      WHERE user_id = $1
    )
    DELETE FROM candidate_profiles
    WHERE user_id IN (SELECT user_id FROM ranked WHERE rn > 1)
  `, [userId]);

  // Remove duplicate education entries (this one is correct - education has id column)
  await query(`
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY
                 user_id,
                 institution,
                 degree,
                 field_of_study,
                 start_date,
                 COALESCE(end_date::text, '')
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
             ) AS rn
      FROM education
      WHERE user_id = $1
    )
    DELETE FROM education
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `, [userId]);

  // Remove duplicate work experience entries (correct - work_experience has id column)
  await query(`
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY
                 user_id,
                 company,
                 title,
                 employment_type,
                 COALESCE(location, ''),
                 start_date,
                 COALESCE(end_date::text, ''),
                 is_current,
                 COALESCE(description, '')
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
             ) AS rn
      FROM work_experience
      WHERE user_id = $1
    )
    DELETE FROM work_experience
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `, [userId]);

  // Remove duplicate user-skill links (correct - user_skills has composite key, no id column)
  // FIXED: user_skills doesn't have an id column - it uses composite key (user_id, skill_id)
  await query(`
    DELETE FROM user_skills
    WHERE ctid IN (
      SELECT ctid FROM (
        SELECT ctid,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id, skill_id
                 ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST
               ) AS rn
        FROM user_skills
        WHERE user_id = $1
      ) ranked
      WHERE rn > 1
    )
  `, [userId]);
};

// =====================================================
// EDUCATION MANAGEMENT (CORRECTED)
// =====================================================

export const addEducation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    let {
      institution,
      institution_id,
      degree,
      fieldOfStudy,
      startDate,
      endDate,
      isCurrent,
      grade,
      gradeScale,
      description,
      activities,
      skills,
      attachments,
      displayOrder
    } = req.body;

    // Validate required fields
    if (!institution || !degree || !fieldOfStudy || !startDate) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Missing required fields: institution, degree, fieldOfStudy, startDate are required'
      });
      return;
    }

    // 🔥 FIX: Handle skills as PostgreSQL array (text[])
    if (skills) {
      if (typeof skills === 'string') {
        try {
          const parsed = JSON.parse(skills);
          if (Array.isArray(parsed)) {
            skills = parsed;
          } else {
            skills = [skills];
          }
        } catch {
          const cleaned = skills
            .replace(/^\[|\]$/g, '')
            .replace(/^"|"$/g, '')
            .split(/","|", "|",|","|"|,\s*/)
            .filter((s: string) => s && s.trim().length > 0)
            .map((s: string) => s.trim());
          skills = cleaned;
        }
      } else if (!Array.isArray(skills)) {
        skills = [String(skills)];
      }
      // Clean each skill
      skills = skills.map((skill: any) => {
        let cleaned = String(skill)
          .replace(/^\[|\]$/g, '')
          .replace(/^"|"$/g, '')
          .trim();
        return cleaned;
      }).filter((s: string) => s && s.length > 0);
    } else {
      skills = [];
    }

    // 🔥 FIX: Handle attachments as JSONB
    if (attachments) {
      if (typeof attachments === 'string') {
        try {
          attachments = JSON.parse(attachments);
        } catch {
          attachments = [];
        }
      }
      if (!Array.isArray(attachments)) {
        attachments = [];
      }
      attachments = attachments.map((att: any) => {
        if (typeof att === 'string') {
          try {
            return JSON.parse(att);
          } catch {
            return { file_name: att };
          }
        }
        return att;
      });
    } else {
      attachments = [];
    }

    // 🔥 FIX: Handle activities as JSONB
    if (activities) {
      if (typeof activities === 'string') {
        try {
          activities = JSON.parse(activities);
        } catch {
          activities = [];
        }
      }
      if (!Array.isArray(activities)) {
        activities = [];
      }
    } else {
      activities = [];
    }

    // Handle endDate for current education
    let processedEndDate = endDate;
    if (isCurrent && (!endDate || endDate === '')) {
      processedEndDate = null;
    }

    // Convert skills to PostgreSQL array format
    const skillsArray = skills.length > 0
      ? `{${skills.map((s: string) => `"${s.replace(/"/g, '\\"')}"`).join(',')}}`
      : '{}';

    const result = await client.query(`
      INSERT INTO education (
        user_id, institution, institution_id, degree, field_of_study, start_date, end_date,
        is_current, grade, grade_scale, description, activities, skills, attachments, display_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      req.user!.id, institution, institution_id, degree, fieldOfStudy, startDate, processedEndDate,
      isCurrent || false, grade, gradeScale, description, JSON.stringify(activities),
      skillsArray, JSON.stringify(attachments), displayOrder || 0
    ]);

    await client.query('COMMIT');

    queueCandidateProfileUpdate(req.user!.id, 'update', { field: 'education'});

    res.status(201).json({
      success: true,
      message: 'Education added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding education:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add education'
    });
  } finally {
    client.release();
  }
};

export const updateEducation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const updates = req.body;

    // Check ownership
    const ownershipCheck = await client.query(
      'SELECT id FROM education WHERE id = $1 AND user_id = $2',
      [id, req.user!.id]
    );

    if (ownershipCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: 'Education entry not found'
      });
      return;
    }

    // Handle endDate for current education
    if (updates.isCurrent && (!updates.endDate || updates.endDate === '')) {
      updates.endDate = null;
    }

    // 🔥 FIX: Handle skills as PostgreSQL array (text[])
    if (updates.skills !== undefined) {
      // If it's a string, try to parse it as JSON or clean it
      if (typeof updates.skills === 'string') {
        try {
          // Try to parse as JSON first
          const parsed = JSON.parse(updates.skills);
          if (Array.isArray(parsed)) {
            updates.skills = parsed;
          } else {
            updates.skills = [updates.skills];
          }
        } catch {
          // If not valid JSON, clean the string and split
          const cleaned = updates.skills
            .replace(/^\[|\]$/g, '') // Remove outer brackets
            .replace(/^"|"$/g, '') // Remove outer quotes
            .split(/","|", "|",|","|"|,\s*/)
            .filter((s: string) => s && s.trim().length > 0)
            .map((s: string) => s.trim());
          updates.skills = cleaned;
        }
      } else if (!Array.isArray(updates.skills)) {
        // If it's not an array, convert to array
        updates.skills = [String(updates.skills)];
      }
      // Clean each skill - remove any array brackets or quotes
      updates.skills = updates.skills.map((skill: any) => {
        let cleaned = String(skill)
          .replace(/^\[|\]$/g, '')
          .replace(/^"|"$/g, '')
          .trim();
        return cleaned;
      }).filter((s: string) => s && s.length > 0);
    }

    // 🔥 FIX: Handle attachments as JSONB
    if (updates.attachments !== undefined) {
      if (typeof updates.attachments === 'string') {
        try {
          updates.attachments = JSON.parse(updates.attachments);
        } catch {
          updates.attachments = [];
        }
      }
      if (!Array.isArray(updates.attachments)) {
        updates.attachments = [];
      }
      updates.attachments = updates.attachments.map((att: any) => {
        if (typeof att === 'string') {
          try {
            return JSON.parse(att);
          } catch {
            return { file_name: att };
          }
        }
        return att;
      });
    }

    // 🔥 FIX: Handle activities as JSONB
    if (updates.activities !== undefined) {
      if (typeof updates.activities === 'string') {
        try {
          updates.activities = JSON.parse(updates.activities);
        } catch {
          updates.activities = [];
        }
      }
      if (!Array.isArray(updates.activities)) {
        updates.activities = [];
      }
    }

    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        const dbField = fieldMapping[key] || camelToSnake(key);
        updateFields.push(`${dbField} = $${paramIndex}`);
        let value = updates[key];

        // Handle different field types
        if (dbField === 'skills') {
          // For PostgreSQL text[] array, use array format
          if (Array.isArray(value)) {
            value = `{${value.map((s: string) => `"${s.replace(/"/g, '\\"')}"`).join(',')}}`;
          } else if (typeof value === 'string') {
            // If it's already a string, clean it
            const cleaned = value
              .replace(/^\{|\}$/g, '')
              .replace(/^\[|\]$/g, '')
              .split(/,\s*/)
              .map((s: string) => s.trim().replace(/^"|"$/g, ''));
            value = `{${cleaned.map((s: string) => `"${s.replace(/"/g, '\\"')}"`).join(',')}}`;
          }
        } else if (['attachments', 'activities'].includes(dbField)) {
          // For JSONB fields, stringify
          if (typeof value === 'object'&& value !== null) {
            value = JSON.stringify(value);
          }
        }

        values.push(value);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
      return;
    }

    values.push(id);
    const result = await client.query(
      `UPDATE education SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await client.query('COMMIT');

    queueCandidateProfileUpdate(req.user!.id, 'update', { field: 'education'});

    res.json({
      success: true,
      message: 'Education updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating education:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update education'
    });
  } finally {
    client.release();
  }
};
export const deleteEducation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    const { id } = req.params;

    const result = await client.query(
      'DELETE FROM education WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Education entry not found'
      });
      return;
    }

    queueCandidateProfileUpdate(req.user!.id, 'update', { field: 'education'});

    res.json({
      success: true,
      message: 'Education deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting education:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete education'
    });
  } finally {
    client.release();
  }
};

// =====================================================
// WORK EXPERIENCE MANAGEMENT (CORRECTED)
// =====================================================

export const addWorkExperience = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    let {
      company,
      company_id,
      title,
      employmentType,
      location,
      locationType,
      startDate,
      endDate,
      isCurrent,
      description,
      achievements,
      skills,
      industry,
      teamSize,
      reportsTo,
      reasonForLeaving,
      attachments,
      verificationMethod,
      displayOrder,
      isRwandan,
      country,
      province,
      district,
      sector,
      cell,
      village
    } = req.body;

    // Validate required fields
    if (!company || !title || !employmentType || !startDate) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Missing required fields: company, title, employmentType, startDate are required'
      });
      return;
    }

    // Same Rwanda-chain validation used for the candidate's own profile-
    // reject a real-looking but inconsistent province/district/.../village combo.
    if (isRwandan === true || isRwandan === 'true') {
      if (!province || !district || !sector || !cell || !village) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, message: 'Province, district, sector, cell and village are required when the role was in Rwanda' });
        return;
      }
      const validChain = await isValidRwandaLocationChain({ province, district, sector, cell, village });
      if (!validChain) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, message: 'Invalid Rwanda location combination' });
        return;
      }
    }

    // 🔥 FIX: TRUNCATE TITLE IF TOO LONG - Prevents VARCHAR(100) error
    if (title && title.length > 100) {
      const originalTitle = title;
      title = title.substring(0, 100);
      logger.warn(`Title truncated from ${originalTitle.length} to 100 characters: ${title}`);
    }

    // 🔥 Normalize attachments to a JSONB array (proof files: {file_name, file_url, file_key, ...})
    if (attachments) {
      if (typeof attachments === 'string') {
        try {
          attachments = JSON.parse(attachments);
        } catch {
          attachments = [];
        }
      }
      if (!Array.isArray(attachments)) {
        attachments = [];
      }
    } else {
      attachments = [];
    }

    // Handle endDate for current positions
    let processedEndDate = endDate;
    if (isCurrent && (!endDate || endDate === '')) {
      processedEndDate = null;
    }

    // Prevent inserting identical work experience rows
    const duplicateCheck = await client.query(
      `SELECT id
       FROM work_experience
       WHERE user_id = $1
         AND company = $2
         AND title = $3
         AND employment_type = $4
         AND start_date = $5
         AND end_date IS NOT DISTINCT FROM $6
       LIMIT 1`,
      [req.user!.id, company, title, employmentType, startDate, processedEndDate]
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        message: 'Duplicate work experience entry already exists'
      });
      return;
    }

    const isRwandanBool = isRwandan === true || isRwandan === 'true';
    const result = await client.query(`
      INSERT INTO work_experience (
        user_id, company, company_id, title, employment_type, location, location_type,
        start_date, end_date, is_current, description, achievements, skills,
        industry, team_size, reports_to, reason_for_leaving, attachments, verification_method, display_order,
        is_rwandan, country, province, district, sector, cell, village
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      RETURNING *
    `, [
      req.user!.id, company, company_id, title, employmentType, location, locationType,
      startDate, processedEndDate, isCurrent || false, description, achievements || [], skills || [],
      industry, teamSize, reportsTo, reasonForLeaving, JSON.stringify(attachments), verificationMethod, displayOrder || 0,
      isRwandan === undefined ? null : isRwandanBool,
      isRwandanBool ? 'Rwanda' : (country || null),
      isRwandanBool ? province : null,
      isRwandanBool ? district : null,
      isRwandanBool ? sector : null,
      isRwandanBool ? cell : null,
      isRwandanBool ? village : null,
    ]);

    await recalculateYearsExperience(client, req.user!.id);
    await client.query('COMMIT');

    queueCandidateProfileUpdate(req.user!.id, 'update', { field: 'work_experience'});

    res.status(201).json({
      success: true,
      message: 'Work experience added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding work experience:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add work experience'
    });
  } finally {
    client.release();
  }
};

export const updateWorkExperience = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const updates = req.body;

    // Check ownership
    const ownershipCheck = await client.query(
      'SELECT id FROM work_experience WHERE id = $1 AND user_id = $2',
      [id, req.user!.id]
    );

    if (ownershipCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: 'Work experience entry not found'
      });
      return;
    }

    // 🔥 FIX: TRUNCATE TITLE IF TOO LONG
    if (updates.title && updates.title.length > 100) {
      const originalTitle = updates.title;
      updates.title = updates.title.substring(0, 100);
      logger.warn(`Title truncated from ${originalTitle.length} to 100 characters: ${updates.title}`);
    }

    // 🔥 FIX: TRUNCATE VERIFICATION METHOD IF TOO LONG
    if (updates.verificationMethod && updates.verificationMethod.length > 100) {
      try {
        // Try to parse and truncate the file name if it's JSON
        const parsed = JSON.parse(updates.verificationMethod);
        if (parsed.files && parsed.files.length > 0) {
          // Truncate each file name to keep total under 100 chars
          parsed.files = parsed.files.map((file: any) => ({
            ...file,
            file_name: file.file_name && file.file_name.length > 50
              ? file.file_name.substring(0, 47) + '...'
              : file.file_name
          }));
          updates.verificationMethod = JSON.stringify(parsed);
        }
      } catch {
        // If not JSON, just truncate the string
        updates.verificationMethod = updates.verificationMethod.substring(0, 100);
      }
      logger.warn(`Verification method truncated to: ${updates.verificationMethod}`);
    }

    // 🔥 Normalize attachments to a JSONB string so node-postgres stores it correctly
    if (updates.attachments !== undefined) {
      let att = updates.attachments;
      if (typeof att === 'string') {
        try { att = JSON.parse(att); } catch { att = []; }
      }
      if (!Array.isArray(att)) att = [];
      updates.attachments = JSON.stringify(att);
    }

    // Handle endDate for current positions
    if (updates.isCurrent && (!updates.endDate || updates.endDate === '')) {
      updates.endDate = null;
    }

    // Same rule as the candidate's own profile: touching any part of the
    // Rwanda location chain requires the whole chain in the same request.
    const locationKeys = ['province', 'district', 'sector', 'cell', 'village'];
    const touchesLocation = locationKeys.some(k => updates[k] !== undefined) || updates.isRwandan !== undefined;
    if (touchesLocation && (updates.isRwandan === true || updates.isRwandan === 'true')) {
      const missing = locationKeys.filter(k => !updates[k]);
      if (missing.length > 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, message: `Updating location requires all of: ${locationKeys.join(', ')}` });
        return;
      }
      const validChain = await isValidRwandaLocationChain({
        province: updates.province, district: updates.district, sector: updates.sector,
        cell: updates.cell, village: updates.village
      });
      if (!validChain) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, message: 'Invalid Rwanda location combination' });
        return;
      }
      updates.country = 'Rwanda';
    } else if (touchesLocation) {
      // isRwandan explicitly false (or being cleared)- drop any Rwanda fields.
      locationKeys.forEach(k => { updates[k] = null; });
    }

    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        const dbField = fieldMapping[key] || camelToSnake(key);
        updateFields.push(`${dbField} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
      return;
    }

    values.push(id);
    const result = await client.query(
      `UPDATE work_experience SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await recalculateYearsExperience(client, req.user!.id);
    await client.query('COMMIT');

    queueCandidateProfileUpdate(req.user!.id, 'update', { field: 'work_experience'});

    res.json({
      success: true,
      message: 'Work experience updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating work experience:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update work experience'
    });
  } finally {
    client.release();
  }
};


// =====================================================
// PROOF FILE MANAGEMENT - COMPLETE FIXED VERSION
// =====================================================

// Add this function to handle proof file uploads
export const uploadProofFile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
      return;
    }

    const file = req.file;
    // Use the file's ACTUAL saved location (multer documentStorage → candidate-documents)
    // so the returned URL is reachable via static serving, instead of a fabricated path.
    const fileKey = `candidate-documents/${file.filename}`;

    const fileData = {
      file_name: file.originalname,
      file_key: fileKey,
      file_size: file.size,
      file_type: file.mimetype,
      uploaded_at: new Date().toISOString(),
      file_url: getFullFileUrl(fileKey)
    };

    res.status(201).json({
      success: true,
      data: fileData,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    logger.error('Error uploading proof file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file'
    });
  }
};

// Add this function to view proof files (opens in browser)
export const viewProofFile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { fileName } = req.params;

    if (!fileName) {
      res.status(400).json({
        success: false,
        message: 'File name is required'
      });
      return;
    }

    const userId = req.user!.id;
    const uploadPath = process.env.UPLOAD_PATH || './uploads';

    // Try to find the file
    const possiblePaths = [
      path.join(uploadPath, 'proofs', userId, fileName),
      path.join(uploadPath, 'proofs', userId, decodeURIComponent(fileName)),
      path.join(uploadPath, fileName),
      path.join(uploadPath, decodeURIComponent(fileName)),
    ];

    let filePath = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        filePath = possiblePath;
        break;
      }
    }

    if (!filePath) {
      // Search in user's proof directory
      const userProofDir = path.join(uploadPath, 'proofs', userId);
      if (fs.existsSync(userProofDir)) {
        const files = fs.readdirSync(userProofDir);
        const matchingFile = files.find(f =>
          f.includes(fileName) ||
          fileName.includes(f) ||
          f.includes(decodeURIComponent(fileName))
        );
        if (matchingFile) {
          filePath = path.join(userProofDir, matchingFile);
        }
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({
        success: false,
        message: 'File not found'
      });
      return;
    }

    // Get the original filename
    const baseFileName = path.basename(filePath);
    const originalNameMatch = baseFileName.match(/^\d+-(.+)$/);
    // ''FIX: Ensure actualFileName is always a string with proper fallback
    let actualFileName: string = baseFileName;
    if (originalNameMatch && originalNameMatch[1]) {
      actualFileName = originalNameMatch[1];
    }

    // ''FIX: Double-check that actualFileName is valid
    if (!actualFileName || actualFileName.length === 0) {
      actualFileName = baseFileName;
    }

    // Get MIME type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    // Set headers for viewing (inline) instead of downloading
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(actualFileName)}"`);

    // Send the file
    res.sendFile(filePath);
  } catch (error) {
    logger.error('Error viewing proof file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to view file'
    });
  }
};

// Add this function to download proof files - FULLY FIXED
export const downloadProofFile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { fileName } = req.params;

    // Check if fileName exists
    if (!fileName) {
      res.status(400).json({
        success: false,
        message: 'File name is required'
      });
      return;
    }

    const userId = req.user!.id;
    const uploadPath = process.env.UPLOAD_PATH || './uploads';

    // Try multiple possible paths
    const possiblePaths = [
      path.join(uploadPath, 'proofs', userId, fileName),
      path.join(uploadPath, 'proofs', userId, decodeURIComponent(fileName)),
      path.join(uploadPath, 'proofs', userId, fileName.replace(/^.*[\\\/]/, '')),
      path.join(uploadPath, 'proofs', userId, fileName.split('-').slice(2).join('-')),
      path.join(uploadPath, fileName),
      path.join(uploadPath, decodeURIComponent(fileName)),
    ];

    let filePath = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        filePath = possiblePath;
        break;
      }
    }

    if (!filePath) {
      // Try to find the file by searching in the user's proof directory
      const userProofDir = path.join(uploadPath, 'proofs', userId);
      if (fs.existsSync(userProofDir)) {
        const files = fs.readdirSync(userProofDir);
        const matchingFile = files.find(f =>
          f.includes(fileName) ||
          fileName.includes(f) ||
          f.includes(decodeURIComponent(fileName))
        );
        if (matchingFile) {
          filePath = path.join(userProofDir, matchingFile);
        }
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({
        success: false,
        message: 'File not found'
      });
      return;
    }

    // Get the original filename (remove timestamp prefix if present)
    const baseFileName = path.basename(filePath);
    // Try to extract original name by removing timestamp pattern
    const originalNameMatch = baseFileName.match(/^proof-\d+-(.+)$/);
    // ''FIX: Ensure actualFileName is always a string
    let actualFileName: string = baseFileName;
    if (originalNameMatch && originalNameMatch[1]) {
      actualFileName = originalNameMatch[1];
    }

    // ''FIX: Double-check that actualFileName is valid
    if (!actualFileName || actualFileName.length === 0) {
      actualFileName = baseFileName;
    }

    // Send the file with the original name
    res.download(filePath, actualFileName);
  } catch (error) {
    logger.error('Error downloading proof file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download file'
    });
  }
};

// Serves a signup identity document (National ID / passport) file.
// Unlike viewProofFile/downloadProofFile above (which resolve files by
// client-supplied filename with a flat-root fallback), ownership is
// established from the candidate_documents row itself   the client only
// supplies a UUID document id, never a path   and the file lives outside
// backend/uploads/, so it's unreachable via the public static mount even if
// this check were bypassed.
export const getIdentityDocumentFile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { documentId, side } = req.params;
    if (side !== 'front'&& side !== 'back') {
      res.status(400).json({ success: false, message: 'side must be "front" or "back"'});
      return;
    }

    const result = await query(
      'SELECT candidate_id, document_front, document_back FROM candidate_documents WHERE id = $1',
      [documentId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Document not found'});
      return;
    }

    const doc = result.rows[0];
    const isOwner = doc.candidate_id === req.user!.id;
    const isReviewer = req.user!.user_type === 'system_admin';
    if (!isOwner && !isReviewer) {
      res.status(403).json({ success: false, message: 'Not authorized to view this document'});
      return;
    }

    const relativeKey = side === 'front'? doc.document_front : doc.document_back;
    if (!relativeKey) {
      res.status(404).json({ success: false, message: 'File not found'});
      return;
    }

    const filePath = resolveIdentityDocumentPath(relativeKey);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'File not found'});
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(filePath);
  } catch (error) {
    logger.error('Error serving identity document file:', error);
    res.status(500).json({ success: false, message: 'Failed to load document'});
  }
};

// Lets an already-registered candidate add or replace their identity
// document from Profile Management   signup only lets them submit one once.
// Unlike register(), the candidate is authenticated here, so multer (see
// candidate.routes.ts identityDocumentUpdateUpload) writes files straight
// into their private-uploads/identity-documents/<userId>/ folder   no
// anonymous staging step is needed. Replacing a side re-submits it for
// review (verification_status resets to 'pending').
export const updateIdentityDocument = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const candidateId = req.user!.id;
  const files = req.files as { documentFront?: Express.Multer.File[]; documentBack?: Express.Multer.File[] } | undefined;
  const newFiles = [files?.documentFront?.[0], files?.documentBack?.[0]].filter((f): f is Express.Multer.File => Boolean(f));
  const cleanupNewFiles = (): void => { newFiles.forEach(f => fs.unlink(f.path, () => {})); };

  try {
    const { documentType, documentNumber } = req.body as { documentType?: DocumentType; documentNumber?: string };

    if (!documentType || !['national_id', 'passport'].includes(documentType)) {
      cleanupNewFiles();
      res.status(400).json({ success: false, message: 'Document type is required'});
      return;
    }
    if (!documentNumber || !documentNumber.trim()) {
      cleanupNewFiles();
      res.status(400).json({ success: false, message: 'Document number is required'});
      return;
    }

    const profileResult = await query(
      'SELECT country, date_of_birth FROM candidate_profiles WHERE user_id = $1',
      [candidateId]
    );
    const country = profileResult.rows[0]?.country || null;
    const dateOfBirth = profileResult.rows[0]?.date_of_birth || null;

    const docValidation = validateIdentityDocument(country, documentType, documentNumber, dateOfBirth);
    if (!docValidation.valid) {
      cleanupNewFiles();
      res.status(400).json({ success: false, message: docValidation.error });
      return;
    }

    const existingResult = await query(
      'SELECT id, document_front, document_back FROM candidate_documents WHERE candidate_id = $1 ORDER BY created_at DESC LIMIT 1',
      [candidateId]
    );
    const existing = existingResult.rows[0];

    const dupResult = await query(
      'SELECT id FROM candidate_documents WHERE document_type = $1 AND document_number = $2 AND candidate_id != $3',
      [documentType, documentNumber.trim(), candidateId]
    );
    if (dupResult.rows.length > 0) {
      cleanupNewFiles();
      const label = documentType === 'national_id'? 'National ID': 'Passport';
      res.status(400).json({ success: false, message: `${label} already exists` });
      return;
    }

    const frontFile = files?.documentFront?.[0];
    const backFile = files?.documentBack?.[0];

    if (!existing && !frontFile) {
      cleanupNewFiles();
      res.status(400).json({ success: false, message: 'Identity document upload is required'});
      return;
    }

    const frontKey = frontFile ? `${candidateId}/${frontFile.filename}` : existing?.document_front;
    const backKey = backFile ? `${candidateId}/${backFile.filename}` : (existing?.document_back || null);

    // Delete the physical files being superseded (old front/back replaced by a new upload).
    [
      frontFile && existing?.document_front,
      backFile && existing?.document_back,
    ].forEach(oldKey => {
      if (!oldKey) return;
      const oldPath = resolveIdentityDocumentPath(oldKey);
      if (oldPath) fs.unlink(oldPath, () => {});
    });

    if (existing) {
      await query(
        `UPDATE candidate_documents
         SET document_type = $1, document_number = $2, document_front = $3, document_back = $4,
             verification_status = 'pending', updated_at = NOW()
         WHERE id = $5`,
        [documentType, documentNumber.trim(), frontKey, backKey, existing.id]
      );
    } else {
      await query(
        `INSERT INTO candidate_documents (candidate_id, document_type, document_number, document_front, document_back)
         VALUES ($1, $2, $3, $4, $5)`,
        [candidateId, documentType, documentNumber.trim(), frontKey, backKey]
      );
    }

    if (docValidation.warning) {
      logger.warn(`Identity document warning for candidate ${candidateId}: ${docValidation.warning}`);
    }

    res.json({ success: true, message: 'Identity document saved for review'});
  } catch (error) {
    cleanupNewFiles();
    logger.error('Error updating identity document:', error);
    res.status(500).json({ success: false, message: 'Failed to save identity document'});
  }
};

export const deleteWorkExperience = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    const { id } = req.params;

    const result = await client.query(
      'DELETE FROM work_experience WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Work experience entry not found'
      });
      return;
    }

    await recalculateYearsExperience(client, req.user!.id);
    queueCandidateProfileUpdate(req.user!.id, 'update', { field: 'work_experience'});

    res.json({
      success: true,
      message: 'Work experience deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting work experience:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete work experience'
    });
  } finally {
    client.release();
  }
};

// =====================================================
// SKILLS MANAGEMENT (CORRECTED)
// =====================================================

export const addSkill = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      skillId,
      skillName,
      proficiencyLevel,
      yearsExperience,
      isPrimary,
      lastUsed,
      skillContext
    } = req.body;

    // Validate proficiency level
    if (proficiencyLevel && (proficiencyLevel < 1 || proficiencyLevel > 5)) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Proficiency level must be between 1 and 5'
      });
      return;
    }

    // Validate that either skillId or skillName is provided
    if (!skillId && !skillName?.trim()) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Either skillId or skillName must be provided'
      });
      return;
    }

    // Parse date if provided (handles DD/MM/YYYY format)
    let parsedLastUsed = null;
    if (lastUsed) {
      if (typeof lastUsed === 'string'&& lastUsed.includes('/')) {
        const parts = lastUsed.split('/');
        if (parts.length === 3) {
          const day = parts[0];
          const month = parts[1];
          const year = parts[2];
          // Validate that we have valid values
          if (day && month && year) {
            parsedLastUsed = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else {
            parsedLastUsed = lastUsed;
          }
        } else {
          parsedLastUsed = lastUsed;
        }
      } else {
        parsedLastUsed = lastUsed;
      }
    }

    let finalSkillId = skillId;

    // If no skillId provided but skillName is given, create a new skill
    if (!skillId && skillName?.trim()) {
      const existingSkill = await client.query(
        'SELECT id FROM skills WHERE LOWER(name) = LOWER($1)',
        [skillName.trim()]
      );

      if (existingSkill.rows.length > 0) {
        finalSkillId = existingSkill.rows[0].id;
      } else {
        const newSkillResult = await client.query(
          `INSERT INTO skills (name, category, skill_type, metadata) 
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [skillName.trim(), 'Custom', 'technical', JSON.stringify({ created_by: req.user!.id })]
        );
        finalSkillId = newSkillResult.rows[0].id;
      }
    }

    if (!finalSkillId) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Unable to determine skill ID'
      });
      return;
    }

    // Check if skill already exists for user
    const existingSkill = await client.query(
      'SELECT 1 FROM user_skills WHERE user_id = $1 AND skill_id = $2',
      [req.user!.id, finalSkillId]
    );

    if (existingSkill.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Skill already exists in your profile'
      });
      return;
    }

    await client.query(`
      INSERT INTO user_skills (
        user_id, skill_id, proficiency_level, years_experience, is_primary, last_used, skill_context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      req.user!.id, finalSkillId, proficiencyLevel || 3, yearsExperience, isPrimary || false,
      parsedLastUsed, skillContext
    ]);

    // Get the inserted record with skill name
    const insertedResult = await client.query(`
      SELECT 
        us.user_id, us.skill_id, us.proficiency_level, us.proficiency_label, 
        us.years_experience, us.months_experience, us.is_primary, us.last_used, 
        us.skill_context, us.endorsement_count, us.created_at, us.updated_at,
        s.name, s.category, s.skill_type
      FROM user_skills us
      JOIN skills s ON us.skill_id = s.id
      WHERE us.user_id = $1 AND us.skill_id = $2
    `, [req.user!.id, finalSkillId]);

    await client.query('COMMIT');

    queueCandidateProfileUpdate(req.user!.id, 'update', { field: 'skills'});

    res.status(201).json({
      success: true,
      message: 'Skill added successfully',
      data: insertedResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding skill:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add skill'
    });
  } finally {
    client.release();
  }
};

export const updateSkill = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { skillId } = req.params;
    const { skillName, proficiencyLevel, yearsExperience, isPrimary, lastUsed, skillContext } = req.body;

    // Check ownership and get current skill
    const ownershipCheck = await client.query(
      `SELECT us.*, s.name as current_skill_name 
       FROM user_skills us 
       JOIN skills s ON us.skill_id = s.id 
       WHERE us.user_id = $1 AND us.skill_id = $2`,
      [req.user!.id, skillId]
    );

    if (ownershipCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: 'Skill not found in your profile'
      });
      return;
    }

    const currentSkill = ownershipCheck.rows[0];
    let finalSkillId = skillId;

    // Parse lastUsed if provided
    // In updateSkill function, replace the date parsing section
    let parsedLastUsed = lastUsed;
    if (lastUsed && typeof lastUsed === 'string'&& lastUsed.includes('/')) {
      const parts = lastUsed.split('/');
      if (parts.length === 3) {
        const day = parts[0];
        const month = parts[1];
        const year = parts[2];
        if (day && month && year) {
          parsedLastUsed = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }
    }

    // If skillName is provided and different, handle skill name change
    if (skillName && skillName.trim() && skillName.trim() !== currentSkill.current_skill_name) {
      const existingSkill = await client.query(
        'SELECT id FROM skills WHERE LOWER(name) = LOWER($1)',
        [skillName.trim()]
      );

      if (existingSkill.rows.length > 0) {
        finalSkillId = existingSkill.rows[0].id;
      } else {
        const newSkillResult = await client.query(
          `INSERT INTO skills (name, category, skill_type, metadata) 
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [skillName.trim(), 'Custom', 'technical', JSON.stringify({ updated_from: skillId })]
        );
        finalSkillId = newSkillResult.rows[0].id;
      }

      // If skill_id changed, handle the change
      if (finalSkillId !== skillId) {
        const existingUserSkill = await client.query(
          'SELECT 1 FROM user_skills WHERE user_id = $1 AND skill_id = $2',
          [req.user!.id, finalSkillId]
        );

        if (existingUserSkill.rows.length > 0) {
          await client.query('ROLLBACK');
          res.status(400).json({
            success: false,
            message: 'You already have a skill with this name in your profile'
          });
          return;
        }

        // Delete old user_skill and insert new one
        await client.query(
          'DELETE FROM user_skills WHERE user_id = $1 AND skill_id = $2',
          [req.user!.id, skillId]
        );

        await client.query(`
          INSERT INTO user_skills (
            user_id, skill_id, proficiency_level, years_experience, 
            is_primary, last_used, skill_context
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          req.user!.id, finalSkillId,
          proficiencyLevel !== undefined ? proficiencyLevel : currentSkill.proficiency_level,
          yearsExperience !== undefined ? yearsExperience : currentSkill.years_experience,
          isPrimary !== undefined ? isPrimary : currentSkill.is_primary,
          parsedLastUsed !== undefined ? parsedLastUsed : currentSkill.last_used,
          skillContext !== undefined ? skillContext : currentSkill.skill_context
        ]);
      } else {
        // Same skill_id, just update
        const updateFields = [];
        const values = [];
        let paramIndex = 1;

        if (proficiencyLevel !== undefined) {
          updateFields.push(`proficiency_level = $${paramIndex++}`);
          values.push(proficiencyLevel);
        }
        if (yearsExperience !== undefined) {
          updateFields.push(`years_experience = $${paramIndex++}`);
          values.push(yearsExperience);
        }
        if (isPrimary !== undefined) {
          updateFields.push(`is_primary = $${paramIndex++}`);
          values.push(isPrimary);
        }
        if (parsedLastUsed !== undefined) {
          updateFields.push(`last_used = $${paramIndex++}`);
          values.push(parsedLastUsed);
        }
        if (skillContext !== undefined) {
          updateFields.push(`skill_context = $${paramIndex++}`);
          values.push(skillContext);
        }

        if (updateFields.length > 0) {
          values.push(req.user!.id, skillId);
          await client.query(
            `UPDATE user_skills 
             SET ${updateFields.join(', ')}, updated_at = NOW() 
             WHERE user_id = $${paramIndex} AND skill_id = $${paramIndex + 1}`,
            values
          );
        }
      }
    } else {
      // No skill name change, just update other fields
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (proficiencyLevel !== undefined) {
        updateFields.push(`proficiency_level = $${paramIndex++}`);
        values.push(proficiencyLevel);
      }
      if (yearsExperience !== undefined) {
        updateFields.push(`years_experience = $${paramIndex++}`);
        values.push(yearsExperience);
      }
      if (isPrimary !== undefined) {
        updateFields.push(`is_primary = $${paramIndex++}`);
        values.push(isPrimary);
      }
      if (parsedLastUsed !== undefined) {
        updateFields.push(`last_used = $${paramIndex++}`);
        values.push(parsedLastUsed);
      }
      if (skillContext !== undefined) {
        updateFields.push(`skill_context = $${paramIndex++}`);
        values.push(skillContext);
      }

      if (updateFields.length > 0) {
        values.push(req.user!.id, skillId);
        await client.query(
          `UPDATE user_skills 
           SET ${updateFields.join(', ')}, updated_at = NOW() 
           WHERE user_id = $${paramIndex} AND skill_id = $${paramIndex + 1}`,
          values
        );
      }
    }

    // Get the final record with skill name
    const finalResult = await client.query(`
      SELECT 
        us.*, s.name, s.category, s.skill_type
      FROM user_skills us
      JOIN skills s ON us.skill_id = s.id
      WHERE us.user_id = $1 AND us.skill_id = $2
    `, [req.user!.id, finalSkillId]);

    await client.query('COMMIT');

    queueCandidateProfileUpdate(req.user!.id, 'update', { field: 'skills'});

    res.json({
      success: true,
      message: 'Skill updated successfully',
      data: finalResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating skill:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update skill'
    });
  } finally {
    client.release();
  }
};

export const deleteSkill = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    const { skillId } = req.params;

    const result = await client.query(
      'DELETE FROM user_skills WHERE user_id = $1 AND skill_id = $2 RETURNING *',
      [req.user!.id, skillId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Skill not found in your profile'
      });
      return;
    }

    queueCandidateProfileUpdate(req.user!.id, 'update', { field: 'skills'});

    res.json({
      success: true,
      message: 'Skill removed successfully'
    });
  } catch (error) {
    logger.error('Error deleting skill:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove skill'
    });
  } finally {
    client.release();
  }
};

// =====================================================
// PORTFOLIO LINKS MANAGEMENT (CORRECTED)
// =====================================================

export const addPortfolioLink = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { platform, url, title, description, thumbnailUrl, metadata, displayOrder } = req.body;

    // Validate required fields
    if (!platform || !url) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Missing required fields: platform and url are required'
      });
      return;
    }

    const validPlatforms = ['personal', 'github', 'linkedin', 'professional', 'portfolio', 'behance', 'dribbble', 'medium', 'other'];
    const validPlatform = validPlatforms.includes(platform) ? platform : 'other';

    const result = await client.query(`
      INSERT INTO portfolio_links (user_id, platform, url, title, description, thumbnail_url, metadata, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      req.user!.id,
      validPlatform,
      url,
      title,
      description,
      thumbnailUrl,
      metadata || {},
      displayOrder || 0
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Portfolio link added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding portfolio link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add portfolio link'
    });
  } finally {
    client.release();
  }
};

export const addPortfolioLinks = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { links } = req.body;

    if (!links || !Array.isArray(links) || links.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Links array is required and must not be empty'
      });
      return;
    }

    const insertedLinks = [];

    for (const link of links) {
      const validPlatforms = ['personal', 'github', 'linkedin', 'professional', 'portfolio', 'behance', 'dribbble', 'medium', 'other'];
      const validPlatform = validPlatforms.includes(link.platform) ? link.platform : 'other';

      const result = await client.query(`
        INSERT INTO portfolio_links (user_id, platform, url, title, description, thumbnail_url, metadata, display_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        req.user!.id,
        validPlatform,
        link.url,
        link.title,
        link.description,
        link.thumbnailUrl,
        link.metadata || {},
        link.displayOrder || 0
      ]);

      insertedLinks.push(result.rows[0]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Portfolio links added successfully',
      data: insertedLinks
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding portfolio links:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add portfolio links'
    });
  } finally {
    client.release();
  }
};

export const updatePortfolioLink = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const updates = req.body;

    // Check ownership
    const ownershipCheck = await client.query(
      'SELECT id FROM portfolio_links WHERE id = $1 AND user_id = $2',
      [id, req.user!.id]
    );

    if (ownershipCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: 'Portfolio link not found'
      });
      return;
    }

    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        const dbField = fieldMapping[key] || camelToSnake(key);
        updateFields.push(`${dbField} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
      return;
    }

    values.push(id);
    const result = await client.query(
      `UPDATE portfolio_links SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Portfolio link updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating portfolio link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update portfolio link'
    });
  } finally {
    client.release();
  }
};

export const deletePortfolioLink = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();
  try {
    const { id } = req.params;

    const result = await client.query(
      'DELETE FROM portfolio_links WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Portfolio link not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Portfolio link deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting portfolio link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete portfolio link'
    });
  } finally {
    client.release();
  }
};

// =====================================================
// RESUME MANAGEMENT (CORRECTED)
// =====================================================

export const uploadResume = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
      return;
    }

    const isPrimary = req.body.isPrimary === 'true'|| req.body.isPrimary === true;
    const file = req.file;
    const parsedData = req.body.parsedData
      ? JSON.parse(req.body.parsedData)
      : (req.body.extractedText ? { extractedText: req.body.extractedText } : null);

    // Use the filename generated by multer
    const fileKey = file.filename;

    // If this resume is set as primary, unset other primary resumes
    if (isPrimary) {
      await query(
        'UPDATE resumes SET is_primary = false WHERE user_id = $1',
        [req.user!.id]
      );
    }

    const result = await query(`
      INSERT INTO resumes (
        user_id, file_name, file_key, file_size, mime_type, is_primary, version, parsed_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, file_name, file_key, file_size, mime_type, is_primary, version, parsed_data, created_at
    `, [
      req.user!.id,
      file.originalname,
      fileKey,
      file.size,
      file.mimetype,
      isPrimary,
      1,
      parsedData
    ]);

    const resume = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Resume uploaded successfully',
      data: {
        ...resume,
        // resume.file_key is the bare filename (see fileKey above) -- the
        // file actually lives under uploads/resumes/, same folder
        // downloadResume() joins in below, so the public URL needs that
        // same prefix or it 404s against the static /uploads mount.
        file_url: getFullFileUrl(`resumes/${resume.file_key}`),
        uploaded_at: resume.created_at
      }
    });
  } catch (error) {
    logger.error('Error uploading resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload resume'
    });
  }
};

export const deleteResume = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM resumes WHERE id = $1 AND user_id = $2 RETURNING file_key',
      [id, req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
      return;
    }

    // Delete the physical file. resume.file_key is the bare filename (see
    // uploadResume) -- the file lives under uploads/resumes/, same folder
    // downloadResume() joins in, so this must too or the file is never
    // actually removed from disk (silent orphan, not an error).
    const resume = result.rows[0];
    if (resume.file_key) {
      const uploadPath = process.env.UPLOAD_PATH || './uploads';
      const filePath = path.join(uploadPath, 'resumes', resume.file_key);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({
      success: true,
      message: 'Resume deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete resume'
    });
  }
};

export const setPrimaryResume = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if resume exists and belongs to user
    const resumeCheck = await query(
      'SELECT id FROM resumes WHERE id = $1 AND user_id = $2',
      [id, req.user!.id]
    );

    if (resumeCheck.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
      return;
    }

    // Set all resumes to non-primary for this user
    await query(
      'UPDATE resumes SET is_primary = false WHERE user_id = $1',
      [req.user!.id]
    );

    // Set the selected resume as primary
    await query(
      'UPDATE resumes SET is_primary = true WHERE id = $1 AND user_id = $2',
      [id, req.user!.id]
    );

    res.json({
      success: true,
      message: 'Primary resume updated successfully'
    });
  } catch (error) {
    logger.error('Error setting primary resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set primary resume'
    });
  }
};

export const downloadResume = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT file_key, file_name, mime_type FROM resumes WHERE id = $1 AND user_id = $2',
      [id, req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
      return;
    }

    const resume = result.rows[0];
    const uploadPath = process.env.UPLOAD_PATH || './uploads';

    // ''Include 'resumes'subfolder in the path
    const filePath = path.join(uploadPath, 'resumes', resume.file_key);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // Try alternative location (without resumes folder)
      const altPath = path.join(uploadPath, resume.file_key);
      if (fs.existsSync(altPath)) {
        // If file is in root uploads, move it or serve from there
        res.download(altPath, resume.file_name);
        return;
      }

      res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
      return;
    }

    res.download(filePath, resume.file_name);
  } catch (error) {
    logger.error('Error downloading resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download resume'
    });
  }
};

// =====================================================
// PROFILE DATA RETRIEVAL (CORRECTED)
// =====================================================

export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = String(req.params.userId || req.user!.id);

    // Ensure profile data is de-duplicated before returning it
    await cleanupDuplicateProfileRows(userId);

    // Get basic profile info
    const profileResult = await query(`
      SELECT cp.*, u.email, u.status as user_status
      FROM candidate_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.user_id = $1
    `, [userId]);

    if (profileResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
      return;
    }

    const profile = profileResult.rows[0];

    // Get education
    const educationResult = await query(`
      SELECT * FROM education
      WHERE user_id = $1
      ORDER BY is_current DESC, start_date DESC, end_date DESC NULLS FIRST
    `, [userId]);

    // Get work experience
    const workExperienceResult = await query(`
      SELECT * FROM work_experience
      WHERE user_id = $1
      ORDER BY is_current DESC, start_date DESC, end_date DESC NULLS FIRST
    `, [userId]);

    // Get skills
    const skillsResult = await query(`
      SELECT 
        us.user_id, us.skill_id, us.proficiency_level, us.proficiency_label, 
        us.years_experience, us.months_experience, us.is_primary, us.last_used, 
        us.skill_context, us.endorsement_count, us.verified, us.created_at, us.updated_at,
        s.name, s.category, s.skill_type
      FROM user_skills us
      LEFT JOIN skills s ON us.skill_id = s.id
      WHERE us.user_id = $1
      ORDER BY us.is_primary DESC, us.proficiency_level DESC
    `, [userId]);

    // Get portfolio links
    const portfolioResult = await query(`
      SELECT * FROM portfolio_links
      WHERE user_id = $1
      ORDER BY display_order ASC, created_at ASC
    `, [userId]);

    // Get resumes
    const resumesResult = await query(`
      SELECT 
        id, file_name, file_key, file_size, mime_type,
        is_primary, version, parsed_data, parsing_confidence,
        skills_extracted, created_at as uploaded_at
      FROM resumes
      WHERE user_id = $1
      ORDER BY is_primary DESC, created_at DESC
    `, [userId]);

    // Transform resumes to include file_url. resume.file_key is the bare
    // filename -- the file lives under uploads/resumes/, so the public URL
    // needs that prefix (see uploadResume's matching comment).
    const resumesWithUrl = resumesResult.rows.map((resume: any) => ({
      id: resume.id,
      file_name: resume.file_name,
      file_key: resume.file_key,
      file_url: getFullFileUrl(`resumes/${resume.file_key}`),
      file_size: resume.file_size,
      mime_type: resume.mime_type,
      is_primary: resume.is_primary,
      version: resume.version,
      parsed_data: resume.parsed_data,
      parsing_confidence: resume.parsing_confidence,
      skills_extracted: resume.skills_extracted,
      uploaded_at: resume.uploaded_at
    }));

    const parsedEducation = educationResult.rows.map((edu: any) => ({
      ...edu,
      attachments: edu.attachments
        ? (typeof edu.attachments === 'string'? JSON.parse(edu.attachments) : edu.attachments)
        : []
    }));

    const parsedWorkExperience = workExperienceResult.rows.map((work: any) => ({
      ...work,
      achievements: work.achievements || [],
      skills: work.skills || [],
      attachments: work.attachments
        ? (typeof work.attachments === 'string'? JSON.parse(work.attachments) : work.attachments)
        : []
    }));

    // Identity document metadata only   never the raw file path/key, which
    // is only resolvable via the authenticated getIdentityDocumentFile route.
    const documentsResult = await query(`
      SELECT id, document_type, document_number, verification_status,
             (document_back IS NOT NULL) AS has_back, created_at, updated_at
      FROM candidate_documents
      WHERE candidate_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    res.json({
      success: true,
      data: {
        profile: profile,
        education: parsedEducation,
        workExperience: parsedWorkExperience,
        experience: parsedWorkExperience,
        skills: skillsResult.rows,
        portfolioLinks: portfolioResult.rows,
        resumes: resumesWithUrl,
        documents: documentsResult.rows
      }
    });
  } catch (error) {
    logger.error('Error getting profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
};

// =====================================================
// PROFILE PREFERENCES & SETTINGS (CORRECTED)
// =====================================================

export const updatePreferences = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const preferencesData = { ...(req.body || {}) };

    // Server-side validation (defense in depth   the UI already validates these).
    const errors: string[] = [];

    const REMOTE_PREFS = ['remote_only', 'office_only', 'hybrid', 'flexible', 'remote', 'onsite', 'any'];
    if (preferencesData.remote_work_preference != null &&
        !REMOTE_PREFS.includes(String(preferencesData.remote_work_preference))) {
      errors.push('Invalid remote work preference');
    }

    const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'RWF'];
    if (preferencesData.salary_currency != null &&
        !CURRENCIES.includes(String(preferencesData.salary_currency))) {
      errors.push('Invalid salary currency');
    }

    // Coerce salary values to numbers (forms may send strings) and validate.
    const toNum = (v: any): number | null =>
      (v === ''|| v === null || v === undefined) ? null : Number(v);
    const minN = toNum(preferencesData.salary_min);
    const maxN = toNum(preferencesData.salary_max);
    if (minN !== null && (isNaN(minN) || minN < 0)) errors.push('Minimum salary must be a non-negative number');
    if (maxN !== null && (isNaN(maxN) || maxN < 0)) errors.push('Maximum salary must be a non-negative number');
    if (minN !== null && maxN !== null && !isNaN(minN) && !isNaN(maxN) && minN > maxN) {
      errors.push('Minimum salary cannot be greater than maximum salary');
    }
    if (minN !== null && !isNaN(minN)) preferencesData.salary_min = minN;
    if (maxN !== null && !isNaN(maxN)) preferencesData.salary_max = maxN;

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('; '), errors });
      return;
    }

    const result = await query(`
      UPDATE candidate_profiles
      SET
        job_preferences = $1,
        updated_at = NOW()
      WHERE user_id = $2
      RETURNING *
    `, [JSON.stringify(preferencesData), req.user!.id]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
      return;
    }

    queueCandidateProfileUpdate(req.user!.id, 'update', {
      field: 'job_preferences',
      profile_completion: result.rows[0].profile_completion ?? null,
    });

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update preferences'
    });
  }
};

export const updateAvailability = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, availableFrom, noticePeriod, openToOpportunities, preferredStartDate } = req.body;

    const VALID_STATUSES = ['not_looking', 'actively_looking', 'open_to_offers', 'passive', 'interviewing', 'available_soon'];
    if (status != null && !VALID_STATUSES.includes(String(status))) {
      res.status(400).json({ success: false, message: 'Invalid availability status'});
      return;
    }
    if (noticePeriod != null && (isNaN(Number(noticePeriod)) || Number(noticePeriod) < 0)) {
      res.status(400).json({ success: false, message: 'Notice period must be a non-negative number of days'});
      return;
    }

    const availabilityObj = {
      status: status || 'not_looking',
      available_from: availableFrom || null,
      notice_period: noticePeriod || null,
      open_to_opportunities: openToOpportunities !== undefined ? openToOpportunities : false,
      preferred_start_date: preferredStartDate || null
    };

    const result = await query(`
      UPDATE candidate_profiles
      SET
        availability = $1,
        updated_at = NOW()
      WHERE user_id = $2
      RETURNING *
    `, [JSON.stringify(availabilityObj), req.user!.id]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
      return;
    }

    queueCandidateProfileUpdate(req.user!.id, 'update', {
      field: 'availability',
      profile_completion: result.rows[0].profile_completion ?? null,
    });

    res.json({
      success: true,
      message: 'Availability updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update availability'
    });
  }
};

export const updatePrivacySettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const privacySettings = req.body || {};

    const VALID_VISIBILITY = ['public', 'private', 'connections_only', 'recruiters_only'];
    if (privacySettings.profile_visibility != null &&
        !VALID_VISIBILITY.includes(String(privacySettings.profile_visibility))) {
      res.status(400).json({ success: false, message: 'Invalid profile visibility setting'});
      return;
    }

    const VALID_RETENTION = ['indefinite', '7_years', '5_years', '3_years', '1_year'];
    if (privacySettings.data_retention_period != null &&
        !VALID_RETENTION.includes(String(privacySettings.data_retention_period))) {
      res.status(400).json({ success: false, message: 'Invalid data retention period'});
      return;
    }

    const result = await query(`
      UPDATE candidate_profiles
      SET
        privacy_settings = $1,
        updated_at = NOW()
      WHERE user_id = $2
      RETURNING *
    `, [JSON.stringify(privacySettings), req.user!.id]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
      return;
    }

    queueCandidateProfileUpdate(req.user!.id, 'update', {
      field: 'privacy_settings',
      profile_completion: result.rows[0].profile_completion ?? null,
    });

    res.json({
      success: true,
      message: 'Privacy settings updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating privacy settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update privacy settings'
    });
  }
};

// In profileController.js - FIXED updateProfile function

export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updates = req.body;
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    const jsonbFields = ['current_salary', 'expected_salary', 'languages', 'metadata'];

    console.log(' Updating profile with data:', updates);

    // ''Field mapping from frontend to database column names
    const fieldMapping: { [key: string]: string } = {
      firstName: 'first_name',
      lastName: 'last_name',
      phone: 'phone',
      location: 'city',        // ''Map 'location'to 'city'column
      bio: 'summary',          // ''Map 'bio'to 'summary'column
      // headline is intentionally NOT mapped here- same as years_experience,
      // it's derived server-side from work_experience entries (see
      // recalculateYearsExperience) and must not be directly overwritable
      // through this generic endpoint.
      country: 'country',
      city: 'city',
      timezone: 'timezone',
      dateOfBirth: 'date_of_birth',
      gender: 'gender',
      linkedinUrl: 'linkedin_url',
      githubUrl: 'github_url',
      portfolioUrl: 'portfolio_url',
      websiteUrl: 'website_url',
      willingToRelocate: 'willing_to_relocate',
      willingToTravel: 'willing_to_travel',
      noticePeriodDays: 'notice_period_days',
      currentSalary: 'current_salary',
      expectedSalary: 'expected_salary',
      currency: 'currency',
      profilePhotoUrl: 'profile_photo_url',
      profilePhotoKey: 'profile_photo_key',
      summary: 'summary',
      // years_experience is intentionally NOT mapped here- it's derived
      // server-side from work_experience entries (see recalculateYearsExperience)
      // and must not be directly overwritable through this generic endpoint.
      languages: 'languages',
      metadata: 'metadata',
      isRwandan: 'is_rwandan',
      province: 'province',
      district: 'district',
      sector: 'sector',
      cell: 'cell',
      village: 'village',
    };

    // Allowed database columns
    const allowedDbColumns = [
      'first_name', 'last_name', 'phone', 'country', 'city', 'timezone',
      'date_of_birth', 'gender', 'profile_photo_url', 'profile_photo_key',
      'linkedin_url', 'github_url', 'portfolio_url', 'website_url',
      'willing_to_relocate', 'willing_to_travel', 'notice_period_days',
      'current_salary', 'expected_salary', 'currency', 'summary',
      'languages', 'metadata',
      'is_rwandan', 'province', 'district', 'sector', 'cell', 'village'
    ];

    // Editing any part of the Rwanda location requires the whole chain in
    // the same request   partial edits (e.g. district only) can't be
    // validated without re-fetching the rest of the candidate's current
    // location, so they're rejected rather than silently accepted unvalidated.
    const locationKeys = ['province', 'district', 'sector', 'cell', 'village'];
    const touchesLocation = Object.keys(updates).some(k => locationKeys.includes(k) || k === 'isRwandan');
    if (touchesLocation && updates.isRwandan !== false && updates.isRwandan !== 'false') {
      const missing = locationKeys.filter(k => !updates[k]);
      if (missing.length > 0) {
        res.status(400).json({
          success: false,
          message: `Updating location requires all of: ${locationKeys.join(', ')}`
        });
        return;
      }
      const validChain = await isValidRwandaLocationChain({
        province: updates.province, district: updates.district, sector: updates.sector,
        cell: updates.cell, village: updates.village
      });
      if (!validChain) {
        res.status(400).json({ success: false, message: 'Invalid Rwanda location combination'});
        return;
      }
    }

    Object.keys(updates).forEach(key => {
      // Map frontend field to database column
      const dbField = fieldMapping[key] || camelToSnake(key);

      // Skip if not allowed
      if (!allowedDbColumns.includes(dbField)) {
        console.log(`Skipping field: ${key} -> ${dbField} (not in allowed list)`);
        return;
      }

      // Skip undefined values
      if (updates[key] === undefined) return;

      updateFields.push(`${dbField} = $${paramIndex}`);

      // Handle JSONB fields
      if (jsonbFields.includes(dbField)) {
        values.push(JSON.stringify(updates[key]));
      } else {
        values.push(updates[key]);
      }
      paramIndex++;
    });

    if (updateFields.length === 0) {
      console.log('No valid fields to update');
      res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
      return;
    }

    values.push(req.user!.id);
    console.log(` Updating fields: ${updateFields.join(', ')}`);
    console.log(' Values:', values);

    const result = await query(
      `UPDATE candidate_profiles 
       SET ${updateFields.join(', ')}, updated_at = NOW() 
       WHERE user_id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
      return;
    }

    console.log('Profile updated successfully:', result.rows[0]);

    queueCandidateProfileUpdate(req.user!.id, 'update', {
      fields: updateFields.map(f => f.split('= ')[0]),
      profile_completion: result.rows[0].profile_completion ?? null,
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error(' Error updating profile:', error);
    logger.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// =====================================================
// SKILLS LIST (PUBLIC)
// =====================================================

export const getSkillsList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, search, skillType, limit = 100 } = req.query;

    let queryText = 'SELECT id, name, category, skill_type FROM skills WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (category) {
      queryText += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (skillType) {
      queryText += ` AND skill_type = $${paramIndex}`;
      params.push(skillType);
      paramIndex++;
    }

    if (search) {
      queryText += ` AND name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    queryText += ` ORDER BY name ASC LIMIT $${paramIndex}`;
    params.push(Number(limit));

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Error getting skills list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get skills list'
    });
  }
};

// =====================================================
// PROFILE COMPLETION (CORRECTED)
// =====================================================

export const completeProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Check if profile has all required sections
    const profileResult = await query(`
      SELECT cp.* FROM candidate_profiles cp WHERE cp.user_id = $1
    `, [userId]);

    if (profileResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Profile not found. Please create your profile first.'
      });
      return;
    }

    const profile = profileResult.rows[0];

    // Check counts for each section
    const educationResult = await query(`SELECT COUNT(*) as count FROM education WHERE user_id = $1`, [userId]);
    const experienceResult = await query(`SELECT COUNT(*) as count FROM work_experience WHERE user_id = $1`, [userId]);
    const skillsResult = await query(`SELECT COUNT(*) as count FROM user_skills WHERE user_id = $1`, [userId]);
    const resumeResult = await query(`SELECT COUNT(*) as count FROM resumes WHERE user_id = $1`, [userId]);

    const educationCount = parseInt(educationResult.rows[0].count);
    const experienceCount = parseInt(experienceResult.rows[0].count);
    const skillsCount = parseInt(skillsResult.rows[0].count);
    const resumeCount = parseInt(resumeResult.rows[0].count);

    // Calculate completion percentage
    let completionScore = 0;
    const fields = {
      basicInfo: !!(profile.first_name && profile.last_name && profile.headline && profile.city),
      education: educationCount > 0,
      experience: experienceCount > 0,
      skills: skillsCount > 0,
      resume: resumeCount > 0
    };

    const totalFields = Object.keys(fields).length;
    completionScore = Object.values(fields).filter(Boolean).length;

    const completionPercentage = Math.round((completionScore / totalFields) * 100);
    const isComplete = completionPercentage === 100;

    // Update profile completion
    const result = await query(`
      UPDATE candidate_profiles
      SET
        profile_completion = $1,
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{profile_completed_at}',
          CASE WHEN $2 THEN to_jsonb(NOW()) ELSE 'null'::jsonb END
        ),
        updated_at = NOW()
      WHERE user_id = $3
      RETURNING *
    `, [completionPercentage, isComplete, userId]);

    if (!isComplete) {
      res.status(400).json({
        success: false,
        message: 'Profile is not complete. Please fill in all required sections.',
        completionPercentage,
        requirements: fields
      });
      return;
    }

    queueCandidateProfileUpdate(userId, 'update', {
      field: 'profile_completion',
      completion_percentage: completionPercentage,
      is_complete: isComplete,
    });

    res.json({
      success: true,
      message: 'Profile completed successfully!',
      completionPercentage,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error completing profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete profile'
    });
  }
};

// backend/src/controllers/profileController.js or similar

// backend/src/controllers/profileController.js

export const getProfileCompletionStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // ''JOIN with users table to get email, user_type, and status
    const profileResult = await query(`
      SELECT 
        cp.*,
        u.email,
        u.user_type,
        u.status as user_status
      FROM candidate_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.user_id = $1
    `, [userId]);

    if (profileResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
      return;
    }

    const profile = profileResult.rows[0];

    // 📊 Log for debugging
    console.log('🔍 Profile data:', {
      first_name: profile.first_name,
      last_name: profile.last_name,
      city: profile.city,
      email: profile.email,        // ''Now available from JOIN
      phone: profile.phone,
      user_type: profile.user_type, // ''Now available from JOIN
      user_status: profile.user_status // ''Now available from JOIN
    });

    // Check each section from database tables
    const educationResult = await query(`SELECT COUNT(*) as count FROM education WHERE user_id = $1`, [userId]);
    const experienceResult = await query(`SELECT COUNT(*) as count FROM work_experience WHERE user_id = $1`, [userId]);
    const skillsResult = await query(`SELECT COUNT(*) as count FROM user_skills WHERE user_id = $1`, [userId]);
    const resumeResult = await query(`SELECT COUNT(*) as count FROM resumes WHERE user_id = $1`, [userId]);
    const portfolioResult = await query(`SELECT COUNT(*) as count FROM portfolio_links WHERE user_id = $1`, [userId]);

    const educationCount = parseInt(educationResult.rows[0].count);
    const experienceCount = parseInt(experienceResult.rows[0].count);
    const skillsCount = parseInt(skillsResult.rows[0].count);
    const resumeCount = parseInt(resumeResult.rows[0].count);
    const portfolioCount = parseInt(portfolioResult.rows[0].count);

    // Check preferences section
    const hasPreferences = !!(profile.job_preferences &&
      (profile.job_preferences.preferred_job_types?.length > 0 ||
        profile.job_preferences.preferred_locations?.length > 0 ||
        profile.job_preferences.preferred_industries?.length > 0 ||
        profile.job_preferences.salary_min ||
        profile.job_preferences.salary_max));

    // Check privacy section
    const hasPrivacySettings = !!(profile.privacy_settings &&
      Object.keys(profile.privacy_settings).length > 0 &&
      (profile.privacy_settings.profile_visibility !== undefined ||
        profile.privacy_settings.show_education !== undefined));

    // ''All fields now available from the JOIN
    const hasBasicInfo = !!(
      profile.first_name &&
      profile.last_name &&
      profile.city &&
      profile.email &&        // ''Now available
      profile.phone &&
      profile.user_type &&    // ''Now available
      profile.user_status     // ''Now available
    );

    const hasSkills = skillsCount > 0;
    const hasExperience = experienceCount > 0;
    const hasEducation = educationCount > 0;
    const hasPortfolio = portfolioCount > 0;
    const hasResume = resumeCount > 0;

    // Log section statuses
    console.log('📊 Section Status:', {
      hasBasicInfo,
      hasSkills,
      hasExperience,
      hasEducation,
      hasPortfolio,
      hasResume,
      hasPreferences,
      hasPrivacySettings
    });

    // Calculate percentage (8 sections total)
    const sections = {
      basicInfo: hasBasicInfo,
      skills: hasSkills,
      experience: hasExperience,
      education: hasEducation,
      portfolio: hasPortfolio,
      resume: hasResume,
      preferences: hasPreferences,
      privacy: hasPrivacySettings
    };

    const completedCount = Object.values(sections).filter(Boolean).length;
    const totalSections = Object.keys(sections).length;
    const completionPercentage = Math.round((completedCount / totalSections) * 100);

    console.log('📊 Completion Calculation:', {
      completedCount,
      totalSections,
      completionPercentage
    });

    const completionStatus = {
      completionPercentage,
      isComplete: completionPercentage === 100,
      sections,
      counts: {
        education: educationCount,
        experience: experienceCount,
        skills: skillsCount,
        resume: resumeCount,
        portfolio: portfolioCount
      }
    };

    // Update the profile_completion field in the database
    await query(`
      UPDATE candidate_profiles 
      SET profile_completion = $1, updated_at = NOW() 
      WHERE user_id = $2
    `, [completionPercentage, userId]);

    queueCandidateProfileUpdate(userId, 'update', {
      field: 'profile_completion',
      completion_percentage: completionPercentage,
      is_complete: completionPercentage === 100,
    });

    res.json({
      success: true,
      data: completionStatus
    });
  } catch (error) {
    console.error('Error getting profile completion status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile completion status'
    });
  }
};

// =====================================================
// DATA EXPORT
// =====================================================

export const downloadProfileData = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Fetch all user data
    const profileData = await query(`
      SELECT 
        (SELECT row_to_json(cp) FROM candidate_profiles cp WHERE cp.user_id = $1) as profile,
        (SELECT json_agg(e ORDER BY start_date DESC) FROM education e WHERE e.user_id = $1) as education,
        (SELECT json_agg(we ORDER BY start_date DESC) FROM work_experience we WHERE we.user_id = $1) as work_experience,
        (SELECT json_agg(us) FROM user_skills us WHERE us.user_id = $1) as skills,
        (SELECT json_agg(pl ORDER BY display_order) FROM portfolio_links pl WHERE pl.user_id = $1) as portfolio_links,
        (SELECT json_agg(r) FROM resumes r WHERE r.user_id = $1) as resumes
    `, [userId]);

    // Get user email separately
    const userResult = await query('SELECT email FROM users WHERE id = $1', [userId]);

    res.json({
      success: true,
      message: 'Profile data exported successfully',
      data: {
        ...profileData.rows[0],
        email: userResult.rows[0]?.email,
        exported_at: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error downloading profile data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download profile data'
    });
  }
};

// =====================================================
// COMPATIBILITY STUB FUNCTIONS
// =====================================================

export const setAvailabilityStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await updateAvailability(req, res);
  } catch (error) {
    logger.error('Error setting availability status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set availability status'
    });
  }
};

export const controlProfilePrivacy = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await updatePrivacySettings(req, res);
  } catch (error) {
    logger.error('Error controlling profile privacy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile privacy settings'
    });
  }
};


// profileController.js - FIXED getFullCandidateProfileById

export const getFullCandidateProfileById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    console.log('getFullCandidateProfileById called');
    console.log('userId:', userId);

    if (!userId) {
      console.log(' No userId provided');
      res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
      return;
    }

    // ''Check if the requesting user is the owner (if authenticated)
    let isOwner = false;
    if (req.user) {
      console.log('User authenticated:', req.user.id);
      const currentUserId = req.user.id;
      const userType = req.user.user_type;

      const userIdStr = String(userId);
      const currentUserIdStr = String(currentUserId);
      isOwner = currentUserIdStr === userIdStr;
      console.log('isOwner:', isOwner);

      // Permission check - only allow own profile or recruiters/company admins
      if (!isOwner && !['recruiter', 'company_admin'].includes(userType)) {
        console.log(' Access denied for user:', currentUserIdStr, 'trying to access:', userIdStr);
        res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own profile.'
        });
        return;
      }
    } else {
      console.log('No user authenticated, public access');
    }

    console.log('Fetching profile from database...');

    // Get basic profile info
    const profileResult = await query(`
      SELECT 
        cp.user_id,
        cp.first_name,
        cp.last_name,
        cp.phone,
        cp.country,
        cp.city,
        cp.is_rwandan,
        cp.province,
        cp.district,
        cp.sector,
        cp.cell,
        cp.village,
        cp.timezone,
        cp.date_of_birth,
        cp.gender,
        cp.profile_photo_url,
        cp.profile_photo_key,
        cp.linkedin_url,
        cp.github_url,
        cp.portfolio_url,
        cp.website_url,
        cp.willing_to_relocate,
        cp.willing_to_travel,
        cp.notice_period_days,
        cp.current_salary,
        cp.expected_salary,
        cp.currency,
        cp.profile_completion,
        cp.headline,
        cp.summary,
        cp.languages,
        cp.privacy_settings,
        cp.job_preferences,
        cp.availability,
        cp.metadata,
        cp.created_at,
        cp.updated_at,
        u.email,
        u.user_type,
        u.status as user_status,
        u.created_at as joined_date,
        u.last_login_at,
        u.two_factor_enabled,
        u.terms_accepted_at,
        u.terms_version
      FROM candidate_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.user_id = $1
    `, [userId]);

    console.log('Profile query result rows:', profileResult.rows.length);

    if (profileResult.rows.length === 0) {
      console.log(' No profile found for userId:', userId);
      res.status(404).json({
        success: false,
        message: 'Candidate profile not found'
      });
      return;
    }

    const profile = profileResult.rows[0];
    console.log('Profile found for user:', profile.email);

    // ''Safe JSON parsing function
    const safeJSONParse = (value: any): any => {
      if (!value) return null;
      if (typeof value === 'object') return value;
      try {
        return JSON.parse(value);
      } catch (e) {
        console.log('Failed to parse JSON:', value);
        return null;
      }
    };

    // Parse JSON fields from profile with safe parsing
    profile.current_salary = safeJSONParse(profile.current_salary);
    profile.expected_salary = safeJSONParse(profile.expected_salary);
    profile.languages = safeJSONParse(profile.languages) || [];
    profile.privacy_settings = safeJSONParse(profile.privacy_settings) || {};
    profile.job_preferences = safeJSONParse(profile.job_preferences) || {};
    profile.availability = safeJSONParse(profile.availability) || {};
    profile.metadata = safeJSONParse(profile.metadata) || {};

    console.log('Fetching education...');

    // Get education
    const educationResult = await query(`
      SELECT 
        id,
        institution,
        institution_id,
        degree,
        field_of_study,
        start_date,
        end_date,
        is_current,
        grade,
        grade_scale,
        description,
        activities,
        skills,
        attachments,
        verified,
        verification_method,
        verification_date,
        display_order,
        created_at,
        updated_at
      FROM education
      WHERE user_id = $1
      ORDER BY is_current DESC, start_date DESC, end_date DESC NULLS FIRST, display_order ASC
    `, [userId]);

    console.log('Education rows:', educationResult.rows.length);

    // Parse JSON fields in education
    const parsedEducation = educationResult.rows.map((edu: any) => ({
      ...edu,
      skills: edu.skills || [],
      attachments: edu.attachments ?
        (typeof edu.attachments === 'string'? safeJSONParse(edu.attachments) : edu.attachments) : []
    }));

    console.log('Fetching work experience...');

    // Get work experience
    const workExperienceResult = await query(`
      SELECT 
        id,
        company,
        company_id,
        title,
        employment_type,
        location,
        location_type,
        start_date,
        end_date,
        is_current,
        description,
        achievements,
        skills,
        industry,
        team_size,
        reports_to,
        reason_for_leaving,
        attachments,
        verified,
        verification_method,
        verification_date,
        display_order,
        created_at,
        updated_at
      FROM work_experience
      WHERE user_id = $1
      ORDER BY is_current DESC, start_date DESC, end_date DESC NULLS FIRST, display_order ASC
    `, [userId]);

    console.log('Work experience rows:', workExperienceResult.rows.length);

    // Parse JSON fields in work experience
    const parsedWorkExperience = workExperienceResult.rows.map((work: any) => ({
      ...work,
      achievements: work.achievements || [],
      skills: work.skills || [],
      attachments: work.attachments ?
        (typeof work.attachments === 'string'? safeJSONParse(work.attachments) : work.attachments) : []
    }));

    console.log('Fetching skills...');

    // Get skills with full details
    const skillsResult = await query(`
      SELECT 
        us.user_id,
        us.skill_id,
        us.proficiency_level,
        us.proficiency_label,
        us.years_experience,
        us.months_experience,
        us.is_primary,
        us.last_used,
        us.skill_context,
        us.verified,
        us.verification_evidence,
        us.endorsement_count,
        us.created_at,
        us.updated_at,
        s.id as skill_id,
        s.name as skill_name,
        s.category,
        s.subcategory,
        s.skill_type,
        s.is_verified as skill_verified,
        s.verification_source,
        s.metadata as skill_metadata
      FROM user_skills us
      LEFT JOIN skills s ON us.skill_id = s.id
      WHERE us.user_id = $1
      ORDER BY us.is_primary DESC, us.proficiency_level DESC, s.name ASC
    `, [userId]);

    console.log('Skills rows:', skillsResult.rows.length);

    // Parse verification evidence
    const parsedSkills = skillsResult.rows.map((skill: any) => ({
      ...skill,
      verification_evidence: skill.verification_evidence ?
        (typeof skill.verification_evidence === 'string'? safeJSONParse(skill.verification_evidence) : skill.verification_evidence) : null,
      skill_metadata: skill.skill_metadata ?
        (typeof skill.skill_metadata === 'string'? safeJSONParse(skill.skill_metadata) : skill.skill_metadata) : {}
    }));

    console.log('Fetching portfolio links...');

    // Get portfolio links
    const portfolioResult = await query(`
      SELECT 
        id,
        platform,
        url,
        title,
        description,
        thumbnail_url,
        metadata,
        is_verified,
        verification_date,
        display_order,
        created_at,
        updated_at
      FROM portfolio_links
      WHERE user_id = $1
      ORDER BY display_order ASC, created_at ASC
    `, [userId]);

    console.log('Portfolio rows:', portfolioResult.rows.length);

    // Parse portfolio metadata
    const parsedPortfolio = portfolioResult.rows.map((portfolio: any) => ({
      ...portfolio,
      metadata: portfolio.metadata ?
        (typeof portfolio.metadata === 'string'? safeJSONParse(portfolio.metadata) : portfolio.metadata) : {}
    }));

    console.log('Fetching resumes...');

    // Get resumes
    const resumesResult = await query(`
      SELECT 
        id,
        file_name,
        file_key,
        file_size,
        mime_type,
        is_primary,
        version,
        parsed_data,
        parsing_confidence,
        skills_extracted,
        created_at as uploaded_at,
        updated_at
      FROM resumes
      WHERE user_id = $1
      ORDER BY is_primary DESC, created_at DESC
    `, [userId]);

    console.log('Resumes rows:', resumesResult.rows.length);

    // Transform resumes to include file_url and parse parsed_data.
    // resume.file_key is the bare filename -- the file lives under
    // uploads/resumes/, so the public URL needs that prefix.
    const resumesWithUrl = resumesResult.rows.map((resume: any) => ({
      id: resume.id,
      file_name: resume.file_name,
      file_key: resume.file_key,
      file_url: getFullFileUrl(`resumes/${resume.file_key}`),
      file_size: resume.file_size,
      mime_type: resume.mime_type,
      is_primary: resume.is_primary,
      version: resume.version,
      parsed_data: resume.parsed_data ?
        (typeof resume.parsed_data === 'string'? safeJSONParse(resume.parsed_data) : resume.parsed_data) : null,
      parsing_confidence: resume.parsing_confidence,
      skills_extracted: resume.skills_extracted || [],
      uploaded_at: resume.uploaded_at,
      updated_at: resume.updated_at
    }));

    console.log('Fetching certifications...');

    // Get certifications
    const certificationsResult = await query(`
      SELECT 
        id,
        name,
        issuer,
        credential_id,
        credential_url,
        issue_date,
        expiry_date,
        is_expired,
        description,
        skills,
        attachments,
        verified,
        verification_method,
        verification_date,
        display_order,
        created_at,
        updated_at
      FROM certifications
      WHERE user_id = $1
      ORDER BY issue_date DESC, display_order ASC
    `, [userId]);

    console.log('Certifications rows:', certificationsResult.rows.length);

    // Parse certifications JSON fields
    const parsedCertifications = certificationsResult.rows.map((cert: any) => ({
      ...cert,
      skills: cert.skills || [],
      attachments: cert.attachments ?
        (typeof cert.attachments === 'string'? safeJSONParse(cert.attachments) : cert.attachments) : []
    }));

    console.log('Calculating statistics...');

    // ============================================
    // ''FIXED: Calculate profile completion with 8 sections
    // Matching the frontend expectations
    // ============================================
    const totalSections = 8;
    let completedSections = 0;

    // Check each section (using frontend-friendly names)
    const hasBasicInfo = !!(profile.first_name && profile.last_name && profile.city);
    const hasEducation = educationResult.rows.length > 0;
    const hasExperience = workExperienceResult.rows.length > 0;
    const hasSkills = skillsResult.rows.length > 0;
    const hasResume = resumesResult.rows.length > 0;
    const hasPortfolio = portfolioResult.rows.length > 0;
    const hasCertifications = certificationsResult.rows.length > 0;
    const hasPreferences = profile.job_preferences &&
      Object.keys(profile.job_preferences).length > 0 &&
      (profile.job_preferences.preferred_job_types?.length > 0 ||
        profile.job_preferences.preferred_locations?.length > 0 ||
        profile.job_preferences.preferred_industries?.length > 0);

    // Count completed sections
    if (hasBasicInfo) completedSections++;
    if (hasEducation) completedSections++;
    if (hasExperience) completedSections++;
    if (hasSkills) completedSections++;
    if (hasResume) completedSections++;
    if (hasPortfolio) completedSections++;
    if (hasCertifications) completedSections++;
    if (hasPreferences) completedSections++;

    const completionPercentage = Math.round((completedSections / totalSections) * 100);

    console.log('📊 Profile Completion:', {
      completionPercentage,
      completedSections,
      totalSections,
      hasBasicInfo,
      hasEducation,
      hasExperience,
      hasSkills,
      hasResume,
      hasPortfolio,
      hasCertifications,
      hasPreferences
    });

    // Calculate total years of experience
    let totalYearsExperience = 0;
    let currentJobYears = 0;
    let mostRecentJob = null;

    workExperienceResult.rows.forEach((exp: any) => {
      const start = new Date(exp.start_date);
      const end = exp.is_current ? new Date() : (exp.end_date ? new Date(exp.end_date) : start);
      const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      totalYearsExperience += years;
      if (exp.is_current) {
        currentJobYears = years;
        mostRecentJob = {
          company: exp.company,
          title: exp.title,
          years: Math.round(years * 10) / 10
        };
      }
    });

    // Get top skills
    const topSkills = skillsResult.rows
      .filter((skill: any) => skill.proficiency_level >= 4)
      .map((skill: any) => skill.skill_name);

    // Calculate skill distribution
    const skillDistribution = {
      expert: skillsResult.rows.filter((s: any) => s.proficiency_level === 5).length,
      advanced: skillsResult.rows.filter((s: any) => s.proficiency_level === 4).length,
      intermediate: skillsResult.rows.filter((s: any) => s.proficiency_level === 3).length,
      beginner: skillsResult.rows.filter((s: any) => s.proficiency_level <= 2).length
    };

    // Get saved jobs count
    const savedJobsResult = await query(`
      SELECT COUNT(*) as saved_count
      FROM saved_jobs
      WHERE user_id = $1
    `, [userId]);

    // Get applications summary
    const applicationsSummary = await query(`
      SELECT 
        COUNT(*) as total_applications,
        COUNT(CASE WHEN status = 'submitted'THEN 1 END) as submitted,
        COUNT(CASE WHEN status = 'under_review'THEN 1 END) as under_review,
        COUNT(CASE WHEN status = 'interview'THEN 1 END) as interviewing,
        COUNT(CASE WHEN status = 'offer'THEN 1 END) as offers,
        COUNT(CASE WHEN status = 'hired'THEN 1 END) as hired,
        COUNT(CASE WHEN status = 'rejected'THEN 1 END) as rejected
      FROM applications
      WHERE user_id = $1 AND deleted_at IS NULL
    `, [userId]);

    // Get simulations summary
    const simulationsSummary = await query(`
      SELECT 
        COUNT(*) as total_simulations,
        COUNT(CASE WHEN status = 'completed'THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'in_progress'THEN 1 END) as in_progress,
        AVG(overall_score) as avg_score
      FROM simulations
      WHERE user_id = $1
    `, [userId]);

    console.log('Sending response...');

    // ''Return response with isOwner flag and all data
    res.json({
      success: true,
      data: {
        isOwner: isOwner,
        profile: {
          personal_info: {
            user_id: profile.user_id,
            email: profile.email,
            first_name: profile.first_name,
            last_name: profile.last_name,
            full_name: `${profile.first_name} ${profile.last_name}`,
            phone: profile.phone,
            country: profile.country,
            city: profile.city,
            is_rwandan: profile.is_rwandan,
            province: profile.province,
            district: profile.district,
            sector: profile.sector,
            cell: profile.cell,
            village: profile.village,
            timezone: profile.timezone,
            date_of_birth: profile.date_of_birth,
            gender: profile.gender,
            profile_photo_url: profile.profile_photo_url,
            profile_photo_key: profile.profile_photo_key,
            headline: profile.headline,
            summary: profile.summary,
            joined_date: profile.joined_date,
            last_login: profile.last_login_at,
            user_status: profile.user_status,
            user_type: profile.user_type,
            two_factor_enabled: profile.two_factor_enabled,
            terms_accepted_at: profile.terms_accepted_at,
            terms_version: profile.terms_version
          },
          links: {
            linkedin: profile.linkedin_url,
            github: profile.github_url,
            portfolio: profile.portfolio_url,
            website: profile.website_url
          },
          work_preferences: {
            willing_to_relocate: profile.willing_to_relocate,
            willing_to_travel: profile.willing_to_travel,
            notice_period_days: profile.notice_period_days,
            current_salary: profile.current_salary,
            expected_salary: profile.expected_salary,
            currency: profile.currency
          },
          languages: profile.languages,
          privacy_settings: profile.privacy_settings,
          job_preferences: profile.job_preferences,
          availability: profile.availability,
          metadata: profile.metadata,
          timestamps: {
            profile_created: profile.created_at,
            profile_updated: profile.updated_at
          }
        },
        statistics: {
          total_years_experience: Math.round(totalYearsExperience * 10) / 10,
          current_job_years: Math.round(currentJobYears * 10) / 10,
          most_recent_job: mostRecentJob,
          total_education_entries: educationResult.rows.length,
          total_work_experience: workExperienceResult.rows.length,
          total_skills: skillsResult.rows.length,
          total_portfolio_links: portfolioResult.rows.length,
          total_resumes: resumesResult.rows.length,
          total_certifications: certificationsResult.rows.length,
          top_skills: topSkills,
          skill_distribution: skillDistribution,
          saved_jobs_count: parseInt(savedJobsResult.rows[0]?.saved_count || '0'),
          profile_completion: {
            percentage: completionPercentage,
            completed_sections: completedSections,
            total_sections: totalSections,
            sections_status: {
              basicInfo: hasBasicInfo,
              education: hasEducation,
              workExperience: hasExperience,
              skills: hasSkills,
              resume: hasResume,
              portfolio: hasPortfolio,
              certifications: hasCertifications,
              preferences: hasPreferences
            },
            missing_sections: [
              !hasBasicInfo && 'basicInfo',
              !hasEducation && 'education',
              !hasExperience && 'workExperience',
              !hasSkills && 'skills',
              !hasResume && 'resume',
              !hasPortfolio && 'portfolio',
              !hasCertifications && 'certifications',
              !hasPreferences && 'preferences'
            ].filter(Boolean)
          }
        },
        applications_summary: {
          total: parseInt(applicationsSummary.rows[0]?.total_applications || '0'),
          submitted: parseInt(applicationsSummary.rows[0]?.submitted || '0'),
          under_review: parseInt(applicationsSummary.rows[0]?.under_review || '0'),
          interviewing: parseInt(applicationsSummary.rows[0]?.interviewing || '0'),
          offers: parseInt(applicationsSummary.rows[0]?.offers || '0'),
          hired: parseInt(applicationsSummary.rows[0]?.hired || '0'),
          rejected: parseInt(applicationsSummary.rows[0]?.rejected || '0')
        },
        simulations_summary: {
          total: parseInt(simulationsSummary.rows[0]?.total_simulations || '0'),
          completed: parseInt(simulationsSummary.rows[0]?.completed || '0'),
          in_progress: parseInt(simulationsSummary.rows[0]?.in_progress || '0'),
          average_score: Math.round(parseFloat(simulationsSummary.rows[0]?.avg_score || '0') * 10) / 10
        },
        education: parsedEducation,
        work_experience: parsedWorkExperience,
        skills: parsedSkills,
        portfolio_links: parsedPortfolio,
        resumes: resumesWithUrl,
        certifications: parsedCertifications
      }
    });

    console.log('Response sent successfully!');

  } catch (error) {
    console.error('🔥 ERROR in getFullCandidateProfileById:', error);
    logger.error('Error getting full candidate profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get candidate profile',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};