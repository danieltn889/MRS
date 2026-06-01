import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { logger } from '../utils/logger.js';
import { query, getClient } from '../config/database.js';
import { getFullFileUrl } from '../utils/fileUrl.js';
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
  skillId: 'skill_id',
  skillName: 'name'
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

    const {
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

    // Handle endDate for current education
    let processedEndDate = endDate;
    if (isCurrent && (!endDate || endDate === '')) {
      processedEndDate = null;
    }

    const result = await client.query(`
      INSERT INTO education (
        user_id, institution, institution_id, degree, field_of_study, start_date, end_date,
        is_current, grade, grade_scale, description, activities, skills, attachments, display_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      req.user!.id, institution, institution_id, degree, fieldOfStudy, startDate, processedEndDate,
      isCurrent || false, grade, gradeScale, description, activities, skills || [], 
      attachments || [], displayOrder || 0
    ]);

    await client.query('COMMIT');

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
      `UPDATE education SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await client.query('COMMIT');

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

    const {
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
      displayOrder
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

    const result = await client.query(`
      INSERT INTO work_experience (
        user_id, company, company_id, title, employment_type, location, location_type,
        start_date, end_date, is_current, description, achievements, skills,
        industry, team_size, reports_to, reason_for_leaving, display_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      req.user!.id, company, company_id, title, employmentType, location, locationType,
      startDate, processedEndDate, isCurrent || false, description, achievements || [], skills || [],
      industry, teamSize, reportsTo, reasonForLeaving, displayOrder || 0
    ]);

    await client.query('COMMIT');

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

    // Handle endDate for current positions
    if (updates.isCurrent && (!updates.endDate || updates.endDate === '')) {
      updates.endDate = null;
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

    await client.query('COMMIT');

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
      if (typeof lastUsed === 'string' && lastUsed.includes('/')) {
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
if (lastUsed && typeof lastUsed === 'string' && lastUsed.includes('/')) {
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

    const isPrimary = req.body.isPrimary === 'true' || req.body.isPrimary === true;
    const file = req.file;

    // Use the filename generated by multer
    const fileKey = `resumes/${file.filename}`;

    // If this resume is set as primary, unset other primary resumes
    if (isPrimary) {
      await query(
        'UPDATE resumes SET is_primary = false WHERE user_id = $1',
        [req.user!.id]
      );
    }

    const result = await query(`
      INSERT INTO resumes (
        user_id, file_name, file_key, file_size, mime_type, is_primary, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, file_name, file_key, file_size, mime_type, is_primary, version, created_at
    `, [
      req.user!.id,
      file.originalname,
      fileKey,
      file.size,
      file.mimetype,
      isPrimary,
      1
    ]);

    const resume = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Resume uploaded successfully',
      data: {
        ...resume,
        file_url: getFullFileUrl(resume.file_key),
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

    // Delete the physical file
    const resume = result.rows[0];
    if (resume.file_key) {
      const uploadPath = process.env.UPLOAD_PATH || './uploads';
      const filePath = path.join(uploadPath, resume.file_key);
      
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
    const filePath = path.join(uploadPath, resume.file_key);
    
    if (!fs.existsSync(filePath)) {
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

    // Transform resumes to include file_url
    const resumesWithUrl = resumesResult.rows.map((resume: any) => ({
      id: resume.id,
      file_name: resume.file_name,
      file_key: resume.file_key,
      file_url: getFullFileUrl(resume.file_key),
      file_size: resume.file_size,
      mime_type: resume.mime_type,
      is_primary: resume.is_primary,
      version: resume.version,
      parsed_data: resume.parsed_data,
      parsing_confidence: resume.parsing_confidence,
      skills_extracted: resume.skills_extracted,
      uploaded_at: resume.uploaded_at
    }));

    res.json({
      success: true,
      data: {
        profile: profile,
        education: educationResult.rows,
        workExperience: workExperienceResult.rows,
        skills: skillsResult.rows,
        portfolioLinks: portfolioResult.rows,
        resumes: resumesWithUrl
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
    const preferencesData = req.body;

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
    const privacySettings = req.body;

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

export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updates = req.body;
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    const jsonbFields = ['current_salary', 'expected_salary', 'languages', 'metadata'];

    // List of allowed fields for profile update
    const allowedFields = [
      'first_name', 'last_name', 'phone', 'country', 'city', 'timezone',
      'date_of_birth', 'gender', 'profile_photo_url', 'profile_photo_key',
      'linkedin_url', 'github_url', 'portfolio_url', 'website_url',
      'willing_to_relocate', 'willing_to_travel', 'notice_period_days',
      'current_salary', 'expected_salary', 'currency', 'headline', 'summary',
      'languages', 'metadata'
    ];

    Object.keys(updates).forEach(key => {
      const snakeKey = camelToSnake(key);
      if (updates[key] !== undefined && allowedFields.includes(snakeKey)) {
        updateFields.push(`${snakeKey} = $${paramIndex}`);
        values.push(jsonbFields.includes(snakeKey) ? JSON.stringify(updates[key]) : updates[key]);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
      return;
    }

    values.push(req.user!.id);
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

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
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

    // Get profile data
    const profileResult = await query(`
      SELECT cp.* FROM candidate_profiles cp WHERE cp.user_id = $1
    `, [userId]);

    if (profileResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
      return;
    }

    const profile = profileResult.rows[0];

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

    // Check preferences section (job_preferences in JSONB)
    const hasPreferences = !!(profile.job_preferences && 
      (profile.job_preferences.preferred_job_types?.length > 0 ||
       profile.job_preferences.preferred_locations?.length > 0 ||
       profile.job_preferences.preferred_industries?.length > 0 ||
       profile.job_preferences.salary_min ||
       profile.job_preferences.salary_max));

    // Check privacy section (privacy_settings in JSONB)
    const hasPrivacySettings = !!(profile.privacy_settings && 
      Object.keys(profile.privacy_settings).length > 0 &&
      (profile.privacy_settings.profile_visibility !== undefined ||
       profile.privacy_settings.show_education !== undefined));

    // Check each section - USING FRONTEND NAMES (basicInfo instead of personalInfo)
    const hasBasicInfo = !!(profile.first_name && profile.last_name && profile.headline && profile.city);
    const hasSkills = skillsCount > 0;
    const hasExperience = experienceCount > 0;
    const hasEducation = educationCount > 0;
    const hasPortfolio = portfolioCount > 0;
    const hasResume = resumeCount > 0;

    // Calculate percentage (8 sections total)
    const sections = {
      basicInfo: hasBasicInfo,        // Changed from personalInfo to basicInfo
      skills: hasSkills,
      experience: hasExperience,
      education: hasEducation,
      portfolio: hasPortfolio,
      resume: hasResume,
      preferences: hasPreferences,
      privacy: hasPrivacySettings
    };

    const completedCount = Object.values(sections).filter(Boolean).length;
    const totalSections = Object.keys(sections).length; // 8 total
    const completionPercentage = Math.round((completedCount / totalSections) * 100);

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


export const getFullCandidateProfileById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user!.id;
    const userType = req.user!.user_type;
    
    // Convert to strings for safe comparison
    const userIdStr = String(userId);
    const currentUserIdStr = String(currentUserId);
    
    // Permission check - only allow own profile or recruiters/company admins
    if (currentUserIdStr !== userIdStr && !['recruiter', 'company_admin'].includes(userType)) {
      res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own profile.'
      });
      return;
    }

    if (!userId) {
      res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
      return;
    }

    // Get basic profile info
    const profileResult = await query(`
      SELECT 
        cp.user_id,
        cp.first_name,
        cp.last_name,
        cp.phone,
        cp.country,
        cp.city,
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
        u.status as user_status,
        u.created_at as joined_date,
        u.last_login_at
      FROM candidate_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.user_id = $1
    `, [userId]);

    if (profileResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Candidate profile not found'
      });
      return;
    }

    const profile = profileResult.rows[0];

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
        s.name as skill_name,
        s.category,
        s.subcategory,
        s.skill_type,
        s.is_verified as skill_verified
      FROM user_skills us
      LEFT JOIN skills s ON us.skill_id = s.id
      WHERE us.user_id = $1
      ORDER BY us.is_primary DESC, us.proficiency_level DESC, s.name ASC
    `, [userId]);

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

    // Transform resumes to include file_url
    const resumesWithUrl = resumesResult.rows.map((resume: any) => ({
      id: resume.id,
      file_name: resume.file_name,
      file_key: resume.file_key,
      file_url: getFullFileUrl(resume.file_key),
      file_size: resume.file_size,
      mime_type: resume.mime_type,
      is_primary: resume.is_primary,
      version: resume.version,
      parsed_data: resume.parsed_data,
      parsing_confidence: resume.parsing_confidence,
      skills_extracted: resume.skills_extracted,
      uploaded_at: resume.uploaded_at
    }));

    // Calculate profile completion statistics
    const totalSections = 6;
    let completedSections = 0;
    
    const hasBasicInfo = !!(profile.first_name && profile.last_name && profile.headline);
    const hasEducation = educationResult.rows.length > 0;
    const hasExperience = workExperienceResult.rows.length > 0;
    const hasSkills = skillsResult.rows.length > 0;
    const hasResume = resumesResult.rows.length > 0;
    const hasPortfolio = portfolioResult.rows.length > 0;
    
    if (hasBasicInfo) completedSections++;
    if (hasEducation) completedSections++;
    if (hasExperience) completedSections++;
    if (hasSkills) completedSections++;
    if (hasResume) completedSections++;
    if (hasPortfolio) completedSections++;
    
    const completionPercentage = Math.round((completedSections / totalSections) * 100);

    // Calculate total years of experience
    let totalYearsExperience = 0;
    workExperienceResult.rows.forEach((exp: any) => {
      const start = new Date(exp.start_date);
      const end = exp.is_current ? new Date() : new Date(exp.end_date);
      const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      totalYearsExperience += years;
    });

    // Get top skills (proficiency level 4 or 5)
    const topSkills = skillsResult.rows
      .filter((skill: any) => skill.proficiency_level >= 4)
      .map((skill: any) => skill.skill_name);

    res.json({
      success: true,
      data: {
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
            timezone: profile.timezone,
            date_of_birth: profile.date_of_birth,
            gender: profile.gender,
            profile_photo_url: profile.profile_photo_url,
            headline: profile.headline,
            summary: profile.summary,
            joined_date: profile.joined_date,
            last_login: profile.last_login_at,
            user_status: profile.user_status
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
          total_education_entries: educationResult.rows.length,
          total_work_experience: workExperienceResult.rows.length,
          total_skills: skillsResult.rows.length,
          total_portfolio_links: portfolioResult.rows.length,
          total_resumes: resumesResult.rows.length,
          top_skills: topSkills,
          profile_completion: {
            percentage: completionPercentage,
            completed_sections: completedSections,
            total_sections: totalSections,
            sections_status: {
              basic_info: hasBasicInfo,
              education: hasEducation,
              work_experience: hasExperience,
              skills: hasSkills,
              resume: hasResume,
              portfolio: hasPortfolio
            },
            missing_sections: [
              !hasBasicInfo && 'basic_info',
              !hasEducation && 'education',
              !hasExperience && 'work_experience',
              !hasSkills && 'skills',
              !hasResume && 'resume',
              !hasPortfolio && 'portfolio'
            ].filter(Boolean)
          }
        },
        education: educationResult.rows,
        work_experience: workExperienceResult.rows,
        skills: skillsResult.rows,
        portfolio_links: portfolioResult.rows,
        resumes: resumesWithUrl
      }
    });

  } catch (error) {
    logger.error('Error getting full candidate profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get candidate profile'
    });
  }
};
