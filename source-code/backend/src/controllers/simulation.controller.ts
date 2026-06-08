import { Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import BaseController from './base.controller.js';
import DatabaseService from '../services/database.service.js';
import PaginationService from '../services/pagination.service.js';
import ValidationService from '../services/validation.service.js';
import ResponseService from '../services/response.service.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { BlockchainService } from '../services/blockchain.service.js';
import contractArtifact from '../../../blockchain/artifacts/contracts/LocalSimulation.sol/LocalSimulation.json' with { type: 'json' };

import NodeCache from 'node-cache';
// Remove circular dependency
import githubController from './github.controller.js';
import Groq from 'groq-sdk';
import { logger } from '../config/logger.js';

let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not set. Add it to your .env file.');
    }
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}


// ============================================
// CONFIGURATION
// ============================================

const SIMULATION_CONFIG = {
  MAX_ACTIVE_SESSIONS_PER_USER: 3,
  MAX_TEMPLATE_TASKS: 50,
  MAX_TASK_SIZE_MB: 5,
  AUTO_SAVE_INTERVAL_MS: 30000,
  SESSION_TIMEOUT_SECONDS: 3600,
  DEFAULT_PASSING_SCORE: 70,
  SCORING_WEIGHTS: {
    punctuality: 0.10,
    communication: 0.15,
    problem_solving: 0.25,
    adaptability: 0.15,
    collaboration: 0.15,
    attention_to_detail: 0.10,
    initiative: 0.10
  }
};

// Helper function to call the communication classifier API
const COMMUNICATION_API_URL = process.env.COMMUNICATION_API_URL || 'http://localhost:8091';

interface CommunicationClassifierResponse {
  dominant_style: string;
  communication_score: number;
  style_counts: {
    formal: number;
    semi_formal: number;
    informal: number;
  };
  total_messages: number;
  average_confidence: number;
  recommendation: string;
}

// Define the interface for chat message rows
interface ChatMessageRow {
  id: string;
  user_id: string;
  message: string;
  message_type: string;
  timestamp: Date;
  created_at: Date;
  email: string;
  user_type: string;
  first_name: string | null;
  last_name: string | null;
  sender_type: 'candidate' | 'recruiter';
}

async function callCommunicationClassifier(messages: any[]): Promise<CommunicationClassifierResponse | null> {
  try {
    // Extract message texts from the messages array
    const messageTexts = messages.map(msg => {
      // Try to extract clean text from nested JSON
      let text = msg.message || msg.parsed_message || '';
      try {
        let parsed = JSON.parse(text);
        let depth = 0;
        while (typeof parsed === 'string' && depth < 10) {
          try {
            parsed = JSON.parse(parsed);
            depth++;
          } catch {
            break;
          }
        }
        if (parsed && typeof parsed === 'object') {
          text = parsed.text || parsed.message || text;
        }
      } catch {
        // Not JSON, use as is
      }
      return text;
    }).filter(text => text && text.trim().length > 0);
    
    if (messageTexts.length === 0) {
      console.log('⚠️ No valid message texts to analyze');
      return null;
    }
    
    console.log(`📤 Sending ${messageTexts.length} messages to communication classifier`);
    
    const response = await fetch(`${COMMUNICATION_API_URL}/analyze/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messageTexts,
        conversation_id: `simulation_${Date.now()}`,
        candidate_id: messages[0]?.user_id || 'unknown'
      })
    });
    
    if (!response.ok) {
      console.warn('Communication API returned error:', response.status);
      return null;
    }
    
    const result = await response.json() as CommunicationClassifierResponse;
    
    console.log('✅ Communication classifier response:', {
      dominant_style: result.dominant_style,
      communication_score: result.communication_score,
      total_messages: result.total_messages
    });
    
    return result;
  } catch (error: any) {
    console.error('Failed to call communication classifier:', error.message);
    return null;
  }
}



// ============================================
// VALIDATION SCHEMAS
// ============================================

const CreateTemplateSchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().max(5000).optional(),
  type: z.enum(['technical', 'behavioral', 'cognitive', 'situational', 'role_play', 'case_study']),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  duration_minutes: z.number().int().min(5).max(480),
  tasks: z.array(z.any()).min(1),
  scoring_rubric: z.record(z.string(), z.any()).optional(),
  is_public: z.boolean().optional(),
  job_id: z.string().uuid().optional()
});

const UpdateTemplateSchema = z.object({
  name: z.string().min(3).max(255).optional(),
  description: z.string().max(5000).optional(),
  type: z.enum(['technical', 'behavioral', 'cognitive', 'situational', 'role_play', 'case_study']).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  tasks: z.array(z.any()).min(1).optional(),
  scoring_rubric: z.record(z.string(), z.any()).optional(),
  job_id: z.string().uuid().optional(),
  availability: z.record(z.string(), z.any()).optional()
});

const CreateSimulationSchema = z.object({
  title: z.string().min(3).max(255),
  jobRole: z.string().max(255),
  jobId: z.string().uuid().optional(),
  description: z.string().max(5000).optional(),
  duration: z.number().int().min(15).max(480),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  objectives: z.array(z.string()),
  tasks: z.array(z.any()).min(1),
  scoring: z.record(z.string(), z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
  passFailCriteria: z.record(z.string(), z.any()).optional(),
  availability: z.record(z.string(), z.any()).optional(),
  practiceEnabled: z.boolean().optional(),
  practiceSimulation: z.any().optional(),
  compliance: z.array(z.any()).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional()
});

const SubmitSimulationSchema = z.object({
  answers: z.record(z.string(), z.any()),
  timeSpent: z.number().int().min(0).max(28800)
});

const AutoSaveSchema = z.object({
  currentTask: z.number().int().min(0).optional(),
  answers: z.record(z.string(), z.any()).optional(),
  progress: z.record(z.string(), z.any()).optional()
});

const SendChatMessageSchema = z.object({
  message: z.string().min(1).max(19_000_000),   // match route validator limit
  messageType: z.enum(['text', 'system', 'notification']).optional().default('text'),
  replyTo: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  simulationId: z.string().uuid().optional()
});

// ============================================
// CACHE INITIALIZATION
// ============================================

const templateCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const sessionCache = new NodeCache({ stdTTL: 60, checkperiod: 20 });

// ============================================
// CONTROLLER
// ============================================

interface CreateSimulationRequest extends AuthenticatedRequest {
  body: {
    title: string;
    jobRole: string;
    jobId?: string;
    description?: string;
    duration: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    objectives: string[];
    tasks: any[];
    scoring: any;
    settings: any;
    passFailCriteria?: any;
    availability?: any;
    practiceEnabled?: boolean;
    practiceSimulation?: any;
    compliance?: any[];
    status?: string;
  };
}
interface CodeQualityResult {
  score: number;
  maxScore: number;
  details: {
    hasFunctions: boolean;
    hasVariables: boolean;
    hasConditionals: boolean;
    hasLoops: boolean;
    hasReturns: boolean;
    hasErrorHandling: boolean;
    hasClasses: boolean;
    hasImports: boolean;
    linesOfCode: number;
    codeLength: number;
    language: string;
    detectedFeatures: string[];
  };
}

// Add these interfaces at the top of SimulationController.ts (after imports)
interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected?: boolean;
}

interface BranchCommitData {
  totalCommits: number;
  commitsPerBranch: Record<string, number>;
}

interface CommitTaskMatchResult {
  commitSha: string;
  commitMessage: string;
  matchedTasks: Array<{
    taskId: string;
    taskName: string;
    confidence: number;
    whatWasImplemented: string;
    howItWasImplemented?: string;
    linesOfCodeImplemented?: number;
    keyFiles?: string[];
    implementedFunctions?: string[];
  }>;
  unmatchedParts: string[];
  confidence?: number;
  // Optional fields for ML matching details
  matchLevel?: string;
  tfidfScore?: number;
  spacyScore?: number;
  sentimentMatch?: boolean;
}

class SimulationController extends BaseController {
  constructor() {
    super('SimulationController');
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  protected async findById(table: string, id: string): Promise<any> {
    try {
      const result = await DatabaseService.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  private async getUserCompanyId(userId: string, userType: string): Promise<string | null> {
    if (userType !== 'company_admin' && userType !== 'recruiter') {
      return null;
    }

    const teamResult = await DatabaseService.query(
      'SELECT company_id FROM company_team WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    
    return teamResult.rows[0]?.company_id || null;
  }

  private async acquireLock(key: string): Promise<boolean> {
    const result = await DatabaseService.query(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) as locked',
      [key]
    );
    return result.rows[0]?.locked || false;
  }

  private formatError(error: any): any {
    if (process.env.NODE_ENV === 'development') {
      return {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        code: error?.code
      };
    }
    return null;
  }
  
  private async isSimulationExpired(simulationId: string): Promise<{ expired: boolean; reason?: string }> {
    try {
      const result = await DatabaseService.query(
        `SELECT status, scheduled_at, completed_at, metadata FROM simulations WHERE id = $1`,
        [simulationId]
      );
      
      if (!result.rows[0]) {
        return { expired: true, reason: 'Simulation not found' };
      }
      
      const simulation = result.rows[0];
      
      // Check if simulation status is already expired
      if (simulation.status === 'expired') {
        return { expired: true, reason: 'Simulation has expired' };
      }
      
      // Check if simulation has ended
      if (simulation.status === 'completed' || simulation.status === 'cancelled') {
        return { expired: true, reason: `Simulation is ${simulation.status}` };
      }
      
      // Check availability dates if defined in metadata
      if (simulation.metadata?.availability) {
        const availability = simulation.metadata.availability;
        const now = new Date();
        
        // Check if simulation has a start date restriction
        if (availability.start_date) {
          const startDate = new Date(availability.start_date);
          if (now < startDate) {
            return { expired: true, reason: 'Simulation has not started yet' };
          }
        }
        
        // Check if simulation has an end date restriction
        if (availability.end_date) {
          const endDate = new Date(availability.end_date);
          if (now > endDate) {
            return { expired: true, reason: 'Simulation has ended' };
          }
        }
      }
      
      return { expired: false };
    } catch (error: any) {
      console.error('❌ Error checking simulation expiration:', error.message);
      return { expired: true, reason: 'Error validating simulation' };
    }
  }

  private async isTemplateAvailable(templateId: string): Promise<{ available: boolean; reason?: string }> {
    try {
      const result = await DatabaseService.query(
        `SELECT is_active, metadata FROM simulation_templates WHERE id = $1`,
        [templateId]
      );
      
      if (!result.rows[0]) {
        return { available: false, reason: 'Template not found' };
      }
      
      const template = result.rows[0];
      
      // Check if template is active
      if (!template.is_active) {
        return { available: false, reason: 'Template is no longer available' };
      }
      
      // Check availability dates if defined in metadata
      if (template.metadata?.availability) {
        const availability = template.metadata.availability;
        const now = new Date();
        
        // Check if template has a start date restriction
        if (availability.start_date) {
          const startDate = new Date(availability.start_date);
          if (now < startDate) {
            return { available: false, reason: 'Simulation has not started yet' };
          }
        }
        
        // Check if template has an end date restriction
        if (availability.end_date) {
          const endDate = new Date(availability.end_date);
          if (now > endDate) {
            return { available: false, reason: 'Simulation has ended' };
          }
        }
      }
      
      return { available: true };
    } catch (error: any) {
      console.error('❌ Error checking template availability:', error.message);
      return { available: false, reason: 'Error validating template' };
    }
  }

  // ============================================
  // TEMPLATE METHODS
  // ============================================

  async createTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const validation = CreateTemplateSchema.safeParse(req.body);
      if (!validation.success) {
        ResponseService.error(res, 'Invalid input', 400, null, JSON.stringify(validation.error.issues));
        return;
      }

      const { 
        name, description, type, difficulty, duration_minutes, 
        tasks, scoring_rubric, is_public, job_id 
      } = validation.data;

      const tasksJson = JSON.stringify(tasks);
      if (tasksJson.length > SIMULATION_CONFIG.MAX_TASK_SIZE_MB * 1024 * 1024) {
        ResponseService.error(res, `Tasks data exceeds ${SIMULATION_CONFIG.MAX_TASK_SIZE_MB}MB limit`, 413);
        return;
      }

      if (tasks.length > SIMULATION_CONFIG.MAX_TEMPLATE_TASKS) {
        ResponseService.error(res, `Maximum ${SIMULATION_CONFIG.MAX_TEMPLATE_TASKS} tasks allowed`, 400);
        return;
      }

      const companyId = await this.getUserCompanyId(req.user.id, req.user.user_type);

      if ((req.user.user_type === 'company_admin' || req.user.user_type === 'recruiter') && !companyId) {
        ResponseService.error(res, 'Company team members must be associated with a company to create templates', 403);
        return;
      }

      if (job_id) {
        const jobResult = await DatabaseService.query(
          'SELECT id FROM jobs WHERE id = $1 AND (company_id = $2 OR $2 IS NULL)',
          [job_id, companyId]
        );
        if (!jobResult.rows[0]) {
          ResponseService.error(res, 'Invalid job ID or access denied', 400);
          return;
        }
      }

      const slug = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const result = await DatabaseService.query(`
        INSERT INTO simulation_templates (
          name, slug, description, type, difficulty, duration_minutes,
          tasks, scoring_rubric, is_public, company_id, created_by,
          total_tasks, created_at, updated_at, is_active, job_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), true, $13)
        RETURNING *
      `, [
        name, slug, description || null, type, difficulty, duration_minutes,
        tasksJson, JSON.stringify(scoring_rubric || {}),
        is_public || false, companyId, req.user.id, tasks.length, job_id || null
      ]);

      templateCache.del('templates_list');
      ResponseService.success(res, result.rows[0], 'Template created', 201);
    } catch (error: any) {
      ResponseService.error(res, 'Failed to create template', 500, null, this.formatError(error));
    }
  }

  async getTemplates(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20', type, difficulty, search } = req.query;
      const validPage = Number(page);
      const validLimit = Math.min(Number(limit), 100);
      const offset = (validPage - 1) * validLimit;

      let where = '1=1';
      const params: any[] = [];
      let idx = 1;

      const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);

      if (type) { 
        where += ` AND st.type = $${idx++}`; 
        params.push(type); 
      }
      if (difficulty) { 
        where += ` AND st.difficulty = $${idx++}`; 
        params.push(difficulty); 
      }
      if (search) { 
        where += ` AND (st.name ILIKE $${idx++} OR st.description ILIKE $${idx})`;
        params.push(`%${search}%`, `%${search}%`); 
        idx += 2;
      }
      
      if (req.user.user_type === 'candidate') {
        where += ` AND EXISTS (SELECT 1 FROM simulation_sessions ss 
                  LEFT JOIN simulations sim ON ss.simulation_id = sim.id
                  WHERE sim.template_id = st.id AND ss.user_id = $${idx++})`;
        params.push(req.user.id);
      } else if ((req.user.user_type === 'company_admin' || req.user.user_type === 'recruiter') && userCompanyId) {
        where += ` AND (st.is_public = true OR st.company_id = $${idx++})`;
        params.push(userCompanyId);
      } else if (req.user.user_type === 'company_admin' || req.user.user_type === 'recruiter') {
        where += ` AND st.is_public = true`;
      }

      const result = await DatabaseService.query(`
        SELECT st.*, c.name as company_name, c.logo_url, j.title as job_title,
              (SELECT COUNT(*) FROM simulation_sessions s 
                LEFT JOIN simulations sim ON s.simulation_id = sim.id 
                WHERE sim.template_id = st.id) as usage_count
        FROM simulation_templates st
        LEFT JOIN companies c ON st.company_id = c.id
        LEFT JOIN jobs j ON st.job_id = j.id
        WHERE ${where}
        ORDER BY st.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `, [...params, validLimit, offset]);

      const countResult = await DatabaseService.query(
        `SELECT COUNT(*) FROM simulation_templates st WHERE ${where}`,
        params
      );

      ResponseService.paginated(res, result.rows, {
        page: validPage, limit: validLimit, 
        total: parseInt(countResult.rows[0]?.count || 0),
        pages: Math.ceil(parseInt(countResult.rows[0]?.count || 0) / validLimit),
        has_next: validPage * validLimit < parseInt(countResult.rows[0]?.count || 0),
        has_prev: validPage > 1,
      });
    } catch (error: any) {
      ResponseService.error(res, 'Failed to fetch templates', 500, null, this.formatError(error));
    }
  }

  async getTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id || !ValidationService.isValidUUID(id)) {
        ResponseService.error(res, 'Invalid ID format', 400);
        return;
      }

      const cached = templateCache.get(`template_${id}`);
      if (cached) {
        ResponseService.success(res, cached);
        return;
      }

      const result = await DatabaseService.query(`
        SELECT st.*, c.name as company_name, u.email as creator_email, j.title as job_title
        FROM simulation_templates st
        LEFT JOIN companies c ON st.company_id = c.id
        LEFT JOIN users u ON st.created_by = u.id
        LEFT JOIN jobs j ON st.job_id = j.id
        WHERE st.id = $1 AND st.is_active = true
      `, [id]);

      if (!result.rows[0]) {
        ResponseService.notFound(res, 'Template');
        return;
      }

      const template = result.rows[0];
      const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);

      if (!template.is_public && template.company_id !== userCompanyId && req.user.user_type !== 'system_admin') {
        ResponseService.forbidden(res, 'Access denied');
        return;
      }

      templateCache.set(`template_${id}`, template);
      ResponseService.success(res, template);
    } catch (error: any) {
      ResponseService.error(res, 'Failed to fetch template', 500, null, this.formatError(error));
    }
  }

  async updateTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        ResponseService.error(res, 'Template ID is required', 400);
        return;
      }

      const validation = UpdateTemplateSchema.safeParse(req.body);
      if (!validation.success) {
        ResponseService.error(res, 'Invalid input', 400, JSON.stringify(validation.error.issues));
        return;
      }

      const updates = validation.data;
      const template = await this.findById('simulation_templates', id);
      
      if (!template) { 
        ResponseService.notFound(res, 'Template'); 
        return; 
      }

      const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);

      if (template.company_id !== userCompanyId && template.created_by !== req.user.id && req.user.user_type !== 'system_admin') {
        ResponseService.forbidden(res, 'Permission denied'); 
        return;
      }

      const updateFields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (updates.name) {
        updateFields.push(`name = $${idx++}`, `slug = $${idx++}`);
        values.push(updates.name, updates.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
      }
      if (updates.description !== undefined) { 
        updateFields.push(`description = $${idx++}`); 
        values.push(updates.description); 
      }
      if (updates.type) { 
        updateFields.push(`type = $${idx++}`); 
        values.push(updates.type); 
      }
      if (updates.difficulty) { 
        updateFields.push(`difficulty = $${idx++}`); 
        values.push(updates.difficulty); 
      }
      if (updates.duration_minutes) { 
        updateFields.push(`duration_minutes = $${idx++}`); 
        values.push(updates.duration_minutes); 
      }
      if (updates.tasks) {
        const tasksJson = JSON.stringify(updates.tasks);
        if (tasksJson.length > SIMULATION_CONFIG.MAX_TASK_SIZE_MB * 1024 * 1024) {
          ResponseService.error(res, `Tasks data exceeds ${SIMULATION_CONFIG.MAX_TASK_SIZE_MB}MB limit`, 413);
          return;
        }
        if (updates.tasks.length > SIMULATION_CONFIG.MAX_TEMPLATE_TASKS) {
          ResponseService.error(res, `Maximum ${SIMULATION_CONFIG.MAX_TEMPLATE_TASKS} tasks allowed`, 400);
          return;
        }
        updateFields.push(`tasks = $${idx++}`, `total_tasks = $${idx++}`);
        values.push(tasksJson, updates.tasks.length);
      }
      if (updates.scoring_rubric) { 
        updateFields.push(`scoring_rubric = $${idx++}`); 
        values.push(JSON.stringify(updates.scoring_rubric)); 
      }
      if (updates.job_id !== undefined) {
        if (updates.job_id) {
          const jobResult = await DatabaseService.query('SELECT id FROM jobs WHERE id = $1', [updates.job_id]);
          if (!jobResult.rows[0]) {
            ResponseService.error(res, 'Job not found', 404);
            return;
          }
        }
        updateFields.push(`job_id = $${idx++}`);
        values.push(updates.job_id || null);
      }

      if (updates.availability) {
        let currentMetadata = template.metadata || {};
        if (typeof currentMetadata === 'string') {
          try {
            currentMetadata = JSON.parse(currentMetadata);
          } catch {
            currentMetadata = {};
          }
        }
        const updatedMetadata = {
          ...currentMetadata,
          availability: updates.availability
        };
        updateFields.push(`metadata = $${idx++}`);
        values.push(JSON.stringify(updatedMetadata));
      }

      if (updateFields.length === 0) { 
        ResponseService.error(res, 'No updates provided', 400); 
        return; 
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(id);
      
      const result = await DatabaseService.query(
        `UPDATE simulation_templates SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      templateCache.del(`template_${id}`);
      templateCache.del('templates_list');

      ResponseService.success(res, result.rows[0], 'Template updated');
    } catch (error: any) {
      ResponseService.error(res, 'Failed to update template', 500, null, this.formatError(error));
    }
  }

  async deleteTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        ResponseService.error(res, 'Template ID is required', 400);
        return;
      }

      const template = await this.findById('simulation_templates', id);
      
      if (!template) { 
        ResponseService.notFound(res, 'Template'); 
        return; 
      }

      const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);

      if (template.company_id !== userCompanyId && req.user.user_type !== 'system_admin') {
        ResponseService.forbidden(res, 'Permission denied'); 
        return;
      }

      const activeSimulations = await DatabaseService.query(`
        SELECT COUNT(*) FROM simulations s
        WHERE s.template_id = $1 AND s.status IN ('scheduled', 'in_progress')
      `, [id]);

      if (parseInt(activeSimulations.rows[0]?.count || '0') > 0) {
        ResponseService.error(res, 'Cannot delete template with active simulations', 400);
        return;
      }

      await DatabaseService.query(
        `UPDATE simulation_templates SET is_active = false, updated_at = NOW() WHERE id = $1`, 
        [id]
      );

      templateCache.del(`template_${id}`);
      templateCache.del('templates_list');

      ResponseService.success(res, null, 'Template deleted');
    } catch (error: any) {
      ResponseService.error(res, 'Failed to delete template', 500, null, this.formatError(error));
    }
  }

  // ============================================
  // SIMULATION MANAGEMENT METHODS
  // ============================================

  async createSimulation(req: CreateSimulationRequest, res: Response): Promise<void> {
    try {
      const validation = CreateSimulationSchema.safeParse(req.body);
      if (!validation.success) {
        ResponseService.error(res, 'Invalid input', 400, null, JSON.stringify(validation.error.issues));
        return;
      }

      const {
        title, jobRole, jobId, description, duration, difficulty, objectives,
        tasks, scoring, settings, passFailCriteria, availability,
        practiceEnabled, practiceSimulation, compliance, status
      } = validation.data;

      const tasksJson = JSON.stringify(tasks);
      if (tasksJson.length > SIMULATION_CONFIG.MAX_TASK_SIZE_MB * 1024 * 1024) {
        ResponseService.error(res, `Tasks data exceeds ${SIMULATION_CONFIG.MAX_TASK_SIZE_MB}MB limit`, 413);
        return;
      }

      if (tasks.length > SIMULATION_CONFIG.MAX_TEMPLATE_TASKS) {
        ResponseService.error(res, `Maximum ${SIMULATION_CONFIG.MAX_TEMPLATE_TASKS} tasks allowed`, 400);
        return;
      }

      const companyId = await this.getUserCompanyId(req.user.id, req.user.user_type);

      if ((req.user.user_type === 'company_admin' || req.user.user_type === 'recruiter') && !companyId) {
        ResponseService.error(res, 'Company team members must be associated with a company to create simulations', 403);
        return;
      }

      if (jobId) {
        const jobResult = await DatabaseService.query(
          'SELECT id, company_id FROM jobs WHERE id = $1',
          [jobId]
        );
        if (!jobResult.rows[0]) {
          ResponseService.error(res, 'Job not found', 404);
          return;
        }
        const job = jobResult.rows[0];
        if ((req.user.user_type === 'company_admin' || req.user.user_type === 'recruiter') && job.company_id !== companyId) {
          ResponseService.error(res, 'Access denied to this job', 403);
          return;
        }
      }

      const slug = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      const typeMap: Record<string, string> = {
        'behavioral': 'behavioral', 'case_study': 'case_study',
        'role_play': 'role_play', 'presentation': 'presentation',
        'cognitive': 'cognitive', 'situational': 'situational'
      };
      
      let simulationType: string = 'technical';
      for (const task of tasks) {
        const taskType = task.type;
        if (taskType && typeMap[taskType]) {
          simulationType = typeMap[taskType];
          break;
        }
      }

      const technologies = [...new Set(tasks.flatMap((t: any) => t.technologies || []))];
      const skillsAssessed = [...new Set(tasks.flatMap((t: any) => t.skills || []))];

      const tasksStructure = {
        objectives: objectives || [],
        jobRole: jobRole,
        settings: settings || {},
        practiceEnabled: practiceEnabled || false,
        practiceSimulation: practiceSimulation || null,
        compliance: compliance || []
      };

      const metadata = {
        availability: availability || {},
        createdAt: new Date().toISOString(),
        version: '1.0'
      };

      const defaultStatus = (req.user.user_type === 'company_admin' || req.user.user_type === 'recruiter') ? 'active' : 'draft';
      const simulationStatus = status || defaultStatus;

      const result = await DatabaseService.query(`
        INSERT INTO simulation_templates (
          company_id, job_id, name, slug, description, type, difficulty, duration_minutes,
          total_tasks, tasks, tasks_structure, scoring_rubric, pass_fail_criteria,
          evaluation_criteria, technologies, skills_assessed, instructions,
          preparation_materials, is_public, is_active, created_by, created_at, updated_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW(), $22)
        RETURNING *
      `, [
        companyId, 
        jobId || null, 
        title, 
        slug, 
        description || null, 
        simulationType, 
        difficulty || 'intermediate',
        duration, 
        tasks.length, 
        tasksJson,
        JSON.stringify(tasksStructure),
        JSON.stringify(scoring || {}), 
        JSON.stringify(passFailCriteria || {}),
        JSON.stringify(settings?.evaluationCriteria || {}),
        technologies.length ? technologies : null, 
        skillsAssessed.length ? skillsAssessed : null,
        settings?.instructions || 'Follow the instructions carefully.',
        JSON.stringify(settings?.preparationMaterials || {}),
        companyId === null, 
        simulationStatus === 'active', 
        req.user.id,
        JSON.stringify(metadata)
      ]);

      const template = result.rows[0];
      
      templateCache.del('templates_list');

      ResponseService.success(res, {
        id: template.id, 
        title: template.name, 
        jobRole: template.tasks_structure?.jobRole,
        jobId: template.job_id,
        description: template.description,
        duration: template.duration_minutes, 
        difficulty: template.difficulty,
        objectives: template.tasks_structure?.objectives || [],
        tasks: template.tasks, 
        scoring: template.scoring_rubric,
        settings: template.tasks_structure?.settings || {},
        passFailCriteria: template.pass_fail_criteria,
        availability: template.metadata?.availability || {},
        practiceEnabled: template.tasks_structure?.practiceEnabled || false,
        practiceSimulation: template.tasks_structure?.practiceSimulation,
        compliance: template.tasks_structure?.compliance || [],
        created_at: template.created_at,
        status: simulationStatus
      }, 'Simulation created successfully', 201);
    } catch (error: any) {
      ResponseService.error(res, 'Failed to create simulation', 500, null, this.formatError(error));
    }
  }

async getSimulations(req: AuthenticatedRequest, res: Response): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📞 [getSimulations] CALLED');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    const { 
      page = '1', 
      limit = '20', 
      type, 
      difficulty, 
      status = 'all',
      sort = '-created_at',
      search = ''
    } = req.query;
    
    console.log('📋 REQUEST PARAMS:', {
      page,
      limit,
      type,
      difficulty,
      status,
      sort,
      search,
      userId: req.user.id,
      userType: req.user.user_type,
      timestamp: new Date().toISOString()
    });
    
    const validPage = Math.max(1, Number(page));
    const validLimit = Math.min(100, Number(limit));
    const offset = (validPage - 1) * validLimit;

    let whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Get user's company ID
    console.log('🔍 Getting user company ID for user:', req.user.id);
    const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);
    console.log('📊 User company ID:', userCompanyId);
    console.log('📊 User type:', req.user.user_type);

    // Base access control
    if (req.user.user_type === 'candidate') {
      whereConditions.push(`EXISTS (
        SELECT 1 FROM simulation_sessions ss 
        LEFT JOIN simulations sim ON ss.simulation_id = sim.id
        WHERE sim.template_id = st.id AND ss.user_id = $${paramIndex++}
      )`);
      params.push(req.user.id);
      console.log('🔐 Candidate access: showing only taken simulations');
    } else if (req.user.user_type === 'company_admin' || req.user.user_type === 'recruiter') {
      if (userCompanyId) {
        whereConditions.push(`(st.is_public = true OR st.company_id = $${paramIndex++})`);
        params.push(userCompanyId);
        console.log('🔐 Company user access: showing own + public simulations');
      } else {
        whereConditions.push(`st.is_public = true`);
        console.log('🔐 Company user without company: showing only public simulations');
      }
    } else if (req.user.user_type === 'system_admin') {
      console.log('🔐 System admin access: showing all simulations');
    } else {
      whereConditions.push(`st.is_public = true`);
      console.log('🔐 Default access: showing only public simulations');
    }

    // ✅ Status filter - using latest simulation attempt status
    if (status !== 'all') {
      if (status === 'scheduled') {
        whereConditions.push(`EXISTS (
          SELECT 1 FROM simulations sim 
          WHERE sim.template_id = st.id AND sim.status = 'scheduled'
          ORDER BY sim.created_at DESC LIMIT 1
        )`);
        console.log('📊 Status filter: scheduled');
      } else if (status === 'in_progress') {
        whereConditions.push(`EXISTS (
          SELECT 1 FROM simulations sim 
          WHERE sim.template_id = st.id AND sim.status = 'in_progress'
          ORDER BY sim.created_at DESC LIMIT 1
        )`);
        console.log('📊 Status filter: in_progress');
      } else if (status === 'paused') {
        whereConditions.push(`EXISTS (
          SELECT 1 FROM simulations sim 
          WHERE sim.template_id = st.id AND sim.status = 'paused'
          ORDER BY sim.created_at DESC LIMIT 1
        )`);
        console.log('📊 Status filter: paused');
      } else if (status === 'completed') {
        whereConditions.push(`EXISTS (
          SELECT 1 FROM simulations sim 
          WHERE sim.template_id = st.id AND sim.status = 'completed'
          ORDER BY sim.created_at DESC LIMIT 1
        )`);
        console.log('📊 Status filter: completed');
      } else if (status === 'expired') {
        whereConditions.push(`EXISTS (
          SELECT 1 FROM simulations sim 
          WHERE sim.template_id = st.id AND sim.status = 'expired'
          ORDER BY sim.created_at DESC LIMIT 1
        )`);
        console.log('📊 Status filter: expired');
      } else if (status === 'cancelled') {
        whereConditions.push(`EXISTS (
          SELECT 1 FROM simulations sim 
          WHERE sim.template_id = st.id AND sim.status = 'cancelled'
          ORDER BY sim.created_at DESC LIMIT 1
        )`);
        console.log('📊 Status filter: cancelled');
      } else if (status === 'failed') {
        whereConditions.push(`EXISTS (
          SELECT 1 FROM simulations sim 
          WHERE sim.template_id = st.id AND sim.status = 'failed'
          ORDER BY sim.created_at DESC LIMIT 1
        )`);
        console.log('📊 Status filter: failed');
      }
    }

    // Type filter
    if (type) {
      whereConditions.push(`st.type = $${paramIndex++}`);
      params.push(type);
      console.log('📊 Type filter:', type);
    }

    // Difficulty filter
    if (difficulty) {
      whereConditions.push(`st.difficulty = $${paramIndex++}`);
      params.push(difficulty);
      console.log('📊 Difficulty filter:', difficulty);
    }

    // Search filter
    if (search && typeof search === 'string' && search.trim()) {
      whereConditions.push(`(st.name ILIKE $${paramIndex++} OR st.description ILIKE $${paramIndex++})`);
      params.push(`%${search}%`, `%${search}%`);
      console.log('📊 Search filter:', search);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    console.log('📊 Where clause:', whereClause);
    console.log('📊 Query params:', params);

    // Sort order
    let orderBy = 'st.created_at DESC';
    if (sort === '-updated_at') orderBy = 'st.updated_at DESC';
    else if (sort === 'updated_at') orderBy = 'st.updated_at ASC';
    else if (sort === '-created_at') orderBy = 'st.created_at DESC';
    else if (sort === 'created_at') orderBy = 'st.created_at ASC';
    else if (sort === 'name') orderBy = 'st.name ASC';
    else if (sort === '-name') orderBy = 'st.name DESC';
    
    console.log('📊 Sort order:', orderBy);

    // Main query - Get latest simulation attempt status
    console.log('🔍 Executing main query...');
    const queryStartTime = Date.now();
    
    const result = await DatabaseService.query(`
      SELECT 
        st.*,
        c.name as company_name,
        c.logo_url,
        u.email as creator_name,
        u.user_type as creator_type,
        j.title as job_title,
        j.id as job_id,
        -- ✅ Get the latest simulation attempt status
        (
          SELECT sim.status
          FROM simulations sim
          WHERE sim.template_id = st.id
          ORDER BY sim.created_at DESC
          LIMIT 1
        ) as latest_simulation_status,
        -- ✅ Status from simulation attempts (default to 'not_started' if no attempts)
        COALESCE(
          (
            SELECT sim.status
            FROM simulations sim
            WHERE sim.template_id = st.id
            ORDER BY sim.created_at DESC
            LIMIT 1
          ),
          'not_started'
        ) as computed_status,
        (SELECT COUNT(*) FROM simulations sim WHERE sim.template_id = st.id) as total_instances,
        (SELECT COUNT(*) FROM simulations sim WHERE sim.template_id = st.id AND sim.status = 'completed') as completed_instances,
        (SELECT COUNT(DISTINCT sim.user_id) FROM simulations sim WHERE sim.template_id = st.id) as unique_candidates,
        (SELECT AVG(overall_score) FROM simulations sim WHERE sim.template_id = st.id AND overall_score IS NOT NULL) as avg_score,
        (SELECT MAX(overall_score) FROM simulations sim WHERE sim.template_id = st.id) as max_score,
        (SELECT MIN(overall_score) FROM simulations sim WHERE sim.template_id = st.id) as min_score
      FROM simulation_templates st
      LEFT JOIN companies c ON st.company_id = c.id
      LEFT JOIN users u ON st.created_by = u.id
      LEFT JOIN jobs j ON st.job_id = j.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, validLimit, offset]);
    
    const queryEndTime = Date.now();
    console.log(`📊 Main query executed in ${queryEndTime - queryStartTime}ms`);
    console.log('📊 Query result:', {
      rowCount: result.rows.length,
      hasRows: result.rows.length > 0
    });

    if (result.rows.length > 0) {
      const firstRow = result.rows[0];
      console.log('📊 First result sample:', {
        id: firstRow.id,
        name: firstRow.name,
        is_active: firstRow.is_active,
        latest_simulation_status: firstRow.latest_simulation_status,
        computed_status: firstRow.computed_status,
        company_name: firstRow.company_name,
        total_instances: firstRow.total_instances,
        avg_score: firstRow.avg_score
      });
    }

    // Count query for pagination
    console.log('🔍 Executing count query...');
    const countStartTime = Date.now();
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM simulation_templates st
      ${whereClause}
    `;
    
    const countResult = await DatabaseService.query(countQuery, params);
    
    const countEndTime = Date.now();
    console.log(`📊 Count query executed in ${countEndTime - countStartTime}ms`);

    const total = parseInt(countResult.rows[0]?.total || '0');
    console.log('📊 Total simulations count:', total);

    // Format results for frontend
    const formattedResults = result.rows.map((row: any) => {
      // Parse JSON fields if they're strings
      let tasks = row.tasks;
      let scoringRubric = row.scoring_rubric;
      let tasksStructure = row.tasks_structure;
      let metadata = row.metadata;
      
      try {
        if (typeof tasks === 'string') tasks = JSON.parse(tasks);
        if (typeof scoringRubric === 'string') scoringRubric = JSON.parse(scoringRubric);
        if (typeof tasksStructure === 'string') tasksStructure = JSON.parse(tasksStructure);
        if (typeof metadata === 'string') metadata = JSON.parse(metadata);
      } catch (e) {
        console.warn('Error parsing JSON for simulation:', row.id);
      }
      
      return {
        id: row.id,
        title: row.name,
        name: row.name,
        jobRole: tasksStructure?.jobRole || row.job_title || '',
        jobId: row.job_id,
        description: row.description || '',
        duration: row.duration_minutes || 60,
        difficulty: row.difficulty || 'intermediate',
        objectives: tasksStructure?.objectives || [],
        tasks: tasks || [],
        scoring: scoringRubric || {},
        settings: tasksStructure?.settings || {
          allowPause: true, showTimer: true, randomizeTasks: false, allowHints: true,
          recordScreen: false, recordAudio: false, maxAttempts: 1, timeLimit: 60,
          environment: 'office', tools: [], constraints: [],
        },
        // ✅ Use the simulation attempt status
        status: row.computed_status,
        latest_simulation_status: row.latest_simulation_status,
        is_active: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        compliance: tasksStructure?.compliance || [],
        passFailCriteria: row.pass_fail_criteria,
        availability: metadata?.availability || tasksStructure?.availability,
        practiceEnabled: tasksStructure?.practiceEnabled || false,
        practiceSimulation: tasksStructure?.practiceSimulation,
        metadata: metadata || {},
        company_name: row.company_name,
        logo_url: row.logo_url,
        avg_score: row.avg_score,
        max_score: row.max_score,
        min_score: row.min_score,
        usage_count: row.usage_count,
        total_instances: parseInt(row.total_instances || '0'),
        completed_instances: parseInt(row.completed_instances || '0'),
        unique_candidates: parseInt(row.unique_candidates || '0'),
        created_by: row.created_by,
        creator_name: row.creator_name,
        creator_type: row.creator_type,
        is_public: row.is_public,
        type: row.type,
        technologies: row.technologies,
        skills_assessed: row.skills_assessed
      };
    });

    console.log('📊 Formatted results count:', formattedResults.length);
    
    // Count by status for stats
    const statusCounts = {
      not_started: formattedResults.filter((s: any) => s.status === 'not_started').length,
      scheduled: formattedResults.filter((s: any) => s.status === 'scheduled').length,
      in_progress: formattedResults.filter((s: any) => s.status === 'in_progress').length,
      paused: formattedResults.filter((s: any) => s.status === 'paused').length,
      completed: formattedResults.filter((s: any) => s.status === 'completed').length,
      expired: formattedResults.filter((s: any) => s.status === 'expired').length,
      cancelled: formattedResults.filter((s: any) => s.status === 'cancelled').length,
      failed: formattedResults.filter((s: any) => s.status === 'failed').length,
    };
    
    console.log('📊 Status breakdown:', statusCounts);

    const responseData = {
      page: validPage,
      limit: validLimit,
      total: total,
      pages: Math.ceil(total / validLimit),
      has_next: validPage * validLimit < total,
      has_prev: validPage > 1,
      stats: {
        total_simulations: total,
        ...statusCounts,
        avg_score_all: formattedResults.length > 0 
          ? (formattedResults.reduce((sum: number, s: any) => sum + (Number(s.avg_score) || 0), 0) / formattedResults.length).toFixed(1)
          : 0,
        total_instances: formattedResults.reduce((sum: number, s: any) => sum + (s.total_instances || 0), 0),
        unique_candidates: new Set(formattedResults.flatMap((s: any) => s.unique_candidates || 0)).size
      }
    };
    
    console.log('📄 Pagination response:', {
      page: responseData.page,
      limit: responseData.limit,
      total: responseData.total,
      pages: responseData.pages,
      has_next: responseData.has_next,
      has_prev: responseData.has_prev
    });
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [getSimulations] COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════');

    ResponseService.paginated(res, formattedResults, responseData);
    
  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [getSimulations] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    console.error('═══════════════════════════════════════════════════════════════');
    ResponseService.error(res, 'Failed to fetch simulations', 500, null, this.formatError(error));
  }
}

  async getSimulationById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id || !ValidationService.isValidUUID(id)) {
        ResponseService.error(res, 'Invalid ID format', 400);
        return;
      }

      const result = await DatabaseService.query(`
        SELECT st.*, c.name as company_name, u.email as creator_name,
              (SELECT COUNT(*) FROM simulations sim WHERE sim.template_id = st.id) as total_instances
        FROM simulation_templates st
        LEFT JOIN companies c ON st.company_id = c.id
        LEFT JOIN users u ON st.created_by = u.id
        WHERE st.id = $1
      `, [id]);

      if (!result.rows[0]) {
        ResponseService.notFound(res, 'Simulation');
        return;
      }

      const simulation = result.rows[0];
      const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);

      if (!simulation.is_public && simulation.company_id !== userCompanyId && req.user.user_type !== 'system_admin') {
        ResponseService.forbidden(res, 'Access denied');
        return;
      }

      ResponseService.success(res, simulation);
    } catch (error: any) {
      ResponseService.error(res, 'Failed to fetch simulation', 500, null, this.formatError(error));
    }
  }

  async updateSimulation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        ResponseService.error(res, 'Simulation ID is required', 400);
        return;
      }

      const validation = UpdateTemplateSchema.safeParse(req.body);
      if (!validation.success) {
        ResponseService.error(res, 'Invalid input', 400, JSON.stringify(validation.error.issues));
        return;
      }

      const updates = validation.data;
      const simulation = await this.findById('simulation_templates', id);
      
      if (!simulation) { 
        ResponseService.notFound(res, 'Simulation'); 
        return; 
      }

      const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);

      if (simulation.company_id !== userCompanyId && simulation.created_by !== req.user.id && req.user.user_type !== 'system_admin') {
        ResponseService.forbidden(res, 'Permission denied');
        return;
      }

      const updateFields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (updates.name) {
        updateFields.push(`name = $${idx++}`, `slug = $${idx++}`);
        values.push(updates.name, updates.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
      }
      if (updates.description !== undefined) { 
        updateFields.push(`description = $${idx++}`); 
        values.push(updates.description); 
      }
      if (updates.type) { 
        updateFields.push(`type = $${idx++}`); 
        values.push(updates.type); 
      }
      if (updates.difficulty) { 
        updateFields.push(`difficulty = $${idx++}`); 
        values.push(updates.difficulty); 
      }
      if (updates.duration_minutes) { 
        updateFields.push(`duration_minutes = $${idx++}`); 
        values.push(updates.duration_minutes); 
      }
      if (updates.tasks) {
        const tasksJson = JSON.stringify(updates.tasks);
        if (tasksJson.length > SIMULATION_CONFIG.MAX_TASK_SIZE_MB * 1024 * 1024) {
          ResponseService.error(res, `Tasks data exceeds ${SIMULATION_CONFIG.MAX_TASK_SIZE_MB}MB limit`, 413);
          return;
        }
        if (updates.tasks.length > SIMULATION_CONFIG.MAX_TEMPLATE_TASKS) {
          ResponseService.error(res, `Maximum ${SIMULATION_CONFIG.MAX_TEMPLATE_TASKS} tasks allowed`, 400);
          return;
        }
        updateFields.push(`tasks = $${idx++}`, `total_tasks = $${idx++}`);
        values.push(tasksJson, updates.tasks.length);
      }
      if (updates.scoring_rubric) { 
        updateFields.push(`scoring_rubric = $${idx++}`); 
        values.push(JSON.stringify(updates.scoring_rubric)); 
      }
      if (updates.job_id !== undefined) {
        if (updates.job_id) {
          const jobResult = await DatabaseService.query('SELECT id FROM jobs WHERE id = $1', [updates.job_id]);
          if (!jobResult.rows[0]) {
            ResponseService.error(res, 'Job not found', 404);
            return;
          }
        }
        updateFields.push(`job_id = $${idx++}`);
        values.push(updates.job_id || null);
      }

      if (updates.availability) {
        let currentMetadata = simulation.metadata || {};
        if (typeof currentMetadata === 'string') {
          try {
            currentMetadata = JSON.parse(currentMetadata);
          } catch {
            currentMetadata = {};
          }
        }
        const updatedMetadata = {
          ...currentMetadata,
          availability: updates.availability
        };
        updateFields.push(`metadata = $${idx++}`);
        values.push(JSON.stringify(updatedMetadata));
      }

      if (updateFields.length === 0) { 
        ResponseService.error(res, 'No updates provided', 400); 
        return; 
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(id);
      
      const result = await DatabaseService.query(
        `UPDATE simulation_templates SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      templateCache.del(`template_${id}`);
      templateCache.del('templates_list');

      ResponseService.success(res, result.rows[0], 'Simulation updated');
    } catch (error: any) {
      ResponseService.error(res, 'Failed to update simulation', 500, null, this.formatError(error));
    }
  }

async deleteSimulation(req: AuthenticatedRequest, res: Response): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📞 [deleteSimulation] CALLED');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    const { id } = req.params;
    
    console.log('📋 REQUEST PARAMS:', {
      simulationId: id,
      userId: req.user.id,
      userType: req.user.user_type,
      timestamp: new Date().toISOString()
    });
    
    if (!id || !ValidationService.isValidUUID(id)) {
      console.log('❌ Invalid simulation ID format:', id);
      ResponseService.error(res, 'Invalid simulation ID format', 400);
      return;
    }
    console.log('✅ Simulation ID validation passed');

    // Check if simulation exists
    console.log('🔍 Checking simulation template for ID:', id);
    const simulation = await this.findById('simulation_templates', id);
    
    if (!simulation) { 
      console.log('❌ Simulation not found for ID:', id);
      ResponseService.notFound(res, 'Simulation not found'); 
      return; 
    }
    
    console.log('✅ Simulation found:', {
      id: simulation.id,
      name: simulation.name,
      company_id: simulation.company_id,
      created_by: simulation.created_by,
      is_active: simulation.is_active
    });

    // Check permissions
    const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);
    console.log('📊 User company ID:', userCompanyId);
    
    const isOwner = simulation.created_by === req.user.id;
    const isCompanyUser = simulation.company_id === userCompanyId;
    const isAdmin = req.user.user_type === 'system_admin';
    const hasAccess = isOwner || isCompanyUser || isAdmin;
    
    console.log('🔐 Permission check results:', {
      isOwner,
      isCompanyUser,
      isAdmin,
      hasAccess,
      simulationCompanyId: simulation.company_id,
      userCompanyId: userCompanyId,
      simulationCreatedBy: simulation.created_by,
      currentUserId: req.user.id
    });

    if (!hasAccess) {
      console.log('❌ Permission denied for user:', req.user.id);
      ResponseService.forbidden(res, 'Permission denied - You do not have access to delete this simulation'); 
      return;
    }
    console.log('✅ Access granted');

    // Check if there are any simulation sessions (attempts)
    console.log('🔍 Checking for existing simulation sessions...');
    const sessionCount = await DatabaseService.query(`
      SELECT COUNT(*) as count
      FROM simulations s
      WHERE s.template_id = $1
    `, [id]);
    
    const existingSessions = parseInt(sessionCount.rows[0]?.count || '0');
    console.log(`📊 Existing simulation sessions count: ${existingSessions}`);

    if (existingSessions > 0) {
      console.log(`⚠️ Cannot delete simulation with ${existingSessions} existing session(s)`);
      ResponseService.error(res, `Cannot delete simulation with ${existingSessions} existing session(s). Please archive it instead.`, 400);
      return;
    }

    // ✅ FIX: Use a single client and handle errors properly
    const client = await DatabaseService.getClient();
    
    try {
      await client.query('BEGIN');
      
      // 1. Delete evaluation sections (if any)
      console.log('📝 Deleting evaluation sections...');
      await client.query(`
        DELETE FROM evaluation_sections
        WHERE evaluation_id IN (
          SELECT e.id FROM evaluations e
          JOIN simulations s ON e.simulation_id = s.id
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 2. Delete evaluation behavioral metrics
      console.log('📝 Deleting evaluation behavioral metrics...');
      await client.query(`
        DELETE FROM evaluation_behavioral_metrics
        WHERE evaluation_id IN (
          SELECT e.id FROM evaluations e
          JOIN simulations s ON e.simulation_id = s.id
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 3. Delete evaluation skill assessments
      console.log('📝 Deleting evaluation skill assessments...');
      await client.query(`
        DELETE FROM evaluation_skill_assessments
        WHERE evaluation_id IN (
          SELECT e.id FROM evaluations e
          JOIN simulations s ON e.simulation_id = s.id
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 4. Delete evaluation AI feedback
      console.log('📝 Deleting evaluation AI feedback...');
      await client.query(`
        DELETE FROM evaluation_ai_feedback
        WHERE evaluation_id IN (
          SELECT e.id FROM evaluations e
          JOIN simulations s ON e.simulation_id = s.id
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 5. Delete evaluation benchmarks
      console.log('📝 Deleting evaluation benchmarks...');
      await client.query(`
        DELETE FROM evaluation_benchmarks
        WHERE evaluation_id IN (
          SELECT e.id FROM evaluations e
          JOIN simulations s ON e.simulation_id = s.id
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 6. Delete qualitative feedback
      console.log('📝 Deleting qualitative feedback...');
      await client.query(`
        DELETE FROM evaluation_qualitative_feedback
        WHERE evaluation_id IN (
          SELECT e.id FROM evaluations e
          JOIN simulations s ON e.simulation_id = s.id
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 7. Delete interview questions
      console.log('📝 Deleting interview questions...');
      await client.query(`
        DELETE FROM evaluation_interview_questions
        WHERE evaluation_id IN (
          SELECT e.id FROM evaluations e
          JOIN simulations s ON e.simulation_id = s.id
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 8. Delete evaluations
      console.log('📝 Deleting evaluations...');
      await client.query(`
        DELETE FROM evaluations
        WHERE simulation_id IN (
          SELECT s.id FROM simulations s
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 9. Delete simulation tasks
      console.log('📝 Deleting simulation tasks...');
      await client.query(`
        DELETE FROM simulation_tasks
        WHERE simulation_id IN (
          SELECT s.id FROM simulations s
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 10. Delete code submissions
      console.log('📝 Deleting code submissions...');
      await client.query(`
        DELETE FROM code_submissions
        WHERE simulation_id IN (
          SELECT s.id FROM simulations s
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 11. Delete whiteboard submissions
      console.log('📝 Deleting whiteboard submissions...');
      await client.query(`
        DELETE FROM whiteboard_submissions
        WHERE simulation_id IN (
          SELECT s.id FROM simulations s
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 12. Delete session task progress
      console.log('📝 Deleting session task progress...');
      await client.query(`
        DELETE FROM session_task_progress
        WHERE session_id IN (
          SELECT ss.id FROM simulation_sessions ss
          JOIN simulations s ON ss.simulation_id = s.id
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 13. Delete chat messages
      console.log('📝 Deleting chat messages...');
      await client.query(`
        DELETE FROM chat_messages
        WHERE session_id IN (
          SELECT ss.id FROM simulation_sessions ss
          JOIN simulations s ON ss.simulation_id = s.id
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 14. Delete simulation sessions
      console.log('📝 Deleting simulation sessions...');
      await client.query(`
        DELETE FROM simulation_sessions
        WHERE simulation_id IN (
          SELECT s.id FROM simulations s
          WHERE s.template_id = $1
        )
      `, [id]);
      
      // 15. Delete simulations (attempts)
      console.log('📝 Deleting simulation attempts...');
      await client.query(`
        DELETE FROM simulations
        WHERE template_id = $1
      `, [id]);
      
      // 16. Finally, delete the simulation template
      console.log('📝 Deleting simulation template...');
      await client.query(`
        DELETE FROM simulation_templates
        WHERE id = $1
      `, [id]);
      
      await client.query('COMMIT');
      console.log('✅ Transaction committed successfully');
      
    } catch (txError: any) {
      console.error('❌ Transaction error, rolling back:', txError.message);
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // Clear cache
    console.log('🗑️ Clearing cache for simulation:', id);
    templateCache.del(`template_${id}`);
    templateCache.del('templates_list');
    console.log('✅ Cache cleared');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [deleteSimulation] COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════');
    
    ResponseService.success(res, null, 'Simulation and all related data deleted successfully');
    
  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [deleteSimulation] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    console.error('═══════════════════════════════════════════════════════════════');
    ResponseService.error(res, 'Failed to delete simulation', 500, null, this.formatError(error));
  }
}

  async publishSimulation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        ResponseService.error(res, 'Simulation ID is required', 400);
        return;
      }

      const simulation = await this.findById('simulation_templates', id);
      
      if (!simulation) { 
        ResponseService.notFound(res, 'Simulation'); 
        return; 
      }

      const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);

      if (simulation.company_id !== userCompanyId && req.user.user_type !== 'system_admin') {
        ResponseService.forbidden(res, 'Permission denied'); 
        return;
      }
      
      if (!simulation.name || !simulation.tasks?.length) {
        ResponseService.error(res, 'Simulation incomplete - name and tasks required', 400);
        return;
      }

      const result = await DatabaseService.query(
        `UPDATE simulation_templates SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );

      templateCache.del(`template_${id}`);
      templateCache.del('templates_list');

      ResponseService.success(res, result.rows[0], 'Simulation published');
    } catch (error: any) {
      ResponseService.error(res, 'Failed to publish simulation', 500, null, this.formatError(error));
    }
  }

  async duplicateSimulation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        ResponseService.error(res, 'Simulation ID is required', 400);
        return;
      }

      const original = await this.findById('simulation_templates', id);
      
      if (!original) { 
        ResponseService.notFound(res, 'Simulation'); 
        return; 
      }

      const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);

      if (original.company_id !== userCompanyId && req.user.user_type !== 'system_admin') {
        ResponseService.forbidden(res, 'Permission denied'); 
        return;
      }

      const newTitle = `${original.name} (Copy)`;
      const newSlug = newTitle.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const result = await DatabaseService.query(`
        INSERT INTO simulation_templates (
          company_id, name, slug, description, type, difficulty, duration_minutes,
          total_tasks, tasks, tasks_structure, scoring_rubric, pass_fail_criteria,
          evaluation_criteria, technologies, skills_assessed, instructions,
          preparation_materials, is_public, is_active, created_by, created_at, updated_at, metadata
        ) SELECT 
          company_id, $1, $2, description, type, difficulty, duration_minutes,
          total_tasks, tasks, tasks_structure, scoring_rubric, pass_fail_criteria,
          evaluation_criteria, technologies, skills_assessed, instructions,
          preparation_materials, is_public, false, $3, NOW(), NOW(), metadata
        FROM simulation_templates WHERE id = $4
        RETURNING *
      `, [newTitle, newSlug, req.user.id, id]);

      templateCache.del('templates_list');

      ResponseService.success(res, { 
        id: result.rows[0].id, 
        title: result.rows[0].name 
      }, 'Simulation duplicated', 201);
    } catch (error: any) {
      ResponseService.error(res, 'Failed to duplicate simulation', 500, null, this.formatError(error));
    }
  }

  async archiveSimulation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        ResponseService.error(res, 'Simulation ID is required', 400);
        return;
      }

      const simulation = await this.findById('simulation_templates', id);
      
      if (!simulation) { 
        ResponseService.notFound(res, 'Simulation'); 
        return; 
      }

      const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);

      if (simulation.company_id !== userCompanyId && req.user.user_type !== 'system_admin') {
        ResponseService.forbidden(res, 'Permission denied'); 
        return;
      }
      
      await DatabaseService.query(
        `UPDATE simulation_templates SET is_active = false, updated_at = NOW() WHERE id = $1`, 
        [id]
      );

      templateCache.del(`template_${id}`);
      templateCache.del('templates_list');

      ResponseService.success(res, null, 'Simulation archived');
    } catch (error: any) {
      ResponseService.error(res, 'Failed to archive simulation', 500, null, this.formatError(error));
    }
  }
  
  
  
  
/**
 * Get commit counts from ALL branches in the repository
 */
async getAllBranchCommits(owner: string, repo: string): Promise<BranchCommitData> {
  console.log('🐙 [getAllBranchCommits] Fetching commits from ALL branches...');
  
  try {
    const branchesRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
      { 
        headers: { 
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/json'
        } 
      }
    );
    
    if (!branchesRes.ok) {
      console.error(`Failed to fetch branches: ${branchesRes.status}`);
      return { totalCommits: 0, commitsPerBranch: {} };
    }
    
    const branches: GitHubBranch[] = await branchesRes.json() as GitHubBranch[];
    
    if (!Array.isArray(branches)) {
      console.error('Branches response is not an array');
      return { totalCommits: 0, commitsPerBranch: {} };
    }
    
    console.log(`📊 Found ${branches.length} branches in repository`);
    
    let totalCommits = 0;
    const commitsPerBranch: Record<string, number> = {};
    
    for (const branch of branches) {
      if (!branch?.name) continue;
      
      const commitsRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch.name)}&per_page=1`,
        { 
          headers: { 
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/json'
          } 
        }
      );
      
      if (!commitsRes.ok) continue;
      
      const linkHeader = commitsRes.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="last"')) {
        const match = linkHeader.match(/page=(\d+)>; rel="last"/);
        if (match && match[1]) {
          const branchCommits = parseInt(match[1], 10);
          totalCommits += branchCommits;
          commitsPerBranch[branch.name] = branchCommits;
          console.log(`   Branch ${branch.name}: ${branchCommits} commits`);
        }
      }
    }
    
    console.log(`📊 TOTAL commits across ${branches.length} branches: ${totalCommits}`);
    return { totalCommits, commitsPerBranch };
    
  } catch (error) {
    console.error('Error fetching branch commits:', error);
    return { totalCommits: 0, commitsPerBranch: {} };
  }
}

/**
 * Get detailed commit information including file changes and diffs
 */
async getCommitWithChanges(owner: string, repo: string, commitSha: string) {
  console.log(`🐙 [getCommitWithChanges] Fetching commit ${commitSha} with changes...`);
  
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}`;
    const response = await fetch(url, {
      headers: { 
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) return null;
    
    const commit: any = await response.json();
    
    return {
      sha: commit.sha,
      shortSha: commit.sha?.substring(0, 7),
      message: commit.commit?.message,
      author: commit.commit?.author?.name,
      authorLogin: commit.author?.login,
      date: commit.commit?.author?.date,
      url: commit.html_url,
      stats: commit.stats,  // { additions, deletions, total }
      // ✅ THIS IS WHAT YOU WANT - FILES CHANGED IN THIS COMMIT
      files: commit.files?.map((file: any) => ({
        filename: file.filename,           // File name (e.g., "src/app.js")
        status: file.status,               // 'added', 'modified', 'removed', 'renamed'
        additions: file.additions,         // Lines added
        deletions: file.deletions,         // Lines deleted
        changes: file.changes,             // Total changes
        patch: file.patch                  // THE ACTUAL CODE DIFF!
      }))
    };
  } catch (error) {
    console.error('Error fetching commit with changes:', error);
    return null;
  }
}

/**
 * calculateGitHubScore — complete drop-in replacement
 *
 * Return now includes perCommitDetail[] — for EVERY commit analyzed you can see:
 *   - What AI found (matched tasks, confidence, whatWasImplemented, howItWasImplemented)
 *   - What ML found (matched tasks, confidence, tfidfScore, spacyScore, sentimentMatch)
 *   - Combined winner decision
 *
 * Plus taskImplementationReport with implementedTasks[] / notImplementedTasks[].
 */

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: AI commit → task matcher
// ─────────────────────────────────────────────────────────────────────────────
private async matchCommitToTasksWithAI(
  commit: any,
  tasks: any[]
): Promise<CommitTaskMatchResult> {
  console.log(`   🤖 [AI] Analyzing commit ${commit.shortSha || commit.sha?.substring(0, 7)}...`);

  const totalChanges =
    (commit.stats?.total || commit.linesAdded || 0) + (commit.linesDeleted || 0);
  const filesChanged = (commit.files || commit.changedFiles || []).length;

  const IS_TRIVIAL =
    totalChanges < 5 ||
    (filesChanged === 1 && totalChanges < 10) ||
    (commit.message || '').toLowerCase().includes('typo') ||
    (commit.message || '').toLowerCase().includes('format') ||
    (commit.message || '').toLowerCase().includes('comment') ||
    (commit.message || '').toLowerCase().includes('readme') ||
    (commit.message || '').toLowerCase().includes('docs');

  if (IS_TRIVIAL) {
    console.log(`   ⏭️ [AI] SKIPPED trivial commit (${totalChanges} lines, ${filesChanged} files)`);
    return {
      commitSha:      commit.shortSha || commit.sha?.substring(0, 7),
      commitMessage:  commit.message || '',
      matchedTasks:   [],
      unmatchedParts: [`Trivial commit (${totalChanges} lines) — no task implementation`]
    };
  }

  const hasSubstantialCode =
    totalChanges >= 10 ||
    (commit.files || []).some(
      (f: any) =>
        f.filename?.match(/\.(js|ts|py|java|go|rs|cpp|html|css)$/) &&
        (f.additions || 0) > 5
    );

  if (!hasSubstantialCode) {
    console.log(`   ⏭️ [AI] SKIPPED — no substantial code (${totalChanges} lines)`);
    return {
      commitSha:      commit.shortSha || commit.sha?.substring(0, 7),
      commitMessage:  commit.message || '',
      matchedTasks:   [],
      unmatchedParts: ['No substantial code changes in this commit']
    };
  }

  console.log(`   ✅ [AI] Proceeding — ${totalChanges} lines changed`);

  const MAX_COMMIT_MSG    = 300;
  const MAX_DIFF_PER_FILE = 200;
  const MAX_FILES         = 3;

  const files    = commit.files || commit.changedFiles || [];
  const topFiles = files
    .sort((a: any, b: any) => (b.additions || 0) - (a.additions || 0))
    .slice(0, MAX_FILES);

  let commitMsg = (commit.message || '').split('\n')[0];
  if (commitMsg.length > MAX_COMMIT_MSG) commitMsg = commitMsg.substring(0, MAX_COMMIT_MSG);

  const commitData = {
    sha:             commit.shortSha || commit.sha?.substring(0, 7),
    message:         commitMsg,
    files: topFiles.map((file: any) => ({
      filename:     file.filename,
      status:       file.status,
      additions:    file.additions || 0,
      deletions:    file.deletions || 0,
      diff_preview: (file.patch || '').substring(0, MAX_DIFF_PER_FILE)
    })),
    total_additions: commit.stats?.additions || commit.linesAdded  || 0,
    total_deletions: commit.stats?.deletions || commit.linesDeleted || 0
  };

  // Build from REAL simulation tasks
  const tasksList = tasks.slice(0, 8).map((task: any, idx: number) => ({
    id:          String(task.id || task.order || task.task_index || idx + 1),
    name:        (task.title || task.task_name || task.name || `Task ${idx + 1}`).substring(0, 60),
    description: (task.description || task.requirements || task.instructions || '').substring(0, 120)
  }));
  
  // const tasksList = [
  //   {
  //     id: "task_1",
  //     name: "Managing Stuff",
  //     description: "Add, change, or remove things you own."
  //   },
  //   {
  //     id: "task_2",
  //     name: "Tracking Spending",
  //     description: "See how much money you spend on things."
  //   },
  //   {
  //     id: "task_3",
  //     name: "Changing Account Settings",
  //     description: "Change your password or email address."
  //   }
  // ];

  const prompt = `Analyze this git commit and match it to one or more simulation tasks below.

COMMIT: ${commitData.sha}
MESSAGE: ${commitData.message}
STATS: +${commitData.total_additions}/-${commitData.total_deletions}

FILES CHANGED:
${commitData.files.map((f: any) => `${f.filename} (${f.status}): +${f.additions}/-${f.deletions}`).join('\n')}

CODE DIFFS:
${commitData.files.map((f: any) => `${f.filename}:\n${f.diff_preview || 'No diff'}`).join('\n')}

SIMULATION TASKS:
${tasksList.map((t: any) => `${t.id}: ${t.name} - ${t.description}`).join('\n')}

Return ONLY valid JSON:
{
  "matchedTasks": [{
    "taskId": "<id from task list>",
    "taskName": "<name from task list>",
    "confidence": 0-100,
    "whatWasImplemented": "brief description",
    "howItWasImplemented": "brief implementation note"
  }],
  "unmatchedParts": "description of anything not matched (or empty string)",
  "commitSummary": "one sentence"
}`;

  try {
    console.log(`   📤 [AI] Sending (${commitData.files.length} files, ${tasksList.length} tasks)`);

   const completion = await getGroq().chat.completions.create({
      messages: [
        {
          role:    'system',
          content: 'You are a code reviewer. Match git commits to simulation tasks. Return ONLY valid JSON. Be concise but accurate.'
        },
        { role: 'user', content: prompt }
      ],
      model:           'llama-3.3-70b-versatile',
      temperature:     0.2,
      max_tokens:      600,
      response_format: { type: 'json_object' }
    });

    const responseContent = completion.choices[0]?.message?.content || '{"matchedTasks":[]}';
    const result           = JSON.parse(responseContent);

    console.log(`   ✅ [AI] Matched ${result.matchedTasks?.length || 0} tasks`);

    return {
      commitSha:      commitData.sha,
      commitMessage:  commitData.message,
      matchedTasks:   result.matchedTasks  || [],
      unmatchedParts: result.unmatchedParts ? [result.unmatchedParts] : [],
      commitSummary:  result.commitSummary  || ''
    } as any;

  } catch (error: any) {
    console.error('   ❌ [AI] Failed:', error.message);
    return {
      commitSha:      commitData.sha,
      commitMessage:  commitData.message,
      matchedTasks:   [],
      unmatchedParts: [`AI analysis failed: ${error.message}`]
    };
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPER: ML commit → task matcher (Python server)
// ─────────────────────────────────────────────────────────────────────────────
private async matchCommitToTasksWithMl(
  commit: any,
  tasks: any[]
): Promise<CommitTaskMatchResult> {
  try {
    const pythonServerUrl = 'http://localhost:8097/match';

    // Build from REAL simulation tasks
    const tasksList = tasks.map((task: any, idx: number) => ({
      id:          String(task.id || task.order || task.task_index || idx + 1),
      name:        task.title || task.task_name || task.name || `Task ${idx + 1}`,
      description: task.description || task.requirements || task.instructions || ''
    }));
    
    // const tasksList = [
    //   {
    //     id: "task_1",
    //     name: "Managing Stuff",
    //     description: "Add, change, or remove things you own."
    //   },
    //   {
    //     id: "task_2",
    //     name: "Tracking Spending",
    //     description: "See how much money you spend on things."
    //   },
    //   {
    //     id: "task_3",
    //     name: "Changing Account Settings",
    //     description: "Change your password or email address."
    //   }
    // ];

    const requestBody = {
      commit_message: commit.message,
      tasks:          tasksList
    };

    console.log(`   🤖 [ML] Matching commit: ${commit.shortSha || commit.sha?.substring(0, 7)}`);

    const response = await fetch(pythonServerUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Python server responded with status: ${response.status}`);
    }

    const result: any = await response.json();

    if (result.success && result.best_match) {
      const bestMatch       = result.best_match;
      const confidenceValue = bestMatch.confidence || 0;

      if (confidenceValue >= 35) {
        return {
          commitSha:     commit.shortSha || commit.sha?.substring(0, 7),
          commitMessage: commit.message,
          matchedTasks: [{
            taskId:               bestMatch.task_id   || '',
            taskName:             bestMatch.task_name || '',
            confidence:           confidenceValue,
            whatWasImplemented:   bestMatch.task_name || '',
            howItWasImplemented:  `Matched with ${confidenceValue}% confidence using ML`,
            keyFiles:             commit.files?.map((f: any) => f.filename) || [],
            implementedFunctions: []
          }],
          unmatchedParts: [],
          confidence:     confidenceValue,
          matchLevel:     bestMatch.match_level,
          tfidfScore:     bestMatch.tfidf_score,
          spacyScore:     bestMatch.spacy_score,
          sentimentMatch: bestMatch.sentiment_match
        };
      }

      return {
        commitSha:      commit.shortSha || commit.sha?.substring(0, 7),
        commitMessage:  commit.message,
        matchedTasks:   [],
        unmatchedParts: [commit.message],
        confidence:     confidenceValue,
        matchLevel:     bestMatch.match_level,
        tfidfScore:     bestMatch.tfidf_score,
        spacyScore:     bestMatch.spacy_score,
        sentimentMatch: bestMatch.sentiment_match
      };
    }

    return {
      commitSha:      commit.shortSha || commit.sha?.substring(0, 7),
      commitMessage:  commit.message,
      matchedTasks:   [],
      unmatchedParts: [commit.message],
      confidence:     0
    };

  } catch (error) {
    console.error(`   ❌ [ML] Failed for commit ${commit.sha}:`, error);
    return {
      commitSha:      commit.shortSha || commit.sha?.substring(0, 7),
      commitMessage:  commit.message,
      matchedTasks:   [],
      unmatchedParts: ['ML matching service unavailable'],
      confidence:     0
    };
  }
}


// ============================================
// HELPER FUNCTIONS FOR GITHUB ANALYSIS
// ============================================

/**
 * Detects README file with fuzzy matching (case-insensitive, multiple patterns)
 */
private detectReadmeFile(files: any[]): { file: any | null; fileName: string | null } {
  console.log('🔍 [detectReadmeFile] Searching for README files...');
  
  const readmePatterns = [
    /^README\.md$/i,      // README.md, ReadMe.md, README.MD
    /^readme\.md$/i,      // readme.md
    /^README$/i,          // README (no extension)
    /^readme$/i,          // readme (no extension)
    /^ReadMe\.md$/i,      // ReadMe.md
    /^README\.txt$/i,     // README.txt
    /^readme\.txt$/i,     // readme.txt
    /\.md$/i              // Any .md file that might be README
  ];
  
  // First, try exact matches
  for (const file of files) {
    const fileName = file.name || '';
    const isReadme = readmePatterns.some(pattern => pattern.test(fileName));
    
    if (isReadme) {
      console.log(`✅ Found README file: ${fileName}`);
      return { file, fileName };
    }
  }
  
  // If no README found, check if any .md file contains 'readme' in name
  const mdFiles = files.filter((f: any) => 
    f.name?.toLowerCase().includes('readme') || 
    (f.name?.endsWith('.md') && f.name?.toLowerCase().includes('readme'))
  );
  
  if (mdFiles.length > 0) {
    const file = mdFiles[0];
    console.log(`✅ Found README-like file: ${file.name}`);
    return { file, fileName: file.name };
  }
  
  console.log('❌ No README file found');
  return { file: null, fileName: null };
}

/**
 * Analyzes README content using Groq AI to check task documentation
 */
private async analyzeReadmeWithAI(
  readmeContent: string, 
  readmeFileName: string, 
  simulationTasks: any[]
): Promise<{
  documentedTasks: string[];
  missingTasks: string[];
  quality: string;
  hasInstallation: boolean;
  hasUsageExamples: boolean;
  hasApiDocs: boolean;
  hasTaskBreakdown: boolean;
  readmeScore: number;
  suggestions: string[];
  overallAssessment: string;
}> {
  console.log('🤖 [analyzeReadmeWithAI] Starting Groq AI analysis...');
  
  const defaultResult = {
    documentedTasks: [],
    missingTasks: [],
    quality: 'basic',
    hasInstallation: false,
    hasUsageExamples: false,
    hasApiDocs: false,
    hasTaskBreakdown: false,
    readmeScore: 50,
    suggestions: ['Add more documentation to README'],
    overallAssessment: 'Basic README documentation'
  };
  
  if (!readmeContent || readmeContent.length < 100) {
    console.log('⚠️ README content too short for analysis (< 100 chars)');
    return defaultResult;
  }
  
  if (simulationTasks.length === 0) {
    console.log('⚠️ No simulation tasks to compare against');
    return defaultResult;
  }
  
  try {
    const taskNames = simulationTasks.map((task, idx) => 
      `${idx + 1}. ${task.title || task.task_name || `Task ${idx + 1}`}`
    ).join('\n');
    
    // Limit README content to 3000 chars for prompt
    const truncatedReadme = readmeContent.substring(0, 3000);
    console.log(`📄 README content truncated to 3000 chars for AI analysis`);
    console.log(`📊 Analyzing README for ${truncatedReadme} tasks...`);
    
    const prompt = `Analyze this README file (${readmeFileName}) and determine which simulation tasks are documented.

    SIMULATION TASKS:
    ${taskNames}

    README CONTENT:
    ${truncatedReadme}

    Return ONLY valid JSON:
    {
      "tasks_documented": ["task name 1", "task name 2"],
      "tasks_missing": ["task name 3"],
      "documentation_quality": "excellent" or "good" or "basic" or "poor",
      "has_installation": true/false,
      "has_usage_examples": true/false,
      "has_api_docs": true/false,
      "has_task_breakdown": true/false,
      "readme_score": 0-100,
      "suggestions": ["suggestion 1", "suggestion 2"],
      "overall_assessment": "brief assessment"
    }`;

    const completion = await getGroq().chat.completions.create({
      messages: [
        { role: 'system', content: 'You analyze README files for technical documentation quality. Return ONLY valid JSON.' },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
    
    console.log(`✅ README Analysis complete:`, {
      quality: result.documentation_quality,
      documentedCount: result.tasks_documented?.length || 0,
      missingCount: result.tasks_missing?.length || 0,
      readmeScore: result.readme_score
    });
    
    return {
      documentedTasks: result.tasks_documented || [],
      missingTasks: result.tasks_missing || [],
      quality: result.documentation_quality || 'basic',
      hasInstallation: result.has_installation || false,
      hasUsageExamples: result.has_usage_examples || false,
      hasApiDocs: result.has_api_docs || false,
      hasTaskBreakdown: result.has_task_breakdown || false,
      readmeScore: result.readme_score || 50,
      suggestions: result.suggestions || [],
      overallAssessment: result.overall_assessment || 'Basic documentation'
    };
    
  } catch (error: any) {
    console.error('❌ README Groq analysis failed:', error.message);
    return defaultResult;
  }
}

/**
 * Calculates README score based on presence, quality, and task coverage
 */
private calculateReadmeScore(
  hasReadme: boolean,
  quality: string,
  taskCoveragePercentage: number
): { score: number; maxScore: number; details: string } {
  console.log('📊 [calculateReadmeScore] Calculating README score...');
  
  const maxScore = 25;
  let score = 0;
  
  if (!hasReadme) {
    console.log('   No README found → 0/25');
    return { score: 0, maxScore, details: 'No README file found' };
  }
  
  // Base points for having README: 5
  score = 0;
  let details = 'README present';
  
  // Quality bonus: up to 8 more points
  if (quality === 'excellent') {
    score += 10;
    details += ' - Excellent documentation quality';
    console.log('   +10: Excellent quality');
  } else if (quality === 'good') {
    score += 8;
    details += ' - Good documentation quality';
    console.log('   +8: Good quality');
  } else if (quality === 'basic') {
    score += 4;
    details += ' - Basic documentation quality';
    console.log('   +4: Basic quality');
  }
  
  // Task coverage bonus: up to 2 more points
  if (taskCoveragePercentage >= 80) {
    score += 2;
    details += `, ${Math.round(taskCoveragePercentage)}% task coverage (Excellent)`;
    console.log(`   +2: Excellent task coverage (${Math.round(taskCoveragePercentage)}%)`);
  } else if (taskCoveragePercentage >= 50) {
    score += 1;
    details += `, ${Math.round(taskCoveragePercentage)}% task coverage (Good)`;
    console.log(`   +1: Good task coverage (${Math.round(taskCoveragePercentage)}%)`);
  } else if (taskCoveragePercentage > 0) {
    details += `, ${Math.round(taskCoveragePercentage)}% task coverage`;
    console.log(`   Task coverage: ${Math.round(taskCoveragePercentage)}%`);
  }
  
  score = Math.min(maxScore, score);
  console.log(`   Final README score: ${score}/${maxScore}`);
  
  return { score, maxScore, details };
}

/**
 * Detects configuration files in repository
 */
private detectConfigFiles(files: any[]): { found: string[]; score: number; maxScore: number; details: string } {
  console.log('⚙️ [detectConfigFiles] Scanning for config files...');
  
  const configFilePatterns = [
    { name: 'package.json', points: 10, lang: 'Node.js' },
    { name: 'requirements.txt', points: 10, lang: 'Python' },
    { name: 'go.mod', points: 10, lang: 'Go' },
    { name: 'Cargo.toml', points: 10, lang: 'Rust' },
    { name: 'pyproject.toml', points: 8, lang: 'Python' },
    { name: 'setup.py', points: 8, lang: 'Python' },
    { name: 'tsconfig.json', points: 8, lang: 'TypeScript' },
    { name: '.eslintrc', points: 6, lang: 'JavaScript/TypeScript' },
    { name: '.eslintrc.js', points: 6, lang: 'JavaScript' },
    { name: '.eslintrc.json', points: 6, lang: 'JavaScript' },
    { name: 'webpack.config.js', points: 6, lang: 'JavaScript' },
    { name: 'vite.config.js', points: 6, lang: 'JavaScript' },
    { name: 'composer.json', points: 8, lang: 'PHP' },
    { name: 'Gemfile', points: 8, lang: 'Ruby' },
    { name: 'build.gradle', points: 8, lang: 'Java' },
    { name: 'pom.xml', points: 8, lang: 'Java' },
    { name: '.env.example', points: 4, lang: 'Environment' },
    { name: 'docker-compose.yml', points: 6, lang: 'Docker' },
    { name: 'Dockerfile', points: 6, lang: 'Docker' }
  ];
  
  const maxScore = 10;
  let score = 0;
  const foundFiles: string[] = [];
  
  for (const pattern of configFilePatterns) {
    const hasFile = files.some((f: any) => f.name === pattern.name);
    if (hasFile && !foundFiles.includes(pattern.name)) {
      foundFiles.push(pattern.name);
      const pointsToAdd = Math.min(maxScore - score, pattern.points);
      score += pointsToAdd;
      console.log(`   ✅ Found: ${pattern.name} (+${pointsToAdd} points, ${pattern.lang})`);
      if (score >= maxScore) break;
    }
  }
  
  score = Math.min(maxScore, score);
  const details = foundFiles.length > 0 
    ? `Found ${foundFiles.length} config file(s): ${foundFiles.join(', ')}` 
    : 'No config files found';
  
  console.log(`📊 Config files score: ${score}/${maxScore} (${foundFiles.length} files found)`);
  
  return { found: foundFiles, score, maxScore, details };
}

/**
 * Detects .gitignore file
 */
private detectGitignore(files: any[]): { present: boolean; score: number; maxScore: number; details: string } {
  console.log('🚫 [detectGitignore] Checking for .gitignore...');
  
  const hasGitignore = files.some((f: any) => f.name === '.gitignore');
  const maxScore = 5;
  const score = hasGitignore ? maxScore : 0;
  const details = hasGitignore ? '.gitignore present' : 'No .gitignore found';
  
  console.log(`📊 .gitignore: ${hasGitignore ? '✅ Present' : '❌ Missing'} (${score}/${maxScore})`);
  
  return { present: hasGitignore, score, maxScore, details };
}

/**
 * Counts and scores code files by extension
 */
private analyzeCodeFiles(files: any[]): { count: number; score: number; maxScore: number; details: string } {
  console.log('💻 [analyzeCodeFiles] Counting code files...');
  
  const codeExtensions = /\.(js|ts|py|java|go|rs|cpp|c|hpp|h|html|css|scss|sass|less|json|rb|php|swift|kt|kts|sql|sh|bash|zsh)$/i;
  
  const codeFiles = files.filter((f: any) => 
    f.name?.match(codeExtensions) && f.type !== 'dir'
  );
  
  const count = codeFiles.length;
  const maxScore = 20;
  let score = 0;
  let details = '';
  
  console.log(`   Found ${count} code files`);
  
  if (count >= 15) {
    score = 20;
    details = `Excellent (${count} files)`;
    console.log(`   → 20/20: EXCELLENT (15+ files)`);
  } else if (count >= 10) {
    score = 16;
    details = `Great (${count} files)`;
    console.log(`   → 16/20: GREAT (10-14 files)`);
  } else if (count >= 6) {
    score = 12;
    details = `Good (${count} files)`;
    console.log(`   → 12/20: GOOD (6-9 files)`);
  } else if (count >= 3) {
    score = 8;
    details = `Adequate (${count} files)`;
    console.log(`   → 8/20: ADEQUATE (3-5 files)`);
  } else if (count >= 1) {
    score = 4;
    details = `Minimal (${count} files)`;
    console.log(`   → 4/20: MINIMAL (1-2 files)`);
  } else {
    score = 0;
    details = `No code files`;
    console.log(`   → 0/20: No code files`);
  }
  
  return { count, score, maxScore, details };
}

/**
 * Scores commit count
 */
private scoreCommitCount(commitCount: number): { earned: number; max: number; details: string } {
  console.log(`📊 [scoreCommitCount] Scoring ${commitCount} commits...`);
  
  const max = 40;
  let earned = 0;
  let details = '';
  
  if (commitCount >= 12) {
    earned = 40;
    details = `10+ commits (${commitCount}) - EXCELLENT`;
    console.log(`   → 40/40: EXCELLENT (10+ commits)`);
  } else if (commitCount >= 10) {
    earned = 35;
    details = `8-9 commits (${commitCount}) - VERY GOOD`;
    console.log(`   → 35/40: VERY GOOD (8-9 commits)`);
  } else if (commitCount >= 8) {
    earned = 30;
    details = `6-7 commits (${commitCount}) - GOOD`;
    console.log(`   → 30/40: GOOD (6-7 commits)`);
  } else if (commitCount >= 6) {
    earned = 20;
    details = `4-5 commits (${commitCount}) - ABOVE AVERAGE`;
    console.log(`   → 20/40: ABOVE AVERAGE (4-5 commits)`);
  } else if (commitCount >= 4) {
    earned = 15;
    details = `2-3 commits (${commitCount}) - AVERAGE`;
    console.log(`   → 15/40: AVERAGE (2-3 commits)`);
  } else if (commitCount >= 2) {
    earned = 8;
    details = `1 commit - MINIMAL`;
    console.log(`   → 8/40: MINIMAL (1 commit)`);
  } else {
    earned = 0;
    details = `No commits`;
    console.log(`   → 0/40: No commits`);
  }
  
  return { earned, max, details };
}

/**
 * Scores commit matching based on match percentage
 */
private scoreCommitMatching(matchPercentage: number, matchedCount: number, totalAnalyzed: number): { earned: number; max: number; details: string } {
  console.log(`📊 [scoreCommitMatching] Scoring ${matchPercentage.toFixed(1)}% match rate...`);
  
  const max = 30;
  let earned = 0;
  let details = '';
  
  if (matchPercentage >= 80) {
    earned = 30;
    details = `Excellent! ${matchedCount}/${totalAnalyzed} (${matchPercentage.toFixed(0)}%) - EXCELLENT`;
    console.log(`   → 30/30: EXCELLENT (${matchPercentage.toFixed(0)}% match rate)`);
  } else if (matchPercentage >= 60) {
    earned = 24;
    details = `Good! ${matchedCount}/${totalAnalyzed} (${matchPercentage.toFixed(0)}%) - GOOD`;
    console.log(`   → 24/30: GOOD (${matchPercentage.toFixed(0)}% match rate)`);
  } else if (matchPercentage >= 40) {
    earned = 18;
    details = `Satisfactory: ${matchedCount}/${totalAnalyzed} (${matchPercentage.toFixed(0)}%) - SATISFACTORY`;
    console.log(`   → 18/30: SATISFACTORY (${matchPercentage.toFixed(0)}% match rate)`);
  } else if (matchPercentage >= 20) {
    earned = 12;
    details = `Needs improvement: ${matchedCount}/${totalAnalyzed} (${matchPercentage.toFixed(0)}%) - NEEDS IMPROVEMENT`;
    console.log(`   → 12/30: NEEDS IMPROVEMENT (${matchPercentage.toFixed(0)}% match rate)`);
  } else if (matchPercentage > 0) {
    earned = 6;
    details = `Minimal: ${matchedCount}/${totalAnalyzed} (${matchPercentage.toFixed(0)}%) - MINIMAL`;
    console.log(`   → 6/30: MINIMAL (${matchPercentage.toFixed(0)}% match rate)`);
  } else {
    earned = 0;
    details = `No commits matched to tasks`;
    console.log(`   → 0/30: No matches found`);
  }
  
  return { earned, max, details };
}

/**
 * Formats commit data for analysis
 */
private formatCommitsForAnalysis(commits: any[]): any[] {
  return commits.map((commit: any) => ({
    sha: commit.sha,
    shortSha: commit.shortSha || commit.sha?.substring(0, 7),
    message: commit.message,
    author: commit.author,
    authorLogin: commit.authorLogin,
    date: commit.date,
    url: commit.url,
    stats: commit.stats,
    files: commit.files || [],
    linesAdded: commit.stats?.additions || commit.linesAdded || 0,
    linesDeleted: commit.stats?.deletions || commit.linesDeleted || 0
  }));
}

/**
 * Extracts metrics from repository data
 */
private extractRepoMetrics(repoData: any, commitsWithChanges: any[]) {
  const files = repoData.code?.files || [];
  
  return {
    totalFiles: repoData.code?.totalFiles || 0,
    totalSize: repoData.code?.totalSize || 0,
    primaryLanguage: repoData.languages?.primary || 'Unknown',
    languages: repoData.languages?.breakdown || [],
    hasReadme: repoData.community?.hasReadme || false,
    hasContributing: repoData.community?.hasContributing || false,
    hasCodeOfConduct: repoData.community?.hasCodeOfConduct || false,
    hasLicense: repoData.community?.hasLicense || false,
    stars: repoData.repository?.stars || 0,
    forks: repoData.repository?.forks || 0,
    watchers: repoData.repository?.watchers || 0,
    openIssues: repoData.repository?.openIssues || 0,
    defaultBranch: repoData.repository?.defaultBranch || 'main'
  };
}

// ============================================
// UPDATED calculateGitHubScore USING HELPER FUNCTIONS
// ============================================

public async calculateGitHubScore(
  session: any
): Promise<{ score: number; analysis: any }> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🐙 [calculateGitHubScore] STARTED');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 Session input:', { 
    hasGithubLinks: !!session.github_links, 
    sessionId: session.id 
  });

  let githubScore = 0;
  let githubAnalysis: any = null;

  // Initialize detailed marks
  let detailedMarks = {
    commits:        { earned: 0, max: 40,  details: '', count: 0 },
    readme:         { earned: 0, max: 15,  details: '', present: false, quality: '', taskCoverage: 0, missingTasks: [] as string[], documented_tasks: [] as string[], file_name: null as string | null },
    configFile:     { earned: 0, max: 10,  details: '', present: false, found: [] as string[] },
    gitignore:      { earned: 0, max: 5,   details: '', present: false },
    codeFiles:      { earned: 0, max: 20,  details: '', count: 0 },
    commitMatching: {
      earned: 0, max: 30, details: '',
      matchedCount: 0, totalCommitsAnalyzed: 0,
      aiMatchedCount: 0, mlMatchedCount: 0, combinedMatchedCount: 0
    },
    totalPossible: 120
  };

  // Guard: check github_links
  if (!session.github_links) {
    console.log('❌ No GitHub repository linked');
    return { score: 0, analysis: { analyzed: false, message: 'No GitHub repository linked', detailedMarks, score: 0 } };
  }

  let githubLinks = session.github_links;
  if (typeof githubLinks === 'string') {
    try { 
      githubLinks = JSON.parse(githubLinks); 
      console.log('✅ Parsed github_links from JSON');
    } catch (e) { 
      console.error('❌ Failed to parse GitHub links:', e);
      return { score: 0, analysis: { analyzed: false, message: 'Failed to parse GitHub links', detailedMarks, score: 0 } }; 
    }
  }

  if (!githubLinks?.repoUrl) {
    console.log('❌ No repository URL in GitHub links');
    return { score: 0, analysis: { analyzed: false, message: 'No repository URL in GitHub links', detailedMarks, score: 0 } };
  }

  const repoUrl = githubLinks.repoUrl;
  console.log(`📦 Repository URL: ${repoUrl}`);
  
  const parsed = await githubController.parseGitHubUrl(repoUrl);
  if (!parsed) {
    console.log('❌ Invalid GitHub repository URL');
    return { score: 0, analysis: { analyzed: false, message: 'Invalid GitHub repository URL', detailedMarks, score: 0 } };
  }

  const { owner, repo } = parsed;
  console.log(`✅ Repo parsed: ${owner}/${repo}`);

  try {
    // Fetch repository data
    console.log('\n📡 [STEP 1] Fetching GitHub repository data...');
    const mockReq = { params: { owner, repo }, query: { includeContent: 'true', maxFiles: '100' } } as any;
    let responseData: any = null;
    const mockRes: any = {
      json: (data: any) => { responseData = data; return mockRes; },
      status: (_code: number) => mockRes
    };

    const t0 = Date.now();
    await githubController.getEverything(mockReq, mockRes);
    console.log(`✅ getEverything completed in ${Date.now() - t0}ms`);

    if (!responseData?.data) {
      console.log('❌ No data returned from GitHub API');
      return { score: 0, analysis: { analyzed: false, message: 'No data returned from GitHub API', detailedMarks, score: 0 } };
    }

    const repoData = responseData.data;
    const files = repoData.code?.files || [];

    // Extract commits
    console.log('\n📝 [STEP 2] Extracting commits...');
    const rawCommits = (repoData.commits?.recentCommits || []);
    const commitsWithChanges = this.formatCommitsForAnalysis(rawCommits);
    console.log(`📊 ${commitsWithChanges.length} commits extracted`);

    // Load simulation tasks
    console.log('\n📋 [STEP 3] Loading simulation tasks...');
    let simulationTasks: any[] = [];
    try {
      if (session.id) {
        const simulationResult = await DatabaseService.query(`
          SELECT st.tasks, st.name AS template_name
          FROM simulation_sessions ss
          JOIN simulations sim ON ss.simulation_id = sim.id
          JOIN simulation_templates st ON sim.template_id = st.id
          WHERE ss.id = $1
        `, [session.id]);

        if (simulationResult.rows[0]?.tasks) {
          let tasksData = simulationResult.rows[0].tasks;
          if (typeof tasksData === 'string') tasksData = JSON.parse(tasksData);
          if (Array.isArray(tasksData)) {
            simulationTasks = tasksData;
            console.log(`✅ ${simulationTasks.length} simulation tasks loaded`);
          }
        }
      }
    } catch (err) {
      console.error('❌ Error retrieving tasks:', err);
    }

    // ============================================
    // README ANALYSIS using helper functions
    // ============================================
    console.log('\n📖 [STEP 4] README Analysis...');
    const { file: readmeFile, fileName: readmeFileName } = this.detectReadmeFile(files);

    let readmeAnalysis = null;
    let taskCoveragePercentage = 0;

    if (readmeFile && readmeFile.content) {
      detailedMarks.readme.present = true;
      detailedMarks.readme.file_name = readmeFileName;
      
      // ✅ FIX: Handle null fileName by providing a default
      const safeFileName = readmeFileName || 'README.md';
      
      const aiReadmeAnalysis = await this.analyzeReadmeWithAI(
        readmeFile.content,
        safeFileName,  // ← Now guaranteed to be a string
        simulationTasks
      );
      
      readmeAnalysis = aiReadmeAnalysis;
      detailedMarks.readme.quality = aiReadmeAnalysis.quality;
      detailedMarks.readme.documented_tasks = aiReadmeAnalysis.documentedTasks;
      detailedMarks.readme.missingTasks = aiReadmeAnalysis.missingTasks;
      
      taskCoveragePercentage = simulationTasks.length > 0 
        ? (aiReadmeAnalysis.documentedTasks.length / simulationTasks.length) * 100 
        : 0;
      detailedMarks.readme.taskCoverage = Math.round(taskCoveragePercentage);
      
      const readmeScoreResult = this.calculateReadmeScore(
        true,
        aiReadmeAnalysis.quality,
        taskCoveragePercentage
      );
      
      detailedMarks.readme.earned = readmeScoreResult.score;
      detailedMarks.readme.details = readmeScoreResult.details;
    } else {
      const readmeScoreResult = this.calculateReadmeScore(false, 'none', 0);
      detailedMarks.readme.earned = readmeScoreResult.score;
      detailedMarks.readme.details = readmeScoreResult.details;
    }

    // ============================================
    // CONFIG FILES ANALYSIS using helper function
    // ============================================
    console.log('\n⚙️ [STEP 5] Config Files Analysis...');
    const configResult = this.detectConfigFiles(files);
    detailedMarks.configFile.earned = configResult.score;
    detailedMarks.configFile.present = configResult.found.length > 0;
    detailedMarks.configFile.found = configResult.found;
    detailedMarks.configFile.details = configResult.details;

    // ============================================
    // GITIGNORE ANALYSIS using helper function
    // ============================================
    console.log('\n🚫 [STEP 6] Gitignore Analysis...');
    const gitignoreResult = this.detectGitignore(files);
    detailedMarks.gitignore.earned = gitignoreResult.score;
    detailedMarks.gitignore.present = gitignoreResult.present;
    detailedMarks.gitignore.details = gitignoreResult.details;

    // ============================================
    // CODE FILES ANALYSIS using helper function
    // ============================================
    console.log('\n💻 [STEP 7] Code Files Analysis...');
    const codeFilesResult = this.analyzeCodeFiles(files);
    detailedMarks.codeFiles.earned = codeFilesResult.score;
    detailedMarks.codeFiles.count = codeFilesResult.count;
    detailedMarks.codeFiles.details = codeFilesResult.details;

    // ============================================
    // COMMIT COUNT SCORE using helper function
    // ============================================
    console.log('\n📊 [STEP 8] Commit Count Score...');
    const commitCountResult = this.scoreCommitCount(commitsWithChanges.length);
    detailedMarks.commits.earned = commitCountResult.earned;
    detailedMarks.commits.count = commitsWithChanges.length;
    detailedMarks.commits.details = commitCountResult.details;

    // ============================================
    // AI + ML COMMIT MATCHING
    // ============================================
    console.log('\n🤖 [STEP 9] AI + ML Commit Matching...');
    let aiMatchedCount = 0;
    let mlMatchedCount = 0;
    let combinedMatchedCount = 0;
    let matchPercentage = 0;
    
    if (simulationTasks.length > 0 && commitsWithChanges.length > 0) {
      // AI Matching
      const aiResults = await this.runAIMatching(commitsWithChanges, simulationTasks);
      aiMatchedCount = aiResults.matchedCount;
      
      // ML Matching
      const mlResults = await this.runMLMatching(commitsWithChanges, simulationTasks);
      mlMatchedCount = mlResults.matchedCount;
      
      // Combine results
      const combined = this.combineMatchingResults(aiResults.results, mlResults.results);
      combinedMatchedCount = combined.matchedCount;
      matchPercentage = combined.matchPercentage;
      
      detailedMarks.commitMatching.totalCommitsAnalyzed = combined.totalAnalyzed;
      detailedMarks.commitMatching.aiMatchedCount = aiMatchedCount;
      detailedMarks.commitMatching.mlMatchedCount = mlMatchedCount;
      detailedMarks.commitMatching.combinedMatchedCount = combinedMatchedCount;
      
      const commitMatchingScore = this.scoreCommitMatching(matchPercentage, combinedMatchedCount, combined.totalAnalyzed);
      detailedMarks.commitMatching.earned = commitMatchingScore.earned;
      detailedMarks.commitMatching.details = commitMatchingScore.details;
    }

    // ============================================
    // CALCULATE TOTAL SCORE
    // ============================================
    githubScore = 
      detailedMarks.commits.earned +
      detailedMarks.readme.earned +
      detailedMarks.configFile.earned +
      detailedMarks.gitignore.earned +
      detailedMarks.codeFiles.earned +
      detailedMarks.commitMatching.earned;
      

    // Print final breakdown
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    GITHUB SCORE BREAKDOWN                      ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║ 📝 Commits:        ${detailedMarks.commits.earned.toString().padStart(2)}/${detailedMarks.commits.max}  - ${detailedMarks.commits.details}`);
    console.log(`║ 📖 README:         ${detailedMarks.readme.earned.toString().padStart(2)}/${detailedMarks.readme.max}  - ${detailedMarks.readme.details}`);
    console.log(`║ ⚙️ Config Files:   ${detailedMarks.configFile.earned.toString().padStart(2)}/${detailedMarks.configFile.max}  - ${detailedMarks.configFile.details}`);
    console.log(`║ 🚫 .gitignore:     ${detailedMarks.gitignore.earned.toString().padStart(2)}/${detailedMarks.gitignore.max}  - ${detailedMarks.gitignore.details}`);
    console.log(`║ 💻 Code Files:     ${detailedMarks.codeFiles.earned.toString().padStart(2)}/${detailedMarks.codeFiles.max}  - ${detailedMarks.codeFiles.details}`);
    console.log(`║ 🔗 Commit Match:   ${detailedMarks.commitMatching.earned.toString().padStart(2)}/${detailedMarks.commitMatching.max}  - ${detailedMarks.commitMatching.details}`);
    console.log(`╠═══════════════════════════════════════════════════════════════╣`);
    console.log(`║ 📊 TOTAL:          ${githubScore.toString().padStart(2)}/${detailedMarks.totalPossible} points (${Math.round((githubScore / detailedMarks.totalPossible) * 100)}%)`);
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    // Build final analysis
    githubAnalysis = {
      analyzed: true,
      mode: '1-day-progressive',
      repoUrl: `${owner}/${repo}`,
      owner,
      repo,
      score: Math.round((githubScore / detailedMarks.totalPossible) * 100),
      detailedMarks,
      readme_analysis: {
        present: detailedMarks.readme.present,
        file_name: detailedMarks.readme.file_name,
        quality: detailedMarks.readme.quality,
        task_coverage: detailedMarks.readme.taskCoverage,
        documented_tasks: detailedMarks.readme.documented_tasks,
        missing_tasks: detailedMarks.readme.missingTasks,
        suggestions: readmeAnalysis?.suggestions || [],
        overall_assessment: readmeAnalysis?.overallAssessment || ''
      },
      config_files_analysis: {
        found: detailedMarks.configFile.found,
        count: detailedMarks.configFile.found.length,
        score: detailedMarks.configFile.earned
      },
      commit_statistics: {
        total_commits: commitsWithChanges.length,
        first_commit: commitsWithChanges[commitsWithChanges.length - 1]?.date,
        last_commit: commitsWithChanges[0]?.date
      },
      matching_summary: {
        ai_matched: detailedMarks.commitMatching.aiMatchedCount,
        ml_matched: detailedMarks.commitMatching.mlMatchedCount,
        combined_matched: detailedMarks.commitMatching.combinedMatchedCount,
        match_rate: matchPercentage,
        total_analyzed: detailedMarks.commitMatching.totalCommitsAnalyzed
      },
      breakdown: {
        commits: { earned: detailedMarks.commits.earned, max: detailedMarks.commits.max, details: detailedMarks.commits.details },
        readme: { earned: detailedMarks.readme.earned, max: detailedMarks.readme.max, details: detailedMarks.readme.details },
        configFiles: { earned: detailedMarks.configFile.earned, max: detailedMarks.configFile.max, details: detailedMarks.configFile.details },
        gitignore: { earned: detailedMarks.gitignore.earned, max: detailedMarks.gitignore.max, details: detailedMarks.gitignore.details },
        codeFiles: { earned: detailedMarks.codeFiles.earned, max: detailedMarks.codeFiles.max, details: detailedMarks.codeFiles.details },
        commitMatching: { earned: detailedMarks.commitMatching.earned, max: detailedMarks.commitMatching.max, details: detailedMarks.commitMatching.details },
        total: githubScore,
        maxPossible: detailedMarks.totalPossible,
        percentage: Math.round((githubScore / detailedMarks.totalPossible) * 100)
      }
    };

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ [calculateGitHubScore] COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    return { score: githubScore, analysis: githubAnalysis };

  } catch (githubError: any) {
    console.error('\n═══════════════════════════════════════════════════════════════');
    console.error('❌ [calculateGitHubScore] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', githubError.message);
    console.error('═══════════════════════════════════════════════════════════════\n');
    
    return {
      score: 0,
      analysis: {
        analyzed: false,
        error: githubError.message,
        message: 'Failed to analyze GitHub repository',
        detailedMarks,
        score: 0
      }
    };
  }
}

// ============================================
// ADDITIONAL HELPER FUNCTIONS FOR MATCHING
// ============================================

private async runAIMatching(commits: any[], tasks: any[]): Promise<{ matchedCount: number; results: any[] }> {
  console.log('🤖 Running AI matching...');
  const results = [];
  let matchedCount = 0;
  
  for (let i = 0; i < Math.min(commits.length, 10); i++) {
    const commit = commits[i];
    try {
      const matchResult = await this.matchCommitToTasksWithAI(commit, tasks);
      results.push(matchResult);
      if (matchResult.matchedTasks?.length > 0) matchedCount++;
    } catch (err) {
      results.push({
        commitSha: commit.shortSha,
        commitMessage: commit.message,
        matchedTasks: [],
        unmatchedParts: ['AI matching failed']
      });
    }
  }
  
  console.log(`   AI matched: ${matchedCount}/${results.length}`);
  return { matchedCount, results };
}

private async runMLMatching(commits: any[], tasks: any[]): Promise<{ matchedCount: number; results: any[] }> {
  console.log('🤖 Running ML matching...');
  const results = [];
  let matchedCount = 0;
  
  for (let i = 0; i < Math.min(commits.length, 15); i++) {
    const commit = commits[i];
    try {
      const matchResult = await this.matchCommitToTasksWithMl(commit, tasks);
      results.push(matchResult);
      if (matchResult.matchedTasks?.length > 0) matchedCount++;
    } catch (err) {
      results.push({
        commitSha: commit.shortSha,
        commitMessage: commit.message,
        matchedTasks: [],
        unmatchedParts: ['ML matching failed']
      });
    }
  }
  
  console.log(`   ML matched: ${matchedCount}/${results.length}`);
  return { matchedCount, results };
}

private combineMatchingResults(aiResults: any[], mlResults: any[]): { matchedCount: number; totalAnalyzed: number; matchPercentage: number } {
  console.log('🔗 Combining AI and ML results...');
  
  const dedupeMap = new Map();
  for (const r of aiResults) dedupeMap.set(r.commitSha, r);
  for (const r of mlResults) {
    if (!dedupeMap.has(r.commitSha)) dedupeMap.set(r.commitSha, r);
  }
  
  const combined = Array.from(dedupeMap.values());
  const matchedCount = combined.filter(r => r.matchedTasks?.length > 0).length;
  const totalAnalyzed = combined.length;
  const matchPercentage = totalAnalyzed > 0 ? (matchedCount / totalAnalyzed) * 100 : 0;
  
  console.log(`   Combined: ${matchedCount}/${totalAnalyzed} matches (${matchPercentage.toFixed(1)}%)`);
  
  return { matchedCount, totalAnalyzed, matchPercentage };
}

calculateGitHubScoreForRepo = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { repoUrl, owner, repo, sessionId } = req.body || {};  // ✅ ADD sessionId
    const normalizedRepoUrl = repoUrl || (owner && repo ? `https://github.com/${owner}/${repo}` : null);

    if (!normalizedRepoUrl) {
      ResponseService.error(res, 'repoUrl or owner/repo is required', 400);
      return;
    }

    // ✅ CREATE PROPER SESSION OBJECT WITH ID
    const session = {
      id: sessionId,  // ← CRITICAL: This enables task lookup
      github_links: {
        repoUrl: normalizedRepoUrl
      }
    };

    const result = await this.calculateGitHubScore(session);

    ResponseService.success(res, result, 'GitHub score calculated');
  } catch (error: any) {
    ResponseService.error(res, error.message || 'Failed to calculate GitHub score', 500);
  }
};


/**
 * Code Quality Detection for Multiple Languages
 * Detects programming language and evaluates code quality
 */


private detectProgrammingLanguage = (code: string): string => {
  if (!code || code.trim().length === 0) return 'unknown';
  
  const languagePatterns: Array<{ lang: string; pattern: RegExp }> = [
    { lang: 'python', pattern: /def\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import|print\(|if\s+__name__\s*==\s*['"]__main__['"]/ },
    { lang: 'javascript', pattern: /function\s+\w+\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|=>|console\.log|export\s+default/ },
    { lang: 'typescript', pattern: /interface\s+\w+|type\s+\w+\s*=|:\s*string|:\s*number|:\s*boolean|<[A-Z]>/ },
    { lang: 'java', pattern: /public\s+class|private\s+\w+|protected\s+\w+|System\.out\.println|import\s+java\./ },
    { lang: 'csharp', pattern: /using\s+System|namespace\s+\w+|public\s+class|private\s+void|Console\.WriteLine/ },
    { lang: 'cpp', pattern: /#include\s+[<"]|using\s+namespace\s+std|int\s+main\(|std::|cout\s*<<|cin\s*>>/ },
    { lang: 'go', pattern: /func\s+\w+\s*\(|package\s+\w+|import\s+\(|fmt\.Println|:=/ },
    { lang: 'rust', pattern: /fn\s+\w+\s*\(|let\s+mut|impl\s+\w+|println!|match\s+/ },
    { lang: 'ruby', pattern: /def\s+\w+|end\s*$|puts\s+|require\s+['"]|attr_accessor/ },
    { lang: 'php', pattern: /function\s+\w+\s*\(|<\?php|echo\s+|namespace\s+\w+|use\s+\w+/ },
    { lang: 'swift', pattern: /func\s+\w+\s*\(|var\s+\w+|let\s+\w+|print\(|import\s+UIKit/ },
    { lang: 'kotlin', pattern: /fun\s+\w+\s*\(|val\s+\w+|var\s+\w+|println\(|import\s+kotlin\./ },
    { lang: 'sql', pattern: /SELECT\s+|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE/i },
    { lang: 'html', pattern: /<[^>]+>|<\/[^>]+>|<!DOCTYPE/i },
    { lang: 'css', pattern: /[a-zA-Z-]+\s*\{|@media|@import/ },
    { lang: 'shell', pattern: /#!\/bin\/bash|#!\/bin\/sh|echo\s+|export\s+\w+=/ }
  ];
  
  for (const { lang, pattern } of languagePatterns) {
    if (pattern.test(code)) {
      return lang;
    }
  }
  
  return 'unknown';
};

private detectCodeQuality = (code: string, language?: string): CodeQualityResult => {
  if (!code || code.trim().length === 0) {
    return {
      score: 0,
      maxScore: 100,
      details: {
        hasFunctions: false,
        hasVariables: false,
        hasConditionals: false,
        hasLoops: false,
        hasReturns: false,
        hasErrorHandling: false,
        hasClasses: false,
        hasImports: false,
        linesOfCode: 0,
        codeLength: 0,
        language: language || 'none',
        detectedFeatures: []
      }
    };
  }
  
  const detectedLanguage = language || this.detectProgrammingLanguage(code);
  const lines = code.split('\n');
  const linesOfCode = lines.filter(line => line.trim().length > 0).length;
  
  let hasFunctions = false;
  let hasVariables = false;
  let hasConditionals = false;
  let hasLoops = false;
  let hasReturns = false;
  let hasErrorHandling = false;
  let hasClasses = false;
  let hasImports = false;
  
  const detectedFeatures: string[] = [];
  
  // Language-specific patterns (keeping your existing patterns)
  const patterns: Record<string, any> = {
    functions: {
      python: /\bdef\s+\w+\s*\(/,
      javascript: /\bfunction\s+\w+\s*\(|\w+\s*=\s*\([^)]*\)\s*=>/,
      typescript: /\bfunction\s+\w+\s*\(|\w+\s*=\s*\([^)]*\)\s*=>/,
      java: /\b(public|private|protected)?\s+\w+\s+\w+\s*\(/,
      csharp: /\b(public|private|protected)?\s+\w+\s+\w+\s*\(/,
      cpp: /\b\w+\s+\w+\s*\([^)]*\)\s*\{/,
      go: /\bfunc\s+\w+\s*\(/,
      rust: /\bfn\s+\w+\s*\(/,
      ruby: /\bdef\s+\w+/,
      php: /\bfunction\s+\w+\s*\(/,
      swift: /\bfunc\s+\w+\s*\(/,
      kotlin: /\bfun\s+\w+\s*\(/
    },
    variables: {
      python: /\b\w+\s*=/,
      javascript: /\b(const|let|var)\s+\w+/,
      typescript: /\b(const|let|var)\s+\w+/,
      java: /\b(int|String|boolean|double|float|long)\s+\w+/,
      csharp: /\b(int|string|bool|double|float|long)\s+\w+/,
      cpp: /\b(int|string|bool|double|float|long|auto)\s+\w+/,
      go: /:=\s*\w+|\bvar\s+\w+/,
      rust: /\b(let|let mut)\s+\w+/,
      ruby: /\b\w+\s*=/,
      php: /\$\w+\s*=/,
      swift: /\b(var|let)\s+\w+/,
      kotlin: /\b(var|val)\s+\w+/
    },
    conditionals: {
      python: /\bif\s+|elif\s+|else\s*:/,
      javascript: /\bif\s*\(|else\s+if|else\s*\{/,
      typescript: /\bif\s*\(|else\s+if|else\s*\{/,
      java: /\bif\s*\(|else\s+if|else\s*\{/,
      csharp: /\bif\s*\(|else\s+if|else\s*\{/,
      cpp: /\bif\s*\(|else\s+if|else\s*\{/,
      go: /\bif\s+|else\s+if|else\s*\{/,
      rust: /\bif\s+|else\s+if|else\s*\{/,
      ruby: /\bif\s+|elsif|else\s*$/,
      php: /\bif\s*\(|elseif|else\s*\{/,
      swift: /\bif\s+|else\s+if|else\s*\{/,
      kotlin: /\bif\s*\(|else\s+if|else\s*\{/
    },
    loops: {
      python: /\bfor\s+\w+\s+in|while\s+/,
      javascript: /\bfor\s*\(|while\s*\(|do\s*\{/,
      typescript: /\bfor\s*\(|while\s*\(|do\s*\{/,
      java: /\bfor\s*\(|while\s*\(|do\s*\{/,
      csharp: /\bfor\s*\(|foreach\s*\(|while\s*\(|do\s*\{/,
      cpp: /\bfor\s*\(|while\s*\(|do\s*\{/,
      go: /\bfor\s+|range\s+/,
      rust: /\bfor\s+\w+\s+in|while\s+/,
      ruby: /\bfor\s+\w+\s+in|while\s+/,
      php: /\bfor\s*\(|foreach\s*\(|while\s*\(/,
      swift: /\bfor\s+\w+\s+in|while\s+/,
      kotlin: /\bfor\s*\(|while\s*\(/
    },
    returns: {
      python: /\breturn\s+/,
      javascript: /\breturn\s+/,
      typescript: /\breturn\s+/,
      java: /\breturn\s+/,
      csharp: /\breturn\s+/,
      cpp: /\breturn\s+/,
      go: /\breturn\s+/,
      rust: /\breturn\s+/,
      ruby: /\breturn\s+/,
      php: /\breturn\s+/,
      swift: /\breturn\s+/,
      kotlin: /\breturn\s+/
    },
    errorHandling: {
      python: /\btry\s*:|except\s+|finally\s*:/,
      javascript: /\btry\s*\{|catch\s*\(|finally\s*\{/,
      typescript: /\btry\s*\{|catch\s*\(|finally\s*\{/,
      java: /\btry\s*\{|catch\s*\(|finally\s*\{/,
      csharp: /\btry\s*\{|catch\s*\(|finally\s*\{/,
      cpp: /\btry\s*\{|catch\s*\(/,
      go: /if\s+err\s*!=\s*nil/,
      rust: /\bResult|Option|unwrap\(\)|expect\(/,
      ruby: /\bbegin\s*$|rescue\s+|ensure\s*$/,
      php: /\btry\s*\{|catch\s*\(|finally\s*\{/,
      swift: /\bdo\s*\{|catch\s+|try!/,
      kotlin: /\btry\s*\{|catch\s*\(|finally\s*\{/
    },
    classes: {
      python: /\bclass\s+\w+/,
      javascript: /\bclass\s+\w+\s*\{/,
      typescript: /\bclass\s+\w+\s*\{|interface\s+\w+/,
      java: /\bclass\s+\w+\s*\{|interface\s+\w+/,
      csharp: /\bclass\s+\w+\s*\{|interface\s+\w+/,
      cpp: /\bclass\s+\w+\s*\{/,
      go: /\btype\s+\w+\s+struct/,
      rust: /\bstruct\s+\w+|impl\s+\w+/,
      ruby: /\bclass\s+\w+/,
      php: /\bclass\s+\w+/,
      swift: /\bclass\s+\w+|struct\s+\w+/,
      kotlin: /\bclass\s+\w+|interface\s+\w+/
    },
    imports: {
      python: /^(import|from)\s+/m,
      javascript: /^(import|require\()/m,
      typescript: /^(import|from\s+['"])/m,
      java: /^import\s+/m,
      csharp: /^using\s+/m,
      cpp: /^#include/m,
      go: /^import\s+/m,
      rust: /^use\s+/m,
      ruby: /^(require|include)\s+/m,
      php: /^(use|require|include)\s+/m,
      swift: /^import\s+/m,
      kotlin: /^import\s+/m
    }
  };
  
  // Detect features
  const langLower = detectedLanguage.toLowerCase();
  
  const checkFeature = (feature: string): boolean => {
    const patternSet = patterns[feature];
    if (!patternSet) return false;
    if (patternSet[langLower]) {
      return patternSet[langLower].test(code);
    }
    if (patternSet.javascript) {
      return patternSet.javascript.test(code);
    }
    return false;
  };
  
  hasFunctions = checkFeature('functions');
  hasVariables = checkFeature('variables');
  hasConditionals = checkFeature('conditionals');
  hasLoops = checkFeature('loops');
  hasReturns = checkFeature('returns');
  hasErrorHandling = checkFeature('errorHandling');
  hasClasses = checkFeature('classes');
  hasImports = checkFeature('imports');
  
  if (hasFunctions) detectedFeatures.push('functions');
  if (hasVariables) detectedFeatures.push('variables');
  if (hasConditionals) detectedFeatures.push('conditionals');
  if (hasLoops) detectedFeatures.push('loops');
  if (hasReturns) detectedFeatures.push('returns');
  if (hasErrorHandling) detectedFeatures.push('error_handling');
  if (hasClasses) detectedFeatures.push('classes');
  if (hasImports) detectedFeatures.push('imports');
  
  // ============================================
  // CALCULATE SCORE WITH DETAILED LOGGING
  // ============================================
  console.log('\n📊 [detectCodeQuality] SCORE BREAKDOWN:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📝 Language: ${detectedLanguage}`);
  console.log(`📄 Lines of code: ${linesOfCode}`);
  console.log(`📏 Code length: ${code.length} chars`);
  console.log(`🔍 Detected features: ${detectedFeatures.join(', ') || 'none'}`);
  console.log('───────────────────────────────────────────────────────────────');
  
  let score = 0;
  
  // Core features (50 points)
  console.log('\n📌 CORE FEATURES (max 50 points):');
  if (hasFunctions) {
    score += 15;
    console.log(`   ✅ Functions/Methods: +15 points (total: ${score})`);
  } else {
    console.log(`   ❌ Functions/Methods: +0 points (total: ${score})`);
  }
  
  if (hasVariables) {
    score += 10;
    console.log(`   ✅ Variables: +10 points (total: ${score})`);
  } else {
    console.log(`   ❌ Variables: +0 points (total: ${score})`);
  }
  
  if (hasConditionals) {
    score += 10;
    console.log(`   ✅ Conditionals (if/else): +10 points (total: ${score})`);
  } else {
    console.log(`   ❌ Conditionals (if/else): +0 points (total: ${score})`);
  }
  
  if (hasReturns) {
    score += 15;
    console.log(`   ✅ Return statements: +15 points (total: ${score})`);
  } else {
    console.log(`   ❌ Return statements: +0 points (total: ${score})`);
  }
  
  // Advanced features (30 points)
  console.log('\n📌 ADVANCED FEATURES (max 30 points):');
  if (hasLoops) {
    score += 10;
    console.log(`   ✅ Loops (for/while): +10 points (total: ${score})`);
  } else {
    console.log(`   ❌ Loops (for/while): +0 points (total: ${score})`);
  }
  
  if (hasErrorHandling) {
    score += 10;
    console.log(`   ✅ Error handling (try/catch): +10 points (total: ${score})`);
  } else {
    console.log(`   ❌ Error handling (try/catch): +0 points (total: ${score})`);
  }
  
  if (hasClasses) {
    score += 10;
    console.log(`   ✅ Classes/OOP: +10 points (total: ${score})`);
  } else {
    console.log(`   ❌ Classes/OOP: +0 points (total: ${score})`);
  }
  
  // Project structure (20 points)
  console.log('\n📌 PROJECT STRUCTURE (max 20 points):');
  if (hasImports) {
    score += 10;
    console.log(`   ✅ Imports/Includes: +10 points (total: ${score})`);
  } else {
    console.log(`   ❌ Imports/Includes: +0 points (total: ${score})`);
  }
  
  if (linesOfCode > 10) {
    score += 5;
    console.log(`   ✅ Lines of code > 10: +5 points (total: ${score})`);
  } else {
    console.log(`   ❌ Lines of code > 10: +0 points (total: ${score})`);
  }
  
  if (code.length > 500) {
    score += 5;
    console.log(`   ✅ Code length > 500 chars: +5 points (total: ${score})`);
  } else {
    console.log(`   ❌ Code length > 500 chars: +0 points (total: ${score})`);
  }
  
  // Cap at 100
  const originalScore = score;
  score = Math.min(100, score);
  
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`📊 RAW SCORE: ${originalScore}/100`);
  if (originalScore > 100) {
    console.log(`⚠️  Capped at 100 (max score)`);
  }
  console.log(`✅ FINAL SCORE: ${score}%`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  return {
    score,
    maxScore: 100,
    details: {
      hasFunctions,
      hasVariables,
      hasConditionals,
      hasLoops,
      hasReturns,
      hasErrorHandling,
      hasClasses,
      hasImports,
      linesOfCode,
      codeLength: code.length,
      language: detectedLanguage,
      detectedFeatures
    }
  };
};

/**
 * Calculate answer quality for a task
 * Uses GitHub repository code when available, falls back to inline code
 */
private async calculateAnswerQuality(answer: any): Promise<{
  score: number;
  codeQuality: number;
  essayQuality: number;
  completeness: number;
  githubScore?: number;
  githubAnalysis?: any;
  details: any;
}> {
  let codeQuality = 0;
  let essayQuality = 0;
  let completeness = 0;
  let codeQualityDetails = null;
  let githubScore = 0;
  let githubAnalysis = null;
  
  const gitRepositoryUrl = answer.githubCommitUrl;
  
  // Fetch code from GitHub repository if URL is provided
  if (gitRepositoryUrl) {
    try {
      // Parse owner and repo from URL
      const parsed = githubController.parseGitHubUrl(gitRepositoryUrl);
      
      if (parsed) {
        const { owner, repo } = parsed;
        
        // ✅ METHOD 1: Call getEverything directly (as you were trying)
        // But we need to capture the response properly
        const mockReq = {
          params: { owner, repo },
          query: { includeContent: 'true', maxFiles: '50' }  // Limit files for performance
        } as any;
        
        let responseData: any = null;
        const mockRes: any = {
          json: (data: any) => { 
            responseData = data; 
            return mockRes; 
          },
          status: (_code: number) => mockRes
        };
        
        // Call getEverything
        await githubController.getEverything(mockReq, mockRes);
        
        if (responseData?.data) {
          const repoData = responseData.data;
          
          // Extract code files from the response
          const files = repoData.code?.files || [];
          
          // Find all code files
          const codeFiles = files.filter((file: any) => 
            file.name?.match(/\.(js|ts|py|java|go|rs|cpp|c|html|css|json|jsx|tsx)$/i)
          );
          
          // ✅ ANALYZE CODE QUALITY FROM GITHUB REPOSITORY
          // Combine all code files content for quality analysis
          let combinedCode = '';
          for (const file of codeFiles) {
            if (file.content) {
              combinedCode += `\n// File: ${file.name}\n${file.content}\n`;
            }
          }
          
          // ✅ Use detectCodeQuality on the GitHub repository code
          if (combinedCode.trim().length > 0) {
            const primaryLanguage = repoData.languages?.primary || 
                                    repoData.repository?.language || 
                                    'Unknown';
            const qualityResult = this.detectCodeQuality(combinedCode, primaryLanguage);
            codeQuality = qualityResult.score;
            codeQualityDetails = qualityResult.details;
            console.log(`✅ Code quality analysis from GitHub repo: ${codeQuality}% (${codeFiles.length} files, ${combinedCode.length} chars)`);
          } else {
            // Fallback to inline code if no code files found
            if (answer.code) {
              console.log('⚠️ No code files in GitHub repo, falling back to inline code');
              const qualityResult = this.detectCodeQuality(answer.code, answer.language);
              codeQuality = qualityResult.score;
              codeQualityDetails = qualityResult.details;
            }
          }
          
          // Build GitHub analysis object
          githubAnalysis = {
            hasRepo: true,
            owner,
            repo,
            totalFiles: files.length,
            codeFilesCount: codeFiles.length,
            languages: repoData.languages?.breakdown || [],
            primaryLanguage: repoData.languages?.primary || 'Unknown',
            codePreview: combinedCode.substring(0, 2000),
            fileStructure: files.slice(0, 20).map((f: any) => f.name || f.path),
            hasReadme: !!repoData.community?.hasReadme,
            hasConfigFile: codeFiles.some((f: any) => 
              f.name === 'package.json' || f.name === 'requirements.txt' || 
              f.name === 'go.mod' || f.name === 'Cargo.toml'
            ),
            codeFiles: codeFiles.map((f: any) => ({
              name: f.name,
              size: f.size,
              language: f.name?.split('.').pop()?.toLowerCase()
            }))
          };
          
          // Calculate GitHub score based on code quality metrics
          githubScore = Math.min(100, 
            (codeFiles.length * 5) + 
            ((repoData.languages?.breakdown?.length || 0) * 10) + 
            (githubAnalysis.hasReadme ? 15 : 0) +
            (githubAnalysis.hasConfigFile ? 10 : 0)
          );
          
          console.log(`✅ GitHub analysis completed for ${owner}/${repo}:`, {
            codeFilesCount: codeFiles.length,
            codeQualityScore: codeQuality,
            githubScore: githubScore
          });
        }
      }
    } catch (error: any) {
      console.error('❌ GitHub analysis failed:', error.message);
      githubAnalysis = { error: error.message, hasRepo: false };
      
      // ✅ FALLBACK: Use inline code if GitHub fetch fails
      if (answer.code) {
        console.log('⚠️ Falling back to inline code analysis');
        const qualityResult = this.detectCodeQuality(answer.code, answer.language);
        codeQuality = qualityResult.score;
        codeQualityDetails = qualityResult.details;
      }
    }
  } else {
    // ✅ No GitHub URL - use inline code if provided
    if (answer.code) {
      console.log('📝 Using inline code for quality analysis');
      const qualityResult = this.detectCodeQuality(answer.code, answer.language);
      codeQuality = qualityResult.score;
      codeQualityDetails = qualityResult.details;
    }
  }
  
  // Essay quality analysis
  if (answer.essay) {
    essayQuality = Math.min(50,
      (answer.essay.length > 100 ? 15 : 0) +
      (answer.essay.split(' ').length > 50 ? 15 : 0) +
      (answer.essay.includes('.') ? 10 : 0) +
      (answer.essay.includes('\n') ? 10 : 0)
    );
  }
  
  completeness = answer.completed ? 30 : 0;
  
  const totalScore = Math.min(100, codeQuality + essayQuality + completeness);
  
  return {
    score: totalScore,
    codeQuality,
    essayQuality,
    completeness,
    githubScore,
    githubAnalysis,
    details: {
      codeQualityDetails,
      essayLength: answer.essay?.length || 0,
      essayWords: answer.essay?.split(' ').length || 0,
      hasCode: !!answer.code,
      hasEssay: !!answer.essay,
      hasComment: !!answer.comment,
      markedCompleted: answer.completed || false,
      githubAnalysis
    }
  };
}


/**
 * Calculate comprehensive scores for a simulation session
 * Can be called independently with just a sessionId
 * 
 * @param sessionId - The simulation session ID
 * @param userId - The user ID (for authorization)
 * @returns Complete score analysis including per-task breakdown, overall scores, GitHub analysis, and feedback
 */
async calculateFullSessionScores(sessionId: string, userId: string): Promise<any> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 [calculateFullSessionScores] STARTED');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 Input:', { sessionId, userId });

  try {
    // ============================================
    // 1. Fetch session with all related data
    // ============================================
    const sessionResult = await DatabaseService.query(`
      SELECT 
        ss.id,
        ss.user_id,
        ss.simulation_id,
        ss.status,
        ss.started_at,
        ss.completed_at,
        ss.time_limit,
        ss.time_spent as session_time_spent,
        ss.current_task,
        ss.answers as session_answers,
        ss.progress,
        ss.github_links,
        ss.score as session_score,
        
        sim.id as simulation_record_id,
        sim.template_id,
        sim.application_id,
        sim.job_id,
        sim.status as simulation_status,
        sim.started_at as simulation_started_at,
        sim.completed_at as simulation_completed_at,
        sim.time_limit as simulation_time_limit,
        sim.time_spent as simulation_time_spent,
        sim.tasks as simulation_tasks,
        sim.answers as simulation_answers,
        sim.overall_score as simulation_overall_score,
        sim.punctuality_score,
        sim.communication_score,
        sim.problem_solving_score,
        sim.adaptability_score,
        sim.collaboration_score,
        sim.attention_score,
        sim.initiative_score,
        
        st.name as simulation_name,
        st.type as simulation_type,
        st.difficulty,
        st.duration_minutes,
        st.tasks as template_tasks,
        st.scoring_rubric,
        st.pass_fail_criteria,
        st.total_tasks,
        st.technologies,
        st.skills_assessed,
        
        j.id as job_id,
        j.title as job_title,
        c.id as company_id,
        c.name as company_name
        
      FROM simulation_sessions ss
      INNER JOIN simulations sim ON ss.simulation_id = sim.id
      INNER JOIN simulation_templates st ON sim.template_id = st.id
      LEFT JOIN jobs j ON sim.job_id = j.id
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE ss.id = $1 AND ss.user_id = $2
    `, [sessionId, userId]);

    if (!sessionResult.rows[0]) {
      throw new Error('Session not found');
    }

    const session = sessionResult.rows[0];
    
    // Parse JSON fields
    const templateTasks = typeof session.template_tasks === 'string' 
      ? JSON.parse(session.template_tasks) 
      : session.template_tasks || [];
    
    const scoringRubric = typeof session.scoring_rubric === 'string'
      ? JSON.parse(session.scoring_rubric)
      : session.scoring_rubric || {};

    // ============================================
    // 2. Fetch task progress
    // ============================================
    const taskProgressResult = await DatabaseService.query(`
      SELECT 
        id,
        task_index,
        status,
        started_at,
        completed_at,
        time_spent,
        answer,
        score,
        feedback,
        github_commit_url,
        created_at,
        updated_at
      FROM session_task_progress
      WHERE session_id = $1
      ORDER BY task_index ASC
    `, [sessionId]);

    const taskProgress = taskProgressResult.rows;
    
    const sessionStartTime = new Date(session.started_at);
    const sessionEndTime = session.completed_at ? new Date(session.completed_at) : new Date();
    const totalTimeSeconds = Math.floor((sessionEndTime.getTime() - sessionStartTime.getTime()) / 1000);
    const timeLimitSeconds = session.time_limit || (session.duration_minutes * 60) || 3600;

    // ============================================
    // 3. GITHUB SCORE - FULL DETAILED BREAKDOWN
    // ============================================
    let githubScore = 0;
    let githubAnalysis = null;
    let githubDetailedMarks = {
      commits: { earned: 0, max: 50, details: '', count: 0 },
      readme: { earned: 0, max: 15, details: '', present: false },
      configFile: { earned: 0, max: 10, details: '', present: false },
      gitignore: { earned: 0, max: 5, details: '', present: false },
      codeFiles: { earned: 0, max: 20, details: '', count: 0 },
      totalPossible: 100
    };
    let githubRepoInfo = null;
    
    if (session.github_links) {
      try {
        const githubScoreResult = await this.calculateGitHubScore(session);
        githubScore = githubScoreResult.score;
        githubAnalysis = githubScoreResult.analysis;
        githubDetailedMarks = githubAnalysis?.detailedMarks || githubDetailedMarks;
        
        let githubLinks = session.github_links;
        if (typeof githubLinks === 'string') {
          try { githubLinks = JSON.parse(githubLinks); } catch (e) { githubLinks = null; }
        }
        
        if (githubLinks) {
          githubRepoInfo = {
            repoUrl: githubLinks.repoUrl,
            repoName: githubLinks.repoName,
            branchName: githubLinks.branchName,
            organizationName: githubLinks.organizationName,
            candidateUsername: githubLinks.candidateUsername,
            issuesCreated: githubLinks.issues?.length || 0
          };
        }
      } catch (err) {
        console.warn('GitHub score calculation failed:', err);
      }
    }
    
    // ============================================
    // 3.5 COMMUNICATION SCORE - WITH FULL DETAILS
    // ============================================
    let communicationScoreResult = null;
    let calculatedCommunicationScore = 0;
    
    try {
      communicationScoreResult = await this.calculateCommunicationScore(sessionId, userId);
      calculatedCommunicationScore = communicationScoreResult.score;
      
      console.log('📊 Communication Score Details:', {
        score: calculatedCommunicationScore,
        messageCount: communicationScoreResult.messageCount,
        hasClassifier: !!communicationScoreResult.classifierAnalysis,
        hasGroq: !!communicationScoreResult.groqAnalysis,
        insightsCount: communicationScoreResult.combinedInsights?.keyInsights?.length || 0
      });
    } catch (err) {
      console.warn('Communication score calculation failed:', err);
    }

    // ============================================
    // 4. Task Completion Analysis (per task with detailed marks)
    // ============================================
    const taskCompletionAnalysis = await Promise.all(templateTasks.map(async (task: any, idx: number) => {
      const progress = taskProgress.find((tp: any) => tp.task_index === idx);
      const isCompleted = progress?.status === 'completed';
      const isInProgress = progress?.status === 'in_progress';
      
      let completionScore = 0;
      let completionStatus = 'not_started';
      
      if (isCompleted) {
        completionScore = 100;
        completionStatus = 'completed';
      } else if (isInProgress) {
        completionScore = 50;
        completionStatus = 'in_progress';
      }
      
      let timeTakenSeconds = 0;
      let timeScore = 0;
      const taskTimeLimit = (task.duration || task.duration_minutes || 30) * 60;
      
      if (progress?.started_at && progress?.completed_at) {
        timeTakenSeconds = Math.floor(
          (new Date(progress.completed_at).getTime() - new Date(progress.started_at).getTime()) / 1000
        );
        timeScore = Math.max(0, Math.min(100, (1 - (timeTakenSeconds / taskTimeLimit)) * 100));
      }
      
      const qualityScore = progress?.score || 0;
      
      let answerQualityScore = 0;
      let answerDetails = null;
      let answerMarks = {
        codeQuality: { earned: 0, max: 50, details: '' },
        essayQuality: { earned: 0, max: 50, details: '' },
        completeness: { earned: 0, max: 30, details: '' },
        total: { earned: 0, max: 100, details: '' }
      };
      
      if (progress?.answer) {
        const qualityResult = await this.calculateAnswerQuality(progress.answer);
        answerQualityScore = qualityResult.score;
        
        const code = progress.answer.code || '';
        const codeAnalysis = {
          hasFunctions: code.includes('function') || code.includes('const') || code.includes('let') || code.includes('def') || code.includes('fun'),
          hasConditionals: code.includes('if') || code.includes('else') || code.includes('switch') || code.includes('elif') || code.includes('case'),
          hasReturns: code.includes('return'),
          hasErrorHandling: (code.includes('try') && code.includes('catch')) || code.includes('except') || code.includes('finally'),
          linesOfCode: code.split('\n').length,
          codeLength: code.length,
          completed: progress.answer.completed === true,
          language: qualityResult.details.codeQualityDetails?.language || 'unknown',
          detectedFeatures: qualityResult.details.codeQualityDetails?.detectedFeatures || []
        };
        
        answerMarks = {
          codeQuality: {
            earned: qualityResult.codeQuality,
            max: 50,
            details: qualityResult.details.codeQualityDetails 
              ? `Language: ${qualityResult.details.codeQualityDetails.language}, Features: ${qualityResult.details.codeQualityDetails.detectedFeatures.join(', ')}`
              : 'No code provided'
          },
          essayQuality: {
            earned: qualityResult.essayQuality,
            max: 50,
            details: `Essay: ${qualityResult.details.essayLength} chars, ${qualityResult.details.essayWords} words`
          },
          completeness: {
            earned: qualityResult.completeness,
            max: 30,
            details: `Task marked as ${qualityResult.details.markedCompleted ? 'completed' : 'incomplete'}`
          },
          total: {
            earned: qualityResult.score,
            max: 100,
            details: `Total answer quality: ${qualityResult.score}%`
          }
        };
        
        answerDetails = {
          hasCode: qualityResult.details.hasCode,
          codeLength: progress.answer.code?.length || 0,
          codeLines: progress.answer.code?.split('\n').length || 0,
          codeLanguage: qualityResult.details.codeQualityDetails?.language || 'unknown',
          codeQualityScore: qualityResult.codeQuality,
          codeFeatures: qualityResult.details.codeQualityDetails?.detectedFeatures || [],
          codeAnalysis: codeAnalysis,
          hasEssay: qualityResult.details.hasEssay,
          essayLength: qualityResult.details.essayLength,
          essayWords: qualityResult.details.essayWords,
          hasComment: qualityResult.details.hasComment,
          commentLength: progress.answer.comment?.length || 0,
          markedCompleted: qualityResult.details.markedCompleted,
          marks: answerMarks
        };
      }
      
      const taskOverallScore = Math.round((completionScore + timeScore + qualityScore + answerQualityScore) / 4);
      
      const taskScoreBreakdown = {
        completion: { earned: completionScore, max: 100, percentage: completionScore, description: completionStatus === 'completed' ? 'Task completed' : completionStatus === 'in_progress' ? 'Task in progress' : 'Task not started' },
        time: { earned: Math.round(timeScore), max: 100, percentage: Math.round(timeScore), description: timeTakenSeconds > 0 ? `Completed in ${Math.floor(timeTakenSeconds / 60)}m ${timeTakenSeconds % 60}s (limit: ${Math.floor(taskTimeLimit / 60)}m)` : 'Time not tracked' },
        quality: { earned: qualityScore, max: 100, percentage: qualityScore, description: qualityScore >= 80 ? 'Excellent quality' : qualityScore >= 60 ? 'Good quality' : qualityScore >= 40 ? 'Average quality' : 'Needs improvement' },
        answer_quality: { earned: Math.round(answerQualityScore), max: 100, percentage: Math.round(answerQualityScore), description: answerDetails?.markedCompleted ? 'Answer provided and marked complete' : 'Answer incomplete' }
      };
      
      return {
        task_index: idx,
        task_title: task.title || task.task_name || `Task ${idx + 1}`,
        task_type: task.type || 'technical',
        status: completionStatus,
        scores: {
          completion: completionScore,
          time: Math.round(timeScore),
          quality: qualityScore,
          answer_quality: Math.round(answerQualityScore),
          overall: taskOverallScore,
          breakdown: taskScoreBreakdown
        },
        time_taken_seconds: timeTakenSeconds,
        time_limit_seconds: taskTimeLimit,
        time_taken_formatted: timeTakenSeconds > 0 ? `${Math.floor(timeTakenSeconds / 60)}m ${timeTakenSeconds % 60}s` : 'Not started',
        started_at: progress?.started_at,
        completed_at: progress?.completed_at,
        feedback: progress?.feedback,
        github_commit_url: progress?.github_commit_url,
        answer_details: answerDetails
      };
    }));

    // ============================================
    // 5. Overall Metrics
    // ============================================
    const completedTasks = taskCompletionAnalysis.filter((t: any) => t.status === 'completed');
    const inProgressTasks = taskCompletionAnalysis.filter((t: any) => t.status === 'in_progress');
    const notStartedTasks = taskCompletionAnalysis.filter((t: any) => t.status === 'not_started');
    const completionRate = (completedTasks.length / templateTasks.length) * 100;
    const averageTaskScore = taskCompletionAnalysis.reduce((sum: number, t: any) => sum + t.scores.overall, 0) / templateTasks.length;
    
    const totalPointsEarned = taskCompletionAnalysis.reduce((sum: number, t: any) => sum + t.scores.overall, 0);
    const totalPointsPossible = templateTasks.length * 100;
    const overallTaskPercentage = totalPointsPossible > 0 ? (totalPointsEarned / totalPointsPossible) * 100 : 0;

    // ============================================
    // 6. Punctuality Score with Partial Credit
    // ============================================
    let totalWeightSum = 0;
    let onTimeWeightSum = 0;
    let partialCreditSum = 0;
    const punctualityBreakdown: any[] = [];

    for (let i = 0; i < templateTasks.length; i++) {
      const task = templateTasks[i];
      const taskWeight = task.evaluation?.weight || task.priority || 1;
      totalWeightSum += taskWeight;
      
      const progress = taskProgress.find((tp: any) => tp.task_index === i);
      let wasOnTime = false;
      let taskElapsedSeconds = 0;
      let taskTimeLimit = 0;
      let punctualityPercentage = 0;
      let creditEarned = 0;
      let overtimeSeconds = 0;
      
      if (progress?.status === 'completed' && progress.completed_at) {
        const taskCompletedAt = new Date(progress.completed_at);
        taskTimeLimit = (task.duration || task.duration_minutes || 30) * 60;
        taskElapsedSeconds = (taskCompletedAt.getTime() - sessionStartTime.getTime()) / 1000;
        
        if (taskElapsedSeconds <= taskTimeLimit) {
          wasOnTime = true;
          punctualityPercentage = 100;
          creditEarned = taskWeight;
          onTimeWeightSum += taskWeight;
        } else {
          overtimeSeconds = taskElapsedSeconds - taskTimeLimit;
          const maxOvertimeAllowed = taskTimeLimit;
          
          if (overtimeSeconds <= maxOvertimeAllowed) {
            punctualityPercentage = Math.max(0, 100 - (overtimeSeconds / maxOvertimeAllowed) * 100);
            creditEarned = taskWeight * (punctualityPercentage / 100);
            partialCreditSum += creditEarned;
          } else {
            punctualityPercentage = 0;
            creditEarned = 0;
          }
        }
      } else if (progress?.status === 'completed') {
        punctualityPercentage = 50;
        creditEarned = taskWeight * 0.5;
        partialCreditSum += creditEarned;
      } else {
        punctualityPercentage = 0;
        creditEarned = 0;
      }
      
      punctualityBreakdown.push({
        task_index: i,
        task_title: task.title || task.task_name || `Task ${i + 1}`,
        weight: taskWeight,
        completed: progress?.status === 'completed',
        completed_at: progress?.completed_at,
        time_limit_seconds: taskTimeLimit,
        time_limit_formatted: taskTimeLimit > 0 ? `${Math.floor(taskTimeLimit / 60)}m ${taskTimeLimit % 60}s` : 'Not set',
        time_taken_seconds: Math.round(taskElapsedSeconds),
        time_taken_formatted: taskElapsedSeconds > 0 
          ? `${Math.floor(taskElapsedSeconds / 60)}m ${Math.floor(taskElapsedSeconds % 60)}s` 
          : 'Not completed',
        was_on_time: wasOnTime,
        punctuality_percentage: Math.round(punctualityPercentage),
        credit_earned: parseFloat(creditEarned.toFixed(2)),
        full_credit_possible: taskWeight,
        overtime_seconds: Math.max(0, overtimeSeconds),
        overtime_formatted: overtimeSeconds > 0 
          ? `${Math.floor(overtimeSeconds / 60)}m ${overtimeSeconds % 60}s` 
          : 'None'
      });
    }

    const punctualityScore = totalWeightSum > 0 
      ? Math.round(((onTimeWeightSum + partialCreditSum) / totalWeightSum) * 100)
      : Math.max(0, Math.min(100, (1 - (totalTimeSeconds / timeLimitSeconds)) * 100));

    // ============================================
    // 7. Adaptability Score
    // ============================================
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🔄 [ADAPTABILITY SCORE] CALCULATION STARTED');
    console.log('═══════════════════════════════════════════════════════════════');

    let qualitySum = 0;
    let speedSum = 0;
    let unexpectedEventsCount = 0;
    let abandonedCount = 0;
    let creativeCount = 0;
    const adaptabilityBreakdown: any[] = [];

    for (let i = 0; i < templateTasks.length; i++) {
      const task = templateTasks[i];
      
      // Detect unexpected tasks
      const isUnexpected = task.type === 'technical' || 
                          task.type === 'emergency' || 
                          task.type === 'change_request';
      
      if (isUnexpected) {
        unexpectedEventsCount++;
        const progress = taskProgress.find((tp: any) => tp.task_index === i);
        
        // ✅ USE YOUR EXISTING CODE QUALITY SCORE
        let qualityScore = 0;
        if (progress?.answer) {
          const qualityResult = await this.calculateAnswerQuality(progress.answer);
          qualityScore = qualityResult.codeQuality;
        }
        
        // ✅ SPEED SCORE: Use task.duration from template (180 minutes)
        let speedScore = 0;
        let isLate = false;
        let minutes = 0;
        
        if (progress?.completed_at && progress?.started_at) {
          minutes = (new Date(progress.completed_at).getTime() - new Date(progress.started_at).getTime()) / 1000 / 60;
          
          // ✅ FIXED: Use task.duration from template instead of hardcoded 30
          const timeLimitMinutes = task.duration || task.duration_minutes || 30;
          
          if (minutes <= timeLimitMinutes) {
            speedScore = 100;
            console.log(`   ✅ Task ${i + 1}: ON TIME (${minutes.toFixed(1)} min ≤ ${timeLimitMinutes} min) → Speed: 100`);
          } else {
            speedScore = 0;
            isLate = true;
            console.log(`   ❌ Task ${i + 1}: LATE (${minutes.toFixed(1)} min > ${timeLimitMinutes} min) → Speed: 0`);
          }
        } else if (progress?.status === 'completed') {
          speedScore = 0;
          console.log(`   ⚠️ Task ${i + 1}: Completed but no timing → Speed: 0`);
        }
        
        // Check for abandonment
        if (progress?.status === 'cancelled' || progress?.status === 'not_started') {
          abandonedCount++;
          qualityScore = 0;
          speedScore = 0;
          console.log(`   ❌ Task ${i + 1}: ABANDONED → Quality: 0, Speed: 0`);
        }
        
        // Check for creativity
        if (progress?.answer) {
          const answerText = JSON.stringify(progress.answer).toLowerCase();
          if (answerText.includes('alternative') || answerText.includes('creative')) {
            creativeCount++;
            console.log(`   💡 Task ${i + 1}: CREATIVE SOLUTION!`);
          }
        }
        
        qualitySum += qualityScore;
        speedSum += speedScore;
        
        console.log(`   📊 Task ${i + 1}: Quality=${qualityScore}, Speed=${speedScore} (Limit: ${task.duration || task.duration_minutes || 30} min)`);
        
        // ✅ PUSH TO adaptabilityBreakdown
        adaptabilityBreakdown.push({
          task_index: i,
          task_title: task.title || task.task_name || `Task ${i + 1}`,
          task_type: 'unexpected',
          time_limit_minutes: task.duration || task.duration_minutes || 30,
          time_taken_minutes: minutes,
          quality_score: Math.round(qualityScore),
          speed_score: Math.round(speedScore),
          completed: progress?.status === 'completed',
          was_abandoned: progress?.status === 'cancelled' || progress?.status === 'not_started',
          was_creative: progress?.answer && JSON.stringify(progress.answer).toLowerCase().includes('alternative'),
          completed_late: isLate,
          completion_time_minutes: minutes
        });
      }
    }

    console.log('\n───────────────────────────────────────────────────────────────');
    console.log('📊 ADAPTABILITY SCORE SUMMARY:');
    console.log(`   Unexpected events: ${unexpectedEventsCount}`);
    console.log(`   Abandoned tasks: ${abandonedCount}`);
    console.log(`   Creative solutions: ${creativeCount}`);
    console.log('───────────────────────────────────────────────────────────────');

    // Calculate averages
    let avgQuality = 0;
    let avgSpeed = 0;
    if (unexpectedEventsCount > 0) {
      avgQuality = qualitySum / unexpectedEventsCount;
      avgSpeed = speedSum / unexpectedEventsCount;
      console.log(`\n📈 Averages:`);
      console.log(`   Average Quality: ${avgQuality.toFixed(1)}`);
      console.log(`   Average Speed: ${avgSpeed.toFixed(1)}`);
    }

    // Calculate penalties and bonuses
    const abandonmentRate = unexpectedEventsCount > 0 ? abandonedCount / unexpectedEventsCount : 0;
    const abandonmentPenalty = abandonmentRate * 30;
    const creativityRate = unexpectedEventsCount > 0 ? creativeCount / unexpectedEventsCount : 0;
    const creativityBonus = creativityRate * 15;

    console.log(`\n📐 Adjustments:`);
    console.log(`   Abandonment rate: ${(abandonmentRate * 100).toFixed(1)}% → Penalty: -${abandonmentPenalty.toFixed(1)}`);
    console.log(`   Creativity rate: ${(creativityRate * 100).toFixed(1)}% → Bonus: +${creativityBonus.toFixed(1)}`);

    // Calculate base score (50% quality + 50% speed)
    let baseScore = Math.round((avgQuality * 0.5) + (avgSpeed * 0.5));
    console.log(`\n📊 Base Score: (${avgQuality.toFixed(1)} × 0.5) + (${avgSpeed.toFixed(1)} × 0.5) = ${baseScore}`);

    // Final score
    let adaptabilityScore = Math.max(0, Math.min(100, baseScore - abandonmentPenalty + creativityBonus));
    console.log(`\n🎯 Final Adaptability Score: ${baseScore} - ${abandonmentPenalty.toFixed(1)} + ${creativityBonus.toFixed(1)} = ${adaptabilityScore}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // ============================================
    // 8. Technical Score
    // ============================================
    let technicalScoreSum = 0;
    let technicalTasksCount = 0;
    const technicalBreakdown: any[] = [];

    for (let i = 0; i < templateTasks.length; i++) {
      const task = templateTasks[i];
      const isTechnical = task.type === 'technical' || task.type === 'code_editor' || task.type === 'code_execution';
      
      if (isTechnical) {
        technicalTasksCount++;
        const progress = taskProgress.find((tp: any) => tp.task_index === i);
        let techScore = 0;
        let techCodeAnalysis: any = null;
        
        if (progress?.answer) {
          // ✅ FIXED: Await the async method and use the result
          console.log(`📊 [Task ${i}] Calculating answer quality...`);
          console.log(`   - Has githubCommitUrl: ${!!progress.answer.githubCommitUrl}`);
          console.log(`   - Has inline code: ${!!progress.answer.code}`);
          console.log(`   - Has essay: ${!!progress.answer.essay}`);
          
          const qualityResult = await this.calculateAnswerQuality(progress.answer);
          
          // ✅ Debug: Log what we got back
          console.log(`   - Result codeQuality: ${qualityResult.codeQuality}`);
          console.log(`   - Result essayQuality: ${qualityResult.essayQuality}`);
          console.log(`   - Result completeness: ${qualityResult.completeness}`);
          console.log(`   - Result score: ${qualityResult.score}`);
          console.log(`   - Has githubAnalysis: ${!!qualityResult.githubAnalysis}`);
          console.log(`   - GitHub score: ${qualityResult.githubScore || 0}`);
          
          // ✅ Use codeQuality (which should come from either GitHub or inline code)
          techScore = qualityResult.codeQuality;
          
          techCodeAnalysis = {
            hasFunctions: qualityResult.details.codeQualityDetails?.hasFunctions || false,
            hasConditionals: qualityResult.details.codeQualityDetails?.hasConditionals || false,
            hasReturns: qualityResult.details.codeQualityDetails?.hasReturns || false,
            hasErrorHandling: qualityResult.details.codeQualityDetails?.hasErrorHandling || false,
            hasLoops: qualityResult.details.codeQualityDetails?.hasLoops || false,
            hasClasses: qualityResult.details.codeQualityDetails?.hasClasses || false,
            hasVariables: qualityResult.details.codeQualityDetails?.hasVariables || false,
            hasImports: qualityResult.details.codeQualityDetails?.hasImports || false,
            linesOfCode: qualityResult.details.codeQualityDetails?.linesOfCode || 0,
            codeLength: qualityResult.details.codeQualityDetails?.codeLength || 0,
            language: qualityResult.details.codeQualityDetails?.language || 'unknown',
            detectedFeatures: qualityResult.details.codeQualityDetails?.detectedFeatures || [],
            completed: progress.answer.completed === true
          };
          
          console.log(`   ✅ Final techScore: ${techScore}`);
        }
        
        technicalScoreSum += techScore;
        technicalBreakdown.push({
          task_index: i,
          task_title: task.title || task.task_name || `Task ${i + 1}`,
          technical_score: Math.round(techScore),
          has_code: !!progress?.answer?.code,
          code_analysis: techCodeAnalysis,
          completed: progress?.status === 'completed'
        });
      }
    }

    const technicalScore = technicalTasksCount > 0 ? Math.round(technicalScoreSum / technicalTasksCount) : 50;

  // ============================================
  // 9. Speed Score
  // ============================================
  let totalSpeedScoreSum = 0;
  let tasksWithTimeData = 0;
  let totalTasksForSpeed = 0;
  const speedTaskBreakdown: any[] = [];

  for (let i = 0; i < templateTasks.length; i++) {
    const task = templateTasks[i];
    const taskWeight = task.evaluation?.weight || task.priority || 1;
    const progress = taskProgress.find((tp: any) => tp.task_index === i);
    
    let taskSpeedScore = 0;
    let taskTimeSpent = 0;
    
    // ✅ FIXED: Get duration from task object (stored in templateTasks JSON)
    // The task.duration is in MINUTES (from your template: 180)
    // Convert to seconds for comparison
    const taskDurationMinutes = task.duration || task.duration_minutes || 30;
    let taskTimeLimit = taskDurationMinutes * 60;  // Convert to seconds
    
    let scoringMethod = 'not_completed';
    
    totalTasksForSpeed += taskWeight;
    
    if (progress?.status === 'completed') {
      if (progress?.started_at && progress?.completed_at) {
        taskTimeSpent = Math.floor((new Date(progress.completed_at).getTime() - new Date(progress.started_at).getTime()) / 1000);
        
        // ✅ BINARY SCORING: ON TIME = 100, LATE = 0
        if (taskTimeSpent <= taskTimeLimit) {
          taskSpeedScore = 100;
          scoringMethod = 'on_time';
          console.log(`   ✅ Task ${i + 1}: ON TIME (${Math.floor(taskTimeSpent / 60)}m ${taskTimeSpent % 60}s ≤ ${taskDurationMinutes}m) → Speed: 100`);
        } else {
          taskSpeedScore = 0;
          scoringMethod = 'late';
          console.log(`   ❌ Task ${i + 1}: LATE (${Math.floor(taskTimeSpent / 60)}m ${taskTimeSpent % 60}s > ${taskDurationMinutes}m) → Speed: 0`);
        }
        totalSpeedScoreSum += taskSpeedScore * taskWeight;
        tasksWithTimeData++;
      } else if (progress?.completed_at && !progress?.started_at) {
        taskSpeedScore = 50;
        totalSpeedScoreSum += taskSpeedScore * taskWeight;
        scoringMethod = 'partial_data';
        console.log(`   ⚠️ Task ${i + 1}: Completed but no start time → Speed: 50`);
      } else {
        taskSpeedScore = 40;
        totalSpeedScoreSum += taskSpeedScore * taskWeight;
        scoringMethod = 'no_time_data';
        console.log(`   ⚠️ Task ${i + 1}: Completed but no timing → Speed: 40`);
      }
    } else if (progress?.status === 'in_progress') {
      taskSpeedScore = 25;
      totalSpeedScoreSum += taskSpeedScore * taskWeight;
      scoringMethod = 'in_progress';
      console.log(`   🕐 Task ${i + 1}: IN PROGRESS → Speed: 25`);
    } else {
      taskSpeedScore = 0;
      scoringMethod = 'not_started';
      console.log(`   ⏸️ Task ${i + 1}: NOT STARTED → Speed: 0`);
    }
    
    speedTaskBreakdown.push({
      task_index: i,
      task_title: task.title || task.task_name || `Task ${i + 1}`,
      weight: taskWeight,
      status: progress?.status || 'not_started',
      duration_minutes: taskDurationMinutes,
      time_spent_seconds: taskTimeSpent,
      time_spent_formatted: taskTimeSpent > 0 ? `${Math.floor(taskTimeSpent / 60)}m ${taskTimeSpent % 60}s` : 'N/A',
      time_limit_seconds: taskTimeLimit,
      time_limit_formatted: `${taskDurationMinutes}m`,
      speed_score: Math.round(taskSpeedScore),
      weighted_contribution: (taskSpeedScore * taskWeight).toFixed(2),
      scoring_method: scoringMethod
    });
  }

  let weightedSpeedScore = 0;
  if (totalTasksForSpeed > 0) {
    weightedSpeedScore = Math.round(totalSpeedScoreSum / totalTasksForSpeed);
    console.log(`\n📊 Weighted Speed Score: ${weightedSpeedScore}%`);
  }

  const sessionSpeedScore = Math.max(0, Math.min(100, (1 - (totalTimeSeconds / timeLimitSeconds)) * 100));
  const speedScore = tasksWithTimeData > 0 ? weightedSpeedScore : sessionSpeedScore;

  const speedBreakdown = {
    total_time_seconds: totalTimeSeconds,
    total_time_formatted: `${Math.floor(totalTimeSeconds / 60)}m ${totalTimeSeconds % 60}s`,
    time_limit_seconds: timeLimitSeconds,
    time_limit_formatted: `${Math.floor(timeLimitSeconds / 60)}m ${timeLimitSeconds % 60}s`,
    time_remaining_seconds: Math.max(0, timeLimitSeconds - totalTimeSeconds),
    time_remaining_formatted: Math.max(0, timeLimitSeconds - totalTimeSeconds) > 0 
      ? `${Math.floor((timeLimitSeconds - totalTimeSeconds) / 60)}m ${(timeLimitSeconds - totalTimeSeconds) % 60}s` : 'EXPIRED',
    percentage_used: Math.min(100, Math.round((totalTimeSeconds / timeLimitSeconds) * 100)),
    speed_score: speedScore,
    weighted_speed_score: weightedSpeedScore,
    session_speed_score: sessionSpeedScore,
    tasks_with_time_data: tasksWithTimeData,
    total_tasks_weighted: totalTasksForSpeed,
    per_task_speed: speedTaskBreakdown,
    calculation_method: tasksWithTimeData > 0 ? 'weighted_per_task' : 'session_based'
  };
    // ============================================
    // 10. Quality Score
    // ============================================
    const qualityScore = Math.round((technicalScore + punctualityScore + adaptabilityScore) / 3);
    
    const qualityBreakdown = {
      technical: { score: technicalScore, weight: 33.33, contribution: ((technicalScore * 0.3333)).toFixed(2) },
      punctuality: { score: punctualityScore, weight: 33.33, contribution: ((punctualityScore * 0.3333)).toFixed(2) },
      adaptability: { score: adaptabilityScore, weight: 33.33, contribution: ((adaptabilityScore * 0.3333)).toFixed(2) },
      total: qualityScore
    };

    // ============================================
    // 11. Behavioral Score
    // ============================================
    const behavioralScore = Math.round((adaptabilityScore + calculatedCommunicationScore) / 2);
    
    const behavioralBreakdown = {
      adaptability: { score: adaptabilityScore, weight: 50, contribution: ((adaptabilityScore * 0.5)).toFixed(2) },
      communication: { score: calculatedCommunicationScore, weight: 50, contribution: ((calculatedCommunicationScore * 0.5)).toFixed(2) },
      total: behavioralScore
    };

    // ============================================
    // 12. Collaboration Score
    // ============================================
    let collaborationScore = 0;

    if (communicationScoreResult && communicationScoreResult.messageCount > 0) {
        const messageCount = communicationScoreResult.messageCount;
        const candidateMessages = communicationScoreResult.candidateMessages;
        const recruiterMessages = communicationScoreResult.recruiterMessages;
        
        // Factor 1: Total interaction volume (max 40 points)
        let volumeScore = 0;
        if (messageCount >= 12) volumeScore = 40;
        else if (messageCount >= 8) volumeScore = 30;
        else if (messageCount >= 4) volumeScore = 20;
        else if (messageCount >= 2) volumeScore = 10;
        else if (messageCount >= 1) volumeScore = 5;
        
        // Factor 2: Balanced conversation (max 30 points)
        // Both parties should participate roughly equally
        let balanceScore = 0;
        const total = candidateMessages + recruiterMessages;
        if (total > 0) {
            const ratio = Math.min(candidateMessages, recruiterMessages) / Math.max(candidateMessages, recruiterMessages, 1);
            balanceScore = Math.round(ratio * 30);
        }
        
        // Factor 3: Meaningful responses (max 30 points)
        // Check if candidate responded to recruiter questions
        let responsivenessScore = 0;
        // You could track question/answer pairs or use the avgResponseTime
        if (communicationScoreResult.classifierAnalysis) {
            // If you have classifier data, use it
            responsivenessScore = communicationScoreResult.score || 20;
        } else {
            // Fallback: if candidate has messages, give partial credit
            responsivenessScore = candidateMessages > 0 ? 20 : 0;
        }
        
        collaborationScore = Math.min(100, volumeScore + balanceScore + responsivenessScore);
        
        console.log('📊 Collaboration Score Breakdown:', {
            messageCount,
            candidateMessages,
            recruiterMessages,
            volumeScore,
            balanceScore,
            responsivenessScore,
            collaborationScore
        });
    } else {
        collaborationScore = 0;
        console.log('📊 No chat messages - collaboration score = 0');
    }
    

    // ============================================
    // 13. Final Overall Score
    // ============================================
    const weights = scoringRubric.weights || {
      quality: 0.60,
      speed: 0.15,
      behavioral: 0.10,
      github: 0.15
    };
    
    const weightedScores = {
      quality: { score: qualityScore, weight: weights.quality, contribution: (qualityScore * weights.quality).toFixed(2) },
      speed: { score: speedScore, weight: weights.speed, contribution: (speedScore * weights.speed).toFixed(2) },
      behavioral: { score: behavioralScore, weight: weights.behavioral, contribution: (behavioralScore * weights.behavioral).toFixed(2) },
      github: { score: githubScore, weight: weights.github, contribution: (githubScore * weights.github).toFixed(2) }
    };
    
    const overallScore = Math.round(
      (qualityScore * weights.quality) +
      (speedScore * weights.speed) +
      (behavioralScore * weights.behavioral) +
      (githubScore * weights.github)
    );

    // ============================================
    // 14. Pass/Fail
    // ============================================
    const passingScore = scoringRubric.passingScore || 70;
    const passed = overallScore >= passingScore;

    // ============================================
    // 15. Strengths & Improvements
    // ============================================
    const strengths = [];
    const improvements = [];
    
    if (completionRate >= 80) strengths.push(`✅ High task completion rate (${Math.round(completionRate)}% of ${templateTasks.length} tasks completed)`);
    else if (completionRate < 60) improvements.push(`⚠️ Complete more tasks (${Math.round(completionRate)}% completion rate, target: 80%)`);
    
    if (punctualityScore >= 80) strengths.push(`✅ Excellent time management (${punctualityScore}% punctuality score)`);
    else if (punctualityScore < 60) improvements.push(`⚠️ Improve time management (${punctualityScore}% punctuality score, target: 80%)`);
    
    if (technicalScore >= 80) strengths.push(`✅ Strong technical skills (${technicalScore}% technical score)`);
    else if (technicalScore < 60) improvements.push(`⚠️ Improve technical implementation (${technicalScore}% technical score, target: 80%)`);
    
    if (qualityScore >= 80) strengths.push(`✅ High quality deliverables (${qualityScore}% quality score)`);
    else if (qualityScore < 60) improvements.push(`⚠️ Focus on quality of work (${qualityScore}% quality score, target: 80%)`);
    
    if (speedScore >= 80) strengths.push(`✅ Fast execution speed (${speedScore}% speed score)`);
    else if (speedScore < 60) improvements.push(`⚠️ Complete tasks faster (${speedScore}% speed score, target: 80%)`);
    
    if (averageTaskScore >= 80) strengths.push(`✅ Consistent performance across tasks (${Math.round(averageTaskScore)}% average task score)`);
    else if (averageTaskScore < 60) improvements.push(`⚠️ Improve consistency across tasks (${Math.round(averageTaskScore)}% average task score, target: 80%)`);
    
    if (calculatedCommunicationScore >= 80) strengths.push(`✅ Strong communication skills (${calculatedCommunicationScore}% communication score)`);
    else if (calculatedCommunicationScore < 60) improvements.push(`⚠️ Improve communication (${calculatedCommunicationScore}% communication score, target: 80%)`);
    
    if (githubScore >= 80) strengths.push(`✅ Excellent GitHub repository structure (${githubScore}% GitHub score)`);
    else if (githubScore >= 50) strengths.push(`✅ Adequate GitHub setup (${githubScore}% GitHub score)`);
    else if (githubScore > 0) improvements.push(`⚠️ Improve GitHub repository documentation and structure (${githubScore}% GitHub score, target: 80%)`);

    if (strengths.length === 0) strengths.push('✅ Completed the simulation');
    if (improvements.length === 0 && overallScore < 80) improvements.push('⚠️ Review all tasks and ensure completeness for a higher score');

    // ============================================
    // 16. RETURN COMPLETE ANALYSIS WITH ALL DETAILS
    // ============================================
    const result = {
      session_id: sessionId,
      simulation_name: session.simulation_name,
      simulation_type: session.simulation_type,
      difficulty: session.difficulty,
      job_title: session.job_title,
      company_name: session.company_name,
      
      summary: {
        total_tasks: templateTasks.length,
        completed_tasks: completedTasks.length,
        in_progress_tasks: inProgressTasks.length,
        not_started_tasks: notStartedTasks.length,
        completion_rate: Math.round(completionRate),
        total_time_seconds: totalTimeSeconds,
        time_limit_seconds: timeLimitSeconds,
        time_remaining_seconds: Math.max(0, timeLimitSeconds - totalTimeSeconds),
        time_used_formatted: `${Math.floor(totalTimeSeconds / 60)}m ${totalTimeSeconds % 60}s`,
        time_limit_formatted: `${Math.floor(timeLimitSeconds / 60)}m ${timeLimitSeconds % 60}s`,
        passed: passed,
        passing_score: passingScore,
        total_points_earned: Math.round(totalPointsEarned),
        total_points_possible: totalPointsPossible,
        overall_percentage: Math.round(overallTaskPercentage)
      },
      
      scores: {
        overall: overallScore,
        quality: qualityScore,
        technical: technicalScore,
        punctuality: punctualityScore,
        adaptability: adaptabilityScore,
        speed: speedScore,
        behavioral: behavioralScore,
        communication: calculatedCommunicationScore,
        collaboration: collaborationScore,
        github: githubScore,
        completion_rate: Math.round(completionRate),
        average_task_score: Math.round(averageTaskScore),
        weighted_breakdown: weightedScores,
        quality_breakdown: qualityBreakdown,
        behavioral_breakdown: behavioralBreakdown,
        speed_breakdown: speedBreakdown,
        punctuality_breakdown: { 
          total_weight: totalWeightSum, 
          on_time_weight: onTimeWeightSum,
          partial_credit_sum: parseFloat(partialCreditSum.toFixed(2)),
          total_earned: parseFloat((onTimeWeightSum + partialCreditSum).toFixed(2)),
          score: punctualityScore,
          scoring_method: 'partial_credit',
          tasks: punctualityBreakdown 
        },
        adaptability_breakdown: { 
  events_count: unexpectedEventsCount, 
  abandoned_count: abandonedCount,
  creative_solutions_count: creativeCount,
  abandonment_rate: Math.round(abandonmentRate * 100),
  creativity_rate: Math.round(creativityRate * 100),
  base_score: baseScore,
  abandonment_penalty: Math.round(abandonmentPenalty),
  creativity_bonus: Math.round(creativityBonus),
  avg_response_quality: Math.round(avgQuality),
  avg_response_speed: Math.round(avgSpeed),
  score: adaptabilityScore,
  assessment: (() => {
    if (unexpectedEventsCount === 0) return 'No unexpected events to assess';
    if (abandonmentRate > 0.5) return 'Poor - abandoned most unexpected tasks';
    if (abandonmentRate > 0.3) return 'Needs improvement - gave up on several challenges';
    if (creativityRate > 0.7 && adaptabilityScore >= 80) return 'Excellent - highly adaptable and creative';
    if (creativityRate > 0.5 && adaptabilityScore >= 70) return 'Good - handled unexpected challenges well';
    if (adaptabilityScore >= 60) return 'Satisfactory - managed unexpected tasks adequately';
    return 'Needs improvement - struggled with unexpected changes';
  })(),
  tasks: adaptabilityBreakdown
},
        technical_breakdown: { 
          tasks_count: technicalTasksCount, 
          total_score: technicalScoreSum, 
          average_score: technicalScore, 
          tasks: technicalBreakdown 
        }
      },
      
      task_analysis: taskCompletionAnalysis,
      
      feedback: {
        strengths: strengths,
        improvements: improvements,
        summary: passed 
          ? `🎉 Congratulations! You passed the ${session.simulation_name} simulation with a score of ${overallScore}%.`
          : `📚 You scored ${overallScore}% on the ${session.simulation_name} simulation. The passing threshold is ${passingScore}%.`,
        detailed_feedback: passed
          ? `Excellent work! You demonstrated strong ${strengths.slice(0, 2).join(', ')}. Keep up the great performance!`
          : `Focus on improving: ${improvements.slice(0, 3).join(', ')}. Review the tasks and try again.`
      },
      
      // ============================================
      // ✅ GITHUB ANALYSIS - FULL DETAILS
      // ============================================
      github_analysis: {
        has_repo: !!githubRepoInfo,
        score: githubScore,
        repo_info: githubRepoInfo,
        detailed_marks: githubDetailedMarks,
        full_analysis: githubAnalysis,
        breakdown: githubAnalysis?.breakdown || null,
        stats: githubAnalysis?.stats || null,
        per_commit_detail: githubAnalysis?.perCommitDetail || null,
        task_implementation_report: githubAnalysis?.taskImplementationReport || null,
        matching_summary: githubAnalysis?.matchingSummary || null
      },
      
      // ============================================
      // ✅ COMMUNICATION ANALYSIS - FULL DETAILS (CLASSIFIER + GROQ)
      // ============================================
      communication_analysis: communicationScoreResult ? {
        score: communicationScoreResult.score,
        message_count: communicationScoreResult.messageCount,
        candidate_messages: communicationScoreResult.candidateMessages,
        recruiter_messages: communicationScoreResult.recruiterMessages,
        has_chat: communicationScoreResult.messageCount > 0,
        
        // ✅ FULL CLASSIFIER API ANALYSIS
        classifier_analysis: communicationScoreResult.classifierAnalysis ? {
          dominant_style: communicationScoreResult.classifierAnalysis.dominant_style,
          style_counts: communicationScoreResult.classifierAnalysis.style_counts,
          total_messages: communicationScoreResult.classifierAnalysis.total_messages,
          average_confidence: communicationScoreResult.classifierAnalysis.average_confidence,
          recommendation: communicationScoreResult.classifierAnalysis.recommendation,
          raw_response: communicationScoreResult.classifierAnalysis
        } : null,
        
        // ✅ FULL GROQ AI ANALYSIS
        groq_analysis: communicationScoreResult.groqAnalysis ? {
          message_tone: communicationScoreResult.groqAnalysis.message_tone,
          clarity_level: communicationScoreResult.groqAnalysis.clarity_level,
          professionalism_level: communicationScoreResult.groqAnalysis.professionalism_level,
          engagement_level: communicationScoreResult.groqAnalysis.engagement_level,
          overall_assessment: communicationScoreResult.groqAnalysis.overall_assessment,
          task_discussion_summary: communicationScoreResult.groqAnalysis.task_discussion_summary,
          questions_asked: communicationScoreResult.groqAnalysis.questions_asked || [],
          answers_provided: communicationScoreResult.groqAnalysis.answers_provided || [],
          task_references: communicationScoreResult.groqAnalysis.task_references || [],
          key_insights: communicationScoreResult.groqAnalysis.key_insights || [],
          strengths: communicationScoreResult.groqAnalysis.strengths || [],
          areas_for_improvement: communicationScoreResult.groqAnalysis.areas_for_improvement || [],
          raw_response: communicationScoreResult.groqAnalysis
        } : null,
        
        // ✅ COMBINED INSIGHTS (Easy access)
        combined_insights: communicationScoreResult.combinedInsights || {
          taskDiscussionSummary: '',
          messageTone: '',
          keyInsights: [],
          strengths: [],
          areasForImprovement: [],
          questionsAsked: [],
          answersProvided: [],
          taskReferences: []
        },
        
        // ✅ CANDIDATE SUMMARY
        candidate_summary: communicationScoreResult.analysis?.candidate_summary || '',
        
        // ✅ METHOD USED
        analysis_method: communicationScoreResult.analysis?.method || 'unknown',
        
        // ✅ RAW ANALYSIS (fallback or combined)
        details: communicationScoreResult.analysis
        
      } : {
        score: 0,
        message_count: 0,
        candidate_messages: 0,
        recruiter_messages: 0,
        has_chat: false,
        classifier_analysis: null,
        groq_analysis: null,
        combined_insights: {
          taskDiscussionSummary: '',
          messageTone: '',
          keyInsights: [],
          strengths: [],
          areasForImprovement: [],
          questionsAsked: [],
          answersProvided: [],
          taskReferences: []
        },
        candidate_summary: 'No chat messages available for analysis',
        analysis_method: 'none',
        details: { message: 'No chat messages available for analysis' }
      },
      
      scoring_config: {
        weights: weights,
        passing_score: passingScore,
        max_score: 100,
        scoring_rubric: scoringRubric
      },
      
      raw_data: {
        simulation_record_id: session.simulation_record_id,
        session_started_at: session.started_at,
        session_completed_at: session.completed_at || new Date().toISOString(),
        time_spent_seconds: totalTimeSeconds,
        total_tasks: templateTasks.length,
        completed_tasks_count: completedTasks.length,
        task_progress_count: taskProgress.length,
        has_github_repo: !!session.github_links
      },
      
      generated_at: new Date().toISOString(),
      session_status: session.status
    };
    
    console.log('📊 [calculateFullSessionScores] Final Result:', result);
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [calculateFullSessionScores] COMPLETED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 FINAL SCORES SUMMARY:', {
      sessionId,
      overallScore,
      passed,
      completionRate: `${Math.round(completionRate)}%`,
      tasksCompleted: `${completedTasks.length}/${templateTasks.length}`,
      technicalScore,
      punctualityScore,
      adaptabilityScore,
      speedScore,
      qualityScore,
      behavioralScore,
      githubScore,
      communicationScore: calculatedCommunicationScore,
      collaborationScore,
      hasGithubAnalysis: !!githubAnalysis,
      hasClassifierAnalysis: !!communicationScoreResult?.classifierAnalysis,
      hasGroqAnalysis: !!communicationScoreResult?.groqAnalysis
    });
    console.log('📊 [calculateFullSessionScores] Final Scores:',{
      sessionId,
      overallScore,
      passed,
      completionRate: `${Math.round(completionRate)}%`,
      tasksCompleted: `${completedTasks.length}/${templateTasks.length}`,
      technicalScore,
      punctualityScore,
      adaptabilityScore,
      speedScore,
      qualityScore,
      behavioralScore,
      githubScore,
      communicationScore: calculatedCommunicationScore,
      collaborationScore,
      hasGithubAnalysis: !!githubAnalysis,
      hasClassifierAnalysis: !!communicationScoreResult?.classifierAnalysis,
      hasGroqAnalysis: !!communicationScoreResult?.groqAnalysis
    });
    return result;
    
  } catch (error: any) {
    console.error('❌ [calculateFullSessionScores] ERROR:', error);
    throw error;
  }
}

/**
 * Extract GitHub metrics from repository data
 */
/**
 * Extract GitHub metrics from repository data
 * Includes commit counts from ALL branches and file change details per commit
 */
private extractGitHubMetrics(repoData: any) {
  console.log('📊 [extractGitHubMetrics] Extracting metrics...');
  
  // ✅ USE TOTAL ACROSS ALL BRANCHES if available
  const commitCount = repoData.commits?.totalAcrossBranches || repoData.commits?.total || 0;
  
  console.log(`📊 Using commit count: ${commitCount} (from ${repoData.commits?.totalAcrossBranches ? 'ALL branches' : 'default branch only'})`);
  
  const fileStructure = repoData.code?.structure || [];
  
  // Better README detection - check multiple sources
  const hasReadme = 
    repoData.community?.hasReadme === true ||
    repoData.repository?.has_readme === true ||
    repoData.readme !== null ||
    fileStructure.some((f: any) => 
      f.path === 'README.md' || 
      f.path === 'README' || 
      f.path?.toLowerCase().includes('readme')
    );
  
  // Detect code files (source code files only)
  const codeFiles = fileStructure.filter((f: any) => {
    const path = f.path || '';
    return f.type === 'blob' && (
      path.endsWith('.js') || path.endsWith('.ts') || 
      path.endsWith('.jsx') || path.endsWith('.tsx') ||
      path.endsWith('.py') || path.endsWith('.java') ||
      path.endsWith('.go') || path.endsWith('.rs') ||
      path.endsWith('.cpp') || path.endsWith('.c') ||
      path.endsWith('.html') || path.endsWith('.css') ||
      path.endsWith('.json') || path.endsWith('.md')
    );
  });
  
  const codeFilesCount = codeFiles.length;
  const totalLinesOfCode = codeFiles.reduce((sum: number, f: any) => sum + (f.size || 0), 0);
  
  // Detect config files
  const hasConfigFile = fileStructure.some((f: any) =>
    f.path === 'package.json' || f.path === 'requirements.txt' ||
    f.path === 'go.mod' || f.path === 'Cargo.toml' ||
    f.path === 'pyproject.toml' || f.path === 'setup.py' ||
    f.path === 'tsconfig.json' || f.path === '.eslintrc' ||
    f.path === 'webpack.config.js' || f.path === 'vite.config.js'
  );
  
  // Detect test files
  const hasTests = fileStructure.some((f: any) =>
    f.path?.includes('test') || f.path?.includes('spec') || 
    f.path?.includes('__tests__') || f.path?.endsWith('.test.js') ||
    f.path?.endsWith('.spec.ts')
  );
  
  // ============================================
  // ✅ PROCESS COMMITS WITH FILE CHANGE DETAILS
  // ============================================
  // Get detailed commits (from getAllBranchCommits + getCommitWithChanges)
  const detailedCommits = repoData.commits?.detailedCommits || [];
  const recentCommitsList = repoData.commits?.recentCommits || [];
  
  // Combine and process commits
  const processedCommits = (detailedCommits.length > 0 ? detailedCommits : recentCommitsList).map((commit: any) => {
    // Get file change details
    const files = commit.files || [];
    const stats = commit.stats || { additions: 0, deletions: 0, total: 0 };
    
    // Calculate totals from files if stats not available
    let totalAdditions = stats.additions || 0;
    let totalDeletions = stats.deletions || 0;
    let totalChanges = stats.total || 0;
    
    if (files.length > 0 && totalAdditions === 0) {
      totalAdditions = files.reduce((sum: number, f: any) => sum + (f.additions || 0), 0);
      totalDeletions = files.reduce((sum: number, f: any) => sum + (f.deletions || 0), 0);
      totalChanges = totalAdditions + totalDeletions;
    }
    
    // ✅ THIS IS WHAT YOU WANT - FILE CHANGES PER COMMIT
    const changedFiles = files.map((file: any) => ({
      filename: file.filename,                    // File name (e.g., "src/app.js")
      status: file.status,                        // 'added', 'modified', 'removed', 'renamed'
      additions: file.additions || 0,             // Lines added in this file
      deletions: file.deletions || 0,             // Lines deleted in this file
      changes: (file.additions || 0) + (file.deletions || 0), // Total changes in this file
      patch: file.patch || null,                  // THE ACTUAL DIFF CONTENT!
      raw_url: file.raw_url,
      blob_url: file.blob_url
    }));
    
    return {
      sha: commit.sha,
      shortSha: commit.shortSha || commit.sha?.substring(0, 7),
      message: commit.message,
      author: commit.author,
      authorLogin: commit.authorLogin,
      date: commit.date,
      url: commit.url,
      // Commit statistics
      stats: {
        additions: totalAdditions,
        deletions: totalDeletions,
        total: totalChanges,
        filesChanged: files.length
      },
      // ✅ FILE CHANGES DETAILS (what you wanted)
      filesChanged: files.length,
      linesAdded: totalAdditions,
      linesDeleted: totalDeletions,
      netChange: totalAdditions - totalDeletions,
      // ✅ DETAILED LIST OF CHANGED FILES
      changedFiles: changedFiles
    };
  });
  
  const metrics = {
    // Commit metrics from ALL branches
    commitCount: commitCount,
    commitsPerBranch: repoData.commits?.perBranch || {},
    commitFrequency: repoData.commits?.commitFrequency || 0,
    commitStreak: repoData.commits?.longestStreak || 0,
    
    // File structure metrics
    totalFiles: repoData.code?.totalFiles || 0,
    codeFilesCount: codeFilesCount,
    totalLinesOfCode: totalLinesOfCode,
    
    // Documentation & config metrics
    hasReadme: hasReadme,
    hasConfigFile: hasConfigFile,
    hasGitignore: fileStructure.some((f: any) => f.path === '.gitignore'),
    hasTests: hasTests,
    
    // Language metrics
    primaryLanguage: repoData.languages?.primary || 'Unknown',
    languages: repoData.languages?.breakdown || [],
    
    // ✅ FULL COMMIT DETAILS WITH FILE CHANGES
    recentCommits: processedCommits,
    
    // Author metrics
    topAuthors: repoData.commits?.topAuthors || [],
    firstCommitDate: repoData.commits?.firstCommitDate || null,
    lastCommitDate: repoData.commits?.lastCommitDate || null,
    averageCommitsPerWeek: repoData.commits?.averageCommitsPerWeek || 0,
    
    // Summary statistics
    totalAdditions: processedCommits.reduce((sum: number, c: any) => sum + c.linesAdded, 0),
    totalDeletions: processedCommits.reduce((sum: number, c: any) => sum + c.linesDeleted, 0),
    totalFilesChanged: processedCommits.reduce((sum: number, c: any) => sum + c.filesChanged, 0)
  };
  
  console.log('📊 Metrics extracted:', {
    commitCount: metrics.commitCount,
    commitsPerBranch: Object.keys(metrics.commitsPerBranch).length,
    codeFilesCount: metrics.codeFilesCount,
    hasReadme: metrics.hasReadme,
    hasConfigFile: metrics.hasConfigFile,
    hasGitignore: metrics.hasGitignore,
    totalAdditions: metrics.totalAdditions,
    totalDeletions: metrics.totalDeletions,
    totalFilesChanged: metrics.totalFilesChanged,
    recentCommitsWithChanges: metrics.recentCommits.filter((c: any) => c.filesChanged > 0).length
  });
  
  return metrics;
}

/**
 * Calculate progressive score based on commit count and code quality
 */
/**
 * Calculate progressive GitHub score with detailed breakdown per parameter
 * Shows exactly how many points are awarded for each category
 * 
 * @param metrics - GitHub repository metrics
 * @returns Score and detailed breakdown with marks per parameter
 */
private calculateProgressiveScore(metrics: any) {
  let score = 0;
  const breakdown = [];
  const detailedMarks = {
    commits: { earned: 0, max: 50, details: '' },
    readme: { earned: 0, max: 15, details: '' },
    configFile: { earned: 0, max: 10, details: '' },
    gitignore: { earned: 0, max: 5, details: '' },
    codeFiles: { earned: 0, max: 20, details: '' }
  };
  
  console.log('\n📊 GITHUB SCORE CALCULATION (Progressive 1-Day Mode):');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   ⚠️ NOTE: Frequency and streak penalties are IGNORED');
  console.log('   📈 1 commit = ~30% | 10+ commits = ~90%');
  console.log('───────────────────────────────────────────────────────────────');
  
  // ============================================
  // 1. COMMIT COUNT - 50% (50 points max)
  // ============================================
  console.log(`   📝 Commit count: ${metrics.commitCount}`);
  
  if (metrics.commitCount >= 10) {
    detailedMarks.commits.earned = 50;
    detailedMarks.commits.details = `10+ commits (${metrics.commitCount} commits) - EXCELLENT`;
    score += 50;
    breakdown.push(`✅ +50: 10+ commits (${metrics.commitCount} commits) - EXCELLENT`);
    console.log(`   → +50/50: EXCELLENT (10+ commits)`);
  } else if (metrics.commitCount >= 8) {
    detailedMarks.commits.earned = 45;
    detailedMarks.commits.details = `8-9 commits (${metrics.commitCount} commits) - VERY GOOD`;
    score += 45;
    breakdown.push(`✅ +45: 8-9 commits (${metrics.commitCount} commits) - VERY GOOD`);
    console.log(`   → +45/50: VERY GOOD (8-9 commits)`);
  } else if (metrics.commitCount >= 6) {
    detailedMarks.commits.earned = 40;
    detailedMarks.commits.details = `6-7 commits (${metrics.commitCount} commits) - GOOD`;
    score += 40;
    breakdown.push(`✅ +40: 6-7 commits (${metrics.commitCount} commits) - GOOD`);
    console.log(`   → +40/50: GOOD (6-7 commits)`);
  } else if (metrics.commitCount >= 4) {
    detailedMarks.commits.earned = 30;
    detailedMarks.commits.details = `4-5 commits (${metrics.commitCount} commits) - ABOVE AVERAGE`;
    score += 30;
    breakdown.push(`✅ +30: 4-5 commits (${metrics.commitCount} commits) - ABOVE AVERAGE`);
    console.log(`   → +30/50: ABOVE AVERAGE (4-5 commits)`);
  } else if (metrics.commitCount >= 2) {
    detailedMarks.commits.earned = 20;
    detailedMarks.commits.details = `2-3 commits (${metrics.commitCount} commits) - AVERAGE`;
    score += 20;
    breakdown.push(`✅ +20: 2-3 commits (${metrics.commitCount} commits) - AVERAGE`);
    console.log(`   → +20/50: AVERAGE (2-3 commits)`);
  } else if (metrics.commitCount >= 1) {
    detailedMarks.commits.earned = 10;
    detailedMarks.commits.details = `1 commit (${metrics.commitCount} commits) - MINIMAL`;
    score += 10;
    breakdown.push(`✅ +10: 1 commit (${metrics.commitCount} commits) - MINIMAL`);
    console.log(`   → +10/50: MINIMAL (1 commit)`);
  } else {
    detailedMarks.commits.earned = 0;
    detailedMarks.commits.details = `No commits (${metrics.commitCount} commits)`;
    breakdown.push('❌ +0: No commits');
    console.log(`   → +0/50: No commits`);
  }
  
  // ============================================
  // SKIPPED: Frequency and streak (0 points)
  // ============================================
  console.log(`   ⚠️ Commit frequency (${metrics.commitFrequency.toFixed(2)}/day) - IGNORED (0 points, 1-day simulation)`);
  console.log(`   ⚠️ Commit streak (${metrics.commitStreak} days) - IGNORED (0 points, 1-day simulation)`);
  console.log(`   ⚠️ Reason: Candidate may have completed all work in a few hours`);
  
  // ============================================
  // 2. README FILE - 15% (15 points max)
  // ============================================
  console.log(`   📖 Has README: ${metrics.hasReadme}`);
  if (metrics.hasReadme) {
    detailedMarks.readme.earned = 15;
    detailedMarks.readme.details = 'README.md file present';
    score += 15;
    breakdown.push('✅ +15: Has README');
    console.log(`   → +15/15: README present`);
  } else {
    detailedMarks.readme.earned = 0;
    detailedMarks.readme.details = 'Missing README.md file';
    breakdown.push('❌ +0: Missing README');
    console.log(`   → +0/15: Missing README`);
  }
  
  // ============================================
  // 3. CONFIGURATION FILE - 10% (10 points max)
  // ============================================
  console.log(`   ⚙️ Has config file: ${metrics.hasConfigFile}`);
  if (metrics.hasConfigFile) {
    detailedMarks.configFile.earned = 10;
    detailedMarks.configFile.details = 'Config file present (package.json, requirements.txt, etc.)';
    score += 10;
    breakdown.push('✅ +10: Has config file');
    console.log(`   → +10/10: Config file present`);
  } else {
    detailedMarks.configFile.earned = 0;
    detailedMarks.configFile.details = 'No config file found';
    breakdown.push('❌ +0: Missing config file');
    console.log(`   → +0/10: Missing config file`);
  }
  
  // ============================================
  // 4. GITIGNORE FILE - 5% (5 points max)
  // ============================================
  console.log(`   🚫 Has .gitignore: ${metrics.hasGitignore}`);
  if (metrics.hasGitignore) {
    detailedMarks.gitignore.earned = 5;
    detailedMarks.gitignore.details = '.gitignore file present';
    score += 5;
    breakdown.push('✅ +5: Has .gitignore');
    console.log(`   → +5/5: .gitignore present`);
  } else {
    detailedMarks.gitignore.earned = 0;
    detailedMarks.gitignore.details = 'No .gitignore file found';
    breakdown.push('❌ +0: Missing .gitignore');
    console.log(`   → +0/5: Missing .gitignore`);
  }
  
  // ============================================
  // 5. CODE FILES - 20% (20 points max) - PROGRESSIVE
  // ============================================
  console.log(`   💻 Code files count: ${metrics.codeFilesCount}`);
  if (metrics.codeFilesCount >= 15) {
    detailedMarks.codeFiles.earned = 20;
    detailedMarks.codeFiles.details = `Excellent code structure (${metrics.codeFilesCount} files)`;
    score += 20;
    breakdown.push(`✅ +20: Excellent code structure (${metrics.codeFilesCount} files)`);
    console.log(`   → +20/20: EXCELLENT (15+ files)`);
  } else if (metrics.codeFilesCount >= 10) {
    detailedMarks.codeFiles.earned = 16;
    detailedMarks.codeFiles.details = `Great code structure (${metrics.codeFilesCount} files)`;
    score += 16;
    breakdown.push(`✅ +16: Great code structure (${metrics.codeFilesCount} files)`);
    console.log(`   → +16/20: GREAT (10-14 files)`);
  } else if (metrics.codeFilesCount >= 6) {
    detailedMarks.codeFiles.earned = 12;
    detailedMarks.codeFiles.details = `Good code structure (${metrics.codeFilesCount} files)`;
    score += 12;
    breakdown.push(`✅ +12: Good code structure (${metrics.codeFilesCount} files)`);
    console.log(`   → +12/20: GOOD (6-9 files)`);
  } else if (metrics.codeFilesCount >= 3) {
    detailedMarks.codeFiles.earned = 8;
    detailedMarks.codeFiles.details = `Adequate code structure (${metrics.codeFilesCount} files)`;
    score += 8;
    breakdown.push(`✅ +8: Adequate code structure (${metrics.codeFilesCount} files)`);
    console.log(`   → +8/20: ADEQUATE (3-5 files)`);
  } else if (metrics.codeFilesCount >= 1) {
    detailedMarks.codeFiles.earned = 4;
    detailedMarks.codeFiles.details = `Minimal code (${metrics.codeFilesCount} files)`;
    score += 4;
    breakdown.push(`✅ +4: Minimal code (${metrics.codeFilesCount} files)`);
    console.log(`   → +4/20: MINIMAL (1-2 files)`);
  } else {
    detailedMarks.codeFiles.earned = 0;
    detailedMarks.codeFiles.details = `No code files (${metrics.codeFilesCount} files)`;
    breakdown.push(`❌ +0: No code files`);
    console.log(`   → +0/20: No code files`);
  }
  
  // ============================================
  // TESTS REQUIREMENT - SKIPPED (0 points)
  // ============================================
  console.log(`   🧪 Tests requirement: SKIPPED (0 points, not required for simulation)`);
  
  // ============================================
  // FINAL SCORE CALCULATION
  // ============================================
  const finalScore = Math.min(100, score);
  
  // Calculate total possible points
  const totalPossiblePoints = 
    detailedMarks.commits.max + 
    detailedMarks.readme.max + 
    detailedMarks.configFile.max + 
    detailedMarks.gitignore.max + 
    detailedMarks.codeFiles.max;
  
  console.log('\n📊 GITHUB SCORE DETAILED BREAKDOWN:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   📝 Commits:        ${detailedMarks.commits.earned}/${detailedMarks.commits.max} points - ${detailedMarks.commits.details}`);
  console.log(`   📖 README:         ${detailedMarks.readme.earned}/${detailedMarks.readme.max} points - ${detailedMarks.readme.details}`);
  console.log(`   ⚙️ Config File:    ${detailedMarks.configFile.earned}/${detailedMarks.configFile.max} points - ${detailedMarks.configFile.details}`);
  console.log(`   🚫 .gitignore:     ${detailedMarks.gitignore.earned}/${detailedMarks.gitignore.max} points - ${detailedMarks.gitignore.details}`);
  console.log(`   💻 Code Files:     ${detailedMarks.codeFiles.earned}/${detailedMarks.codeFiles.max} points - ${detailedMarks.codeFiles.details}`);
  console.log(`   ───────────────────────────────────────────────────────────`);
  console.log(`   📊 TOTAL:          ${finalScore}/${totalPossiblePoints} points (${finalScore}%)`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  return {
    score: finalScore,
    analysis: {
      analyzed: true,
      mode: '1-day-progressive',
      score: finalScore,
      detailedMarks: detailedMarks,
      breakdown: {
        commitCount: metrics.commitCount,
        hasReadme: metrics.hasReadme,
        hasConfigFile: metrics.hasConfigFile,
        hasGitignore: metrics.hasGitignore,
        codeFilesCount: metrics.codeFilesCount,
        totalLinesOfCode: metrics.totalLinesOfCode,
        primaryLanguage: metrics.primaryLanguage,
        languagesUsed: metrics.languages.map((l: any) => l.name),
        scoreBreakdown: breakdown,
        pointsEarned: {
          commits: detailedMarks.commits.earned,
          readme: detailedMarks.readme.earned,
          configFile: detailedMarks.configFile.earned,
          gitignore: detailedMarks.gitignore.earned,
          codeFiles: detailedMarks.codeFiles.earned,
          total: finalScore,
          maxPossible: totalPossiblePoints
        }
      },
      stats: {
        commits: metrics.commitCount,
        codeFiles: metrics.codeFilesCount,
        linesOfCode: metrics.totalLinesOfCode,
        totalFiles: metrics.totalFiles,
        hasReadme: metrics.hasReadme,
        hasConfigFile: metrics.hasConfigFile,
        hasGitignore: metrics.hasGitignore,
        hasTests: false,
        primaryLanguage: metrics.primaryLanguage
      }
    }
  };
}

/**
 * Parse chat messages from database
 */
private parseChatMessages(messages: any[], currentUserId: string) {
  console.log(`📝 Parsing ${messages.length} chat messages...`);
  
  const parsed = messages.map((msg: any) => {
    let parsedText = msg.message;
    try {
      let parsed = JSON.parse(msg.message);
      let depth = 0;
      while (typeof parsed === 'string' && depth < 10) {
        try { 
          parsed = JSON.parse(parsed); 
          depth++; 
        } catch { 
          break; 
        }
      }
      if (parsed && typeof parsed === 'object') {
        parsedText = parsed.text || msg.message;
      }
    } catch {}
    
    return {
      id: msg.id,
      session_id: msg.session_id,
      user_id: msg.user_id,
      user_email: msg.user_email,
      user_name: msg.first_name ? `${msg.first_name} ${msg.last_name || ''}`.trim() : msg.user_email?.split('@')[0] || 'User',
      message: parsedText,
      timestamp: msg.timestamp,
      is_candidate: msg.user_id === currentUserId
    };
  });
  
  console.log(`✅ Parsed ${parsed.length} chat messages`);
  // console.log(`📊 Candidate messages: ${parsed.filter(m => m.is_candidate).length}`);
  console.log(`📊 Recruiter messages: ${parsed.filter(m => !m.is_candidate).length}`);
  
  return parsed;
}

/**
 * Calculate punctuality score
 */
private calculatePunctualityScore(tasks: any[], taskProgress: any[], sessionStartTime: Date): number {
  console.log('\n📊 CALCULATING PUNCTUALITY SCORE:');
  console.log('───────────────────────────────────────────────');
  
  let totalWeight = 0;
  let onTimeWeight = 0;
  
  for (const task of tasks) {
    const weight = task.evaluation?.weight || task.priority || 1;
    totalWeight += weight;
    
    const progress = taskProgress.find((tp: any) => tp.task_index === (task.order || task.task_index || 0));
    
    console.log(`   Task ${task.order || task.task_index}:`, {
      name: task.name,
      weight: weight,
      status: progress?.status,
      completed_at: progress?.completed_at
    });
    
    if (progress?.status === 'completed' && progress.completed_at) {
      const completedAt = new Date(progress.completed_at);
      const elapsed = (completedAt.getTime() - sessionStartTime.getTime()) / 1000;
      const limit = (task.duration || task.duration_minutes || 30) * 60;
      
      const isOnTime = elapsed <= limit;
      console.log(`      Completed at: ${completedAt.toISOString()}`);
      console.log(`      Elapsed: ${Math.floor(elapsed)}s / Limit: ${limit}s`);
      console.log(`      On time: ${isOnTime}`);
      
      if (isOnTime) {
        onTimeWeight += weight;
        console.log(`      → Added weight ${weight} to onTimeWeightSum`);
      }
    } else {
      console.log(`      Not completed or no completion time`);
    }
  }
  
  const score = totalWeight > 0 ? Math.round((onTimeWeight / totalWeight) * 100) : 0;
  
  console.log(`\n📊 Punctuality Score Calculation:`);
  console.log(`   Total weight sum: ${totalWeight}`);
  console.log(`   On-time weight sum: ${onTimeWeight}`);
  console.log(`   Formula: (${onTimeWeight} / ${totalWeight}) * 100 = ${score}%`);
  
  return score;
}

/**
 * Calculate adaptability score
 */
private calculateAdaptabilityScore(tasks: any[], taskProgress: any[], chatMessages: any[]): number {
  console.log('\n📊 CALCULATING ADAPTABILITY SCORE:');
  console.log('───────────────────────────────────────────────');
  
  let qualitySum = 0;
  let speedSum = 0;
  let eventCount = 0;
  
  // Check unexpected tasks
  for (const task of tasks) {
    console.log(`   Evaluating Task ${task.order || task.task_index}: ${task.name} (type: ${task.type || task.task_type})`);
    // In calculateFullSessionScores, find the adaptability section and change:
    const isUnexpected = task.task_type === 'technical' || 
                        task.task_type === 'emergency' || 
                        task.task_type === 'change_request' ||
                        task.type === 'technical' || 
                        task.type === 'emergency' || 
                        task.type === 'change_request';
    if (isUnexpected) {
      eventCount++;
      console.log(`   Unexpected Event ${eventCount}: Task ${task.order || task.task_index} - ${task.name}`);
      
      const progress = taskProgress.find((tp: any) => tp.task_index === (task.order || task.task_index || 0));
      
      // Quality score
      if (progress?.score) {
        qualitySum += progress.score;
        console.log(`      Quality: Using stored score ${progress.score}`);
      } else if (progress?.answer) {
        let qScore = 50;
        if (progress.answer.code?.length > 0) qScore += 20;
        if (progress.answer.essay?.length > 50) qScore += 15;
        if (progress.answer.comment?.length > 20) qScore += 15;
        if (progress.answer.completed) qScore += 10;
        qualitySum += Math.min(100, qScore);
        console.log(`      Quality: Calculated score ${Math.min(100, qScore)} (based on answer content)`);
      } else {
        qualitySum += 0;
        console.log(`      Quality: No answer found, score 0`);
      }
      
      // Speed score
      if (progress?.completed_at && progress?.started_at) {
        const responseTime = (new Date(progress.completed_at).getTime() - new Date(progress.started_at).getTime()) / 1000;
        const expected = (task.expected_response_time || 300);
        const speed = Math.max(0, Math.min(100, (1 - (responseTime / expected)) * 100));
        speedSum += speed;
        console.log(`      Speed: Response time ${Math.floor(responseTime)}s / Expected ${expected}s = ${speed.toFixed(1)}%`);
      } else if (progress?.status === 'completed') {
        speedSum += 50;
        console.log(`      Speed: Default score 50`);
      } else {
        speedSum += 0;
        console.log(`      Speed: Not completed, score 0`);
      }
    }
  }
  
  // Chat response times
  console.log(`\n   Chat Response Times Analysis:`);
  let lastMessageTime: Date | null = null;
  let chatEventCount = 0;
  
  for (const msg of chatMessages) {
    if (!msg.is_candidate && msg.timestamp) {
      lastMessageTime = new Date(msg.timestamp);
      console.log(`      Recruiter message at: ${lastMessageTime.toISOString()}`);
    } else if (msg.is_candidate && lastMessageTime && msg.timestamp) {
      const responseTime = (new Date(msg.timestamp).getTime() - lastMessageTime.getTime()) / 1000;
      if (responseTime > 0 && responseTime < 3600) {
        chatEventCount++;
        eventCount++;
        const expected = 120;
        const speed = Math.max(0, Math.min(100, (1 - (responseTime / expected)) * 100));
        speedSum += speed;
        qualitySum += 70;
        console.log(`      Candidate response in ${Math.floor(responseTime)}s (within 1 hour)`);
        console.log(`      Speed score: ${speed.toFixed(1)}%, Quality: 70`);
      }
      lastMessageTime = null;
    }
  }
  
  const avgQuality = eventCount > 0 ? qualitySum / eventCount : 50;
  const avgSpeed = eventCount > 0 ? speedSum / eventCount : 50;
  const score = Math.round((avgQuality * 0.5) + (avgSpeed * 0.5));
  
  console.log(`\n📊 Adaptability Score Calculation:`);
  console.log(`   Unexpected events count: ${eventCount}`);
  console.log(`   Total response quality sum: ${qualitySum}`);
  console.log(`   Total response speed sum: ${speedSum}`);
  console.log(`   Average response quality: ${avgQuality.toFixed(1)}`);
  console.log(`   Average response speed: ${avgSpeed.toFixed(1)}`);
  console.log(`   Formula: (${avgQuality.toFixed(1)} * 0.5) + (${avgSpeed.toFixed(1)} * 0.5) = ${score}%`);
  
  return score;
}

/**
 * Calculate technical score
 */
private calculateTechnicalScore(tasks: any[], taskProgress: any[]): number {
  console.log('\n📊 CALCULATING TECHNICAL SCORE:');
  console.log('───────────────────────────────────────────────');
  
  let scoreSum = 0;
  let taskCount = 0;
  
  for (const task of tasks) {
    const isTechnical = task.type === 'technical' || task.type === 'code_editor' || task.type === 'code_execution';
    if (isTechnical) {
      taskCount++;
      console.log(`   Technical Task ${taskCount}: Task ${task.order || task.task_index} - ${task.name}`);
      
      const progress = taskProgress.find((tp: any) => tp.task_index === (task.order || task.task_index || 0));
      
      if (progress?.score) {
        scoreSum += progress.score;
        console.log(`      Score: Using stored score ${progress.score}`);
      } else if (progress?.answer?.code) {
        let techScore = 50;
        const code = progress.answer.code;
        
        console.log(`      Analyzing code (${code.length} chars):`);
        if (code.includes('function') || code.includes('const') || code.includes('let')) {
          techScore += 10;
          console.log(`      +10: Contains functions/variables`);
        }
        if (code.includes('if') || code.includes('else')) {
          techScore += 10;
          console.log(`      +10: Contains conditionals`);
        }
        if (code.includes('return')) {
          techScore += 10;
          console.log(`      +10: Contains return statements`);
        }
        if (code.includes('try')) {
          techScore += 10;
          console.log(`      +10: Contains error handling`);
        }
        if (code.split('\n').length > 5) {
          techScore += 10;
          console.log(`      +10: More than 5 lines of code`);
        }
        if (progress.answer.completed) {
          techScore += 10;
          console.log(`      +10: Marked as completed`);
        }
        
        techScore = Math.min(100, techScore);
        scoreSum += techScore;
        console.log(`      Total technical score: ${techScore}`);
      } else {
        scoreSum += 0;
        console.log(`      Score: No answer found, score 0`);
      }
    }
  }
  
  const score = taskCount > 0 ? Math.round(scoreSum / taskCount) : 50;
  
  console.log(`\n📊 Technical Score Calculation:`);
  console.log(`   Technical tasks count: ${taskCount}`);
  console.log(`   Total technical score sum: ${scoreSum}`);
  console.log(`   Formula: ${scoreSum} / ${taskCount} = ${score}%`);
  
  return score;
}

/**
 * Calculate overall score
 */
private calculateOverallScore(scores: {
  technical: number;
  punctuality: number;
  adaptability: number;
  communication: number;
  speed: number;
  github: number;
}): number {
  console.log('\n📊 CALCULATING OVERALL SCORE (with GitHub):');
  console.log('───────────────────────────────────────────────');
  
  const quality = Math.round((scores.technical + scores.punctuality + scores.adaptability + scores.communication) / 4);
  const behavioral = Math.round((scores.adaptability + scores.communication) / 2);
  
  console.log(`   Quality Score: (${scores.technical} + ${scores.punctuality} + ${scores.adaptability} + ${scores.communication}) / 4 = ${quality}%`);
  console.log(`   Behavioral Score: (${scores.adaptability} + ${scores.communication}) / 2 = ${behavioral}%`);
  console.log(`   Quality (60%): ${quality} * 0.60 = ${(quality * 0.60).toFixed(1)}`);
  console.log(`   Speed (15%): ${scores.speed} * 0.15 = ${(scores.speed * 0.15).toFixed(1)}`);
  console.log(`   Behavioral (10%): ${behavioral} * 0.10 = ${(behavioral * 0.10).toFixed(1)}`);
  console.log(`   GitHub (15%): ${scores.github} * 0.15 = ${(scores.github * 0.15).toFixed(1)}`);
  
  const total = (quality * 0.60) + (scores.speed * 0.15) + (behavioral * 0.10) + (scores.github * 0.15);
  const overall = Math.round(total);
  
  console.log(`   TOTAL: ${total.toFixed(1)} = ${overall}%`);
  
  return overall;
}



/**
 * Calculate communication score based on chat messages
 * Uses BOTH communication classifier API (Python) AND Groq AI for deep analysis
 * Returns COMPLETE analysis from both sources
 */
private async calculateCommunicationScore(sessionId: string, candidateId: string): Promise<{
  score: number;
  analysis: any;
  messageCount: number;
  candidateMessages: number;
  recruiterMessages: number;
  classifierAnalysis: any;      
  groqAnalysis: any;            
  combinedInsights: {
    taskDiscussionSummary: string;
    messageTone: string;
    keyInsights: string[];
    strengths: string[];
    areasForImprovement: string[];
    questionsAsked: string[];
    answersProvided: string[];
    taskReferences: any[];
  };
}> {
  console.log('📊 [calculateCommunicationScore] STARTED');
  console.log('📋 Input:', { sessionId, candidateId });

  try {
    // Get all chat messages for this session
    const messagesResult = await DatabaseService.query(`
      SELECT 
          cm.id,
          cm.user_id,
          cm.message,
          cm.message_type,
          cm.timestamp,
          cm.created_at,
          u.email,
          u.user_type,
          cp.first_name,
          cp.last_name,
          CASE 
              WHEN cm.user_id = $2 THEN 'candidate'
              WHEN u.user_type IN ('recruiter', 'company_admin', 'system_admin') THEN 'recruiter'
              ELSE 'other'
          END as sender_type,
          COALESCE(cp.first_name || ' ' || cp.last_name, u.email, 'User') as sender_name,
          CASE 
              WHEN u.user_type = 'recruiter' THEN 'Recruiter'
              WHEN u.user_type = 'company_admin' THEN 'Company Admin'
              WHEN u.user_type = 'system_admin' THEN 'System Admin'
              WHEN u.user_type = 'candidate' THEN 'Candidate'
              ELSE u.user_type
          END as sender_role
      FROM chat_messages cm
      JOIN users u ON cm.user_id = u.id
      LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
      WHERE cm.session_id = $1
      ORDER BY cm.timestamp ASC
  `, [sessionId, candidateId]);

    const messages = (messagesResult?.rows || []) as ChatMessageRow[];

    if (!messages || messages.length === 0) {
      return {
        score: 0,
        analysis: { message: 'No chat messages exchanged' },
        messageCount: 0,
        candidateMessages: 0,
        recruiterMessages: 0,
        classifierAnalysis: null,
        groqAnalysis: null,
        combinedInsights: {
          taskDiscussionSummary: '',
          messageTone: '',
          keyInsights: [],
          strengths: [],
          areasForImprovement: [],
          questionsAsked: [],
          answersProvided: [],
          taskReferences: []
        }
      };
    }

    const candidateMessages = messages.filter((m: ChatMessageRow) => m?.sender_type === 'candidate').length;
    const recruiterMessages = messages.filter((m: ChatMessageRow) => m?.sender_type === 'recruiter').length;
    const totalMessages = messages.length;

    console.log(`📊 Message stats: ${candidateMessages} candidate, ${recruiterMessages} recruiter, ${totalMessages} total`);

    if (candidateMessages === 0) {
      return {
        score: 0,
        analysis: { message: 'Candidate did not send any messages' },
        messageCount: totalMessages,
        candidateMessages,
        recruiterMessages,
        classifierAnalysis: null,
        groqAnalysis: null,
        combinedInsights: {
          taskDiscussionSummary: '',
          messageTone: '',
          keyInsights: [],
          strengths: [],
          areasForImprovement: [],
          questionsAsked: [],
          answersProvided: [],
          taskReferences: []
        }
      };
    }

    // ============================================
    // STEP 1: Get simulation tasks for context
    // ============================================
    let simulationTasks: any[] = [];
    let taskContext = '';
    
    try {
      const sessionResult = await DatabaseService.query(`
        SELECT ss.simulation_id FROM simulation_sessions ss WHERE ss.id = $1
      `, [sessionId]);
      
      if (sessionResult.rows[0]) {
        const tasksResult = await DatabaseService.query(`
          SELECT st.tasks, st.name as simulation_name
          FROM simulations sim
          JOIN simulation_templates st ON sim.template_id = st.id
          WHERE sim.id = $1
        `, [sessionResult.rows[0].simulation_id]);
        
        if (tasksResult.rows[0]?.tasks) {
          let tasksData = tasksResult.rows[0].tasks;
          if (typeof tasksData === 'string') tasksData = JSON.parse(tasksData);
          if (Array.isArray(tasksData)) {
            simulationTasks = tasksData;
            taskContext = tasksData.slice(0, 5).map((task: any, idx: number) => {
              const title = (task.title || task.task_name || `Task ${idx + 1}`).substring(0, 50);
              const desc = (task.description || '').substring(0, 100);
              return `${idx + 1}. ${title}: ${desc}`;
            }).join('\n');
          }
        }
      }
    } catch (taskError) {
      console.warn('Could not load simulation tasks:', taskError);
    }

    // ============================================
    // STEP 2: Call Communication Classifier API (Python) - FULL RESPONSE
    // ============================================
    let classifierAnalysis: any = null;
    let communicationScore = 0;

    try {
      classifierAnalysis = await callCommunicationClassifier(messages);
      if (classifierAnalysis && classifierAnalysis.communication_score) {
        communicationScore = classifierAnalysis.communication_score;
      }
      console.log('✅ Communication classifier API response received:', {
        score: classifierAnalysis?.communication_score,
        dominant_style: classifierAnalysis?.dominant_style,
        style_counts: classifierAnalysis?.style_counts
      });
    } catch (apiError: any) {
      console.error('❌ Communication classifier API error:', apiError.message);
      classifierAnalysis = { error: apiError.message, fallback: true };
    }

    // ============================================
    // STEP 3: Groq AI Deep Analysis - FULL RESPONSE
    // ============================================
    let groqAnalysis: any = null;
    let aiSuggestedScore = communicationScore;
    let combinedInsights = {
      taskDiscussionSummary: '',
      messageTone: '',
      keyInsights: [] as string[],
      strengths: [] as string[],
      areasForImprovement: [] as string[],
      questionsAsked: [] as string[],
      answersProvided: [] as string[],
      taskReferences: [] as any[]
    };

    try {
      console.log('🤖 Running Groq AI analysis on chat messages...');
      
      // Limit messages to last 15 for prompt size
      const recentMessages = messages.slice(-15);
      
      // Parse and truncate each message
      const messageTexts = recentMessages.map((msg: ChatMessageRow, idx: number) => {
        const sender = msg.sender_type === 'candidate' ? 'Candidate' : 'Recruiter';
        let content = msg.message;
        try {
          let parsed = JSON.parse(msg.message);
          let depth = 0;
          while (typeof parsed === 'string' && depth < 3) {
            try {
              parsed = JSON.parse(parsed);
              depth++;
            } catch { break; }
          }
          if (parsed && typeof parsed === 'object') {
            content = parsed.text || parsed.message || msg.message;
          }
        } catch { content = msg.message; }
        
        content = content.substring(0, 200);
        return `${sender}: ${content}`;
      }).join('\n');
      
      const prompt = `Analyze these chat messages between candidate and recruiter.

      TASKS:
      ${taskContext.substring(0, 500) || 'No specific tasks'}

      MESSAGES:
      ${messageTexts.substring(0, 3500)}

      Return ONLY valid JSON:
      {
        "communication_score": 0-100,
        "message_tone": "professional" or "friendly" or "rushed" or "detailed" or "brief" or "confident" or "hesitant",
        "task_discussion_summary": "1-2 sentences summarizing what candidate discussed about tasks",
        "questions_asked": ["question 1", "question 2"],
        "answers_provided": ["answer 1", "answer 2"],
        "clarity_level": 0-100,
        "professionalism_level": 0-100,
        "engagement_level": 0-100,
        "key_insights": ["insight 1", "insight 2"],
        "strengths": ["strength 1", "strength 2"],
        "areas_for_improvement": ["area 1", "area 2"],
        "task_references": [
          {
            "task_name": "task mentioned",
            "context": "what candidate said",
            "understanding_shown": "high/medium/low"
          }
        ],
        "overall_assessment": "brief overall assessment"
      }`;

      if (prompt.length < 6000) {
        const completion = await getGroq().chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'You are a communication analyst. Return ONLY valid JSON. Be detailed but concise.'
            },
            { role: 'user', content: prompt }
          ],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.3,
          max_tokens: 1200,
          response_format: { type: 'json_object' }
        });

        const responseContent = completion.choices[0]?.message?.content;
        if (responseContent && responseContent.length < 5000) {
          groqAnalysis = JSON.parse(responseContent);
          aiSuggestedScore = groqAnalysis.communication_score || communicationScore;
          
          // Extract combined insights
          combinedInsights = {
            taskDiscussionSummary: groqAnalysis.task_discussion_summary || '',
            messageTone: groqAnalysis.message_tone || 'unknown',
            keyInsights: (groqAnalysis.key_insights || []).slice(0, 5),
            strengths: (groqAnalysis.strengths || []).slice(0, 5),
            areasForImprovement: (groqAnalysis.areas_for_improvement || []).slice(0, 5),
            questionsAsked: (groqAnalysis.questions_asked || []).slice(0, 10),
            answersProvided: (groqAnalysis.answers_provided || []).slice(0, 10),
            taskReferences: (groqAnalysis.task_references || []).slice(0, 10)
          };
          
          console.log('✅ Groq AI analysis completed:', {
            score: groqAnalysis.communication_score,
            tone: groqAnalysis.message_tone,
            taskReferencesCount: groqAnalysis.task_references?.length || 0,
            insightsCount: groqAnalysis.key_insights?.length || 0
          });
        }
      } else {
        console.warn(`⚠️ Prompt too long (${prompt.length} chars), skipping Groq`);
      }
    } catch (groqError: any) {
      console.error('❌ Groq AI analysis failed:', groqError.message);
      groqAnalysis = { error: groqError.message, fallback: true };
    }

    // ============================================
    // STEP 4: Fallback Calculation (if both failed)
    // ============================================
    let finalAnalysis: any = {};
    let finalScore = communicationScore;

    if (!classifierAnalysis?.communication_score && !groqAnalysis?.communication_score) {
      console.log('📊 Using fallback communication score calculation');
      
      // Calculate responsiveness
      let responsivenessScore = 0;
      let lastRecruiterMessageTime: Date | null = null;
      let responseTimes: number[] = [];
      
      for (const msg of messages) {
        if (msg?.sender_type === 'recruiter') {
          lastRecruiterMessageTime = new Date(msg.timestamp);
        } else if (msg?.sender_type === 'candidate' && lastRecruiterMessageTime) {
          const responseTime = (new Date(msg.timestamp).getTime() - lastRecruiterMessageTime.getTime()) / 1000;
          if (responseTime > 0 && responseTime < 3600) {
            responseTimes.push(responseTime);
          }
          lastRecruiterMessageTime = null;
        }
      }
      
      if (responseTimes.length > 0) {
        const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        responsivenessScore = Math.max(0, Math.min(100, 100 - (avgResponseTime / 1800) * 100));
      } else {
        responsivenessScore = candidateMessages > 0 ? 50 : 0;
      }
      
      // Calculate message quality
      let qualityScore = 0;
      let totalQuality = 0;
      
      for (const msg of messages.filter((m: ChatMessageRow) => m?.sender_type === 'candidate')) {
        let msgQuality = 0;
        let parsedMessage = msg?.message || '';
        
        try {
          let parsed = JSON.parse(msg.message);
          let depth = 0;
          while (typeof parsed === 'string' && depth < 3) {
            try {
              parsed = JSON.parse(parsed);
              depth++;
            } catch { break; }
          }
          if (parsed && typeof parsed === 'object') {
            parsedMessage = parsed.text || parsed.message || msg.message;
          }
        } catch { parsedMessage = msg.message; }
        
        if (parsedMessage && typeof parsedMessage === 'string') {
          parsedMessage = parsedMessage.substring(0, 500);
          const length = parsedMessage.length;
          if (length > 200) msgQuality += 40;
          else if (length > 100) msgQuality += 30;
          else if (length > 50) msgQuality += 20;
          else if (length > 20) msgQuality += 10;
          else if (length > 0) msgQuality += 5;
          
          if (parsedMessage.includes('.') || parsedMessage.includes('?') || parsedMessage.includes('!')) msgQuality += 20;
          if (!parsedMessage.match(/[A-Z]{5,}/)) msgQuality += 10;
          if (parsedMessage.includes('?') || parsedMessage.toLowerCase().includes('please')) msgQuality += 10;
        }
        
        totalQuality += Math.min(100, msgQuality);
      }
      
      const avgQuality = candidateMessages > 0 ? totalQuality / candidateMessages : 0;
      qualityScore = Math.min(100, avgQuality);
      
      // Engagement score
      let firstMessageIsCandidate = false;
      if (messages.length > 0) {
        firstMessageIsCandidate = messages[0]?.sender_type === 'candidate';
      }
      const engagementScore = firstMessageIsCandidate ? 70 : 50;
      
      finalScore = Math.round(
        (qualityScore * 0.4) + (responsivenessScore * 0.3) + (engagementScore * 0.3)
      );
      
      finalAnalysis = {
        method: 'fallback',
        quality_score: Math.round(qualityScore),
        responsiveness_score: Math.round(responsivenessScore),
        engagement_score: engagementScore,
        candidate_messages: candidateMessages,
        recruiter_messages: recruiterMessages,
        total_messages: totalMessages,
        candidate_summary: this.generateCandidateMessageSummary(messages, simulationTasks)
      };
    } else {
      // Combine both analyses
      finalScore = Math.round((communicationScore * 0.5) + (aiSuggestedScore * 0.5));
      
      finalAnalysis = {
        method: 'combined',
        // ✅ FULL CLASSIFIER ANALYSIS
        classifier: classifierAnalysis ? {
          dominant_style: classifierAnalysis.dominant_style,
          style_counts: classifierAnalysis.style_counts,
          total_messages: classifierAnalysis.total_messages,
          average_confidence: classifierAnalysis.average_confidence,
          recommendation: classifierAnalysis.recommendation,
          raw_response: classifierAnalysis
        } : null,
        
        // ✅ FULL GROQ ANALYSIS
        groq: groqAnalysis ? {
          message_tone: groqAnalysis.message_tone,
          clarity_level: groqAnalysis.clarity_level,
          professionalism_level: groqAnalysis.professionalism_level,
          engagement_level: groqAnalysis.engagement_level,
          overall_assessment: groqAnalysis.overall_assessment,
          task_discussion_summary: groqAnalysis.task_discussion_summary,
          questions_asked: groqAnalysis.questions_asked || [],
          answers_provided: groqAnalysis.answers_provided || [],
          task_references: groqAnalysis.task_references || [],
          key_insights: groqAnalysis.key_insights || [],
          strengths: groqAnalysis.strengths || [],
          areas_for_improvement: groqAnalysis.areas_for_improvement || [],
          raw_response: groqAnalysis
        } : null,
        
        // ✅ COMBINED INSIGHTS
        combined_insights: combinedInsights,
        
        // Statistics
        candidate_messages: candidateMessages,
        recruiter_messages: recruiterMessages,
        total_messages: totalMessages,
        candidate_summary: this.generateCandidateMessageSummary(messages, simulationTasks),
        
        // Raw messages for reference
        message_preview: messages.slice(-5).map((m: ChatMessageRow) => ({
          sender: m.sender_type,
          preview: (m.message || '').substring(0, 100),
          timestamp: m.timestamp
        }))
      };
    }
    
    finalScore = Math.max(0, Math.min(100, finalScore));
    
    console.log('📊 Communication Score Final Result:', {
      score: finalScore,
      candidateMessages,
      recruiterMessages,
      totalMessages,
      hasClassifier: !!classifierAnalysis?.communication_score,
      hasGroq: !!groqAnalysis?.communication_score,
      method: finalAnalysis.method
    });
    
    return {
      score: finalScore,
      analysis: finalAnalysis,
      messageCount: totalMessages,
      candidateMessages,
      recruiterMessages,
      classifierAnalysis: classifierAnalysis,
      groqAnalysis: groqAnalysis,
      combinedInsights: combinedInsights
    };
    
  } catch (error: any) {
    console.error('❌ Error calculating communication score:', error);
    return {
      score: 0,
      analysis: { error: error.message, message: 'Failed to calculate communication score' },
      messageCount: 0,
      candidateMessages: 0,
      recruiterMessages: 0,
      classifierAnalysis: null,
      groqAnalysis: null,
      combinedInsights: {
        taskDiscussionSummary: '',
        messageTone: '',
        keyInsights: [],
        strengths: [],
        areasForImprovement: [],
        questionsAsked: [],
        answersProvided: [],
        taskReferences: []
      }
    };
  }
}

/**
 * Generate summary of what the candidate did in messages
 */
private generateCandidateMessageSummary(messages: ChatMessageRow[], tasks: any[]): string {
  const candidateMessages = messages.filter(m => m.sender_type === 'candidate');
  
  if (candidateMessages.length === 0) {
    return 'Candidate sent no messages.';
  }
  
  let questionCount = 0;
  let codeReferenceCount = 0;
  let taskReferenceCount = 0;
  let answerCount = 0;
  let clarificationCount = 0;
  
  for (const msg of candidateMessages) {
    let content = msg.message;
    try {
      let parsed = JSON.parse(msg.message);
      let depth = 0;
      while (typeof parsed === 'string' && depth < 3) {
        try { parsed = JSON.parse(parsed); depth++; } catch { break; }
      }
      if (parsed && typeof parsed === 'object') {
        content = parsed.text || parsed.message || msg.message;
      }
    } catch { content = msg.message; }
    
    const lowerContent = content.toLowerCase();
    if (content.includes('?')) questionCount++;
    if (lowerContent.includes('answer') || lowerContent.includes('solution')) answerCount++;
    if (lowerContent.includes('```') || lowerContent.includes('code')) codeReferenceCount++;
    if (lowerContent.includes('task') || lowerContent.includes('problem')) taskReferenceCount++;
    if (lowerContent.includes('clarify') || lowerContent.includes('explain') || lowerContent.includes('understand')) clarificationCount++;
  }
  
  const parts = [`Sent ${candidateMessages.length} message(s)`];
  if (questionCount > 0) parts.push(`asked ${questionCount} question(s)`);
  if (answerCount > 0) parts.push(`provided ${answerCount} answer(s)`);
  if (codeReferenceCount > 0) parts.push(`shared code ${codeReferenceCount} time(s)`);
  if (taskReferenceCount > 0) parts.push(`discussed tasks ${taskReferenceCount} time(s)`);
  if (clarificationCount > 0) parts.push(`sought clarification ${clarificationCount} time(s)`);
  
  return parts.join(', ');
}

// ============================================
// MAIN SUBMIT SIMULATION FUNCTION
// ============================================

async submitSimulation(req: AuthenticatedRequest, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    const sessionId = req.params.id;
    const { answers, timeSpent } = req.body;

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📝 [submitSimulation] STARTED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📋 Request params:', {
      sessionId,
      userId: req.user.id,
      userEmail: req.user.email,
      timeSpent,
      answersKeys: Object.keys(answers || {}),
      answersCount: Object.keys(answers || {}).length,
      timestamp: new Date().toISOString()
    });

    // ============================================
    // STEP 1: Validate session exists
    // ============================================
    if (!sessionId || !ValidationService.isValidUUID(sessionId)) {
      console.log('❌ Invalid session ID format');
      ResponseService.error(res, 'Invalid session ID format', 400);
      return;
    }

    const validSessionId: string = sessionId;

    const sessionCheck = await DatabaseService.query(`
      SELECT ss.id, ss.user_id, ss.status, ss.simulation_id, ss.started_at
      FROM simulation_sessions ss
      WHERE ss.id = $1 AND ss.user_id = $2
    `, [validSessionId, req.user.id]);

    if (!sessionCheck.rows[0]) {
      console.log('❌ Session not found');
      ResponseService.error(res, 'Session not found', 404);
      return;
    }

    const session = sessionCheck.rows[0];
    console.log('✅ Session found:', { sessionId: session.id, status: session.status });

    // ============================================
    // STEP 2: Check if already submitted
    // ============================================
    if (session.status === 'completed' || session.status === 'submitted') {
      console.log('⚠️ Session already completed');
      ResponseService.success(res, {
        sessionId: session.id,
        alreadySubmitted: true,
        message: 'Simulation already submitted'
      });
      return;
    }

    // ============================================
    // STEP 3: Check if session is in progress
    // ============================================
    if (session.status !== 'in_progress') {
      console.log('❌ Session not in progress. Status:', session.status);
    }

    // ============================================
    // STEP 4: Check time expiration
    // ============================================
    const sessionStartTime = new Date(session.started_at);
    const sessionEndTime = new Date();
    const calculatedTimeSeconds = Math.floor((sessionEndTime.getTime() - sessionStartTime.getTime()) / 1000);
    const totalTimeSeconds = Number.isFinite(calculatedTimeSeconds)
      ? Math.max(0, calculatedTimeSeconds)
      : Math.max(0, Number(timeSpent || 0));
    const minSubmitSeconds = 3 * 60;

    if (totalTimeSeconds < minSubmitSeconds) {
      const remainingSeconds = minSubmitSeconds - totalTimeSeconds;
      const remainingLabel = `${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s`;
      console.log('⏱️ Submission blocked: minimum 3 minutes not reached', {
        totalTimeSeconds,
        remainingSeconds
      });
      ResponseService.error(
        res,
        `You must spend at least 3 minutes before submitting. ${remainingLabel} remaining.`,
        400,
        'MINIMUM_TIME_NOT_REACHED'
      );
      return;
    }
    
    const timeLimitResult = await DatabaseService.query(`
      SELECT st.duration_minutes
      FROM simulation_sessions ss
      JOIN simulations sim ON ss.simulation_id = sim.id
      JOIN simulation_templates st ON sim.template_id = st.id
      WHERE ss.id = $1
    `, [validSessionId]);
    
    const timeLimitSeconds = (timeLimitResult.rows[0]?.duration_minutes || 60) * 60;
    const isExpired = totalTimeSeconds > timeLimitSeconds;

    if (isExpired) {
      console.log('⏰ Session expired');
    }

    // ============================================
    // STEP 5: CALCULATE FULL SCORES
    // ============================================
    console.log('🔢 [STEP 5] Calculating full session scores...');
    
    let fullScoreAnalysis;
    let communicationAnalysis = null;
    
    try {
      fullScoreAnalysis = await this.calculateFullSessionScores(validSessionId, req.user.id);
      console.log('✅ Full score analysis completed');
    } catch (calcError: any) {
      console.error('❌ Score calculation failed:', calcError);
      ResponseService.error(res, 'Failed to calculate scores', 500);
      return;
    }

    // Extract all scores from the analysis
    const overallScore = fullScoreAnalysis.scores.overall;
    const qualityScore = fullScoreAnalysis.scores.quality;
    const technicalScore = fullScoreAnalysis.scores.technical;
    const punctualityScore = fullScoreAnalysis.scores.punctuality;
    const adaptabilityScore = fullScoreAnalysis.scores.adaptability;
    const speedScore = fullScoreAnalysis.scores.speed;
    const behavioralScore = fullScoreAnalysis.scores.behavioral;
    const communicationScore = fullScoreAnalysis.scores.communication;
    const collaborationScore = fullScoreAnalysis.scores.collaboration;
    const githubScore = fullScoreAnalysis.scores.github;
    const completionRate = fullScoreAnalysis.summary.completion_rate;
    const passed = fullScoreAnalysis.summary.passed;
    const passingScore = fullScoreAnalysis.summary.passing_score;
    
    const completedTasksCount = fullScoreAnalysis.summary.completed_tasks;
    const totalTasks = fullScoreAnalysis.summary.total_tasks;
    const taskAnalysis = fullScoreAnalysis.task_analysis;
    
    // Get simulation record ID
    const simulationRecordId = fullScoreAnalysis.raw_data?.simulation_record_id || null;

    console.log('📊 Scores extracted from analysis:', {
      overall: overallScore,
      quality: qualityScore,
      technical: technicalScore,
      punctuality: punctualityScore,
      adaptability: adaptabilityScore,
      speed: speedScore,
      github: githubScore,
      passed,
      completionRate: `${completionRate}%`
    });

    // ============================================
    // STEP 5.5: Completion Angle, Data Analysis & Participation Marks
    // ============================================

    const completionAngle = Math.round((completionRate / 100) * 360);

    const submittedAnswersCount = Object.keys(answers || {}).length;
    const tasksAttempted = taskAnalysis.filter((t: any) => t.status !== 'not_started').length;
    const tasksWithCode = taskAnalysis.filter((t: any) => t.answer_details?.hasCode).length;
    const tasksWithEssay = taskAnalysis.filter((t: any) => t.answer_details?.hasEssay).length;
    const tasksWithComment = taskAnalysis.filter((t: any) => (t.answer_details?.commentLength || 0) > 0).length;

    const dataQuantityAnalysis = {
      answers_submitted: submittedAnswersCount,
      tasks_attempted: tasksAttempted,
      tasks_with_code: tasksWithCode,
      tasks_with_essay: tasksWithEssay,
      tasks_with_comment: tasksWithComment,
      data_completeness_percent: totalTasks > 0 ? Math.round((tasksAttempted / totalTasks) * 100) : 0
    };

    const avgAnswerQuality = taskAnalysis.length > 0
      ? Math.round(taskAnalysis.reduce((sum: number, t: any) => sum + (t.scores?.answer_quality || 0), 0) / taskAnalysis.length)
      : 0;
    const qualityGrade = avgAnswerQuality >= 80 ? 'A' : avgAnswerQuality >= 65 ? 'B' : avgAnswerQuality >= 50 ? 'C' : avgAnswerQuality >= 35 ? 'D' : 'F';

    const dataQualityAnalysis = {
      average_answer_quality: avgAnswerQuality,
      grade: qualityGrade,
      description: qualityGrade === 'A' ? 'Excellent quality answers' : qualityGrade === 'B' ? 'Good quality answers' : qualityGrade === 'C' ? 'Average quality answers' : qualityGrade === 'D' ? 'Below average — needs improvement' : 'Poor or no answers submitted',
      per_task_quality: taskAnalysis.map((t: any) => ({
        task_index: t.task_index,
        task_title: t.task_title,
        answer_quality_score: t.scores?.answer_quality || 0,
        has_code: t.answer_details?.hasCode || false,
        code_length: t.answer_details?.codeLength || 0,
        has_essay: t.answer_details?.hasEssay || false,
        essay_length: t.answer_details?.essayLength || 0,
        has_comment: (t.answer_details?.commentLength || 0) > 0,
        comment_length: t.answer_details?.commentLength || 0
      }))
    };

    const sessionCompleteTime = {
      started_at: session.started_at,
      completed_at: new Date().toISOString(),
      total_seconds: totalTimeSeconds,
      total_minutes: Math.floor(totalTimeSeconds / 60),
      formatted: `${Math.floor(totalTimeSeconds / 60)}m ${totalTimeSeconds % 60}s`,
      time_limit_seconds: timeLimitSeconds,
      time_limit_minutes: Math.floor(timeLimitSeconds / 60),
      time_used_percent: Math.round((totalTimeSeconds / timeLimitSeconds) * 100),
      submitted_on_time: totalTimeSeconds <= timeLimitSeconds
    };

    const PARTICIPATION_MIN_SECONDS = 30 * 60;
    const qualifiesForParticipation = totalTimeSeconds >= PARTICIPATION_MIN_SECONDS;
    let participationBonus = 0;
    let participationMessage = '';

    if (completionRate === 0) {
      if (qualifiesForParticipation) {
        participationBonus = Math.min(0, Math.floor(totalTimeSeconds / 360));
        participationMessage = `Participation marks awarded: +${participationBonus} pts (${Math.floor(totalTimeSeconds / 60)} min in session, minimum 30 min met)`;
      } else {
        participationMessage = `No participation marks: session ended at ${Math.floor(totalTimeSeconds / 60)}m ${totalTimeSeconds % 60}s — minimum 30 minutes required`;
      }
    }

    const finalOverallScore = Math.min(100, overallScore + participationBonus);
    const finalPassed = finalOverallScore >= passingScore;

    const completionRateLabel = `${Math.round(completionRate)}% completion (${completedTasksCount}/${totalTasks} tasks)`;
    const sessionTimeLabel = `${Math.floor(totalTimeSeconds / 60)}m ${totalTimeSeconds % 60}s`;
    const submissionMessage = finalPassed
      ? `Passed with ${finalOverallScore}% — ${completionRateLabel} in ${sessionTimeLabel}.`
      : completionRate === 0 && qualifiesForParticipation
        ? `No tasks completed. ${participationMessage}. Overall: ${finalOverallScore}%. Duration: ${sessionTimeLabel}.`
        : completionRate === 0
          ? `No tasks completed. Session under 30 minutes (${sessionTimeLabel}) — no participation marks. Score: 0.`
          : `Completed with ${finalOverallScore}% — ${completionRateLabel} in ${sessionTimeLabel}. Passing threshold: ${passingScore}%.`;

    console.log('📐 Completion Angle:', completionAngle, '°');
    console.log('📦 Data Quantity:', dataQuantityAnalysis);
    console.log('🔍 Data Quality:', { grade: qualityGrade, avgScore: avgAnswerQuality });
    console.log('⏱️ Session Complete Time:', sessionCompleteTime.formatted, `(${sessionCompleteTime.time_used_percent}% of limit)`);
    console.log('🎯 Participation:', { qualifies: qualifiesForParticipation, bonus: participationBonus, message: participationMessage });
    console.log('📊 Final Score:', finalOverallScore, participationBonus > 0 ? `(base ${overallScore} + ${participationBonus} participation)` : '');
    console.log('💬 Submission Message:', submissionMessage);

    // ============================================
    // STEP 6: Merge answers
    // ============================================
    const existingAnswersResult = await DatabaseService.query(`
      SELECT answers FROM simulation_sessions WHERE id = $1
    `, [validSessionId]);
    
    let existingAnswers = {};
    if (existingAnswersResult.rows[0]?.answers) {
      try {
        existingAnswers = typeof existingAnswersResult.rows[0].answers === 'string' 
          ? JSON.parse(existingAnswersResult.rows[0].answers) 
          : existingAnswersResult.rows[0].answers;
      } catch (e) {
        console.warn('Failed to parse existing answers:', e);
      }
    }
    
    const mergedAnswers = { ...existingAnswers, ...(answers || {}) };
    
    const taskAnswersResult = await DatabaseService.query(`
      SELECT task_index, answer FROM session_task_progress WHERE session_id = $1 AND answer IS NOT NULL
    `, [validSessionId]);
    
    for (const task of taskAnswersResult.rows) {
      mergedAnswers[`task_${task.task_index}`] = task.answer;
    }

    // ============================================
    // STEP 7: Begin transaction for final save
    // ============================================
    const client = await DatabaseService.getClient();
    let evaluationId = null;
    
    // Blockchain storage variables
    let blockchainTxHash = null;
    let blockchainBlockNumber = null;
    let credentialHash = null;
    
    try {
      console.log('💾 [STEP 7] Saving submission data...');
      await client.query('BEGIN');

      // 7.1 Update simulation session
      await client.query(`
        UPDATE simulation_sessions 
        SET 
          status = 'completed',
          completed_at = NOW(),
          answers = $1,
          time_spent = $2,
          score = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [JSON.stringify(mergedAnswers), totalTimeSeconds, finalOverallScore, validSessionId]);
      
      // ============================================
      // BLOCKCHAIN STORAGE WITH UNIQUE ADDRESS
      // Place this inside your transaction after saving scores
      // ============================================

      let blockchainResult = null;
      let blockchainTxHash = null;
      let blockchainBlockNumber = null;
      let credentialHash = null;

      try {
        if (process.env.USE_BLOCKCHAIN === 'true') {
          console.log('═══════════════════════════════════════════════════════════════');
          console.log('🔗 Storing simulation result on blockchain with UNIQUE address...');
          console.log('═══════════════════════════════════════════════════════════════');
          
          const { BlockchainService } = await import('../services/blockchain.service.js');
          const fs = await import('fs');
          const path = await import('path');
          const { fileURLToPath } = await import('url');
          const crypto = await import('crypto');
          
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = path.dirname(__filename);
          
          const artifactPath = path.join(__dirname, '../../../blockchain/artifacts/contracts/LocalSimulation.sol/LocalSimulation.json');
          
          if (fs.existsSync(artifactPath)) {
            const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
            const blockchain = new BlockchainService();
            await blockchain.initializeContract(artifact.abi);
            
            console.log('📊 Simulation data:', {
              sessionId: validSessionId,
              simulationId: simulationRecordId,
              candidateId: req.user.id,
              overallScore: finalOverallScore,
              technicalScore: technicalScore,
              punctualityScore: punctualityScore,
              githubScore: githubScore
            });
            
            const result = await blockchain.storeSimulationResultWithUniqueAddress({
              sessionId: validSessionId,
              simulationId: simulationRecordId,
              candidateId: req.user.id,
              overallScore: finalOverallScore,
              technicalScore: technicalScore,
              punctualityScore: punctualityScore,
              adaptabilityScore: adaptabilityScore,
              githubScore: githubScore
            });
            
            console.log('✅ Blockchain storage successful!');
            console.log(`   📍 Address: ${result.address}`);
            console.log(`   🆕 New: ${result.isNewAddress}`);
            console.log(`   🔗 TX: ${result.txHash}`);
            console.log(`   📦 Block: ${result.blockNumber}`);
            console.log(`   💰 Balance: ${result.balance} ETH`);
            
            blockchainTxHash = result.txHash;
            blockchainBlockNumber = result.blockNumber;
            
            const credentialData = JSON.stringify({
              sessionId: validSessionId,
              simulationId: simulationRecordId,
              candidateId: req.user.id,
              walletAddress: result.address,
              overallScore: finalOverallScore,
              technicalScore: technicalScore,
              punctualityScore: punctualityScore,
              adaptabilityScore: adaptabilityScore,
              githubScore: githubScore,
              txHash: result.txHash,
              blockNumber: result.blockNumber,
              blockHash: result.blockHash,
              timestamp: new Date().toISOString()
            });
            
            credentialHash = crypto.createHash('sha256').update(credentialData).digest('hex');
            
            await client.query(`
              INSERT INTO blockchain_records (
                simulation_id, session_id, candidate_id, 
                tx_id, block_hash, data_hash, data, wallet_address, timestamp
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
              ON CONFLICT (session_id) DO NOTHING
            `, [
              simulationRecordId, validSessionId, req.user.id,
              result.txHash, result.blockHash, credentialHash, credentialData, result.address
            ]);
            
            await client.query(`
              INSERT INTO verifiable_credentials (
                simulation_id, session_id, candidate_id, 
                credential_data, credential_hash, issued_at
              ) VALUES ($1, $2, $3, $4, $5, NOW())
              ON CONFLICT (session_id) DO NOTHING
            `, [
              simulationRecordId, validSessionId, req.user.id, credentialData, credentialHash
            ]);
            
            blockchainResult = { 
              txHash: result.txHash, 
              blockNumber: result.blockNumber, 
              credentialHash: credentialHash,
              walletAddress: result.address,
              isNewAddress: result.isNewAddress,
              balance: result.balance
            };
            
            console.log('✅ Blockchain records saved to database');
            console.log('═══════════════════════════════════════════════════════════════');
            
          } else {
            console.warn('⚠️ Contract artifact not found, skipping blockchain storage');
          }
        } else {
          console.log('ℹ️ Blockchain storage disabled (USE_BLOCKCHAIN !== "true")');
        }
      } catch (blockchainError: any) {
        console.error('❌ Blockchain storage error:', blockchainError?.message);
        console.error('   Continuing with submission...');
      }

      // 7.2 Update simulation record with blockchain info
      if (simulationRecordId) {
        const updateFields = [
          `status = 'completed'`,
          `completed_at = NOW()`,
          `answers = $1`,
          `time_spent = $2`,
          `overall_score = $3`,
          `punctuality_score = $4`,
          `communication_score = $5`,
          `problem_solving_score = $6`,
          `adaptability_score = $7`,
          `collaboration_score = $8`,
          `attention_score = $9`,
          `initiative_score = $10`,
          `updated_at = NOW()`
        ];
        
        const queryParams: any[] = [
          JSON.stringify(mergedAnswers),
          totalTimeSeconds,
          finalOverallScore,           // DECIMAL(5,2) - keep decimal
          punctualityScore,            // DECIMAL(5,2) - keep decimal
          communicationScore,          // DECIMAL(5,2) - keep decimal
          technicalScore,              // DECIMAL(5,2) - keep decimal
          adaptabilityScore,           // DECIMAL(5,2) - keep decimal
          collaborationScore,          // DECIMAL(5,2) - keep decimal
          Math.round(punctualityScore), // attention_score - INTEGER column
          Math.round(speedScore)        // initiative_score - INTEGER column
        ];
        
        // Add blockchain fields if available
        if (blockchainTxHash) {
          updateFields.push(`blockchain_tx_id = $${queryParams.length + 1}`);
          queryParams.push(blockchainTxHash);
        }
        
        if (credentialHash) {
          updateFields.push(`blockchain_hash = $${queryParams.length + 1}`);
          queryParams.push(credentialHash);
        }
        
        if (blockchainBlockNumber) {
          updateFields.push(`blockchain_timestamp = NOW()`);
        }
        
        updateFields.push(`id = $${queryParams.length + 1}`);
        queryParams.push(simulationRecordId);
        
        const updateQuery = `UPDATE simulations SET ${updateFields.join(', ')} WHERE id = $${queryParams.length}`;
        
        await client.query(updateQuery, queryParams);
      }

      // 7.3 Insert or update evaluation record
      const evaluationResult = await client.query(`
        INSERT INTO evaluations (
          candidate_id,
          simulation_id,
          overall_score,
          punctuality_score,
          communication_score,
          problem_solving_score,
          adaptability_score,
          collaboration_score,
          attention_to_detail_score,
          initiative_score,
          status,
          completed_at,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed', NOW(), NOW(), NOW())
        ON CONFLICT (candidate_id, simulation_id) 
        DO UPDATE SET
          overall_score = EXCLUDED.overall_score,
          punctuality_score = EXCLUDED.punctuality_score,
          communication_score = EXCLUDED.communication_score,
          problem_solving_score = EXCLUDED.problem_solving_score,
          adaptability_score = EXCLUDED.adaptability_score,
          collaboration_score = EXCLUDED.collaboration_score,
          attention_to_detail_score = EXCLUDED.attention_to_detail_score,
          initiative_score = EXCLUDED.initiative_score,
          status = 'completed',
          completed_at = NOW(),
          updated_at = NOW()
        RETURNING id
      `, [
        req.user.id,
        simulationRecordId,
        finalOverallScore,
        punctualityScore,
        communicationScore,
        technicalScore,
        adaptabilityScore,
        collaborationScore,
        punctualityScore,
        speedScore
      ]);

      evaluationId = evaluationResult.rows[0]?.id;

      // 7.4 Insert evaluation sections from task analysis
      if (evaluationId) {
        for (const task of taskAnalysis) {
          await client.query(`
            INSERT INTO evaluation_sections (
              evaluation_id,
              section_name,
              score,
              max_score,
              percentage,
              tasks_completed,
              total_tasks,
              metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (evaluation_id, section_name) 
            DO UPDATE SET
              score = EXCLUDED.score,
              max_score = EXCLUDED.max_score,
              percentage = EXCLUDED.percentage,
              tasks_completed = EXCLUDED.tasks_completed,
              total_tasks = EXCLUDED.total_tasks,
              metadata = EXCLUDED.metadata
          `, [evaluationId, `Task ${task.task_index + 1}: ${task.task_title}`, task.scores.overall, 100, task.scores.overall, task.status === 'completed' ? 1 : 0, 1, JSON.stringify({ task_type: task.task_type, time_taken: task.time_taken_formatted, status: task.status, answer_details: task.answer_details })]);
        }

        // 7.5 Insert behavioral metrics with ON CONFLICT
        await client.query(`
          INSERT INTO evaluation_behavioral_metrics (
            evaluation_id,
            metric,
            score,
            description,
            improvement_suggestion
          ) VALUES 
            ($1, 'Punctuality', $2, $3, $4),
            ($1, 'Adaptability', $5, $6, $7),
            ($1, 'Communication', $8, $9, $10),
            ($1, 'Collaboration', $11, $12, $13),
            ($1, 'Technical Skills', $14, $15, $16)
          ON CONFLICT (evaluation_id, metric) 
          DO UPDATE SET
            score = EXCLUDED.score,
            description = EXCLUDED.description,
            improvement_suggestion = EXCLUDED.improvement_suggestion
        `, [
          evaluationId,
          punctualityScore,
          JSON.stringify(punctualityScore < 70 ? 'Consider better time management and planning' : 'Good time management demonstrated'),
          JSON.stringify(punctualityScore < 70 ? 'Consider better time management and planning' : 'Good time management demonstrated'),
          adaptabilityScore,
          JSON.stringify(adaptabilityScore < 70 ? 'Practice handling changing requirements and unexpected tasks' : 'Good adaptability shown'),
          JSON.stringify(adaptabilityScore < 70 ? 'Practice handling changing requirements and unexpected tasks' : 'Good adaptability shown'),
          communicationScore,
          JSON.stringify(communicationScore < 70 ? 'Improve clarity and structure in responses' : 'Clear and effective communication'),
          JSON.stringify(communicationScore < 70 ? 'Improve clarity and structure in responses' : 'Clear and effective communication'),
          collaborationScore,
          JSON.stringify(collaborationScore < 70 ? 'Engage more in collaborative tasks and discussions' : 'Strong collaboration skills'),
          JSON.stringify(collaborationScore < 70 ? 'Engage more in collaborative tasks and discussions' : 'Strong collaboration skills'),
          technicalScore,
          JSON.stringify(technicalScore < 70 ? 'Focus on core technical concepts and implementation' : 'Strong technical problem-solving'),
          JSON.stringify(technicalScore < 70 ? 'Focus on core technical concepts and implementation' : 'Strong technical problem-solving')
        ]);

        // 7.6 Insert AI feedback with ON CONFLICT
        const sanitizedSummary = JSON.stringify(fullScoreAnalysis.feedback.summary || '');
        const sanitizedDetailedAnalysis = JSON.stringify(
          `Overall performance shows ${qualityScore}% quality, ${speedScore}% speed, and ${adaptabilityScore}% adaptability. Completion rate: ${completionRate}%. ${fullScoreAnalysis.feedback.detailed_feedback || ''}`
        );
        const sanitizedStrengths = JSON.stringify(
          Array.isArray(fullScoreAnalysis.feedback.strengths) 
            ? fullScoreAnalysis.feedback.strengths.join('; ') 
            : 'Completed the simulation successfully'
        );
        const sanitizedAreasForImprovement = JSON.stringify(
          Array.isArray(fullScoreAnalysis.feedback.improvements) 
            ? fullScoreAnalysis.feedback.improvements.join('; ') 
            : 'Continue to improve in all areas'
        );
        const sanitizedRecommendations = JSON.stringify(
          Array.isArray(fullScoreAnalysis.feedback.improvements) 
            ? fullScoreAnalysis.feedback.improvements.map((imp: string) => imp.replace(/[⚠️✅❌📚🎉]/g, '').trim()).slice(0, 3)
            : ['Review all tasks and ensure completeness']
        );

        await client.query(`
          INSERT INTO evaluation_ai_feedback (
            evaluation_id,
            summary,
            detailed_analysis,
            strengths,
            areas_for_improvement,
            recommendations,
            confidence
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (evaluation_id) 
          DO UPDATE SET
            summary = EXCLUDED.summary,
            detailed_analysis = EXCLUDED.detailed_analysis,
            strengths = EXCLUDED.strengths,
            areas_for_improvement = EXCLUDED.areas_for_improvement,
            recommendations = EXCLUDED.recommendations,
            confidence = EXCLUDED.confidence,
            updated_at = NOW()
        `, [
          evaluationId,
          sanitizedSummary,
          sanitizedDetailedAnalysis,
          sanitizedStrengths,
          sanitizedAreasForImprovement,
          sanitizedRecommendations,
          0.85
        ]);
      }

      await client.query('COMMIT');
      console.log('✅ Transaction committed successfully');
      
    } catch (dbError: any) {
      await client.query('ROLLBACK');
      console.error('❌ Database transaction failed:', dbError);
      throw dbError;
    } finally {
      client.release();
    }

    // ============================================
    // STEP 8: Return COMPLETE response with ALL details
    // ============================================
    const totalDuration = Date.now() - startTime;
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [submitSimulation] COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 FINAL SCORES:', {
      overall: finalOverallScore,
      baseScore: overallScore,
      participationBonus,
      quality: qualityScore,
      technical: technicalScore,
      punctuality: punctualityScore,
      adaptability: adaptabilityScore,
      speed: speedScore,
      github: githubScore,
      passed: finalPassed,
      completionRate: `${completionRate}%`,
      completionAngle: `${completionAngle}°`,
      totalTime: sessionCompleteTime.formatted
    });
    

      // SAVE ALL SUBMISSION DATA TO simulation_sessions.submission_results
      // ============================================

      // DECLARE submissionResults OUTSIDE the try block
      let submissionResults = null;

      try {
          console.log('💾 Saving ALL submission results to simulation_sessions.submission_results...');
          
          // Create the submission results object with ALL response variables
          submissionResults = {
              // Basic submission info
              sessionId: session.id,
              simulationId: session.simulation_id,
              simulationRecordId: simulationRecordId,
              score: finalOverallScore,
              passed: finalPassed,
              passingScore: passingScore,
              submittedAt: new Date().toISOString(),
              message: submissionMessage,

              // Completion angle
              completionAngle: completionAngle,

              // Data quantity and quality
              dataQuantity: dataQuantityAnalysis,
              dataQuality: dataQualityAnalysis,

              // Session complete time
              sessionCompleteTime: sessionCompleteTime,

              // Participation marks
              participation: {
                  qualifies: qualifiesForParticipation,
                  bonus: participationBonus,
                  message: participationMessage,
                  min_time_required: '30 minutes',
                  time_spent: sessionCompleteTime.formatted
              },

              // Score breakdown
              scoreBreakdown: {
                  overall: finalOverallScore,
                  base_overall: overallScore,
                  participation_bonus: participationBonus,
                  quality: qualityScore,
                  technical: technicalScore,
                  punctuality: punctualityScore,
                  adaptability: adaptabilityScore,
                  speed: speedScore,
                  behavioral: behavioralScore,
                  communication: communicationScore,
                  collaboration: collaborationScore,
                  github: githubScore,
                  completion_rate: completionRate,
                  average_task_score: fullScoreAnalysis.scores.average_task_score,
                  weighted_breakdown: fullScoreAnalysis.scores.weighted_breakdown,
                  quality_breakdown: fullScoreAnalysis.scores.quality_breakdown,
                  behavioral_breakdown: fullScoreAnalysis.scores.behavioral_breakdown,
                  speed_breakdown: fullScoreAnalysis.scores.speed_breakdown,
                  punctuality_breakdown: fullScoreAnalysis.scores.punctuality_breakdown,
                  adaptability_breakdown: fullScoreAnalysis.scores.adaptability_breakdown,
                  technical_breakdown: fullScoreAnalysis.scores.technical_breakdown
              },

              // Task analysis
              taskAnalysis: taskAnalysis,

              // Summary statistics
              summary: {
                  total_tasks: totalTasks,
                  completed_tasks: completedTasksCount,
                  in_progress_tasks: fullScoreAnalysis.summary.in_progress_tasks,
                  not_started_tasks: fullScoreAnalysis.summary.not_started_tasks,
                  completion_rate: completionRate,
                  completion_angle: completionAngle,
                  total_time_seconds: totalTimeSeconds,
                  total_time_formatted: sessionCompleteTime.formatted,
                  time_limit_seconds: timeLimitSeconds,
                  time_limit_formatted: `${Math.floor(timeLimitSeconds / 60)}m ${timeLimitSeconds % 60}s`,
                  time_used_percent: sessionCompleteTime.time_used_percent,
                  time_remaining_seconds: Math.max(0, timeLimitSeconds - totalTimeSeconds),
                  time_remaining_formatted: Math.max(0, timeLimitSeconds - totalTimeSeconds) > 0
                      ? `${Math.floor((timeLimitSeconds - totalTimeSeconds) / 60)}m ${(timeLimitSeconds - totalTimeSeconds) % 60}s`
                      : 'EXPIRED',
                  passed: finalPassed,
                  passing_score: passingScore
              },

              // Feedback
              feedback: fullScoreAnalysis.feedback,

              // GitHub analysis
              githubAnalysis: fullScoreAnalysis.github_analysis || {
                  has_repo: false,
                  score: 0,
                  repo_info: null,
                  detailed_marks: null,
                  full_analysis: null,
                  message: 'No GitHub repository linked to this simulation'
              },

              // Communication analysis
              communicationAnalysis: communicationAnalysis || null,

              // Scoring configuration
              scoring_config: fullScoreAnalysis.scoring_config,

              // Raw data
              raw_data: fullScoreAnalysis.raw_data,

              // Time tracking
              timeTracking: {
                  sessionStartedAt: session.started_at,
                  sessionCompletedAt: sessionCompleteTime.completed_at,
                  sessionTotalSeconds: totalTimeSeconds,
                  sessionTotalFormatted: sessionCompleteTime.formatted,
                  timeLimitSeconds: timeLimitSeconds,
                  timeLimitFormatted: `${Math.floor(timeLimitSeconds / 60)}m ${timeLimitSeconds % 60}s`,
                  timeUsedPercent: sessionCompleteTime.time_used_percent,
                  remainingSeconds: Math.max(0, timeLimitSeconds - totalTimeSeconds),
                  remainingFormatted: Math.max(0, timeLimitSeconds - totalTimeSeconds) > 0
                      ? `${Math.floor((timeLimitSeconds - totalTimeSeconds) / 60)}m ${(timeLimitSeconds - totalTimeSeconds) % 60}s`
                      : 'EXPIRED',
                  submittedOnTime: sessionCompleteTime.submitted_on_time
              },

              // Full analysis
              fullAnalysis: fullScoreAnalysis,
              
              // Blockchain info
              blockchain: blockchainTxHash ? {
                  txHash: blockchainTxHash,
                  blockNumber: blockchainBlockNumber,
                  credentialHash: credentialHash,
                  verified: true,
                  message: 'Simulation result stored on blockchain and verifiable credential created'
              } : null,
              
              // Metadata
              savedAt: new Date().toISOString(),
              version: '1.0'
          };
          
          // Save to the submission_results column in simulation_sessions table
          await DatabaseService.query(`
              UPDATE simulation_sessions 
              SET 
                  submission_results = $1::JSONB,
                  score = $2,
                  status = 'completed',
                  completed_at = NOW(),
                  updated_at = NOW()
              WHERE id = $3
          `, [
              JSON.stringify(submissionResults),
              finalOverallScore,
              session.id
          ]);
          
          console.log('✅ Submission results saved to simulation_sessions.submission_results');
          
      } catch (saveError) {
          console.error('❌ Error saving submission results:', saveError);
          // Don't throw - continue to return response
      }

      // ============================================
      // ✅ RETURN THE submissionResults OBJECT (NO DUPLICATE CODE)
      // ============================================
      if (!submissionResults) {
          // Fallback: create a minimal response if save failed
          submissionResults = {
              sessionId: session.id,
              simulationId: session.simulation_id,
              simulationRecordId: simulationRecordId,
              score: finalOverallScore,
              passed: finalPassed,
              passingScore: passingScore,
              submittedAt: new Date().toISOString(),
              message: submissionMessage,
              error: 'Failed to save full results to database'
          };
      }

      ResponseService.success(res, submissionResults, `Simulation ${finalPassed ? 'passed' : 'completed'} successfully`);
    } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [submitSimulation] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      sessionId: req.params.id,
      userId: req.user?.id,
      totalDurationMs: totalDuration,
      timestamp: new Date().toISOString()
    });
    console.error('═══════════════════════════════════════════════════════════════');
    ResponseService.error(res, error.message || 'Failed to submit simulation', 500);
  }
}

// Method to get submission results from the column
async getSubmissionResults(req: AuthenticatedRequest, res: Response) {
    try {
        const { sessionId } = req.params;
        
        if (!sessionId || !ValidationService.isValidUUID(sessionId)) {
            ResponseService.error(res, 'Invalid session ID', 400);
            return;
        }
        
        // Check access
        const sessionCheck = await DatabaseService.query(`
            SELECT ss.user_id, ss.submission_results, ss.score, ss.status
            FROM simulation_sessions ss
            WHERE ss.id = $1
        `, [sessionId]);
        
        if (!sessionCheck.rows[0]) {
            ResponseService.notFound(res, 'Session not found');
            return;
        }
        
        const session = sessionCheck.rows[0];
        const isOwner = session.user_id === req.user.id;
        const isRecruiter = req.user.user_type === 'recruiter' || 
                            req.user.user_type === 'company_admin' || 
                            req.user.user_type === 'system_admin';
        
        if (!isOwner && !isRecruiter) {
            ResponseService.forbidden(res, 'Access denied');
            return;
        }
        
        // Parse the submission_results JSONB
        let submissionResults = session.submission_results;
        if (typeof submissionResults === 'string') {
            submissionResults = JSON.parse(submissionResults);
        }
        
        // If no submission results, return basic info
        if (!submissionResults || Object.keys(submissionResults).length === 0) {
            ResponseService.success(res, {
                sessionId: sessionId,
                hasResults: false,
                score: session.score,
                status: session.status,
                message: 'No submission results found for this session'
            });
            return;
        }
        
        // Return the exact same structure that was saved
        ResponseService.success(res, {
            hasResults: true,
            ...submissionResults
        }, 'Submission results retrieved');
        
    } catch (error) {
        console.error('Error retrieving submission results:', error);
        ResponseService.error(res, 'Failed to retrieve submission results', 500);
    }
}


  async autoSaveProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const validation = AutoSaveSchema.safeParse(req.body);
      
      if (!validation.success) {
        ResponseService.error(res, 'Invalid input', 400, JSON.stringify(validation.error.issues));
        return;
      }

      const { currentTask, answers, progress } = validation.data;
      
      const result = await DatabaseService.query(`
        UPDATE simulation_sessions 
        SET 
          current_task = COALESCE($1, current_task),
          answers = CASE WHEN $2::jsonb IS NOT NULL THEN $2::jsonb ELSE answers END,
          progress = CASE WHEN $3::jsonb IS NOT NULL THEN $3::jsonb ELSE progress END,
          updated_at = NOW()
        WHERE id = $4 
          AND user_id = $5
          AND status = 'in_progress'
        RETURNING id, updated_at
      `, [
        currentTask, 
        answers ? JSON.stringify(answers) : null, 
        progress ? JSON.stringify(progress) : null, 
        sessionId, 
        req.user.id
      ]);
      
      if (!result.rows[0]) {
        ResponseService.notFound(res, 'Session not found or not in progress');
        return;
      }
      
      ResponseService.success(res, { 
        savedAt: result.rows[0].updated_at,
        sessionId: result.rows[0].id
      }, 'Progress saved');
    } catch (error: any) {
      ResponseService.error(res, 'Failed to save progress', 500, null, this.formatError(error));
    }
  }

  // ============================================
// CANDIDATE SIMULATION METHODS
// ============================================

async startAppliedJobSimulation(req: AuthenticatedRequest, res: Response): Promise<void> {
  const client = await DatabaseService.getClient();
  let simulationRecordId: string;
  let session: any;
  let template: any;
  
  try {
    const { simulationId, applicationId, githubUsername } = req.body;

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🚀 [startAppliedJobSimulation] CALLED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📥 Request body:', { simulationId, applicationId, githubUsername });
    console.log('👤 User:', { userId: req.user.id, userType: req.user.user_type });

    // Validation
    if (!simulationId || !applicationId) {
      console.log('❌ Missing simulationId or applicationId');
      ResponseService.error(res, 'Simulation ID and Application ID are required', 400);
      return;
    }

    if (!githubUsername) {
      console.log('❌ Missing githubUsername');
      ResponseService.error(res, 'GitHub username is required', 400);
      return;
    }

    if (!ValidationService.isValidUUID(simulationId) || !ValidationService.isValidUUID(applicationId)) {
      console.log('❌ Invalid UUID format');
      ResponseService.error(res, 'Invalid ID format', 400);
      return;
    }

    console.log('✅ Validation passed');

    // Acquire lock
    const lockKey = `sim_${req.user.id}_${applicationId}`;
    const locked = await this.acquireLock(lockKey);
    if (!locked) {
      console.log('❌ Failed to acquire lock');
      ResponseService.error(res, 'Another session is being created, please retry', 409);
      return;
    }

    console.log('✅ Lock acquired');

    await client.query('BEGIN');

    try {
      // Check active sessions count
      const sessionCount = await client.query(`
        SELECT COUNT(*) FROM simulation_sessions ss
        JOIN simulations s ON ss.simulation_id = s.id
        WHERE ss.user_id = $1 AND ss.status = 'in_progress'
      `, [req.user.id]);

      if (parseInt(sessionCount.rows[0].count) >= SIMULATION_CONFIG.MAX_ACTIVE_SESSIONS_PER_USER) {
        await client.query('ROLLBACK');
        console.log('❌ Too many active sessions');
        ResponseService.error(res, `You have too many active simulations. Maximum ${SIMULATION_CONFIG.MAX_ACTIVE_SESSIONS_PER_USER} allowed.`, 429);
        return;
      }

      console.log('✅ Session count check passed');

      // Check application
      const appCheck = await client.query(`
        SELECT a.id, a.job_id, j.title, j.company_id
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        WHERE a.id = $1 AND a.user_id = $2 AND a.status NOT IN ('rejected', 'withdrawn')
      `, [applicationId, req.user.id]);

      if (!appCheck.rows[0]) {
        await client.query('ROLLBACK');
        console.log('❌ Application not found');
        ResponseService.error(res, 'Application not found or access denied', 404);
        return;
      }

      console.log('✅ Application found:', { jobId: appCheck.rows[0].job_id });

      // Check simulation template
      const simCheck = await client.query(`
        SELECT id, name, duration_minutes, tasks, job_id, scoring_rubric
        FROM simulation_templates
        WHERE id = $1 AND job_id = $2 AND is_active = true
      `, [simulationId, appCheck.rows[0].job_id]);

      if (!simCheck.rows[0]) {
        await client.query('ROLLBACK');
        console.log('❌ Simulation template not found or inactive');
        ResponseService.error(res, 'Simulation not available for this job', 404);
        return;
      }

      console.log('✅ Simulation template found:', { name: simCheck.rows[0].name });

      // Check if template is available (check availability dates)
      const availabilityCheck = await this.isTemplateAvailable(simulationId);
      if (!availabilityCheck.available) {
        await client.query('ROLLBACK');
        console.log('❌ Template not available:', availabilityCheck.reason);
        ResponseService.error(res, availabilityCheck.reason || 'Simulation is not available', 400);
        return;
      }

      template = simCheck.rows[0];

      // Check existing simulation
      const existingSimulation = await client.query(`
        SELECT s.id, s.status
        FROM simulations s
        WHERE s.template_id = $1 AND s.application_id = $2 AND s.user_id = $3
        ORDER BY s.created_at DESC
        LIMIT 1
      `, [simulationId, applicationId, req.user.id]);

      if (existingSimulation.rows[0]) {
        simulationRecordId = existingSimulation.rows[0].id;
        console.log('✅ Existing simulation found:', { simulationRecordId });
        
        const activeSession = await client.query(`
          SELECT ss.id
          FROM simulation_sessions ss
          WHERE ss.simulation_id = $1 AND ss.user_id = $2 AND ss.status = 'in_progress'
          LIMIT 1
        `, [simulationRecordId, req.user.id]);
        
        if (activeSession.rows[0]) {
          await client.query('COMMIT');
          console.log('⚠️ Active session already exists');
          ResponseService.success(res, {
            sessionId: activeSession.rows[0].id,
            simulationId: simulationRecordId,
            status: 'in_progress',
            message: 'Existing active session found. Use resume endpoint.'
          }, 'Existing active session found');
          return;
        }
        
        await client.query(`
          UPDATE simulations 
          SET status = 'in_progress', updated_at = NOW()
          WHERE id = $1
        `, [simulationRecordId]);
      } else {
        const newSimulation = await client.query(`
          INSERT INTO simulations (
            template_id,
            application_id,
            job_id,
            user_id,
            status,
            current_task,
            created_at,
            updated_at,
            metadata
          ) VALUES ($1, $2, $3, $4, 'in_progress', 0, NOW(), NOW(), $5)
          RETURNING id
        `, [
          template.id,
          applicationId,
          template.job_id,
          req.user.id,
          JSON.stringify({ startedAt: new Date().toISOString() })
        ]);
        simulationRecordId = newSimulation.rows[0].id;
        console.log('✅ New simulation created:', { simulationRecordId });
      }

      // Create simulation session
      const newSession = await client.query(`
        INSERT INTO simulation_sessions (
          simulation_id,
          user_id,
          application_id,
          session_type,
          started_at,
          status,
          time_limit,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'candidate', NOW(), 'in_progress', $4, NOW(), NOW())
        RETURNING id, started_at, time_limit
      `, [
        simulationRecordId,
        req.user.id,
        applicationId,
        template.duration_minutes * 60
      ]);

      session = newSession.rows[0];
      console.log('✅ New session created:', { sessionId: session.id });
      
      // ✅ COMMIT the transaction BEFORE creating GitHub repo
      await client.query('COMMIT');
      
      // ✅ RELEASE the client immediately after commit to avoid timeout
      client.release();
      
      console.log('✅ Transaction committed, client released - proceeding with GitHub operations');
      
    } catch (dbError: any) {
      await client.query('ROLLBACK');
      client.release();
      console.error('❌ Database error:', dbError);
      ResponseService.error(res, 'Failed to create simulation session', 500);
      return;
    }
    
    // ============================================
    // GITHUB OPERATIONS (outside transaction)
    // ============================================
    
    // ✅ NEW: Get candidate's first name for better repo naming
    const candidateInfo = await DatabaseService.query(`
      SELECT first_name, last_name 
      FROM candidate_profiles 
      WHERE user_id = $1
    `, [req.user.id]);
    
    const firstName = candidateInfo.rows[0]?.first_name || 'candidate';
    const lastName = candidateInfo.rows[0]?.last_name || '';
    const candidateName = `${firstName}${lastName ? `-${lastName}` : ''}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    // ✅ NEW: Clean simulation name for use in repo name
    const simulationName = template.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30); // Limit length
    
    // ✅ NEW: Generate timestamp for uniqueness
    const timestamp = Date.now();
    const shortSimId = simulationRecordId.substring(0, 6);
    
    // ✅ NEW REPO NAME FORMAT: {simulation-name}-{candidate-name}-{timestamp}
    // Example: "frontend-developer-simulation-john-doe-1704067200000"
    const repoName = `${simulationName}-${candidateName}-${timestamp}`;
    
    const orgName = process.env.GITHUB_ORG_NAME || 'recruitment-platform';
    const repoUrl = `https://github.com/${orgName}/${repoName}`;
    const cloneUrl = `${repoUrl}.git`;
    const branchName = `${candidateName}-${shortSimId}`;

    console.log('🐙 [GitHub] Creating repository...');
    console.log('📊 GitHub repo config:', { 
      repoName, 
      simulationName: template.name,
      candidateName,
      orgName, 
      githubUsername, 
      taskCount: template.tasks?.length 
    });

    // Create GitHub repository using the controller method
    let repoResult = null;
    let githubLinksData = null;
    
    try {
      const templateTasks = typeof template.tasks === 'string' ? JSON.parse(template.tasks) : template.tasks;
      
      repoResult = await githubController.createSimulationRepoInternal(
        simulationRecordId,
        session.id,
        repoName,
        githubUsername,
        templateTasks,
        orgName
      );
      
      console.log(`✅ GitHub repository created: ${repoResult.repoUrl}`);
      console.log(`📋 Issues created: ${repoResult.issuesCreated?.length || 0}`);
      console.log(`📊 Organization: ${repoResult.organizationName}`);
      console.log(`👤 Candidate: ${repoResult.candidateUsername}`);
      
      // Create COMPLETE github_links data object
      githubLinksData = {
        repoName: repoResult.repoName,
        repoUrl: repoResult.repoUrl,
        cloneUrl: repoResult.cloneUrl,
        branchName: repoResult.branchName || branchName,
        organizationName: repoResult.organizationName || orgName,
        candidateUsername: githubUsername,
        candidateId: req.user.id,
        sessionId: session.id,
        simulationId: simulationRecordId,
        simulationName: template.name,
        status: 'active',
        createdAt: new Date().toISOString(),
        issues: repoResult.issuesCreated || [],
        attemptNumber: repoResult.attemptNumber || 1
      };
      
      console.log('📦 GitHub links data prepared');
      
      // ✅ Store in github_simulation_repos table
      await DatabaseService.query(`
        INSERT INTO github_simulation_repos (
          simulation_id,
          candidate_id,
          session_id,
          repo_name,
          repo_url,
          branch_name,
          status,
          attempt_number,
          metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (simulation_id, candidate_id, session_id) 
        WHERE status = 'active'
        DO UPDATE SET
          repo_name = EXCLUDED.repo_name,
          repo_url = EXCLUDED.repo_url,
          branch_name = EXCLUDED.branch_name,
          updated_at = NOW()
      `, [
        simulationRecordId,
        req.user.id,
        session.id,
        repoResult.repoName,
        repoResult.repoUrl,
        repoResult.branchName || branchName,
        'active',
        repoResult.attemptNumber || 1,
        JSON.stringify({
          simulation_name: template.name,
          candidate_name: candidateName,
          issues_created: repoResult.issuesCreated?.length || 0
        })
      ]);
      
      console.log('✅ GitHub repo record saved to database');
      
    } catch (githubError: any) {
      console.error('⚠️ GitHub repo creation error:', {
        message: githubError?.message,
        status: githubError?.status,
        code: githubError?.code
      });
      console.warn('GitHub repo creation warning - continuing anyway');
      
      // Create fallback github_links data
      githubLinksData = {
        repoName: repoName,
        repoUrl: repoUrl,
        cloneUrl: cloneUrl,
        branchName: branchName,
        organizationName: orgName,
        candidateUsername: githubUsername,
        candidateId: req.user.id,
        sessionId: session.id,
        simulationId: simulationRecordId,
        simulationName: template.name,
        status: 'pending',
        createdAt: new Date().toISOString(),
        error: githubError?.message || 'Repository creation failed',
        issues: []
      };
      
      console.log('📦 Fallback GitHub links data prepared');
    }
    
    // ✅ Store GitHub repo info in session using a NEW client
    if (githubLinksData) {
      const updateClient = await DatabaseService.getClient();
      try {
        await updateClient.query(`
          UPDATE simulation_sessions
          SET 
            github_links = $1,
            updated_at = NOW()
          WHERE id = $2
        `, [
          JSON.stringify(githubLinksData),
          session.id
        ]);
        
        console.log('✅ GitHub data stored in session github_links');
        console.log('   Session ID:', session.id);
        console.log('   Repo URL:', githubLinksData.repoUrl);
        console.log('   Branch:', githubLinksData.branchName);
        console.log('   Repo Name Pattern: {simulation-name}-{candidate-name}-{timestamp}');
      } catch (updateError: any) {
        console.error('❌ Failed to update session with GitHub data:', updateError.message);
      } finally {
        updateClient.release();
      }
    } else {
      console.warn('⚠️ No GitHub data to store');
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [startAppliedJobSimulation] SUCCESS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 Response summary:', {
      sessionId: session.id,
      simulationId: simulationRecordId,
      simulationName: template.name,
      candidateName: candidateName,
      repoName: repoName,
      hasGitHubRepo: !!repoResult,
      githubRepoUrl: repoResult?.repoUrl || repoUrl
    });

    ResponseService.success(res, {
      sessionId: session.id,
      simulationId: simulationRecordId,
      simulationTemplateId: template.id,
      simulationName: template.name,
      duration: template.duration_minutes,
      tasks: template.tasks,
      startedAt: session.started_at,
      timeLimit: session.time_limit,
      scoringRubric: template.scoring_rubric,
      githubRepo: repoResult ? {
        repoName: repoResult.repoName,
        repoUrl: repoResult.repoUrl,
        cloneUrl: repoResult.cloneUrl,
        branchName: repoResult.branchName || branchName,
        organizationName: repoResult.organizationName || orgName,
        candidateUsername: githubUsername,
        issues: repoResult.issuesCreated || []
      } : {
        repoName: repoName,
        repoUrl: repoUrl,
        cloneUrl: cloneUrl,
        branchName: branchName,
        organizationName: orgName,
        candidateUsername: githubUsername,
        issues: []
      }
    }, 'Simulation started successfully with GitHub repository created');
    
  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [startAppliedJobSimulation] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      stack: error?.stack
    });
    console.error('═══════════════════════════════════════════════════════════════');
    ResponseService.error(res, 'Failed to start simulation', 500, null, this.formatError(error));
  }
}

  // ============================================
  // COMPLETE SIMULATION START FLOW
  // ============================================
  // Creates: Simulation record → Tasks → Session → GitHub Repo → Issues
  // Returns: GitHub repo name/URL for candidate to use
  async startSimulationFlow(req: AuthenticatedRequest, res: Response): Promise<void> {
    const client = await DatabaseService.getClient();
    
    try {
      const { 
        templateId, 
        applicationId, 
        candidateGitHubUsername,
        candidateId 
      } = req.body;

      // Validation
      if (!templateId || !ValidationService.isValidUUID(templateId)) {
        ResponseService.error(res, 'Valid template ID is required', 400);
        return;
      }

      if (applicationId && !ValidationService.isValidUUID(applicationId)) {
        ResponseService.error(res, 'Invalid application ID format', 400);
        return;
      }

      if (!candidateGitHubUsername || typeof candidateGitHubUsername !== 'string') {
        ResponseService.error(res, 'Candidate GitHub username is required', 400);
        return;
      }

      const effectiveCandidateId = candidateId || req.user.id;

      await client.query('BEGIN');

      try {
        // STEP 1: Get template and validate
        console.log('📋 [STEP 1] Fetching template...');
        const templateResult = await client.query(`
          SELECT id, name, duration_minutes, tasks, job_id, scoring_rubric, pass_fail_criteria
          FROM simulation_templates
          WHERE id = $1 AND is_active = true
        `, [templateId]);

        if (!templateResult.rows[0]) {
          await client.query('ROLLBACK');
          ResponseService.error(res, 'Template not found or inactive', 404);
          return;
        }

        const template = templateResult.rows[0];
        const templateTasks = typeof template.tasks === 'string' ? JSON.parse(template.tasks) : template.tasks;

        // Check if template is available (check availability dates)
        const availabilityCheck = await this.isTemplateAvailable(templateId);
        if (!availabilityCheck.available) {
          await client.query('ROLLBACK');
          console.log('❌ Template not available:', availabilityCheck.reason);
          ResponseService.error(res, availabilityCheck.reason || 'Simulation is not available', 400);
          return;
        }

        // STEP 2: Create simulation record
        console.log('📝 [STEP 2] Creating simulation record...');
        const simulationResult = await client.query(`
          INSERT INTO simulations (
            template_id,
            application_id,
            job_id,
            user_id,
            status,
            current_task,
            time_limit,
            tasks,
            created_at,
            updated_at,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9)
          RETURNING id
        `, [
          template.id,
          applicationId || null,
          template.job_id || null,
          effectiveCandidateId,
          'scheduled',
          0,
          template.duration_minutes * 60,
          template.tasks,
          JSON.stringify({ createdAt: new Date().toISOString() })
        ]);

        const simulationId = simulationResult.rows[0].id;
        console.log(`✅ Simulation created: ${simulationId}`);

        // STEP 3: Copy tasks from template to simulation_tasks
        console.log('📋 [STEP 3] Copying tasks from template...');
        const taskInserts: any[] = [];
        
        for (let i = 0; i < templateTasks.length; i++) {
          const task = templateTasks[i];
          const taskIndex = task.task_index || task.order || (i + 1);
          
          const taskResult = await client.query(`
            INSERT INTO simulation_tasks (
              simulation_id,
              task_index,
              task_name,
              task_type,
              task_data,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING id
          `, [
            simulationId,
            taskIndex,
            task.title || task.task_name || task.name || `Task ${taskIndex}`,
            task.type || task.task_type || 'technical',
            JSON.stringify(task)
          ]);
          
          taskInserts.push({
            taskId: taskResult.rows[0].id,
            taskIndex,
            ...task
          });
        }
        console.log(`✅ ${taskInserts.length} tasks copied`);

        // STEP 4: Create simulation_sessions record
        console.log('🔄 [STEP 4] Creating simulation session...');
        const sessionResult = await client.query(`
          INSERT INTO simulation_sessions (
            simulation_id,
            user_id,
            application_id,
            session_type,
            status,
            time_limit,
            created_at,
            updated_at,
            github_links
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)
          RETURNING id
        `, [
          simulationId,
          effectiveCandidateId,
          applicationId || null,
          'candidate',
          'scheduled',
          template.duration_minutes * 60,
          JSON.stringify({ status: 'pending' })
        ]);

        const sessionId = sessionResult.rows[0].id;
        console.log(`✅ Session created: ${sessionId}`);

        // STEP 5: Create GitHub repository
        console.log('🐙 [STEP 5] Creating GitHub repository...');
        const repoResponse = await githubController.createSimulationRepo(
          {
            body: {
              candidateId: effectiveCandidateId,
              simulationId: simulationId,
              candidateGitHubUsername: candidateGitHubUsername,
              tasks: templateTasks
            },
            user: req.user
          } as AuthenticatedRequest,
          res
        );

        // Get repo info from GitHub response (we'll extract it from the flow)
        // For now, just mark the session as ready
        console.log(`✅ GitHub repository created`);

        // Update session with GitHub repo info
        const repoName = `sim-${simulationId.substring(0, 8)}-${effectiveCandidateId.substring(0, 8)}`;
        const repoUrl = `https://github.com/${process.env.GITHUB_ORG_NAME}/${repoName}`;
        const branchName = `candidate-${effectiveCandidateId.substring(0, 8)}`;

        await client.query(`
          UPDATE simulation_sessions
          SET 
            github_links = $1,
            updated_at = NOW()
          WHERE id = $2
        `, [
          JSON.stringify({
            repoName,
            repoUrl,
            cloneUrl: `git@github.com:${process.env.GITHUB_ORG_NAME}/${repoName}.git`,
            branchName,
            createdAt: new Date().toISOString()
          }),
          sessionId
        ]);

        // Update simulation metadata with GitHub info
        await client.query(`
          UPDATE simulations
          SET 
            metadata = jsonb_set(metadata, '{github}', $1::jsonb),
            updated_at = NOW()
          WHERE id = $2
        `, [
          JSON.stringify({
            repoName,
            repoUrl,
            branchName,
            status: 'ready'
          }),
          simulationId
        ]);

        await client.query('COMMIT');

        // Return comprehensive response
        ResponseService.success(res, {
          simulation: {
            id: simulationId,
            templateId: template.id,
            status: 'scheduled',
            taskCount: taskInserts.length,
            durationMinutes: template.duration_minutes
          },
          session: {
            id: sessionId,
            status: 'scheduled'
          },
          github: {
            repoName,
            repoUrl,
            cloneUrl: `git@github.com:${process.env.GITHUB_ORG_NAME}/${repoName}.git`,
            branchName,
            instruction: `Clone the repo and checkout the ${branchName} branch to start the simulation`
          },
          tasks: {
            total: taskInserts.length,
            list: taskInserts.map((t, idx) => ({
              index: t.taskIndex,
              name: t.task_name || t.title,
              type: t.type || t.task_type,
              order: idx + 1
            }))
          },
          message: 'Simulation flow completed successfully. Candidate can now start working in the GitHub repository.'
        }, 'Simulation flow started successfully', 201);

      } catch (stepError: any) {
        await client.query('ROLLBACK');
        throw stepError;
      }

    } catch (error: any) {
      console.error('Simulation start flow error:', error);
      ResponseService.error(res, 'Failed to start simulation flow', 500, null, this.formatError(error));
    } finally {
      client.release();
    }
  }

 async getMySimulations(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { page = '1', limit = '20', status } = req.query;
    const validPage = Number(page);
    const validLimit = Math.min(Number(limit), 50);
    const offset = (validPage - 1) * validLimit;

    let statusFilter = '';
    const queryParams: any[] = [req.user.id];

    if (status && ['not_started', 'in_progress', 'completed'].includes(status as string)) {
      if (status === 'not_started') {
        statusFilter = `AND (sim.id IS NULL)`;
      } else if (status === 'in_progress') {
        statusFilter = `AND sim.status = 'in_progress'`;
      } else if (status === 'completed') {
        statusFilter = `AND sim.status = 'completed'`;
      }
    }

    // ✅ FIXED: Get the LATEST session (not just in_progress)
    const result = await DatabaseService.query(`
      SELECT 
        a.id as application_id,
        a.job_id,
        a.status as application_status,
        a.applied_at,
        a.match_score,
        j.title as job_title,
        j.description as job_description,
        j.job_type,
        j.work_arrangement,
        j.locations as job_locations,
        c.id as company_id,
        c.name as company_name,
        c.logo_url,
        c.description as company_description,
        st.id as simulation_id,
        st.name as simulation_name,
        st.description as simulation_description,
        st.duration_minutes,
        st.difficulty,
        st.type as simulation_type,
        st.tasks,
        st.tasks_structure,
        st.scoring_rubric,
        st.pass_fail_criteria,
        st.metadata,
        sim.id as simulation_record_id,
        sim.status as simulation_status,
        sim.overall_score as simulation_score,
        sim.created_at as simulation_created_at,
        -- ✅ FIXED: Get the LATEST session (ordered by created_at DESC, limit 1)
        s.id as session_id,
        s.status as session_status,
        s.started_at,
        s.completed_at,
        s.score as session_score,
        s.time_spent,
        s.current_task,
        s.github_links
      FROM applications a
      INNER JOIN jobs j ON a.job_id = j.id
      INNER JOIN companies c ON j.company_id = c.id
      LEFT JOIN simulation_templates st ON st.job_id = j.id AND st.is_active = true
      LEFT JOIN simulations sim ON sim.template_id = st.id AND sim.application_id = a.id AND sim.user_id = a.user_id
      -- ✅ FIXED: Get LATEST session using LATERAL (works in PostgreSQL)
      LEFT JOIN LATERAL (
        SELECT s2.* 
        FROM simulation_sessions s2 
        WHERE s2.simulation_id = sim.id AND s2.session_type = 'candidate'
        ORDER BY s2.created_at DESC 
        LIMIT 1
      ) s ON true
      WHERE a.user_id = $1
        AND a.status NOT IN ('rejected', 'withdrawn')
        AND j.status = 'active'
        ${statusFilter}
      ORDER BY a.applied_at DESC, sim.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, validLimit, offset]);

    const allSimulations = result.rows.map((row: any) => ({
      id: row.simulation_id,
      applicationId: row.application_id,
      jobId: row.job_id,
      jobTitle: row.job_title,
      companyName: row.company_name,
      companyLogo: row.logo_url,
      companyDescription: row.company_description,
      simulationName: row.simulation_name || `${row.job_title} Assessment`,
      description: row.simulation_description || `Complete this simulation to demonstrate your skills for the ${row.job_title} position.`,
      duration: row.duration_minutes || 30,
      difficulty: row.difficulty || 'intermediate',
      type: row.simulation_type || 'technical',
      status: row.simulation_status || 'not_started',
      sessionId: row.session_id,  // ✅ Now returns sessionId for ALL simulations (completed and in_progress)
      sessionStatus: row.session_status,
      score: row.simulation_score,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      appliedAt: row.applied_at,
      applicationStatus: row.application_status,
      matchScore: row.match_score,
      tasks: row.tasks,
      tasksStructure: row.tasks_structure,
      scoringRubric: row.scoring_rubric,
      passFailCriteria: row.pass_fail_criteria,
      metadata: row.metadata
    }));

    const paginatedSimulations = allSimulations.slice(offset, offset + validLimit);
    const total = allSimulations.length;

    console.log(`📊 [getMySimulations] Returning ${paginatedSimulations.length} simulations`);
    console.log(`📊 Session IDs present: ${paginatedSimulations.filter((sim: any) => sim.sessionId).length}/${paginatedSimulations.length}`);

    ResponseService.success(res, {
      data: paginatedSimulations,
      pagination: {
        page: validPage,
        limit: validLimit,
        total: total,
        pages: Math.ceil(total / validLimit),
        has_next: validPage * validLimit < total,
        has_prev: validPage > 1,
      }
    });
  } catch (error: any) {
    console.error('Error in getMySimulations:', error);
    ResponseService.error(res, 'Failed to fetch simulations', 500);
  }
}

  async getMySimulationById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || !ValidationService.isValidUUID(id)) {
        ResponseService.error(res, 'Invalid simulation ID format', 400);
        return;
      }

      const result = await DatabaseService.query(`
        SELECT 
          a.id as application_id,
          a.job_id,
          a.status as application_status,
          a.applied_at,
          a.match_score,
          j.title as job_title,
          j.description as job_description,
          j.job_type,
          j.work_arrangement,
          j.locations,
          j.salary_min,
          j.salary_max,
          j.benefits,
          c.id as company_id,
          c.name as company_name,
          c.logo_url,
          c.description as company_description,
          st.id as simulation_template_id,
          st.name as simulation_name,
          st.description as simulation_description,
          st.duration_minutes,
          st.difficulty,
          st.type as simulation_type,
          st.tasks,
          st.scoring_rubric,
          st.instructions,
          st.pass_fail_criteria,
          st.tasks_structure,
          st.metadata,
          s.id as session_id,
          s.status as session_status,
          s.started_at,
          s.completed_at,
          s.score,
          s.time_spent,
          s.current_task,
          s.answers,
          s.progress,
          s.time_limit,
          s.time_remaining,
          CASE 
            WHEN s.id IS NULL THEN 'not_started'
            WHEN s.status = 'completed' THEN 'completed'
            WHEN s.status = 'in_progress' THEN 'in_progress'
            ELSE 'available'
          END as simulation_status
        FROM simulation_templates st
        INNER JOIN jobs j ON st.job_id = j.id
        INNER JOIN companies c ON j.company_id = c.id
        INNER JOIN applications a ON a.job_id = j.id AND a.user_id = $2
        LEFT JOIN simulation_sessions s ON s.application_id = a.id 
          AND s.user_id = a.user_id 
          AND s.session_type = 'candidate' 
          AND s.simulation_id = st.id
        WHERE st.id = $1
          AND a.user_id = $2
          AND a.status NOT IN ('rejected', 'withdrawn')
      `, [id, req.user.id]);

      if (!result.rows[0]) {
        ResponseService.notFound(res, 'Simulation not found or you do not have access');
        return;
      }

      const row = result.rows[0];
      const simulation = {
        id: row.simulation_template_id,
        applicationId: row.application_id,
        jobId: row.job_id,
        jobTitle: row.job_title,
        jobDescription: row.job_description,
        jobType: row.job_type,
        workArrangement: row.work_arrangement,
        locations: row.locations,
        salaryRange: row.salary_min && row.salary_max ? `${row.salary_min} - ${row.salary_max}` : null,
        benefits: row.benefits,
        company: {
          id: row.company_id,
          name: row.company_name,
          logo: row.logo_url,
          description: row.company_description
        },
        simulation: {
          name: row.simulation_name,
          description: row.simulation_description,
          duration: row.duration_minutes,
          difficulty: row.difficulty,
          type: row.simulation_type,
          tasks: row.tasks,
          scoringRubric: row.scoring_rubric,
          instructions: row.instructions,
          passFailCriteria: row.pass_fail_criteria,
          objectives: row.tasks_structure?.objectives || [],
          settings: row.tasks_structure?.settings || {},
          practiceEnabled: row.tasks_structure?.practiceEnabled || false,
          practiceSimulation: row.tasks_structure?.practiceSimulation,
          compliance: row.tasks_structure?.compliance || [],
          availability: row.metadata?.availability || {}
        },
        session: row.session_id ? {
          id: row.session_id,
          status: row.session_status,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          score: row.score,
          timeSpent: row.time_spent,
          currentTask: row.current_task,
          answers: row.answers,
          progress: row.progress,
          timeLimit: row.time_limit,
          timeRemaining: row.time_remaining
        } : null,
        simulationStatus: row.simulation_status,
        applicationStatus: row.application_status,
        matchScore: row.match_score,
        appliedAt: row.applied_at
      };

      ResponseService.success(res, simulation);
    } catch (error: any) {
      ResponseService.error(res, 'Failed to fetch simulation', 500, null, this.formatError(error));
    }
  }

  async getMySimulationStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await DatabaseService.query(`
        SELECT 
          COUNT(DISTINCT a.id) as total_applications_with_simulations,
          COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'completed') as completed_simulations,
          COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'in_progress') as in_progress_simulations,
          COUNT(DISTINCT a.id) FILTER (WHERE s.id IS NULL AND st.id IS NOT NULL) as pending_simulations,
          ROUND(AVG(s.score) FILTER (WHERE s.status = 'completed')) as average_score,
          MAX(s.score) FILTER (WHERE s.status = 'completed') as best_score,
          COUNT(DISTINCT j.company_id) as companies_applied
        FROM applications a
        INNER JOIN jobs j ON a.job_id = j.id
        LEFT JOIN simulation_templates st ON st.job_id = j.id AND st.is_active = true
        LEFT JOIN simulation_sessions s ON s.application_id = a.id 
          AND s.user_id = a.user_id 
          AND s.session_type = 'candidate'
        WHERE a.user_id = $1
          AND a.status NOT IN ('rejected', 'withdrawn')
          AND j.status = 'active'
      `, [req.user.id]);

      const stats = result.rows[0] || {
        total_applications_with_simulations: 0,
        completed_simulations: 0,
        in_progress_simulations: 0,
        pending_simulations: 0,
        average_score: null,
        best_score: null,
        companies_applied: 0
      };

      const recentActivity = await DatabaseService.query(`
        SELECT 
          s.completed_at as date,
          'completed' as type,
          j.title as job_title,
          s.score,
          c.name as company_name
        FROM simulation_sessions s
        INNER JOIN applications a ON s.application_id = a.id
        INNER JOIN jobs j ON a.job_id = j.id
        INNER JOIN companies c ON j.company_id = c.id
        WHERE s.user_id = $1 
          AND s.status = 'completed'
          AND s.completed_at IS NOT NULL
        ORDER BY s.completed_at DESC
        LIMIT 5
      `, [req.user.id]);

      ResponseService.success(res, {
        stats,
        recentActivity: recentActivity.rows,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      ResponseService.error(res, 'Failed to fetch simulation stats', 500, null, this.formatError(error));
    }
  }

async resumeMySimulation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔄 [resumeMySimulation] CALLED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📥 Session ID:', id);
    console.log('👤 User:', { userId: req.user.id, userType: req.user.user_type });

    if (!id || !ValidationService.isValidUUID(id)) {
      ResponseService.error(res, 'Invalid session ID format', 400);
      return;
    }

    // Query session with all related data including github_links
    const sessionResult = await DatabaseService.query(`
      SELECT 
        s.id,
        s.simulation_id,
        s.user_id,
        s.status,
        s.started_at,
        s.completed_at,
        s.paused_at,
        s.resumed_at,
        s.time_limit,
        s.time_remaining,
        s.time_spent,
        s.current_task,
        s.answers,
        s.progress,
        s.score,
        s.feedback,
        s.notes,
        s.github_links,
        s.created_at,
        s.updated_at,
        sim.template_id,
        sim.application_id,
        sim.job_id,
        st.duration_minutes,
        st.tasks,
        st.name as simulation_name,
        st.scoring_rubric,
        st.pass_fail_criteria,
        st.description as simulation_description,
        st.difficulty,
        st.type as simulation_type,
        j.title as job_title,
        j.job_type,
        j.work_arrangement,
        c.name as company_name,
        c.logo_url as company_logo,
        c.industry as company_industry
      FROM simulation_sessions s
      INNER JOIN simulations sim ON s.simulation_id = sim.id
      INNER JOIN simulation_templates st ON sim.template_id = st.id
      LEFT JOIN jobs j ON sim.job_id = j.id
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE s.id = $1 
        AND s.user_id = $2
    `, [id, req.user.id]);

    if (!sessionResult.rows[0]) {
      console.log('❌ Session not found');
      ResponseService.notFound(res, 'Simulation session not found');
      return;
    }

    const session = sessionResult.rows[0];
    
    // ============================================
    // ✅ EXTRACT GITHUB REPO FROM github_links
    // ============================================
    let githubRepo = null;
    if (session.github_links) {
      try {
        githubRepo = typeof session.github_links === 'string' 
          ? JSON.parse(session.github_links) 
          : session.github_links;
          
        console.log('✅ GitHub repo data retrieved from session:', {
          repoName: githubRepo.repoName,
          repoUrl: githubRepo.repoUrl,
          branchName: githubRepo.branchName,
          organizationName: githubRepo.organizationName,
          candidateUsername: githubRepo.candidateUsername
        });
      } catch (err) {
        console.warn('⚠️ Failed to parse github_links:', err);
      }
    }

    // Calculate task progress
    const tasks = session.tasks;
    const totalTasks = tasks?.length || 0;
    const currentTaskIndex = session.current_task || 0;
    const progressPercentage = totalTasks > 0 
      ? Math.round((currentTaskIndex / totalTasks) * 100) 
      : 0;

    // Calculate time remaining
    let timeRemaining = session.time_limit;
    let timeSpent = session.time_spent || 0;
    
    if (session.started_at && session.status === 'in_progress') {
      const elapsed = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
      timeSpent = elapsed;
      timeRemaining = Math.max(0, (session.time_limit || 3600) - elapsed);
    }

    // ============================================
    // ✅ BUILD RESPONSE WITH GITHUB REPO DATA - FIXED DUPLICATE 'progress'
    // ============================================
    const responseData = {
      sessionId: session.id,
      simulationId: session.simulation_id,
      simulationName: session.simulation_name,
      simulationDescription: session.simulation_description,
      simulationType: session.simulation_type,
      difficulty: session.difficulty,
      durationMinutes: session.duration_minutes,
      jobTitle: session.job_title,
      companyName: session.company_name,
      status: session.status,
      startedAt: session.started_at,
      currentTask: currentTaskIndex,
      totalTasks: totalTasks,
      progress: progressPercentage,  // ← This is the ONLY 'progress' property
      timeSpent: timeSpent,
      timeRemaining: timeRemaining,
      timeLimit: session.time_limit,
      answers: session.answers || {},
      sessionProgress: session.progress || {},  // ← Renamed to sessionProgress (was duplicate)
      tasks: tasks,
      scoringRubric: session.scoring_rubric,
      passFailCriteria: session.pass_fail_criteria,
      canResume: session.status === 'in_progress' || session.status === 'scheduled',
      
      // ✅ GITHUB REPOSITORY DATA
      githubRepo: githubRepo ? {
        repoName: githubRepo.repoName,
        repoUrl: githubRepo.repoUrl,
        cloneUrl: githubRepo.cloneUrl,
        branchName: githubRepo.branchName || 'main',
        organizationName: githubRepo.organizationName || 'recruitment-platform',
        candidateUsername: githubRepo.candidateUsername,
        status: githubRepo.status || 'active',
        createdAt: githubRepo.createdAt,
        issues: githubRepo.issues || []
      } : null
    };

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [resumeMySimulation] SUCCESS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 Response includes GitHub repo:', !!responseData.githubRepo);
    if (responseData.githubRepo) {
      console.log('   Repo URL:', responseData.githubRepo.repoUrl);
      console.log('   Branch:', responseData.githubRepo.branchName);
    }

    ResponseService.success(res, responseData, 'Simulation resumed successfully');
    
  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [resumeMySimulation] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      stack: error?.stack
    });
    ResponseService.error(res, error.message || 'Failed to resume simulation', 500);
  }
}
  async cancelMySimulation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || !ValidationService.isValidUUID(id)) {
        ResponseService.error(res, 'Invalid session ID format', 400);
        return;
      }

      const result = await DatabaseService.query(`
        UPDATE simulation_sessions 
        SET status = 'cancelled', 
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 
          AND user_id = $2 
          AND status = 'in_progress'
        RETURNING id, simulation_id
      `, [id, req.user.id]);

      if (!result.rows[0]) {
        ResponseService.notFound(res, 'Active simulation session not found');
        return;
      }

      await DatabaseService.query(`
        UPDATE simulations 
        SET status = 'cancelled', 
            updated_at = NOW()
        WHERE id = $1 AND status = 'in_progress'
      `, [result.rows[0].simulation_id]);

      sessionCache.del(`session_${id}_${req.user.id}`);
      ResponseService.success(res, null, 'Simulation cancelled');
    } catch (error: any) {
      ResponseService.error(res, 'Failed to cancel simulation', 500, null, this.formatError(error));
    }
  }

async getSimulationResults(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params; // This is the session ID

    if (!id || !ValidationService.isValidUUID(id)) {
      ResponseService.error(res, 'Invalid session ID format', 400);
      return;
    }

    const result = await DatabaseService.query(`
      SELECT 
        e.id AS evaluation_id,
        e.overall_score,
        e.punctuality_score,
        e.communication_score,
        e.problem_solving_score,
        e.adaptability_score,
        e.collaboration_score,
        e.attention_to_detail_score,
        e.initiative_score,
        e.status AS evaluation_status,
        e.completed_at AS evaluation_completed_at,
        e.reviewed_at,
        e.reviewer_id,

        sim.status AS simulation_status,
        sim.started_at,
        sim.completed_at AS simulation_completed_at,
        sim.time_spent,

        st.name AS simulation_name,
        st.type AS simulation_type,
        st.difficulty,
        st.duration_minutes,
        st.scoring_rubric,

        j.title AS job_title,
        c.name AS company_name,
        c.logo_url AS company_logo

      FROM simulation_sessions ss
      JOIN simulations sim ON ss.simulation_id = sim.id
      JOIN simulation_templates st ON sim.template_id = st.id
      LEFT JOIN applications a ON sim.application_id = a.id
      LEFT JOIN jobs j ON a.job_id = j.id
      LEFT JOIN companies c ON j.company_id = c.id
      LEFT JOIN evaluations e ON e.candidate_id = ss.user_id AND e.simulation_id = sim.id
      WHERE ss.id = $1 AND ss.user_id = $2
    `, [id, req.user.id]);

    if (!result.rows[0]) {
      ResponseService.notFound(res, 'Simulation results not found');
      return;
    }

    ResponseService.success(res, result.rows[0]);
  } catch (error: any) {
    console.error('Error in getSimulationResults:', error);
    ResponseService.error(res, 'Failed to fetch simulation results', 500, null, this.formatError(error));
  }
}

  // ============================================
  // TASK PROGRESS METHODS
  // ============================================

// In SimulationController.ts - REPLACE the getSessionTaskProgress method with this:

async getSessionTaskProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📞 [getSessionTaskProgress] CALLED');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    const { sessionId } = req.params;

    console.log('📋 REQUEST PARAMS:', {
      sessionId,
      userId: req.user.id,
      userType: req.user.user_type,
      timestamp: new Date().toISOString()
    });

    if (!sessionId || !ValidationService.isValidUUID(sessionId)) {
      console.log('❌ Invalid session ID format:', sessionId);
      ResponseService.error(res, 'Invalid session ID format', 400);
      return;
    }

    console.log('✅ Session ID validation passed');

    console.log('🔍 Executing query to fetch task progress...');
    const queryStartTime = Date.now();
    
    const result = await DatabaseService.query(`
      SELECT 
        stp.id,
        stp.session_id,
        stp.task_index,
        stp.status,
        stp.started_at,
        stp.completed_at,
        stp.time_spent,
        stp.answer,
        stp.score,
        stp.feedback,
        stp.github_commit_url,
        stp.prerequisites_met,
        stp.unlocked_at,
        stp.created_at,
        stp.updated_at
      FROM session_task_progress stp
      INNER JOIN simulation_sessions ss ON ss.id = stp.session_id
      WHERE stp.session_id = $1 AND ss.user_id = $2
      ORDER BY stp.task_index
    `, [sessionId, req.user.id]);
    
    const queryEndTime = Date.now();
    console.log(`📊 Query executed in ${queryEndTime - queryStartTime}ms`);
    console.log(`📊 Raw query result:`, {
      rowCount: result.rows.length,
      rows: result.rows.map((row: any) => ({
        id: row.id,
        task_index: row.task_index,
        status: row.status,
        started_at: row.started_at,
        completed_at: row.completed_at
      }))
    });

    // ✅ Check each row's status
    for (const row of result.rows) {
      console.log(`📌 Task ${row.task_index} - Raw status from DB: "${row.status}"`);
      
      // Log if status is unexpected
      if (row.status === 'inactive') {
        console.warn(`⚠️⚠️⚠️ WARNING: Task ${row.task_index} has status "inactive" in database!`);
        console.warn(`   This should be "not_started", "in_progress", or "completed"`);
        console.warn(`   Updating to "not_started" for frontend compatibility`);
      }
    }

    // ✅ Return the status AS-IS from the database
    // The status should be one of: 'not_started', 'in_progress', 'completed'
    console.log('📤 SENDING RESPONSE:', {
      success: true,
      dataCount: result.rows.length,
      data: result.rows.map((row: any) => ({
        task_index: row.task_index,
        status: row.status,
        started_at: row.started_at
      }))
    });

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [getSessionTaskProgress] COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════');
    
    ResponseService.success(res, result.rows);
    
  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [getSessionTaskProgress] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    console.error('═══════════════════════════════════════════════════════════════');
    ResponseService.error(res, 'Failed to fetch task progress', 500, null, this.formatError(error));
  }
}

// In SimulationController.ts - REPLACE the entire updateTaskProgress method with this:

async updateTaskProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📞 [updateTaskProgress] CALLED');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    const { sessionId } = req.params;
    const { status, answer, score, feedback, githubCommitUrl, timeSpent, started_at, completed_at } = req.body;

    console.log('📋 REQUEST PARAMS:', {
      sessionId,
      taskIndex: req.params.taskIndex,
      status,
      hasAnswer: !!answer,
      hasScore: !!score,
      hasFeedback: !!feedback,
      timeSpent,
      started_at,
      completed_at,
      timestamp: new Date().toISOString()
    });

    if (req.params.taskIndex === undefined || req.params.taskIndex === null) {
      console.log('❌ Task index is required but missing');
      ResponseService.error(res, 'Task index is required', 400);
      return;
    }

    const taskIndex = parseInt(req.params.taskIndex);

    if (!sessionId || !ValidationService.isValidUUID(sessionId)) {
      console.log('❌ Invalid session ID format:', sessionId);
      ResponseService.error(res, 'Invalid session ID format', 400);
      return;
    }

    if (isNaN(taskIndex) || taskIndex < 0) {
      console.log('❌ Invalid task index:', taskIndex);
      ResponseService.error(res, 'Invalid task index', 400);
      return;
    }

    console.log('✅ Validation passed:', { sessionId, taskIndex });

    // ✅ Check if session exists (allow ANY status for update)
    console.log('🔍 Checking session existence...');
    const sessionCheck = await DatabaseService.query(`
      SELECT id, user_id, status, started_at FROM simulation_sessions
      WHERE id = $1 AND user_id = $2
    `, [sessionId, req.user.id]);

    console.log('📊 Session check result:', {
      found: sessionCheck.rows.length > 0,
      sessionData: sessionCheck.rows[0] || null
    });

    if (!sessionCheck.rows[0]) {
      console.log('❌ Session not found or not accessible');
      ResponseService.error(res, 'Session not found or not accessible', 404);
      return;
    }

    const session = sessionCheck.rows[0];
    console.log('✅ Session found:', {
      id: session.id,
      user_id: session.user_id,
      status: session.status,
      started_at: session.started_at
    });
    
    // Don't allow updates if session is completed
    if (session.status === 'completed' || session.status === 'submitted') {
      console.log('❌ Session already completed, cannot update');
      ResponseService.error(res, 'Cannot update task progress for completed session', 400);
      return;
    }

    const now = new Date();
    console.log('🕐 Current server time:', now.toISOString());

    // ✅ Check if task progress record already exists
    console.log(`🔍 Checking existing task progress for task ${taskIndex}...`);
    const existing = await DatabaseService.query(`
      SELECT id, started_at, completed_at, status, time_spent
      FROM session_task_progress
      WHERE session_id = $1 AND task_index = $2
      LIMIT 1
    `, [sessionId, taskIndex]);

    console.log('📊 Existing task progress:', {
      exists: existing.rows.length > 0,
      data: existing.rows[0] || null
    });

    let result;
    const updateFields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // ✅ Build update fields dynamically
    if (status !== undefined) {
      updateFields.push(`status = $${idx++}`);
      values.push(status);
      console.log(`   Setting status to: ${status}`);
    }

    if (answer !== undefined) {
      updateFields.push(`answer = $${idx++}`);
      values.push(answer);
      console.log(`   Setting answer (length: ${JSON.stringify(answer).length})`);
    }

    if (score !== undefined) {
      updateFields.push(`score = $${idx++}`);
      values.push(score);
      console.log(`   Setting score to: ${score}`);
    }

    if (feedback !== undefined) {
      updateFields.push(`feedback = $${idx++}`);
      values.push(feedback);
      console.log(`   Setting feedback (length: ${feedback.length})`);
    }

    if (githubCommitUrl !== undefined) {
      updateFields.push(`github_commit_url = $${idx++}`);
      values.push(githubCommitUrl);
      console.log(`   Setting github_commit_url to: ${githubCommitUrl}`);
    }

    if (timeSpent !== undefined) {
      updateFields.push(`time_spent = $${idx++}`);
      values.push(timeSpent);
      console.log(`   Setting time_spent to: ${timeSpent}`);
    }

    // ✅ CRITICAL: Set started_at when status becomes 'in_progress'
    if (status === 'in_progress') {
      const startTime = started_at || now;
      updateFields.push(`started_at = $${idx++}`);
      values.push(startTime);
      console.log(`   ✅✅✅ Setting started_at to: ${startTime} (task now IN_PROGRESS) ✅✅✅`);
    }

    // Set completed_at when status becomes 'completed'
    if (status === 'completed') {
      const completeTime = completed_at || now;
      updateFields.push(`completed_at = $${idx++}`);
      values.push(completeTime);
      console.log(`   ✅ Setting completed_at to: ${completeTime} (task COMPLETED)`);
    }

    // Always update updated_at
    updateFields.push(`updated_at = $${idx++}`);
    values.push(now);

    if (existing.rows[0]) {
      // ✅ UPDATE existing task progress
      console.log('📝 Updating existing task progress record...');
      
      if (updateFields.length > 1) { // More than just updated_at
        values.push(existing.rows[0].id);
        
        const query = `
          UPDATE session_task_progress 
          SET ${updateFields.join(', ')}
          WHERE id = $${idx}
          RETURNING *
        `;
        
        console.log('📝 Executing UPDATE query...');
        result = await DatabaseService.query(query, values);
        
        console.log(`✅ Task ${taskIndex} updated in session ${sessionId}`);
        console.log('📊 Updated record:', {
          id: result.rows[0]?.id,
          task_index: result.rows[0]?.task_index,
          status: result.rows[0]?.status,
          started_at: result.rows[0]?.started_at,
          completed_at: result.rows[0]?.completed_at,
          time_spent: result.rows[0]?.time_spent
        });
      } else {
        console.log('⚠️ No fields to update, returning existing record');
        result = { rows: [existing.rows[0]] };
      }
    } else {
      // ✅ CREATE new task progress record
      console.log('📝 Creating NEW task progress record...');
      
      const newStatus = status || 'in_progress';
      const newStartedAt = (newStatus === 'in_progress') ? (started_at || now) : null;
      
      console.log('📊 New task data:', {
        session_id: sessionId,
        task_index: taskIndex,
        status: newStatus,
        started_at: newStartedAt,
        time_spent: timeSpent || 0,
        hasAnswer: !!answer
      });
      
      // Add all fields for INSERT
      const insertFields = [
        'session_id', 'task_index', 'status', 'answer', 'score', 
        'feedback', 'github_commit_url', 'time_spent', 'started_at', 
        'completed_at', 'created_at', 'updated_at'
      ];
      
      const insertValues = [
        sessionId, taskIndex, newStatus, answer || null, score || null,
        feedback || null, githubCommitUrl || null, timeSpent || 0,
        newStartedAt, status === 'completed' ? (completed_at || now) : null,
        now, now
      ];
      
      const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');
      
      result = await DatabaseService.query(`
        INSERT INTO session_task_progress (${insertFields.join(', ')})
        VALUES (${placeholders})
        RETURNING *
      `, insertValues);
      
      console.log(`✅ NEW task ${taskIndex} created in session ${sessionId}`);
      console.log('📊 Created record:', {
        id: result.rows[0]?.id,
        task_index: result.rows[0]?.task_index,
        status: result.rows[0]?.status,
        started_at: result.rows[0]?.started_at,
        completed_at: result.rows[0]?.completed_at,
        time_spent: result.rows[0]?.time_spent
      });
    }

    // ✅ Update session status if this is the first task being started
    if (status === 'in_progress') {
      console.log('🔍 Checking if this is the first task being started...');
      
      const existingTasksCount = await DatabaseService.query(`
        SELECT COUNT(*) FROM session_task_progress 
        WHERE session_id = $1 AND status = 'in_progress'
      `, [sessionId]);
      
      const inProgressCount = parseInt(existingTasksCount.rows[0]?.count || '0');
      console.log(`📊 Tasks in progress count: ${inProgressCount}`);
      
      // If this is the only in_progress task, update session status
      if (inProgressCount === 1 && session.status === 'scheduled') {
        console.log('✅ First task started - updating session status to in_progress');
        await DatabaseService.query(`
          UPDATE simulation_sessions 
          SET status = 'in_progress', updated_at = NOW()
          WHERE id = $1
        `, [sessionId]);
      }
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [updateTaskProgress] COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════');

    ResponseService.success(res, result.rows[0], 'Task progress updated');
    
  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [updateTaskProgress] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    console.error('═══════════════════════════════════════════════════════════════');
    ResponseService.error(res, 'Failed to update task progress', 500, null, this.formatError(error));
  }
}

  // ============================================
  // CHAT METHODS - WITH FIXED TYPES
  // ============================================
async getChatMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { sessionId, simulationId } = req.params;
    const { limit = '20', offset = '0' } = req.query;

    let sessionIds: string[] = [];
    let actualSimulationId: string | null = null;

    // CASE 1: If sessionId is provided, get ALL sessions for that simulation
    if (sessionId && ValidationService.isValidUUID(sessionId)) {
      console.log('🔍 [getChatMessages] sessionId provided:', sessionId);
      
      const sessionCheck = await DatabaseService.query(`
        SELECT ss.id, ss.user_id as session_owner_id, ss.simulation_id
        FROM simulation_sessions ss
        WHERE ss.id = $1
      `, [sessionId]);

      if (!sessionCheck.rows[0]) {
        ResponseService.error(res, 'Session not found', 404);
        return;
      }

      const session = sessionCheck.rows[0];
      actualSimulationId = session.simulation_id;
      const isOwner = session.session_owner_id === req.user.id;
      const isRecruiter = req.user.user_type === 'recruiter' || 
                          req.user.user_type === 'company_admin' || 
                          req.user.user_type === 'system_admin';

      if (!isOwner && !isRecruiter) {
        ResponseService.forbidden(res, 'Access denied');
        return;
      }

      // ✅ FIX: Get ALL sessions that belong to this simulation
      sessionIds = [sessionId];
      
      console.log('✅ [getChatMessages] Resolved:', {
        actualSimulationId,
        originalSessionId: sessionId,
        totalSessionsFound: sessionIds.length,
        sessionIds
      });

    // CASE 2: If simulationId is provided, get all sessions for it
    } else if (simulationId && ValidationService.isValidUUID(simulationId)) {
      console.log('🔍 [getChatMessages] simulationId provided:', simulationId);
      
      const simulationCheck = await DatabaseService.query(`
        SELECT s.id, s.user_id
        FROM simulations s
        WHERE s.id = $1
      `, [simulationId]);

      if (!simulationCheck.rows[0]) {
        ResponseService.error(res, 'Simulation not found', 404);
        return;
      }

      const simulation = simulationCheck.rows[0];
      actualSimulationId = simulationId;
      const isOwner = simulation.user_id === req.user.id;
      const isRecruiter = req.user.user_type === 'recruiter' || 
                          req.user.user_type === 'company_admin' || 
                          req.user.user_type === 'system_admin';

      if (!isOwner && !isRecruiter) {
        ResponseService.forbidden(res, 'Access denied');
        return;
      }

      const sessionsResult = await DatabaseService.query(`
        SELECT id FROM simulation_sessions WHERE simulation_id = $1
      `, [simulationId]);
      
      sessionIds = sessionsResult.rows.map((row: any) => row.id);
      
      console.log('✅ [getChatMessages] Resolved:', {
        actualSimulationId,
        totalSessionsFound: sessionIds.length,
        sessionIds
      });
      
      if (sessionIds.length === 0) {
        ResponseService.success(res, {
          simulation_id: simulationId,
          messages: [],
          pagination: {
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            total: 0,
            has_more: false
          }
        });
        return;
      }

    } else {
      ResponseService.error(res, 'Either sessionId or simulationId is required', 400);
      return;
    }

    let query: string;
    let params: any[];
    let totalCount: number;

    if (sessionIds.length === 1) {
      query = `
        SELECT 
          cm.*, 
          u.email as user_email, 
          u.user_type,
          cp.first_name, 
          cp.last_name,
          ss.simulation_id
        FROM chat_messages cm
        LEFT JOIN users u ON cm.user_id = u.id
        LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
        LEFT JOIN simulation_sessions ss ON cm.session_id = ss.id
        WHERE cm.session_id = $1
        ORDER BY cm.timestamp ASC
        LIMIT $2 OFFSET $3
      `;
      params = [sessionIds[0], parseInt(limit as string), parseInt(offset as string)];

      const countResult = await DatabaseService.query(`
        SELECT COUNT(*) as total FROM chat_messages WHERE session_id = $1
      `, [sessionIds[0]]);
      totalCount = parseInt(countResult.rows[0]?.total || 0);

    } else {
      // Multiple sessions - use ANY
      query = `
        SELECT 
          cm.*, 
          u.email as user_email, 
          u.user_type,
          cp.first_name, 
          cp.last_name,
          ss.simulation_id
        FROM chat_messages cm
        LEFT JOIN users u ON cm.user_id = u.id
        LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
        LEFT JOIN simulation_sessions ss ON cm.session_id = ss.id
        WHERE cm.session_id = ANY($1::uuid[])
        ORDER BY cm.timestamp ASC
        LIMIT $2 OFFSET $3
      `;
      params = [sessionIds, parseInt(limit as string), parseInt(offset as string)];

      const countResult = await DatabaseService.query(`
        SELECT COUNT(*) as total FROM chat_messages WHERE session_id = ANY($1::uuid[])
      `, [sessionIds]);
      totalCount = parseInt(countResult.rows[0]?.total || 0);
    }

    const result = await DatabaseService.query(query, params);

    const parsedMessages = result.rows.map((row: any) => {
      let parsedText = row.message;
      try {
        let parsed = JSON.parse(row.message);
        while (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            break;
          }
        }
        if (parsed && typeof parsed === 'object') {
          parsedText = parsed.text || row.message;
        }
      } catch {}
      return { 
        ...row, 
        parsed_message: parsedText,
        simulation_id: row.simulation_id || actualSimulationId
      };
    });

    const hasMore = (parseInt(offset as string) + result.rows.length) < totalCount;

    ResponseService.success(res, {
      session_id: sessionId || null,
      simulation_id: actualSimulationId,
      session_count: sessionIds.length,
      messages: parsedMessages,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total: totalCount,
        has_more: hasMore,
        next_offset: hasMore ? parseInt(offset as string) + parseInt(limit as string) : null
      }
    });
  } catch (error: any) {
    console.error('Error in getChatMessages:', error);
    ResponseService.error(res, 'Failed to fetch chat messages', 500, null, this.formatError(error));
  }
}

async getSimulationChatWithReplies(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📞 [getSimulationChatWithReplies] CALLED');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const { sessionId, simulationId } = req.params;
    const { limit = '50', offset = '0', filter = 'all' } = req.query;

    console.log('📋 REQUEST PARAMS:', {
      sessionId: sessionId || 'null',
      simulationId: simulationId || 'null',
      limit: limit,
      offset: offset,
      filter: filter,
      user_id: req.user.id,
      user_type: req.user.user_type
    });

    let actualSimulationId: string | null = null;
    let sessionIds: string[] = [];

    // CASE 1: If sessionId is provided, get ALL sessions for that simulation
    if (sessionId && ValidationService.isValidUUID(sessionId)) {
      const sessionResult = await DatabaseService.query(`
        SELECT simulation_id FROM simulation_sessions WHERE id = $1
      `, [sessionId]);

      if (!sessionResult.rows[0]) {
        ResponseService.error(res, 'Session not found', 404);
        return;
      }

      actualSimulationId = sessionResult.rows[0].simulation_id;
      sessionIds = [sessionId];
      
      console.log('✅ Resolved:', { actualSimulationId, totalSessionsFound: sessionIds.length });

    // CASE 2: If simulationId is provided
    } else if (simulationId && ValidationService.isValidUUID(simulationId)) {
      actualSimulationId = simulationId;
      
      const sessionsResult = await DatabaseService.query(`
        SELECT id FROM simulation_sessions WHERE simulation_id = $1
      `, [simulationId]);
      
      sessionIds = sessionsResult.rows.map((row: any) => row.id);

    } else {
      ResponseService.error(res, 'Either sessionId or simulationId is required', 400);
      return;
    }

    if (!actualSimulationId) {
      ResponseService.error(res, 'Simulation not found', 404);
      return;
    }

    // ✅ FIXED: Get simulation with company info - REMOVED s.company_id
    const simulationCheck = await DatabaseService.query(`
      SELECT 
        s.id, 
        s.user_id as candidate_id,
        s.application_id,
        a.job_id,
        j.company_id as job_company_id,
        j.title as job_title,
        c.id as company_id,
        c.name as company_name,
        c.logo_url as company_logo
      FROM simulations s
      LEFT JOIN applications a ON s.application_id = a.id
      LEFT JOIN jobs j ON a.job_id = j.id
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE s.id = $1
    `, [actualSimulationId]);

    if (!simulationCheck.rows[0]) {
      ResponseService.error(res, 'Simulation not found', 404);
      return;
    }

    const simulation = simulationCheck.rows[0];
    const isCandidate = simulation.candidate_id === req.user.id;
    
    // Check if user is recruiter/admin for this company
    let isCompanyUser = false;
    let userCompanyId = null;
    
    if (req.user.user_type === 'recruiter' || req.user.user_type === 'company_admin') {
      // ✅ FIXED: Use company_team table (not company_users)
      const companyUserCheck = await DatabaseService.query(`
        SELECT company_id FROM company_team WHERE user_id = $1
      `, [req.user.id]);
      
      if (companyUserCheck.rows.length > 0) {
        userCompanyId = companyUserCheck.rows[0].company_id;
        const simulationCompanyId = simulation.job_company_id || simulation.company_id;
        isCompanyUser = userCompanyId === simulationCompanyId;
      }
    }
    
    // System admin has access to everything
    const isSystemAdmin = req.user.user_type === 'system_admin';
    
    // Check access: candidate (owner) OR company user OR system admin
    const hasAccess = isCandidate || isCompanyUser || isSystemAdmin;
    
    console.log('🔐 Access check:', {
      isCandidate,
      isCompanyUser,
      isSystemAdmin,
      hasAccess,
      candidateId: simulation.candidate_id,
      currentUserId: req.user.id,
      userCompanyId,
      simulationCompanyId: simulation.job_company_id
    });

    if (!hasAccess) {
      ResponseService.forbidden(res, 'Access denied');
      return;
    }

    if (sessionIds.length === 0) {
      ResponseService.success(res, {
        simulation_id: actualSimulationId,
        session_id: sessionId || null,
        company: {
          id: simulation.job_company_id,
          name: simulation.company_name,
          logo: simulation.company_logo,
          job_title: simulation.job_title
        },
        candidate: {
          id: simulation.candidate_id
        },
        stats: {
          total_messages: 0,
          unique_participants: 0,
          total_replies: 0,
          total_threads: 0
        },
        messages: [],
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          has_more: false
        }
      });
      return;
    }

    // BUILD QUERY FOR ALL MESSAGES (no user filtering by default)
    let whereConditions: string[];
    let params: any[];
    
    if (sessionIds.length === 1) {
      whereConditions = ['cm.session_id = $1'];
      params = [sessionIds[0]];
    } else {
      whereConditions = ['cm.session_id = ANY($1::uuid[])'];
      params = [sessionIds];
    }
    
    let paramIndex = params.length + 1;

    // Apply filter based on query param (optional)
    switch (filter) {
      case 'my_messages':
        whereConditions.push(`cm.user_id = $${paramIndex++}`);
        params.push(req.user.id);
        console.log('🔍 Filter: my_messages only');
        break;
      case 'candidate_messages':
        whereConditions.push(`cm.user_id = $${paramIndex++}`);
        params.push(simulation.candidate_id);
        console.log('🔍 Filter: candidate_messages only');
        break;
      case 'company_messages':
        // Get all company users for this simulation's company
        // ✅ FIXED: Use company_team table
        const companyUsersResult = await DatabaseService.query(`
          SELECT user_id FROM company_team WHERE company_id = $1
        `, [simulation.job_company_id]);
        const companyUserIds = companyUsersResult.rows.map((r: any) => r.user_id);
        if (companyUserIds.length > 0) {
          whereConditions.push(`cm.user_id = ANY($${paramIndex++}::uuid[])`);
          params.push(companyUserIds);
          console.log('🔍 Filter: company_messages only', { companyUserIds });
        } else {
          console.log('⚠️ No company users found, returning empty result');
          ResponseService.success(res, {
            simulation_id: actualSimulationId,
            session_id: sessionId || null,
            company: {
              id: simulation.job_company_id,
              name: simulation.company_name,
              logo: simulation.company_logo,
              job_title: simulation.job_title
            },
            candidate: {
              id: simulation.candidate_id
            },
            stats: {
              total_messages: 0,
              unique_participants: 0,
              total_replies: 0,
              total_threads: 0
            },
            messages: [],
            pagination: {
              limit: parseInt(limit as string),
              offset: parseInt(offset as string),
              has_more: false
            }
          });
          return;
        }
        break;
      case 'all':
      default:
        console.log('🔍 Filter: all messages (candidate + company)');
        break;
    }

    if (isCandidate) {
      whereConditions.push(`(cm.user_id = $${paramIndex} OR cm.recipient_id = $${paramIndex} OR cm.recipient_id IS NULL)`);
      params.push(req.user.id);
      paramIndex++;
    } else if (isCompanyUser || isSystemAdmin) {
      whereConditions.push(`(cm.user_id = $${paramIndex} OR cm.user_id = $${paramIndex + 1} OR cm.recipient_id = $${paramIndex + 1} OR cm.recipient_id IS NULL)`);
      params.push(req.user.id, simulation.candidate_id);
      paramIndex += 2;
    }

    // QUERY FOR ALL MESSAGES - returns BOTH candidate AND company messages
    const query = `
      SELECT 
        cm.*,
        COALESCE(cm.reply_count, 0) as reply_count,
        jsonb_build_object(
          'id', u.id,
          'email', u.email,
          'first_name', COALESCE(cp.first_name, u.email),
          'last_name', COALESCE(cp.last_name, ''),
          'user_type', u.user_type,
          'is_company_user', CASE 
            WHEN u.user_type IN ('recruiter', 'company_admin') THEN true 
            ELSE false 
          END
        ) as author,
        CASE 
          WHEN cm.reply_to IS NOT NULL THEN (
            SELECT jsonb_build_object(
              'id', replied.id,
              'message', LEFT(replied.message, 200),
              'user_id', replied.user_id,
              'author_name', COALESCE(replied_cp.first_name, replied_user.email)
            )
            FROM chat_messages replied
            LEFT JOIN users replied_user ON replied.user_id = replied_user.id
            LEFT JOIN candidate_profiles replied_cp ON replied.user_id = replied_cp.user_id
            WHERE replied.id = cm.reply_to
          )
          ELSE NULL
        END as replied_to_message
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY cm.timestamp ASC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);
    params.push(limitNum, offsetNum);

    const result = await DatabaseService.query(query, params);

    console.log(`📊 Query returned ${result.rows.length} messages`);

    // Process messages - parse JSON and organize
    const processedMessages = result.rows.map((message: any) => {
      let parsedText = message.message;
      try {
        let parsed = JSON.parse(message.message);
        let parseDepth = 0;
        while (typeof parsed === 'string' && parseDepth < 10) {
          try { 
            parsed = JSON.parse(parsed); 
            parseDepth++;
          } catch { 
            break; 
          }
        }
        if (parsed && typeof parsed === 'object') {
          parsedText = parsed.text || message.message;
        }
      } catch {}
      
      return {
        ...message,
        parsed_message: parsedText,
        is_from_candidate: message.user_id === simulation.candidate_id,
        is_from_company: message.user_id !== simulation.candidate_id
      };
    });

    // Get statistics for ALL messages
    let statsWhereCondition: string;
    let statsParams: any[];
    
    if (sessionIds.length === 1) {
      statsWhereCondition = 'cm.session_id = $2';
      statsParams = [simulation.candidate_id, sessionIds[0]];
    } else {
      statsWhereCondition = 'cm.session_id = ANY($2::uuid[])';
      statsParams = [simulation.candidate_id, sessionIds];
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT cm.user_id) as unique_participants,
        COUNT(CASE WHEN cm.user_id = $1 THEN 1 END) as candidate_messages,
        COUNT(CASE WHEN cm.user_id != $1 THEN 1 END) as company_messages,
        COUNT(CASE WHEN cm.reply_to IS NOT NULL THEN 1 END) as total_replies,
        COUNT(DISTINCT COALESCE(cm.thread_id, cm.id)) as total_threads
      FROM chat_messages cm
      WHERE ${statsWhereCondition}
    `;
    
    const statsResult = await DatabaseService.query(statsQuery, statsParams);
    const stats = statsResult.rows[0];

    // Get company users info (for display)
    // ✅ FIXED: Use company_team table with proper columns
    const companyUsersQuery = `
      SELECT 
        u.id,
        u.email,
        cp.first_name,
        cp.last_name,
        ct.role
      FROM company_team ct
      JOIN users u ON ct.user_id = u.id
      LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
      WHERE ct.company_id = $1
    `;
    
    const companyUsersResult = await DatabaseService.query(companyUsersQuery, [
      simulation.job_company_id
    ]);

    const responseData = {
      simulation_id: actualSimulationId,
      session_id: sessionId || null,
      company: {
        id: simulation.job_company_id,
        name: simulation.company_name,
        logo: simulation.company_logo,
        job_title: simulation.job_title,
        team_members: companyUsersResult.rows.map((u: any) => ({
          id: u.id,
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          role: u.role,
          email: u.email
        }))
      },
      candidate: {
        id: simulation.candidate_id,
        name: `Candidate ${simulation.candidate_id?.slice(0, 8)}`
      },
      stats: {
        total_messages: parseInt(stats.total_messages || 0),
        unique_participants: parseInt(stats.unique_participants || 0),
        candidate_messages: parseInt(stats.candidate_messages || 0),
        company_messages: parseInt(stats.company_messages || 0),
        total_replies: parseInt(stats.total_replies || 0),
        total_threads: parseInt(stats.total_threads || 0)
      },
      messages: processedMessages,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        has_more: result.rows.length === limitNum
      },
      current_user: {
        id: req.user.id,
        user_type: req.user.user_type,
        is_candidate: isCandidate,
        is_company_user: isCompanyUser,
        is_system_admin: isSystemAdmin
      }
    };

    console.log('📤 SENDING RESPONSE:', {
      simulation_id: responseData.simulation_id,
      company: responseData.company?.name,
      stats: responseData.stats,
      messagesCount: responseData.messages.length
    });

    ResponseService.success(res, responseData);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    ResponseService.error(res, 'Failed to fetch chat messages', 500);
  }
}

  async getMessageThread(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { threadId } = req.params;
      const { sessionId, simulationId } = req.query;

      if (!threadId || !ValidationService.isValidUUID(threadId)) {
        ResponseService.error(res, 'Invalid thread ID format', 400);
        return;
      }

      let accessCheck;
      let actualSimulationId: string | null = null;

      if (sessionId && ValidationService.isValidUUID(sessionId as string)) {
        accessCheck = await DatabaseService.query(`
          SELECT ss.user_id as session_owner_id, ss.simulation_id
          FROM simulation_sessions ss
          WHERE ss.id = $1
        `, [sessionId]);
        
        if (accessCheck.rows[0]) {
          actualSimulationId = accessCheck.rows[0].simulation_id;
        }

      } else if (simulationId && ValidationService.isValidUUID(simulationId as string)) {
        actualSimulationId = simulationId as string;
        
        const simulationAccess = await DatabaseService.query(`
          SELECT s.user_id as session_owner_id
          FROM simulations s
          WHERE s.id = $1
        `, [simulationId]);
        
        if (simulationAccess.rows[0]) {
          accessCheck = simulationAccess;
        }

      } else {
        accessCheck = await DatabaseService.query(`
          SELECT ss.user_id as session_owner_id, ss.simulation_id
          FROM chat_messages cm
          JOIN simulation_sessions ss ON cm.session_id = ss.id
          WHERE cm.id = $1 OR cm.thread_id = $1
          LIMIT 1
        `, [threadId]);
        
        if (accessCheck.rows[0]) {
          actualSimulationId = accessCheck.rows[0].simulation_id;
        }
      }

      if (!accessCheck || !accessCheck.rows[0]) {
        ResponseService.error(res, 'Thread not found or access denied', 404);
        return;
      }

      const sessionOwnerId = accessCheck.rows[0].session_owner_id;
      const isOwner = sessionOwnerId === req.user.id;
      const isRecruiter = req.user.user_type === 'recruiter' || 
                          req.user.user_type === 'company_admin' || 
                          req.user.user_type === 'system_admin';

      if (!isOwner && !isRecruiter) {
        ResponseService.forbidden(res, 'Access denied');
        return;
      }

      let threadQuery: string;
      let threadParams: any[];

      if (actualSimulationId) {
        threadQuery = `
          WITH RECURSIVE message_thread AS (
            SELECT 
              cm.*,
              0 as depth,
              ARRAY[cm.id] as path,
              jsonb_build_object(
                'id', u.id,
                'email', u.email,
                'first_name', cp.first_name,
                'last_name', cp.last_name,
                'user_type', u.user_type
              ) as author
            FROM chat_messages cm
            LEFT JOIN users u ON cm.user_id = u.id
            LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
            WHERE (cm.id = $1 OR cm.thread_id = $1)
              AND cm.session_id IN (SELECT id FROM simulation_sessions WHERE simulation_id = $2)
            
            UNION ALL
            
            SELECT 
              cm.*,
              mt.depth + 1,
              mt.path || cm.id,
              jsonb_build_object(
                'id', u.id,
                'email', u.email,
                'first_name', cp.first_name,
                'last_name', cp.last_name,
                'user_type', u.user_type
              ) as author
            FROM chat_messages cm
            INNER JOIN message_thread mt ON cm.reply_to = mt.id
            LEFT JOIN users u ON cm.user_id = u.id
            LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
            WHERE cm.reply_to IS NOT NULL
              AND cm.session_id IN (SELECT id FROM simulation_sessions WHERE simulation_id = $2)
          )
          SELECT * FROM message_thread
          ORDER BY path
        `;
        threadParams = [threadId, actualSimulationId];
      } else {
        threadQuery = `
          WITH RECURSIVE message_thread AS (
            SELECT 
              cm.*,
              0 as depth,
              ARRAY[cm.id] as path,
              jsonb_build_object(
                'id', u.id,
                'email', u.email,
                'first_name', cp.first_name,
                'last_name', cp.last_name,
                'user_type', u.user_type
              ) as author
            FROM chat_messages cm
            LEFT JOIN users u ON cm.user_id = u.id
            LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
            WHERE cm.id = $1 OR cm.thread_id = $1
            
            UNION ALL
            
            SELECT 
              cm.*,
              mt.depth + 1,
              mt.path || cm.id,
              jsonb_build_object(
                'id', u.id,
                'email', u.email,
                'first_name', cp.first_name,
                'last_name', cp.last_name,
                'user_type', u.user_type
              ) as author
            FROM chat_messages cm
            INNER JOIN message_thread mt ON cm.reply_to = mt.id
            LEFT JOIN users u ON cm.user_id = u.id
            LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
            WHERE cm.reply_to IS NOT NULL
          )
          SELECT * FROM message_thread
          ORDER BY path
        `;
        threadParams = [threadId];
      }

      const result = await DatabaseService.query(threadQuery, threadParams);

      const parsedMessages = result.rows.map((row: any) => {
        let parsedText = row.message;
        try {
          let parsed = JSON.parse(row.message);
          while (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch { break; }
          }
          if (parsed && typeof parsed === 'object') {
            parsedText = parsed.text || row.message;
          }
        } catch {}
        return { ...row, parsed_message: parsedText };
      });

      ResponseService.success(res, {
        thread_id: threadId,
        simulation_id: actualSimulationId,
        session_id: sessionId || null,
        message_count: parsedMessages.length,
        messages: parsedMessages
      });
    } catch (error: any) {
      console.error('Error in getMessageThread:', error);
      ResponseService.error(res, 'Failed to fetch message thread', 500, null, this.formatError(error));
    }
  }

  async getUnreadMessageCount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { sessionId, simulationId } = req.params;
    const { session_id, simulation_id } = req.query;

    const effectiveSessionId = (sessionId || session_id) as string | undefined;
    const effectiveSimulationId = (simulationId || simulation_id) as string | undefined;

    let sessionIds: string[] = [];

    // CASE 1: If sessionId is provided, get ALL sessions for that simulation
    if (effectiveSessionId && ValidationService.isValidUUID(effectiveSessionId)) {
      console.log('🔍 [getUnreadMessageCount] sessionId provided:', effectiveSessionId);
      
      // First, get the simulation_id from this session
      const sessionResult = await DatabaseService.query(`
        SELECT simulation_id FROM simulation_sessions WHERE id = $1
      `, [effectiveSessionId]);
      
      if (!sessionResult.rows[0]) {
        ResponseService.error(res, 'Session not found', 404);
        return;
      }
      
      const actualSimulationId = sessionResult.rows[0].simulation_id;
      
      // ✅ FIX: Get ALL sessions that belong to this simulation
      const allSessionsResult = await DatabaseService.query(`
        SELECT id FROM simulation_sessions WHERE simulation_id = $1
      `, [actualSimulationId]);
      
      sessionIds = allSessionsResult.rows.map((row: any) => row.id);
      
      console.log('✅ [getUnreadMessageCount] Resolved:', {
        actualSimulationId,
        originalSessionId: effectiveSessionId,
        totalSessionsFound: sessionIds.length
      });
      
    } else if (effectiveSimulationId && ValidationService.isValidUUID(effectiveSimulationId)) {
      console.log('🔍 [getUnreadMessageCount] simulationId provided:', effectiveSimulationId);
      
      const sessionsResult = await DatabaseService.query(`
        SELECT id FROM simulation_sessions WHERE simulation_id = $1
      `, [effectiveSimulationId]);
      
      sessionIds = sessionsResult.rows.map((row: any) => row.id);
      
      console.log('✅ [getUnreadMessageCount] Resolved:', {
        effectiveSimulationId,
        totalSessionsFound: sessionIds.length
      });
      
      if (sessionIds.length === 0) {
        ResponseService.success(res, {
          simulation_id: effectiveSimulationId,
          unread_count: 0
        });
        return;
      }
      
    } else {
      ResponseService.error(res, 'Either sessionId or simulationId is required', 400);
      return;
    }

    let query: string;
    let params: any[];

    if (sessionIds.length === 1) {
      query = `
        SELECT COUNT(*) as unread_count
        FROM chat_messages cm
        WHERE cm.session_id = $1 
          AND cm.user_id != $2
          AND cm.is_read = false
      `;
      params = [sessionIds[0], req.user.id];
    } else {
      query = `
        SELECT COUNT(*) as unread_count
        FROM chat_messages cm
        WHERE cm.session_id = ANY($1::uuid[]) 
          AND cm.user_id != $2
          AND cm.is_read = false
      `;
      params = [sessionIds, req.user.id];
    }

    const result = await DatabaseService.query(query, params);

    ResponseService.success(res, {
      session_id: effectiveSessionId || null,
      simulation_id: effectiveSimulationId || null,
      session_count: sessionIds.length,
      unread_count: parseInt(result.rows[0]?.unread_count || 0)
    });
  } catch (error: any) {
    console.error('Error in getUnreadMessageCount:', error);
    ResponseService.error(res, 'Failed to get unread count', 500, null, this.formatError(error));
  }
}

 async markMessagesAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { sessionId, simulationId } = req.params;
    const { messageIds, session_id, simulation_id } = req.body;

    const effectiveSessionId = (sessionId || session_id) as string | undefined;
    const effectiveSimulationId = (simulationId || simulation_id) as string | undefined;

    let sessionIds: string[] = [];

    // CASE 1: If sessionId is provided, get ALL sessions for that simulation
    if (effectiveSessionId && ValidationService.isValidUUID(effectiveSessionId)) {
      console.log('🔍 [markMessagesAsRead] sessionId provided:', effectiveSessionId);
      
      // First, get the simulation_id from this session
      const sessionResult = await DatabaseService.query(`
        SELECT simulation_id FROM simulation_sessions WHERE id = $1
      `, [effectiveSessionId]);
      
      if (!sessionResult.rows[0]) {
        ResponseService.error(res, 'Session not found', 404);
        return;
      }
      
      const actualSimulationId = sessionResult.rows[0].simulation_id;
      
      // ✅ FIX: Get ALL sessions that belong to this simulation
      const allSessionsResult = await DatabaseService.query(`
        SELECT id FROM simulation_sessions WHERE simulation_id = $1
      `, [actualSimulationId]);
      
      sessionIds = allSessionsResult.rows.map((row: any) => row.id);
      
      console.log('✅ [markMessagesAsRead] Resolved:', {
        actualSimulationId,
        originalSessionId: effectiveSessionId,
        totalSessionsFound: sessionIds.length
      });
      
    } else if (effectiveSimulationId && ValidationService.isValidUUID(effectiveSimulationId)) {
      console.log('🔍 [markMessagesAsRead] simulationId provided:', effectiveSimulationId);
      
      const sessionsResult = await DatabaseService.query(`
        SELECT id FROM simulation_sessions WHERE simulation_id = $1
      `, [effectiveSimulationId]);
      
      sessionIds = sessionsResult.rows.map((row: any) => row.id);
      
      console.log('✅ [markMessagesAsRead] Resolved:', {
        effectiveSimulationId,
        totalSessionsFound: sessionIds.length
      });
      
      if (sessionIds.length === 0) {
        ResponseService.success(res, {
          simulation_id: effectiveSimulationId,
          marked_count: 0
        }, 'No sessions found');
        return;
      }
      
    } else {
      ResponseService.error(res, 'Either sessionId or simulationId is required', 400);
      return;
    }

    let query: string;
    let params: any[];
    let paramIndex = 1;

    if (sessionIds.length === 1) {
      query = `
        UPDATE chat_messages 
        SET is_read = true
        WHERE session_id = $1 AND user_id != $2
      `;
      params = [sessionIds[0], req.user.id];
      paramIndex = 3;
    } else {
      query = `
        UPDATE chat_messages 
        SET is_read = true
        WHERE session_id = ANY($1::uuid[]) AND user_id != $2
      `;
      params = [sessionIds, req.user.id];
      paramIndex = 3;
    }

    if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
      const placeholders = messageIds.map((_, i) => `$${paramIndex + i}`).join(',');
      query += ` AND id IN (${placeholders})`;
      params.push(...messageIds);
    }

    const result = await DatabaseService.query(query, params);

    ResponseService.success(res, {
      session_id: effectiveSessionId || null,
      simulation_id: effectiveSimulationId || null,
      session_count: sessionIds.length,
      marked_count: result.rowCount || 0
    }, 'Messages marked as read');
  } catch (error: any) {
    console.error('Error in markMessagesAsRead:', error);
    ResponseService.error(res, 'Failed to mark messages as read', 500, null, this.formatError(error));
  }
}

 async getChatStatistics(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { sessionId, simulationId } = req.params;
    const { session_id, simulation_id } = req.query;

    const effectiveSessionId = (sessionId || session_id) as string | undefined;
    const effectiveSimulationId = (simulationId || simulation_id) as string | undefined;

    let sessionIds: string[] = [];

    // CASE 1: If sessionId is provided, get ALL sessions for that simulation
    if (effectiveSessionId && ValidationService.isValidUUID(effectiveSessionId)) {
      console.log('🔍 [getChatStatistics] sessionId provided:', effectiveSessionId);
      
      // First, get the simulation_id from this session
      const sessionResult = await DatabaseService.query(`
        SELECT simulation_id FROM simulation_sessions WHERE id = $1
      `, [effectiveSessionId]);
      
      if (!sessionResult.rows[0]) {
        ResponseService.error(res, 'Session not found', 404);
        return;
      }
      
      const actualSimulationId = sessionResult.rows[0].simulation_id;
      
      // ✅ FIX: Get ALL sessions that belong to this simulation
      const allSessionsResult = await DatabaseService.query(`
        SELECT id FROM simulation_sessions WHERE simulation_id = $1
      `, [actualSimulationId]);
      
      sessionIds = allSessionsResult.rows.map((row: any) => row.id);
      
      console.log('✅ [getChatStatistics] Resolved:', {
        actualSimulationId,
        originalSessionId: effectiveSessionId,
        totalSessionsFound: sessionIds.length
      });
      
    } else if (effectiveSimulationId && ValidationService.isValidUUID(effectiveSimulationId)) {
      console.log('🔍 [getChatStatistics] simulationId provided:', effectiveSimulationId);
      
      const sessionsResult = await DatabaseService.query(`
        SELECT id FROM simulation_sessions WHERE simulation_id = $1
      `, [effectiveSimulationId]);
      
      sessionIds = sessionsResult.rows.map((row: any) => row.id);
      
      console.log('✅ [getChatStatistics] Resolved:', {
        effectiveSimulationId,
        totalSessionsFound: sessionIds.length
      });
      
      if (sessionIds.length === 0) {
        ResponseService.success(res, {
          simulation_id: effectiveSimulationId,
          total_messages: 0,
          total_participants: 0,
          total_replies: 0,
          total_threads: 0,
          last_activity: null,
          first_activity: null,
          participants: []
        });
        return;
      }
      
    } else {
      ResponseService.error(res, 'Either sessionId or simulationId is required', 400);
      return;
    }

    let query: string;
    let params: any[];

    if (sessionIds.length === 1) {
      query = `
        SELECT 
          COUNT(*) as total_messages,
          COUNT(DISTINCT cm.user_id) as total_participants,
          COUNT(CASE WHEN cm.reply_to IS NOT NULL THEN 1 END) as total_replies,
          COUNT(DISTINCT COALESCE(cm.thread_id, cm.id)) as total_threads,
          MAX(cm.timestamp) as last_activity,
          MIN(cm.timestamp) as first_activity,
          (
            SELECT jsonb_agg(DISTINCT jsonb_build_object(
              'user_id', u2.id,
              'user_email', u2.email,
              'user_type', u2.user_type,
              'message_count', sub.msg_count
            ))
            FROM users u2
            LEFT JOIN (
              SELECT user_id, COUNT(*) as msg_count
              FROM chat_messages
              WHERE session_id = $1
              GROUP BY user_id
            ) sub ON u2.id = sub.user_id
            WHERE u2.id IN (SELECT DISTINCT user_id FROM chat_messages WHERE session_id = $1)
          ) as participants
        FROM chat_messages cm
        WHERE cm.session_id = $1
        GROUP BY cm.session_id
      `;
      params = [sessionIds[0]];
    } else {
      query = `
        SELECT 
          COUNT(*) as total_messages,
          COUNT(DISTINCT cm.user_id) as total_participants,
          COUNT(CASE WHEN cm.reply_to IS NOT NULL THEN 1 END) as total_replies,
          COUNT(DISTINCT COALESCE(cm.thread_id, cm.id)) as total_threads,
          MAX(cm.timestamp) as last_activity,
          MIN(cm.timestamp) as first_activity,
          (
            SELECT jsonb_agg(DISTINCT jsonb_build_object(
              'user_id', u2.id,
              'user_email', u2.email,
              'user_type', u2.user_type,
              'message_count', sub.msg_count
            ))
            FROM users u2
            LEFT JOIN (
              SELECT user_id, COUNT(*) as msg_count
              FROM chat_messages
              WHERE session_id = ANY($1::uuid[])
              GROUP BY user_id
            ) sub ON u2.id = sub.user_id
            WHERE u2.id IN (SELECT DISTINCT user_id FROM chat_messages WHERE session_id = ANY($1::uuid[]))
          ) as participants
        FROM chat_messages cm
        WHERE cm.session_id = ANY($1::uuid[])
        GROUP BY cm.session_id
      `;
      params = [sessionIds];
    }

    const result = await DatabaseService.query(query, params);
    const stats = result.rows[0] || {};

    let participants = stats.participants;
    if (typeof participants === 'string') {
      try {
        participants = JSON.parse(participants);
      } catch {
        participants = [];
      }
    }
    if (!participants) participants = [];

    ResponseService.success(res, {
      session_id: effectiveSessionId || null,
      simulation_id: effectiveSimulationId || null,
      session_count: sessionIds.length,
      total_messages: parseInt(stats.total_messages || 0),
      total_participants: parseInt(stats.total_participants || 0),
      total_replies: parseInt(stats.total_replies || 0),
      total_threads: parseInt(stats.total_threads || 0),
      last_activity: stats.last_activity || null,
      first_activity: stats.first_activity || null,
      participants: participants
    });
  } catch (error: any) {
    console.error('Error in getChatStatistics:', error);
    ResponseService.error(res, 'Failed to fetch chat statistics', 500, null, this.formatError(error));
  }
}

 async sendChatMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
  const startTime = Date.now();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📨 [sendChatMessage] STARTED');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    const { sessionId, simulationId } = req.params;
    const validation = SendChatMessageSchema.safeParse(req.body);
    
    console.log('📋 REQUEST PARAMS:', {
      sessionId: sessionId || 'null',
      simulationId: simulationId || 'null',
      userId: req.user.id,
      userType: req.user.user_type,
      userEmail: req.user.email,
      timestamp: new Date().toISOString()
    });
    
    console.log('📦 REQUEST BODY:', {
      hasMessage: !!req.body.message,
      messageLength: req.body.message?.length,
      messageType: req.body.messageType,
      hasReplyTo: !!req.body.replyTo,
      replyTo: req.body.replyTo
    });
    
    if (!validation.success) {
      console.log('❌ Validation failed:', JSON.stringify(validation.error.issues));
      ResponseService.error(res, 'Invalid input', 400, JSON.stringify(validation.error.issues));
      return;
    }
    console.log('✅ Validation passed');

    let { message, messageType = 'text', replyTo } = validation.data;
    console.log('📝 Parsed message data:', { messageType, replyTo, messagePreview: message?.substring(0, 100) });

    // Deep recursive parser
    console.log('🔍 Starting deep recursive parsing...');
    let extractedText = '';
    let extractedAttachments: any[] = [];
    
    const extractFromNested = (input: any, depth = 0, maxDepth = 20): string => {
      if (depth >= maxDepth) {
        console.log(`⚠️ Max depth (${maxDepth}) reached in extractFromNested`);
        return String(input);
      }
      
      if (typeof input === 'string') {
        try {
          const parsed = JSON.parse(input);
          console.log(`🔄 [depth ${depth}] Parsed string to object`);
          return extractFromNested(parsed, depth + 1, maxDepth);
        } catch {
          return input;
        }
      }
      
      if (input && typeof input === 'object') {
        if (input.text !== undefined) {
          console.log(`📖 [depth ${depth}] Found .text property`);
          return extractFromNested(input.text, depth + 1, maxDepth);
        }
        if (input.message !== undefined) {
          console.log(`📖 [depth ${depth}] Found .message property`);
          return extractFromNested(input.message, depth + 1, maxDepth);
        }
        return JSON.stringify(input);
      }
      
      return String(input);
    };
    
    const extractAttachments = (input: any, depth = 0, maxDepth = 20): any[] => {
      if (depth >= maxDepth) {
        console.log(`⚠️ Max depth (${maxDepth}) reached in extractAttachments`);
        return [];
      }
      
      if (typeof input === 'string') {
        try {
          const parsed = JSON.parse(input);
          return extractAttachments(parsed, depth + 1, maxDepth);
        } catch {
          return [];
        }
      }
      
      if (input && typeof input === 'object') {
        if (input.attachments && Array.isArray(input.attachments)) {
          console.log(`📎 [depth ${depth}] Found ${input.attachments.length} attachments`);
          return input.attachments;
        }
        if (input.text !== undefined) {
          return extractAttachments(input.text, depth + 1, maxDepth);
        }
      }
      
      return [];
    };
    
    const extractReplyTo = (input: any, depth = 0, maxDepth = 20): string | null => {
      if (depth >= maxDepth) {
        console.log(`⚠️ Max depth (${maxDepth}) reached in extractReplyTo`);
        return null;
      }
      
      if (typeof input === 'string') {
        try {
          const parsed = JSON.parse(input);
          return extractReplyTo(parsed, depth + 1, maxDepth);
        } catch {
          return null;
        }
      }
      
      if (input && typeof input === 'object') {
        if (input.replyTo && typeof input.replyTo === 'string' && input.replyTo.length > 10) {
          console.log(`🔗 [depth ${depth}] Found replyTo: ${input.replyTo}`);
          return input.replyTo;
        }
        if (input.text !== undefined) {
          return extractReplyTo(input.text, depth + 1, maxDepth);
        }
      }
      
      return null;
    };
    
    extractedText = extractFromNested(message);
    extractedAttachments = extractAttachments(message);
    const extractedReplyTo = extractReplyTo(message);
    
    console.log('📊 Extraction results:', {
      extractedTextLength: extractedText?.length,
      extractedTextPreview: extractedText?.substring(0, 100),
      extractedAttachmentsCount: extractedAttachments?.length,
      extractedReplyTo: extractedReplyTo || 'null'
    });
    
    if (!replyTo && extractedReplyTo) {
      replyTo = extractedReplyTo;
      console.log('✅ Using extracted replyTo:', replyTo);
    }
    
    if (typeof extractedText === 'string') {
      if (extractedText.startsWith('"') && extractedText.endsWith('"')) {
        extractedText = extractedText.slice(1, -1);
        console.log('✂️ Removed surrounding quotes from extractedText');
      }
      extractedText = extractedText.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    
    const cleanMessage = JSON.stringify({ 
      text: extractedText || message.substring(0, 500), 
      attachments: extractedAttachments 
    });
    console.log('📦 Clean message prepared:', {
      cleanMessageLength: cleanMessage.length,
      cleanMessagePreview: cleanMessage.substring(0, 200)
    });

    // Find or create session
    console.log('🔍 Finding or creating session...');
    let actualSessionId: string | null = sessionId || validation.data.sessionId || req.body.session_id || null;
    let actualSimulationId: string | null = simulationId || validation.data.simulationId || req.body.simulation_id || null;
    console.log('🎯 Initial IDs:', { actualSessionId, actualSimulationId });

    if (!actualSessionId || !actualSimulationId) {
      console.log('Missing required chat IDs:', { actualSessionId, actualSimulationId });
      ResponseService.error(res, 'Both sessionId and simulationId are required to send chat messages', 400);
      return;
    }

    if (!actualSessionId && actualSimulationId) {
      console.log('📌 Case 1: Only simulationId provided, looking for existing session...');
      
      console.log('🔍 Checking simulation exists and user has access...');
      const simulationCheck = await DatabaseService.query(`
        SELECT s.id, s.user_id, s.template_id, s.application_id, s.job_id
        FROM simulations s
        WHERE s.id = $1 AND (s.user_id = $2 OR EXISTS (
          SELECT 1 FROM company_team ct 
          WHERE ct.user_id = $2 AND ct.company_id IN (
            SELECT j.company_id FROM jobs j WHERE j.id = s.job_id
          )
        ))
      `, [actualSimulationId, req.user.id]);
      
      console.log('📊 Simulation check result:', {
        found: simulationCheck.rows.length > 0,
        simulationData: simulationCheck.rows[0] || null
      });
      
      if (!simulationCheck.rows[0]) {
        console.log('❌ Simulation not found or access denied');
        ResponseService.error(res, 'Simulation not found or access denied', 404);
        return;
      }
      
      console.log('🔍 Looking for existing active session...');
      const existingSession = await DatabaseService.query(`
        SELECT id, status FROM simulation_sessions 
        WHERE simulation_id = $1 AND user_id = $2 AND status IN ('in_progress', 'scheduled')
        ORDER BY created_at DESC
        LIMIT 1
      `, [actualSimulationId, req.user.id]);
      
      console.log('📊 Existing session query result:', {
        found: existingSession.rows.length > 0,
        sessionData: existingSession.rows[0] || null
      });
      
      if (existingSession.rows[0]) {
        actualSessionId = existingSession.rows[0].id;
        
        console.log('✅ Found existing session for simulation:', {
          simulationId: actualSimulationId,
          sessionId: actualSessionId,
          status: existingSession.rows[0].status
        });
      } else {
        console.log('❌ No active session found for simulation:', actualSimulationId);
        ResponseService.error(res, 'No active session found. Please start the simulation first.', 400);
        return;
      }
    } else if (actualSessionId && !actualSimulationId) {
      console.log('📌 Case 2: Only sessionId provided, looking up simulation...');
      
      console.log('🔍 Looking up session info...');
      const sessionInfo = await DatabaseService.query(`
        SELECT ss.simulation_id, ss.user_id as session_owner_id
        FROM simulation_sessions ss
        WHERE ss.id = $1
      `, [actualSessionId]);
      
      console.log('📊 Session info query result:', {
        found: sessionInfo.rows.length > 0,
        sessionData: sessionInfo.rows[0] || null
      });
      
      if (!sessionInfo.rows[0]) {
        console.log('❌ Session not found');
        ResponseService.error(res, 'Session not found', 404);
        return;
      }
      
      actualSimulationId = sessionInfo.rows[0].simulation_id;
      console.log('✅ Found simulation ID:', actualSimulationId);
      
      const isOwner = sessionInfo.rows[0].session_owner_id === req.user.id;
      const isRecruiter = req.user.user_type === 'recruiter' || 
                          req.user.user_type === 'company_admin' || 
                          req.user.user_type === 'system_admin';
      
      console.log('🔐 Access check:', { isOwner, isRecruiter });
      
      if (!isOwner && !isRecruiter) {
        console.log('❌ Access denied to this session');
        ResponseService.forbidden(res, 'Access denied to this session');
        return;
      }
      console.log('✅ Access granted');
    } else if (actualSessionId && actualSimulationId) {
      console.log('📌 Case 3: Both sessionId and simulationId provided, verifying...');
      
      const verifyResult = await DatabaseService.query(`
        SELECT ss.id FROM simulation_sessions ss
        WHERE ss.id = $1 AND ss.simulation_id = $2
      `, [actualSessionId, actualSimulationId]);
      
      console.log('📊 Verification result:', {
        matches: verifyResult.rows.length > 0
      });
      
      if (!verifyResult.rows[0]) {
        console.log('❌ Session does not belong to the specified simulation');
        ResponseService.error(res, 'Session does not belong to the specified simulation', 400);
        return;
      }
      console.log('✅ Session verification passed');
    }

    if (!actualSessionId || !ValidationService.isValidUUID(actualSessionId)) {
      console.log('❌ Invalid or missing session ID:', actualSessionId);
      ResponseService.error(res, 'Valid session ID is required. Provide sessionId or simulationId', 400);
      return;
    }

    if (!actualSimulationId || !ValidationService.isValidUUID(actualSimulationId)) {
      console.log('❌ Invalid or missing simulation ID:', actualSimulationId);
      ResponseService.error(res, 'Valid simulation ID is required', 400);
      return;
    }
    
    console.log('✅ Final resolved IDs:', { actualSessionId, actualSimulationId });

    console.log('🔍 Checking session status...');
    const sessionCheck = await DatabaseService.query(`
      SELECT ss.id, ss.user_id as session_owner_id, ss.simulation_id, ss.status
      FROM simulation_sessions ss
      WHERE ss.id = $1
    `, [actualSessionId]);

    console.log('📊 Session check result:', {
      found: sessionCheck.rows.length > 0,
      sessionStatus: sessionCheck.rows[0]?.status || null,
      sessionOwner: sessionCheck.rows[0]?.session_owner_id || null
    });

    if (!sessionCheck.rows[0]) {
      console.log('❌ Session not found');
      ResponseService.error(res, 'Session not found', 404);
      return;
    }

    const session = sessionCheck.rows[0];
    
    if (session.status === 'completed') {
      console.log('❌ Cannot send messages to a completed session');
      ResponseService.error(res, 'Cannot send messages to a completed session', 400);
      return;
    }
    
    if (session.status === 'expired') {
      console.log('❌ Session has expired');
      ResponseService.error(res, 'Session has expired', 400);
      return;
    }
    
    console.log('✅ Session is active, status:', session.status);
    
    const isOwner = session.session_owner_id === req.user.id;
    const isRecruiter = req.user.user_type === 'recruiter' || 
                        req.user.user_type === 'company_admin' || 
                        req.user.user_type === 'system_admin';

    console.log('🔐 Permission check:', { isOwner, isRecruiter });

    if (!isOwner && !isRecruiter) {
      console.log('❌ Access denied - user not owner or recruiter');
      ResponseService.forbidden(res, 'Access denied');
      return;
    }
    console.log('✅ User has permission to send messages');

    const recipientId = isOwner ? null : session.session_owner_id;
    let recipientUserIds: string[] = [];

    if (isOwner) {
      const companyRecipients = await DatabaseService.query(`
        SELECT DISTINCT user_id
        FROM (
          SELECT ct.user_id
          FROM simulation_sessions ss
          JOIN simulations s ON s.id = ss.simulation_id
          LEFT JOIN applications a ON a.id = s.application_id
          JOIN jobs j ON j.id = COALESCE(s.job_id, a.job_id)
          JOIN company_team ct ON ct.company_id = j.company_id
          JOIN users team_user ON team_user.id = ct.user_id
          WHERE ss.id = $1
            AND ct.user_id IS NOT NULL
            AND (
              ct.role IN ('admin', 'recruiter')
              OR team_user.user_type IN ('company_admin', 'recruiter')
            )

          UNION

          SELECT c.created_by as user_id
          FROM simulation_sessions ss
          JOIN simulations s ON s.id = ss.simulation_id
          LEFT JOIN applications a ON a.id = s.application_id
          JOIN jobs j ON j.id = COALESCE(s.job_id, a.job_id)
          JOIN companies c ON c.id = j.company_id
          WHERE ss.id = $1
            AND c.created_by IS NOT NULL

          UNION

          SELECT j.created_by as user_id
          FROM simulation_sessions ss
          JOIN simulations s ON s.id = ss.simulation_id
          LEFT JOIN applications a ON a.id = s.application_id
          JOIN jobs j ON j.id = COALESCE(s.job_id, a.job_id)
          WHERE ss.id = $1
            AND j.created_by IS NOT NULL

          UNION

          SELECT a.assigned_to as user_id
          FROM simulation_sessions ss
          JOIN simulations s ON s.id = ss.simulation_id
          JOIN applications a ON a.id = s.application_id
          WHERE ss.id = $1
            AND a.assigned_to IS NOT NULL
        ) recipients
        WHERE user_id != $2
      `, [actualSessionId, req.user.id]);

      recipientUserIds = companyRecipients.rows
        .map((row: any) => row.user_id)
        .filter(Boolean);
    } else if (session.session_owner_id) {
      recipientUserIds = [session.session_owner_id];
    }

    // Handle reply functionality
    console.log('🔗 Checking reply functionality...');
    let threadId = null;
    let replyToId = null;

    if (replyTo && replyTo !== 'null' && replyTo !== 'undefined' && replyTo.length > 10) {
      console.log('📎 Processing reply to message:', replyTo);
      
      const originalMessage = await DatabaseService.query(`
        SELECT 
          cm.id, 
          cm.thread_id, 
          cm.user_id, 
          cm.message, 
          cm.session_id,
          ss.simulation_id
        FROM chat_messages cm
        JOIN simulation_sessions ss ON cm.session_id = ss.id
        WHERE cm.id = $1 AND ss.simulation_id = $2
      `, [replyTo, actualSimulationId]);

      console.log('📊 Original message lookup:', {
        found: originalMessage.rows.length > 0,
        originalMessageData: originalMessage.rows[0] ? {
          id: originalMessage.rows[0].id,
          thread_id: originalMessage.rows[0].thread_id,
          user_id: originalMessage.rows[0].user_id
        } : null
      });

      if (originalMessage.rows[0]) {
        replyToId = replyTo;
        
        if (originalMessage.rows[0].thread_id) {
          threadId = originalMessage.rows[0].thread_id;
          console.log('📎 Using existing thread_id:', threadId);
        } else {
          threadId = replyTo;
          console.log('📎 Creating new thread_id from replyTo:', threadId);
        }
        
        await DatabaseService.query(`
          UPDATE chat_messages 
          SET reply_count = COALESCE(reply_count, 0) + 1
          WHERE id = $1
        `, [replyTo]);
        console.log('✅ Updated reply_count for parent message');
      } else {
        console.log('⚠️ Original message not found, proceeding without reply context');
      }
    } else {
      console.log('📝 No reply context, sending new message');
    }

    // Insert message
    console.log('💾 Inserting message into database...');
    const insertStartTime = Date.now();
    
    const result = await DatabaseService.query(`
      INSERT INTO chat_messages (
        session_id, user_id, message, message_type, 
        reply_to, thread_id, recipient_id, timestamp, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id, session_id, user_id, message, message_type, 
                reply_to, thread_id, recipient_id, timestamp, created_at, reply_count
    `, [actualSessionId, req.user.id, cleanMessage, messageType, replyToId, threadId, recipientId]);

    const insertEndTime = Date.now();
    console.log(`✅ Message inserted in ${insertEndTime - insertStartTime}ms`);
    
    const savedMessage = result.rows[0];
    console.log('📊 Saved message:', {
      id: savedMessage.id,
      session_id: savedMessage.session_id,
      user_id: savedMessage.user_id,
      message_type: savedMessage.message_type,
      reply_to: savedMessage.reply_to,
      thread_id: savedMessage.thread_id
    });

    // Fetch user info
    console.log('👤 Fetching user info...');
    const userInfo = await DatabaseService.query(`
      SELECT 
        u.id, 
        u.email, 
        u.user_type,
        cp.first_name, 
        cp.last_name,
        cp.profile_photo_url
      FROM users u
      LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
      WHERE u.id = $1
    `, [req.user.id]);

    console.log('👤 User info retrieved:', {
      id: userInfo.rows[0]?.id,
      email: userInfo.rows[0]?.email,
      user_type: userInfo.rows[0]?.user_type,
      first_name: userInfo.rows[0]?.first_name,
      last_name: userInfo.rows[0]?.last_name
    });

    // Build response message
    const responseMessage: any = {
      id: savedMessage.id,
      session_id: actualSessionId,
      simulation_id: actualSimulationId,
      user_id: req.user.id,
      message: savedMessage.message,
      message_type: savedMessage.message_type,
      reply_to: savedMessage.reply_to,
      thread_id: savedMessage.thread_id,
      recipient_id: savedMessage.recipient_id,
      recipient_ids: recipientUserIds,
      reply_count: savedMessage.reply_count || 0,
      timestamp: savedMessage.timestamp,
      created_at: savedMessage.created_at,
      parsed_message: extractedText,
      author: {
        id: userInfo.rows[0].id,
        email: userInfo.rows[0].email,
        user_type: userInfo.rows[0].user_type,
        first_name: userInfo.rows[0].first_name,
        last_name: userInfo.rows[0].last_name,
        profile_photo_url: userInfo.rows[0].profile_photo_url,
        name: userInfo.rows[0].first_name 
          ? `${userInfo.rows[0].first_name} ${userInfo.rows[0].last_name || ''}`.trim()
          : userInfo.rows[0].email?.split('@')[0] || 'User'
      }
    };

    // Include original message context for replies
    if (replyToId) {
      console.log('📎 Adding replied_to_message context...');
      const originalMsg = await DatabaseService.query(`
        SELECT 
          cm.id, 
          cm.message, 
          cm.user_id, 
          cm.timestamp,
          ss.simulation_id
        FROM chat_messages cm
        JOIN simulation_sessions ss ON cm.session_id = ss.id
        WHERE cm.id = $1
      `, [replyToId]);
      
      if (originalMsg.rows[0]) {
        let originalText = originalMsg.rows[0].message;
        try {
          originalText = extractFromNested(originalText);
        } catch {}
        
        const originalAuthor = await DatabaseService.query(`
          SELECT email, first_name, last_name, profile_photo_url
          FROM users u
          LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
          WHERE u.id = $1
        `, [originalMsg.rows[0].user_id]);
        
        responseMessage.replied_to_message = {
          id: originalMsg.rows[0].id,
          message: (typeof originalText === 'string' ? originalText : '').substring(0, 200),
          timestamp: originalMsg.rows[0].timestamp,
          author: {
            id: originalMsg.rows[0].user_id,
            email: originalAuthor.rows[0]?.email,
            name: originalAuthor.rows[0]?.first_name 
              ? `${originalAuthor.rows[0].first_name} ${originalAuthor.rows[0].last_name || ''}`.trim()
              : originalAuthor.rows[0]?.email?.split('@')[0] || 'User',
            profile_photo_url: originalAuthor.rows[0]?.profile_photo_url
          }
        };
        console.log('✅ Added replied_to_message context');
      }
    }

    // Update session last activity
    console.log('🔄 Updating session last activity...');
    await DatabaseService.query(`
      UPDATE simulation_sessions 
      SET updated_at = NOW()
      WHERE id = $1
    `, [actualSessionId]);
    console.log('✅ Session last activity updated');

    // WebSocket broadcast
    console.log('📡 Broadcasting via WebSocket...');
    const io = req.app.get('io');
    if (io) {
      console.log('📡 WebSocket available, broadcasting to rooms:', {
        simulationRoom: `simulation:${actualSimulationId}`,
        sessionRoom: `session:${actualSessionId}`
      });
      
      io.to(`simulation:${actualSimulationId}`).emit('simulation_chat_message', responseMessage);
      io.to(`session:${actualSessionId}`).emit('simulation_chat_message', responseMessage);
      const userRoomIds = Array.from(new Set([req.user.id, ...recipientUserIds].filter(Boolean)));
      for (const userId of userRoomIds) {
        io.to(`user:${userId}`).emit('simulation_chat_message', responseMessage);
      }
      console.log('✅ Messages broadcasted to rooms');
      
      const unreadCounts = await DatabaseService.query(`
        SELECT 
          ss.user_id,
          COUNT(cm.id) as unread_count
        FROM simulation_sessions ss
        LEFT JOIN chat_messages cm ON cm.session_id = ss.id 
          AND cm.user_id != ss.user_id 
          AND cm.is_read = false
        WHERE ss.simulation_id = $1
        GROUP BY ss.user_id
      `, [actualSimulationId]);
      
      console.log('📊 Unread counts for users:', unreadCounts.rows);
      
      for (const uc of unreadCounts.rows) {
        io.to(`user:${uc.user_id}`).emit('unread_count_update', {
          simulation_id: actualSimulationId,
          unread_count: parseInt(uc.unread_count)
        });
      }
      console.log('✅ Unread count updates sent');
    } else {
      console.log('⚠️ WebSocket not available, skipping broadcast');
    }

    const totalDuration = Date.now() - startTime;
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [sendChatMessage] COMPLETED SUCCESSFULLY');
    console.log(`📊 Total execution time: ${totalDuration}ms`);
    console.log('═══════════════════════════════════════════════════════════════');

    ResponseService.success(res, responseMessage, 'Message sent successfully');
    
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [sendChatMessage] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    console.error(`📊 Total execution time before error: ${totalDuration}ms`);
    console.error('═══════════════════════════════════════════════════════════════');
    ResponseService.error(res, error.message || 'Failed to send message', 500, null, this.formatError(error));
  }
}
 

async editChatMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
  const extractFromNested = (input: any, depth = 0, maxDepth = 20): string => {
    if (depth >= maxDepth) return typeof input === 'string' ? input : '';
    if (typeof input === 'string') {
      try { return extractFromNested(JSON.parse(input), depth + 1, maxDepth); }
      catch { return input; }
    }
    if (input && typeof input === 'object') {
      if (input.text && typeof input.text === 'string') return input.text;
      if (input.message && typeof input.message === 'string') return input.message;
    }
    return typeof input === 'string' ? input : '';
  };

  try {
    const { sessionId, messageId, simulationId } = req.params;
    const { message } = req.body;

    console.log('[EDIT MESSAGE] Request params:', { sessionId, messageId, simulationId });
    console.log('[EDIT MESSAGE] User:', { id: req.user.id, type: req.user.user_type });

    if (!messageId || !ValidationService.isValidUUID(messageId)) {
      ResponseService.error(res, 'Invalid message ID format', 400);
      return;
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      ResponseService.error(res, 'Message content is required', 400);
      return;
    }
    if (message.length > 5000) {
      ResponseService.error(res, 'Message too long (max 5000 characters)', 400);
      return;
    }

    const messageCheck = await DatabaseService.query(`
      SELECT
        cm.id,
        cm.user_id,
        cm.message,
        cm.session_id as message_session_id,
        ss.simulation_id
      FROM chat_messages cm
      JOIN simulation_sessions ss ON cm.session_id = ss.id
      WHERE cm.id = $1
    `, [messageId]);

    if (!messageCheck.rows[0]) {
      ResponseService.error(res, 'Message not found', 404);
      return;
    }

    const found = messageCheck.rows[0];

    if (found.user_id !== req.user.id) {
      ResponseService.error(res, 'Access denied: You can only edit your own messages', 403);
      return;
    }

    const simulationAccess = await DatabaseService.query(`
      SELECT 
        s.user_id as candidate_id,
        s.id as simulation_id,
        EXISTS (
          SELECT 1 FROM company_team ct 
          WHERE ct.user_id = $2 AND ct.company_id IN (
            SELECT j.company_id FROM jobs j WHERE j.id = s.job_id
          )
        ) as is_recruiter
      FROM simulations s
      WHERE s.id = $1
    `, [found.simulation_id, req.user.id]);

    if (!simulationAccess.rows[0]) {
      ResponseService.error(res, 'Simulation not found or access denied', 404);
      return;
    }

    const access = simulationAccess.rows[0];
    const isCandidate = access.candidate_id === req.user.id;
    const isRecruiter = access.is_recruiter || req.user.user_type === 'system_admin';

    if (!isCandidate && !isRecruiter) {
      ResponseService.forbidden(res, 'Access denied: You do not have permission to edit messages in this simulation');
      return;
    }

    if (sessionId && ValidationService.isValidUUID(sessionId) && sessionId !== found.message_session_id) {
      const sessionSimResult = await DatabaseService.query(`
        SELECT simulation_id FROM simulation_sessions WHERE id = $1
      `, [sessionId]);

      const sessionSimId = sessionSimResult.rows[0]?.simulation_id;
      if (sessionSimId && sessionSimId !== found.simulation_id) {
        ResponseService.error(res, 'Message not found in this session', 404);
        return;
      }
    }

    // ✅ FIXED: Removed updated_at column (doesn't exist in chat_messages)
    const result = await DatabaseService.query(`
      UPDATE chat_messages
      SET message = $1
      WHERE id = $2
      RETURNING *
    `, [message.trim(), messageId]);

    const updatedMessage = result.rows[0];
    let extractedText = updatedMessage.message;
    try { extractedText = extractFromNested(updatedMessage.message); } catch {}

    const responseMessage = { 
      ...updatedMessage, 
      parsed_message: extractedText, 
      edited: true 
    };

    const io = req.app.get('io');
    if (io) {
      io.to(`simulation:${found.simulation_id}`).emit('simulation_chat_message_edited', responseMessage);
      io.to(`session:${found.message_session_id}`).emit('simulation_chat_message_edited', responseMessage);
    }

    ResponseService.success(res, responseMessage, 'Message updated successfully');
  } catch (error: any) {
    console.error('Edit message error:', error);
    ResponseService.error(res, 'Failed to edit message', 500, null, this.formatError(error));
  }
}

 async deleteChatMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📞 [deleteChatMessage] CALLED');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    // Get params from either route pattern
    const { simulationId, sessionId, messageId } = req.params;

    console.log('[DELETE MESSAGE] Request:', { 
      simulationId, 
      sessionId, 
      messageId, 
      userId: req.user.id,
      userType: req.user.user_type
    });

    if (!messageId || !ValidationService.isValidUUID(messageId)) {
      ResponseService.error(res, 'Invalid message ID format', 400);
      return;
    }

    // Step 1: Look up message by ID only (don't rely on URL params for lookup)
    const messageCheck = await DatabaseService.query(`
      SELECT 
        cm.id, 
        cm.user_id, 
        cm.session_id,
        cm.reply_to,
        ss.simulation_id
      FROM chat_messages cm
      JOIN simulation_sessions ss ON cm.session_id = ss.id
      WHERE cm.id = $1
    `, [messageId]);

    console.log('[DELETE MESSAGE] Message lookup result:', messageCheck.rows[0] || 'NOT FOUND');

    if (!messageCheck.rows[0]) {
      ResponseService.error(res, 'Message not found', 404);
      return;
    }

    const foundMessage = messageCheck.rows[0];
    const actualSimulationId = foundMessage.simulation_id;
    const actualSessionId = foundMessage.session_id;

    // If simulationId was provided in URL, verify it matches (optional validation)
    if (simulationId && ValidationService.isValidUUID(simulationId) && simulationId !== actualSimulationId) {
      console.log('[DELETE MESSAGE] Simulation ID mismatch:', { 
        urlSimulationId: simulationId, 
        actualSimulationId 
      });
      ResponseService.error(res, 'Message does not belong to this simulation', 404);
      return;
    }

    // If sessionId was provided in URL, verify it matches (optional validation)
    if (sessionId && ValidationService.isValidUUID(sessionId) && sessionId !== actualSessionId) {
      console.log('[DELETE MESSAGE] Session ID mismatch:', { 
        urlSessionId: sessionId, 
        actualSessionId 
      });
      ResponseService.error(res, 'Message does not belong to this session', 404);
      return;
    }

    // Step 2: Verify the user owns this message
    if (foundMessage.user_id !== req.user.id) {
      console.log('[DELETE MESSAGE] User not owner:', { 
        messageOwner: foundMessage.user_id, 
        currentUser: req.user.id 
      });
      ResponseService.error(res, 'Access denied: You can only delete your own messages', 403);
      return;
    }

    // Step 3: Verify user has access to the simulation (for recruiters/admins)
    const simulationAccess = await DatabaseService.query(`
      SELECT 
        s.user_id as candidate_id,
        s.id as simulation_id,
        EXISTS (
          SELECT 1 FROM company_team ct 
          WHERE ct.user_id = $2 AND ct.company_id IN (
            SELECT j.company_id FROM jobs j WHERE j.id = s.job_id
          )
        ) as is_recruiter
      FROM simulations s
      WHERE s.id = $1
    `, [actualSimulationId, req.user.id]);

    console.log('[DELETE MESSAGE] Simulation access check:', simulationAccess.rows[0]);

    if (!simulationAccess.rows[0]) {
      ResponseService.error(res, 'Simulation not found', 404);
      return;
    }

    const isOwner = simulationAccess.rows[0].candidate_id === req.user.id;
    const isRecruiter = simulationAccess.rows[0].is_recruiter || 
                        req.user.user_type === 'system_admin';

    if (!isOwner && !isRecruiter) {
      console.log('[DELETE MESSAGE] Access denied - not owner or recruiter');
      ResponseService.forbidden(res, 'Access denied to this simulation');
      return;
    }

    // Step 4: Update reply counts if this message was a reply
    if (foundMessage.reply_to) {
      await DatabaseService.query(`
        UPDATE chat_messages 
        SET reply_count = GREATEST(COALESCE(reply_count, 0) - 1, 0)
        WHERE id = $1
      `, [foundMessage.reply_to]);
      console.log('[DELETE MESSAGE] Updated reply count for parent message:', foundMessage.reply_to);
    }

    // Step 5: Delete the message
    const deleteResult = await DatabaseService.query(`
      DELETE FROM chat_messages 
      WHERE id = $1
      RETURNING id
    `, [messageId]);

    console.log('[DELETE MESSAGE] Delete result:', deleteResult.rows[0]);

    if (!deleteResult.rows[0]) {
      ResponseService.error(res, 'Failed to delete message', 500);
      return;
    }

    // Step 6: Broadcast deletion via WebSocket
    const io = req.app.get('io');
    if (io) {
      console.log('[DELETE MESSAGE] Broadcasting deletion via WebSocket');
      io.to(`simulation:${actualSimulationId}`).emit('simulation_chat_message_deleted', { 
        id: messageId,
        simulation_id: actualSimulationId
      });
      io.to(`session:${actualSessionId}`).emit('simulation_chat_message_deleted', { 
        id: messageId,
        session_id: actualSessionId
      });
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [deleteChatMessage] COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════');

    ResponseService.success(res, { 
      id: messageId,
      simulation_id: actualSimulationId,
      session_id: actualSessionId
    }, 'Message deleted successfully');
    
  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [deleteChatMessage] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    console.error('═══════════════════════════════════════════════════════════════');
    ResponseService.error(res, 'Failed to delete message', 500, null, this.formatError(error));
  }
}

  async updateGithubLinks(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { githubLinks } = req.body;

      if (!sessionId || !ValidationService.isValidUUID(sessionId)) {
        ResponseService.error(res, 'Invalid session ID format', 400);
        return;
      }

      if (!githubLinks || typeof githubLinks !== 'object') {
        ResponseService.error(res, 'GitHub links object is required', 400);
        return;
      }

      const sessionCheck = await DatabaseService.query(`
        SELECT id FROM simulation_sessions
        WHERE id = $1 AND user_id = $2
      `, [sessionId, req.user.id]);

      if (!sessionCheck.rows[0]) {
        ResponseService.error(res, 'Session not found or not accessible', 404);
        return;
      }

      const result = await DatabaseService.query(`
        UPDATE simulation_sessions
        SET github_links = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING github_links
      `, [JSON.stringify(githubLinks), sessionId]);

      ResponseService.success(res, result.rows[0].github_links, 'GitHub links updated');
    } catch (error: any) {
      ResponseService.error(res, 'Failed to update GitHub links', 500, null, this.formatError(error));
    }
  }
  
  
async getMySimulationSessions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { page = '1', limit = '20', status } = req.query;
    const validPage = Number(page);
    const validLimit = Math.min(Number(limit), 100);
    const offset = (validPage - 1) * validLimit;

    let whereClause = 'ss.user_id = $1';
    const params: any[] = [req.user.id];
    let paramIndex = 2;

    if (status && status !== 'all') {
      whereClause += ` AND ss.status = $${paramIndex++}`;
      params.push(status);
    }

    const result = await DatabaseService.query(`
      SELECT 
        ss.id as session_id,
        ss.simulation_id,
        ss.status as session_status,
        ss.started_at,
        ss.completed_at,
        ss.time_spent,
        ss.current_task,
        ss.score as session_score,
        ss.answers,
        ss.progress,
        ss.time_limit,
        ss.github_links,
        
        st.name as simulation_name,
        st.type as simulation_type,
        st.difficulty,
        st.duration_minutes,
        st.tasks,
        st.scoring_rubric,
        st.pass_fail_criteria,
        
        j.id as job_id,
        j.title as job_title,
        c.id as company_id,
        c.name as company_name,
        c.logo_url as company_logo,
        a.id as application_id,
        
        e.id as evaluation_id,
        e.overall_score,
        e.punctuality_score,
        e.communication_score,
        e.problem_solving_score,
        e.adaptability_score,
        e.collaboration_score,
        e.attention_to_detail_score,
        e.initiative_score,
        e.status as evaluation_status,
        e.completed_at as evaluation_completed_at,
        
        CASE 
          WHEN e.overall_score IS NOT NULL AND st.scoring_rubric->>'passingScore' IS NOT NULL 
          THEN e.overall_score >= (st.scoring_rubric->>'passingScore')::int
          WHEN e.overall_score IS NOT NULL 
          THEN e.overall_score >= 70
          ELSE NULL
        END as passed
        
      FROM simulation_sessions ss
      JOIN simulations sim ON ss.simulation_id = sim.id
      JOIN simulation_templates st ON sim.template_id = st.id
      LEFT JOIN applications a ON sim.application_id = a.id
      LEFT JOIN jobs j ON a.job_id = j.id
      LEFT JOIN companies c ON j.company_id = c.id
      LEFT JOIN evaluations e ON e.candidate_id = ss.user_id AND e.simulation_id = sim.id
      
      WHERE ${whereClause}
      ORDER BY ss.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, validLimit, offset]);

    const countResult = await DatabaseService.query(`
      SELECT COUNT(*) 
      FROM simulation_sessions ss
      WHERE ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0]?.count || '0');

    const processedResults = result.rows.map((row: any) => ({
      ...row,
      tasks: typeof row.tasks === 'string' ? JSON.parse(row.tasks) : row.tasks,
      scoring_rubric: typeof row.scoring_rubric === 'string' ? JSON.parse(row.scoring_rubric) : row.scoring_rubric,
      answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers,
      progress: typeof row.progress === 'string' ? JSON.parse(row.progress) : row.progress,
      github_links: typeof row.github_links === 'string' ? JSON.parse(row.github_links) : row.github_links,
    }));

    ResponseService.paginated(res, processedResults, {
      page: validPage,
      limit: validLimit,
      total,
      pages: Math.ceil(total / validLimit),
      has_next: validPage * validLimit < total,
      has_prev: validPage > 1,
    });

  } catch (error: any) {
    console.error('Error in getMySimulationSessions:', error);
    ResponseService.error(res, 'Failed to fetch simulation sessions', 500, null, this.formatError(error));
  }
}

async getSimulationSessionById(req: AuthenticatedRequest, res: Response): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📞 [getSimulationSessionById] CALLED');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    const { sessionId } = req.params;
    
    console.log('📋 REQUEST PARAMS:', {
      sessionId,
      userId: req.user.id,
      userType: req.user.user_type,
      timestamp: new Date().toISOString()
    });
    
    if (!sessionId || !ValidationService.isValidUUID(sessionId)) {
      console.log('❌ Invalid session ID format:', sessionId);
      ResponseService.error(res, 'Invalid session ID format', 400);  // ✅ Fixed
      return;
    }
    console.log('✅ Session ID validation passed');
    
    // First, check if session exists
    console.log('🔍 Checking if session exists...');
    const sessionCheck = await DatabaseService.execute(`
      SELECT id, user_id, simulation_id, status, started_at, completed_at 
      FROM simulation_sessions 
      WHERE id = $1
    `, [sessionId]);
    
    if (sessionCheck.rows.length === 0) {
      console.log('❌ Session not found for ID:', sessionId);
      this.sendError(res, 'Session not found', 404);
      return;
    }
    console.log('✅ Session exists');
    
    // Get the full session data with all details including task progress
    console.log('🔍 Fetching full session details with task progress...');
    const detailsStart = Date.now();
    
    const result = await DatabaseService.execute(`
      SELECT 
        -- Session columns (all from simulation_sessions)
        ss.id as session_id,
        ss.user_id as candidate_id,
        ss.simulation_id,
        ss.session_type,
        ss.status as session_status,
        ss.started_at,
        ss.completed_at as session_completed_at,
        ss.paused_at,
        ss.resumed_at,
        ss.time_limit,
        ss.time_remaining,
        ss.time_spent,
        ss.current_task,
        ss.answers,
        ss.progress,
        ss.score as session_score,
        ss.feedback as session_feedback,
        ss.notes,
        ss.github_links,
        ss.created_at as session_created_at,
        ss.updated_at as session_updated_at,
        ss.submission_results,
        
        -- Simulation Record columns (from simulations table)
        sim.id as simulation_record_id,
        sim.template_id,
        sim.application_id,
        sim.job_id,
        sim.status as simulation_status,
        sim.scheduled_at,
        sim.started_at as simulation_started_at,
        sim.completed_at as simulation_completed_at,
        sim.time_limit as simulation_time_limit,
        sim.time_remaining as simulation_time_remaining,
        sim.time_spent as simulation_time_spent,
        sim.tasks,
        sim.progress as simulation_progress,
        sim.current_task as simulation_current_task,
        sim.answers as simulation_answers,
        sim.results,
        sim.ai_analysis,
        sim.ai_analysis_version,
        sim.punctuality_score,
        sim.communication_score,
        sim.problem_solving_score,
        sim.adaptability_score,
        sim.collaboration_score,
        sim.attention_score,
        sim.initiative_score,
        sim.overall_score as simulation_overall_score,
        sim.feedback as simulation_feedback,
        sim.strengths,
        sim.improvements,
        sim.evaluator_notes,
        sim.evaluated_by,
        sim.evaluated_at,
        sim.blockchain_tx_id,
        sim.blockchain_hash,
        sim.blockchain_timestamp,
        sim.metadata as simulation_metadata,
        
        -- Simulation Template columns (from simulation_templates)
        st.name as simulation_name,
        st.slug as simulation_slug,
        st.description as simulation_description,
        st.type as simulation_type,
        st.category,
        st.difficulty,
        st.duration_minutes,
        st.total_tasks,
        st.tasks as template_tasks,
        st.tasks_structure,
        st.scoring_rubric,
        st.pass_fail_criteria,
        st.evaluation_criteria,
        st.technologies,
        st.skills_assessed,
        st.languages_supported,
        st.instructions,
        st.preparation_materials,
        st.is_public,
        st.is_active,
        
        -- Session Task Progress (from session_task_progress table)
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', stp.id,
                'task_index', stp.task_index,
                'status', stp.status,
                'started_at', stp.started_at,
                'completed_at', stp.completed_at,
                'time_spent', stp.time_spent,
                'answer', stp.answer,
                'score', stp.score,
                'feedback', stp.feedback,
                'github_commit_url', stp.github_commit_url,
                'created_at', stp.created_at,
                'updated_at', stp.updated_at
              ) ORDER BY stp.task_index
            )
            FROM session_task_progress stp
            WHERE stp.session_id = ss.id
          ),
          '[]'::jsonb
        ) as session_task_progress,
        
        -- Code Submissions (from code_submissions table)
        (
          SELECT jsonb_agg(jsonb_build_object(
            'id', cs.id,
            'task_id', cs.task_id,
            'language', cs.language,
            'code', cs.code,
            'code_version', cs.code_version,
            'test_results', cs.test_results,
            'test_passed', cs.test_passed,
            'test_total', cs.test_total,
            'execution_time', cs.execution_time,
            'memory_used', cs.memory_used,
            'compiler_output', cs.compiler_output,
            'error_message', cs.error_message,
            'submitted_at', cs.submitted_at
          ))
          FROM code_submissions cs
          WHERE cs.simulation_id = ss.simulation_id
        ) as code_submissions,
        
        -- User/Candidate columns
        u.email as candidate_email,
        u.user_type as candidate_user_type,
        u.status as candidate_status,
        u.created_at as candidate_created_at,
        
        -- Candidate Profile columns
        cp.first_name,
        cp.last_name,
        cp.phone,
        cp.country,
        cp.city,
        cp.timezone,
        cp.date_of_birth,
        cp.gender,
        cp.profile_photo_url,
        cp.headline,
        cp.summary,
        cp.linkedin_url,
        cp.github_url,
        cp.portfolio_url,
        cp.website_url,
        cp.profile_completion,
        cp.languages,
        
        -- Evaluation columns (if exists)
        e.id as evaluation_id,
        e.overall_score as evaluation_overall_score,
        e.punctuality_score as evaluation_punctuality_score,
        e.communication_score as evaluation_communication_score,
        e.problem_solving_score as evaluation_problem_solving_score,
        e.adaptability_score as evaluation_adaptability_score,
        e.collaboration_score as evaluation_collaboration_score,
        e.attention_to_detail_score,
        e.initiative_score as evaluation_initiative_score,
        e.status as evaluation_status,
        e.completed_at as evaluation_completed_at,
        e.reviewed_at,
        e.reviewer_id,
        e.created_at as evaluation_created_at,
        e.updated_at as evaluation_updated_at,
        
        -- Evaluation sections (aggregated as JSON)
        (
          SELECT jsonb_agg(jsonb_build_object(
            'section_name', es.section_name,
            'score', es.score,
            'max_score', es.max_score,
            'percentage', es.percentage,
            'time_spent_seconds', es.time_spent_seconds,
            'tasks_completed', es.tasks_completed,
            'total_tasks', es.total_tasks
          ) ORDER BY es.section_name)
          FROM evaluation_sections es
          WHERE es.evaluation_id = e.id
        ) as evaluation_sections,
        
        -- Behavioral metrics (aggregated as JSON)
        (
          SELECT jsonb_agg(jsonb_build_object(
            'metric', ebm.metric,
            'score', ebm.score,
            'description', ebm.description,
            'improvement_suggestion', ebm.improvement_suggestion
          ))
          FROM evaluation_behavioral_metrics ebm
          WHERE ebm.evaluation_id = e.id
        ) as behavioral_metrics,
        
        -- Skill assessments (aggregated as JSON)
        (
          SELECT jsonb_agg(jsonb_build_object(
            'skill', esa.skill,
            'level', esa.level,
            'score', esa.score,
            'evidence', esa.evidence
          ))
          FROM evaluation_skill_assessments esa
          WHERE esa.evaluation_id = e.id
        ) as skill_assessments,
        
        -- AI feedback
        (
          SELECT jsonb_build_object(
            'summary', eaf.summary,
            'detailed_analysis', eaf.detailed_analysis,
            'strengths', eaf.strengths,
            'areas_for_improvement', eaf.areas_for_improvement,
            'recommendations', eaf.recommendations,
            'confidence', eaf.confidence
          )
          FROM evaluation_ai_feedback eaf
          WHERE eaf.evaluation_id = e.id
        ) as ai_feedback,
        
        -- Benchmarks
        (
          SELECT jsonb_build_object(
            'overall_percentile', eb.overall_percentile,
            'role_percentile', eb.role_percentile,
            'industry_percentile', eb.industry_percentile,
            'company_percentile', eb.company_percentile
          )
          FROM evaluation_benchmarks eb
          WHERE eb.evaluation_id = e.id
        ) as benchmarks,
        
        -- Qualitative feedback
        (
          SELECT jsonb_build_object(
            'strengths', eqf.strengths,
            'weaknesses', eqf.weaknesses,
            'recommendations', eqf.recommendations,
            'overall_feedback', eqf.overall_feedback
          )
          FROM evaluation_qualitative_feedback eqf
          WHERE eqf.evaluation_id = e.id
        ) as qualitative_feedback,
        
        -- Interview questions
        (
          SELECT jsonb_agg(jsonb_build_object(
            'question', eiq.question,
            'priority', eiq.priority,
            'category', eiq.category
          ))
          FROM evaluation_interview_questions eiq
          WHERE eiq.evaluation_id = e.id
        ) as interview_questions,
        
        -- Application columns
        a.id as application_id,
        a.application_number,
        a.status as application_status,
        a.applied_at,
        a.match_score,
        a.rating,
        
        -- Job columns
        j.id as job_id,
        j.title as job_title,
        j.job_type,
        j.work_arrangement,
        j.locations,
        j.department,
        j.salary_min,
        j.salary_max,
        j.experience_level,
        
        -- Company columns
        c.id as company_id,
        c.name as company_name,
        c.logo_url,
        c.industry,
        c.description as company_description
        
      FROM simulation_sessions ss
      JOIN simulations sim ON ss.simulation_id = sim.id
      JOIN simulation_templates st ON sim.template_id = st.id
      LEFT JOIN users u ON ss.user_id = u.id
      LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
      LEFT JOIN evaluations e ON e.simulation_id = sim.id AND e.candidate_id = ss.user_id
      LEFT JOIN applications a ON sim.application_id = a.id
      LEFT JOIN jobs j ON j.id = COALESCE(sim.job_id, a.job_id)
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE ss.id = $1
    `, [sessionId]);
    
    const detailsEnd = Date.now();
    console.log(`📊 Query executed in ${detailsEnd - detailsStart}ms`);
    
    if (result.rows.length === 0) {
      console.log('❌ Session details not found');
      this.sendError(res, 'Session details not found', 404);
      return;
    }
    
    const row = result.rows[0];

    const isSessionOwner = row.candidate_id === req.user.id;
    const isSystemAdmin = req.user.user_type === 'system_admin';
    let hasCompanyAccess = false;

    if (!isSessionOwner && !isSystemAdmin && (req.user.user_type === 'company_admin' || req.user.user_type === 'recruiter')) {
      const accessResult = await DatabaseService.query(`
        SELECT 1
        WHERE EXISTS (
          SELECT 1
          FROM company_team ct
          WHERE ct.company_id = $1
            AND ct.user_id = $2
            AND ct.role IN ('admin', 'recruiter')
        )
        OR EXISTS (
          SELECT 1
          FROM companies c
          WHERE c.id = $1
            AND c.created_by = $2
        )
        OR EXISTS (
          SELECT 1
          FROM jobs j
          WHERE j.id = $3
            AND j.created_by = $2
        )
        OR EXISTS (
          SELECT 1
          FROM applications a
          WHERE a.id = $4
            AND a.assigned_to = $2
        )
      `, [row.company_id, req.user.id, row.job_id, row.application_id]);

      hasCompanyAccess = accessResult.rows.length > 0;
    }

    if (!isSessionOwner && !isSystemAdmin && !hasCompanyAccess) {
      console.log('âŒ Access denied to session:', {
        sessionId,
        userId: req.user.id,
        userType: req.user.user_type,
        companyId: row.company_id,
        jobId: row.job_id,
        applicationId: row.application_id
      });
      this.sendError(res, 'Access denied to this session', 403);
      return;
    }
    
    // Check if session has expired
    console.log('🔍 Checking if simulation has expired...');
    const expirationCheck = await this.isSimulationExpired(row.simulation_record_id);
    if (expirationCheck.expired) {
      console.log('❌ Simulation expired:', expirationCheck.reason);
      // Update session to expired status (commented out)
      // await DatabaseService.query(`
      //   UPDATE simulation_sessions 
      //   SET status = 'expired', completed_at = NOW(), updated_at = NOW()
      //   WHERE id = $1
      // `, [sessionId]);
      // this.sendError(res, expirationCheck.reason || 'Simulation has expired', 400);
      // return;
    }
    console.log('✅ Simulation is not expired');
    
    // ============================================
    // ✅ EXTRACT GITHUB REPO FROM github_links
    // ============================================
    let githubRepo = null;
    if (row.github_links) {
      try {
        githubRepo = typeof row.github_links === 'string' 
          ? JSON.parse(row.github_links) 
          : row.github_links;
          
        console.log('✅ GitHub repo data extracted from session:', {
          repoName: githubRepo.repoName,
          repoUrl: githubRepo.repoUrl,
          cloneUrl: githubRepo.cloneUrl,
          branchName: githubRepo.branchName,
          organizationName: githubRepo.organizationName,
          candidateUsername: githubRepo.candidateUsername,
          issuesCount: githubRepo.issues?.length || 0
        });
      } catch (err) {
        console.warn('⚠️ Failed to parse github_links:', err);
      }
    } else {
      console.log('📭 No github_links found in session');
    }
    
    // Parse template tasks
    let templateTasks = [];
    if (row.template_tasks) {
      if (typeof row.template_tasks === 'object') {
        templateTasks = row.template_tasks;
      } else if (typeof row.template_tasks === 'string') {
        try {
          templateTasks = JSON.parse(row.template_tasks);
        } catch (e) {
          console.log('⚠️ Failed to parse template_tasks');
          templateTasks = [];
        }
      }
    }
    
    // Get existing task progress
    let existingTaskProgress = [];
    if (row.session_task_progress) {
      if (typeof row.session_task_progress === 'object') {
        existingTaskProgress = row.session_task_progress;
      } else if (typeof row.session_task_progress === 'string') {
        try {
          existingTaskProgress = JSON.parse(row.session_task_progress);
        } catch (e) {
          existingTaskProgress = [];
        }
      }
    }
    
    // Create a map of existing task progress by task_index
    const taskProgressMap = new Map();
    for (const task of existingTaskProgress) {
      taskProgressMap.set(task.task_index, task);
    }
    
    // ✅ Build complete task progress with 0-based indexing
    const mergedTaskProgress = [];
    const totalTemplateTasks = templateTasks.length;
    
    for (let i = 0; i < totalTemplateTasks; i++) {
      const task = templateTasks[i];
      const existingTask = taskProgressMap.get(i);
      
      if (existingTask) {
        mergedTaskProgress.push({
          ...existingTask,
          task_id: task.id,
          task_title: task.title || `Task ${i + 1}`,
          task_description: task.description || '',
          task_duration: task.duration || 0,
          task_type: task.type || 'technical',
          template_task: task
        });
      } else {
        mergedTaskProgress.push({
          id: null,
          task_index: i,
          task_id: task.id,
          task_title: task.title || `Task ${i + 1}`,
          task_description: task.description || '',
          task_duration: task.duration || 0,
          task_type: task.type || 'technical',
          status: 'not_started',
          started_at: null,
          completed_at: null,
          time_spent: 0,
          answer: null,
          score: null,
          feedback: null,
          github_commit_url: null,
          code_submission: null,
          template_task: task
        });
      }
    }
    
    // Process code submissions
    let codeSubmissions = [];
    if (row.code_submissions) {
      if (typeof row.code_submissions === 'object') {
        codeSubmissions = row.code_submissions;
      } else if (typeof row.code_submissions === 'string') {
        try {
          codeSubmissions = JSON.parse(row.code_submissions);
        } catch (e) {
          codeSubmissions = [];
        }
      }
    }
    
    // ✅ Format the response WITH GITHUB REPO DATA
    const formattedResult = {
      // Session Info
      session: {
        id: row.session_id,
        candidate_id: row.candidate_id,
        simulation_id: row.simulation_id,
        session_type: row.session_type,
        status: row.session_status,
        started_at: row.started_at,
        completed_at: row.session_completed_at,
        paused_at: row.paused_at,
        resumed_at: row.resumed_at,
        time_limit: row.time_limit,
        time_remaining: row.time_remaining,
        time_spent: row.time_spent,
        current_task: row.current_task,
        answers: row.answers,
        progress: row.progress,
        score: row.session_score,
        feedback: row.session_feedback,
        notes: row.notes,
        github_links: row.github_links,
        created_at: row.session_created_at,
        updated_at: row.session_updated_at
      },
      
      // ✅ GITHUB REPOSITORY DATA - This is what the frontend ResumeDialog needs
      githubRepo: githubRepo ? {
        repoName: githubRepo.repoName,
        repoUrl: githubRepo.repoUrl,
        cloneUrl: githubRepo.cloneUrl || `${githubRepo.repoUrl}.git`,
        branchName: githubRepo.branchName || 'main',
        organizationName: githubRepo.organizationName || 'recruitment-platform',
        candidateUsername: githubRepo.candidateUsername,
        status: githubRepo.status || 'active',
        createdAt: githubRepo.createdAt,
        issues: githubRepo.issues || []
      } : null,
      
      // Task Progress (with 0-based indexing)
      task_progress: mergedTaskProgress,
      
      // Code Submissions
      code_submissions: codeSubmissions,
      
      // Candidate Info
      candidate: {
        id: row.candidate_id,
        email: row.candidate_email,
        user_type: row.candidate_user_type,
        first_name: row.first_name,
        last_name: row.last_name,
        full_name: row.first_name && row.last_name 
          ? `${row.first_name} ${row.last_name}` 
          : row.candidate_email?.split('@')[0] || 'Anonymous',
        phone: row.phone,
        country: row.country,
        city: row.city,
        profile_photo_url: row.profile_photo_url,
        headline: row.headline,
        summary: row.summary,
        linkedin_url: row.linkedin_url,
        github_url: row.github_url,
        profile_completion: row.profile_completion,
        languages: row.languages
      },
      
      // Simulation Record Info
      simulation_record: {
        id: row.simulation_record_id,
        template_id: row.template_id,
        application_id: row.application_id,
        job_id: row.job_id,
        status: row.simulation_status,
        scheduled_at: row.scheduled_at,
        started_at: row.simulation_started_at,
        completed_at: row.simulation_completed_at,
        time_limit: row.simulation_time_limit,
        time_spent: row.simulation_time_spent,
        current_task: row.simulation_current_task,
        overall_score: row.simulation_overall_score,
        punctuality_score: row.punctuality_score,
        communication_score: row.communication_score,
        problem_solving_score: row.problem_solving_score,
        adaptability_score: row.adaptability_score,
        collaboration_score: row.collaboration_score,
        attention_score: row.attention_score,
        initiative_score: row.initiative_score,
        feedback: row.simulation_feedback,
        strengths: row.strengths,
        improvements: row.improvements,
        ai_analysis: row.ai_analysis,
        blockchain_tx_id: row.blockchain_tx_id,
        metadata: row.simulation_metadata
      },
      
      // Evaluation Info
      evaluation: row.evaluation_id ? {
        id: row.evaluation_id,
        overall_score: row.evaluation_overall_score,
        punctuality_score: row.evaluation_punctuality_score,
        communication_score: row.evaluation_communication_score,
        problem_solving_score: row.evaluation_problem_solving_score,
        adaptability_score: row.evaluation_adaptability_score,
        collaboration_score: row.evaluation_collaboration_score,
        attention_to_detail_score: row.attention_to_detail_score,
        initiative_score: row.evaluation_initiative_score,
        status: row.evaluation_status,
        completed_at: row.evaluation_completed_at,
        reviewed_at: row.reviewed_at,
        reviewer_id: row.reviewer_id,
        sections: row.evaluation_sections || [],
        behavioral_metrics: row.behavioral_metrics || [],
        skill_assessments: row.skill_assessments || [],
        ai_feedback: row.ai_feedback,
        benchmarks: row.benchmarks,
        qualitative_feedback: row.qualitative_feedback,
        interview_questions: row.interview_questions || []
      } : null,
      
      // Simulation Template Info
      simulation_template: {
        id: row.template_id,
        name: row.simulation_name,
        slug: row.simulation_slug,
        description: row.simulation_description,
        type: row.simulation_type,
        category: row.category,
        difficulty: row.difficulty,
        duration_minutes: row.duration_minutes,
        total_tasks: totalTemplateTasks,
        tasks: templateTasks,
        tasks_structure: row.tasks_structure,
        scoring_rubric: row.scoring_rubric,
        pass_fail_criteria: row.pass_fail_criteria,
        evaluation_criteria: row.evaluation_criteria,
        technologies: row.technologies,
        skills_assessed: row.skills_assessed,
        instructions: row.instructions,
        is_public: row.is_public,
        is_active: row.is_active
      },
      
      // Application Info
      application: row.application_id ? {
        id: row.application_id,
        number: row.application_number,
        status: row.application_status,
        applied_at: row.applied_at,
        match_score: row.match_score,
        rating: row.rating
      } : null,
      
      // Job Info
      job: row.job_id ? {
        id: row.job_id,
        title: row.job_title,
        type: row.job_type,
        work_arrangement: row.work_arrangement,
        locations: row.locations,
        department: row.department,
        salary_min: row.salary_min,
        salary_max: row.salary_max,
        experience_level: row.experience_level
      } : null,
      
      submission_results: row.submission_results ? (typeof row.submission_results === 'string' ? JSON.parse(row.submission_results) : row.submission_results) : null,
      
      // Company Info
      company: row.company_id ? {
        id: row.company_id,
        name: row.company_name,
        logo_url: row.logo_url,
        industry: row.industry,
        description: row.company_description
      } : null,
      
      // Summary fields
      has_evaluation: !!row.evaluation_id,
      passed: (row.evaluation_overall_score || row.simulation_overall_score || 0) >= 70,
      total_score: row.evaluation_overall_score || row.simulation_overall_score || row.session_score || 0
    };
    
    console.log('📊 Session details retrieved:', {
      session_id: row.session_id,
      session_status: row.session_status,
      simulation_name: row.simulation_name,
      job_title: row.job_title,
      company_name: row.company_name,
      candidate_name: formattedResult.candidate.full_name,
      has_evaluation: formattedResult.has_evaluation,
      total_score: formattedResult.total_score,
      has_github_repo: !!formattedResult.githubRepo,
      github_repo_url: formattedResult.githubRepo?.repoUrl,
      task_progress_count: mergedTaskProgress.length,
      code_submissions_count: codeSubmissions.length,
      time_spent: row.time_spent,
      current_task: row.current_task,
      requesting_user: {
        id: req.user.id,
        type: req.user.user_type
      }
    });
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [getSimulationSessionById] COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════');
    
    ResponseService.success(res, formattedResult, 'Session retrieved successfully');  // ✅ Fixed
    
  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [getSimulationSessionById] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    console.error('═══════════════════════════════════════════════════════════════');
    ResponseService.error(res, 'Failed to fetch session', 500, null, this.formatError(error));  // ✅ Fixed
  }
}

async resumeSimulationSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId || !ValidationService.isValidUUID(sessionId)) {
      ResponseService.error(res, 'Invalid session ID format', 400);
      return;
    }
    
    const sessionResult = await DatabaseService.query(`
      SELECT ss.*, st.duration_minutes, st.tasks, st.name as simulation_name
      FROM simulation_sessions ss
      JOIN simulations sim ON ss.simulation_id = sim.id
      JOIN simulation_templates st ON sim.template_id = st.id
      WHERE ss.id = $1 AND ss.user_id = $2
    `, [sessionId, req.user.id]);
    
    if (!sessionResult.rows[0]) {
      ResponseService.notFound(res, 'Session not found');
      return;
    }
    
    const session = sessionResult.rows[0];
    
    if (session.status === 'completed') {
      ResponseService.error(res, 'Session already completed', 400);
      return;
    }
    
    if (session.status === 'expired') {
      ResponseService.error(res, 'Simulation has expired', 400);
      return;
    }
    
    // Check if simulation has expired
    const expirationCheck = await this.isSimulationExpired(session.simulation_id);
    if (expirationCheck.expired) {
      // Update session to expired
      await DatabaseService.query(`
      //   UPDATE simulation_sessions 
      //   SET status = 'expired', completed_at = NOW(), updated_at = NOW()
      //   WHERE id = $1
      // `, [sessionId]);
      // ResponseService.error(res, expirationCheck.reason || 'Simulation has expired', 400);
      // return;
    }
    
    if (session.status !== 'in_progress') {
      await DatabaseService.query(`
        UPDATE simulation_sessions 
        SET status = 'in_progress', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
        WHERE id = $1
      `, [sessionId]);
    }
    
    let timeElapsed = 0;
    if (session.started_at) {
      timeElapsed = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
    }
    
    ResponseService.success(res, {
      sessionId: session.id,
      simulationId: session.simulation_id,
      simulationName: session.simulation_name,
      status: 'in_progress',
      startedAt: session.started_at,
      timeLimit: session.time_limit,
      timeElapsed,
      timeRemaining: Math.max(0, (session.time_limit || 3600) - timeElapsed),
      currentTask: session.current_task || 0,
      answers: session.answers || {},
      progress: session.progress || {},
      tasks: session.tasks,
    }, 'Session ready to resume');
  } catch (error: any) {
    ResponseService.error(res, 'Failed to resume session', 500, null, this.formatError(error));
  }
}

async cancelSimulationSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId || !ValidationService.isValidUUID(sessionId)) {
      ResponseService.error(res, 'Invalid session ID format', 400);
      return;
    }
    
    const result = await DatabaseService.query(`
      UPDATE simulation_sessions 
      SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'in_progress'
      RETURNING id, simulation_id
    `, [sessionId, req.user.id]);
    
    if (!result.rows[0]) {
      ResponseService.notFound(res, 'Active session not found');
      return;
    }
    
    ResponseService.success(res, null, 'Session cancelled');
  } catch (error: any) {
    ResponseService.error(res, 'Failed to cancel session', 500, null, this.formatError(error));
  }
}



async getSimulationCandidates(req: AuthenticatedRequest, res: Response): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📞 [getSimulationCandidates] CALLED');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    const { id } = req.params;
    const { page = '1', limit = '100', status = 'all' } = req.query;
    
    console.log('📋 REQUEST PARAMS:', {
      simulationTemplateId: id,
      page,
      limit,
      status,
      userId: req.user.id,
      userType: req.user.user_type,
      timestamp: new Date().toISOString()
    });
    
    if (!id || !ValidationService.isValidUUID(id)) {
      console.log('❌ Invalid simulation ID format:', id);
      ResponseService.error(res, 'Invalid simulation ID format', 400);
      return;
    }
    console.log('✅ Simulation ID validation passed');

    // Verify user has access to this simulation template
    console.log('🔍 Checking simulation template access for ID:', id);
    const simulationCheck = await DatabaseService.query(`
      SELECT st.id, st.company_id, st.created_by, st.name
      FROM simulation_templates st
      WHERE st.id = $1
    `, [id]);
    
    console.log('📊 Simulation template check result:', {
      found: simulationCheck.rows.length > 0,
      rowCount: simulationCheck.rows.length,
      simulationData: simulationCheck.rows[0] || null
    });

    if (!simulationCheck.rows[0]) {
      console.log('❌ Simulation template not found for ID:', id);
      ResponseService.notFound(res, 'Simulation not found');
      return;
    }

    const simulationTemplate = simulationCheck.rows[0];
    console.log('📊 Simulation template data:', {
      id: simulationTemplate.id,
      name: simulationTemplate.name,
      company_id: simulationTemplate.company_id,
      created_by: simulationTemplate.created_by
    });
    
    console.log('🔍 Getting user company ID for user:', req.user.id);
    const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);
    console.log('📊 User company ID:', userCompanyId);
    
    const isOwner = simulationTemplate.created_by === req.user.id;
    const isCompanyUser = simulationTemplate.company_id === userCompanyId;
    const isAdmin = req.user.user_type === 'system_admin';
    const isRecruiter = req.user.user_type === 'recruiter' || 
                        req.user.user_type === 'company_admin' || 
                        req.user.user_type === 'system_admin';

    console.log('🔐 Access check results:', {
      isOwner,
      isCompanyUser,
      isAdmin,
      simulationCreatedBy: simulationTemplate.created_by,
      currentUserId: req.user.id,
      simulationCompanyId: simulationTemplate.company_id,
      userCompanyId: userCompanyId,
      userType: req.user.user_type,
      hasAccess: isOwner || isCompanyUser || isAdmin || isRecruiter
    });

    if (!isCompanyUser && !isRecruiter) {
      console.log('❌ Access denied to simulation template:', id);
      ResponseService.forbidden(res, 'Access denied to this simulation');
      return;
    }
    console.log('✅ Access granted to simulation template');

    // Build status filter
    let statusFilter = '';
    const queryParams: any[] = [id];
    let paramIndex = 2;

    if (status !== 'all') {
      if (status === 'completed') {
        statusFilter = ` AND e.status = 'completed'`;
      } else if (status === 'in_progress') {
        statusFilter = ` AND ss.status = 'in_progress' AND e.id IS NULL`;
      }
      console.log('📊 Status filter applied:', { status, statusFilter });
    }

    // Get pagination
    const validPage = Math.max(1, parseInt(page as string));
    const validLimit = Math.min(100, parseInt(limit as string));
    const offset = (validPage - 1) * validLimit;
    
    console.log('📄 Pagination:', {
      originalPage: page,
      originalLimit: limit,
      validPage,
      validLimit,
      offset,
      paramIndex
    });

    // Get ALL sessions and evaluations for this simulation template
    console.log('🔍 Executing main query to fetch ALL sessions for simulation template:', id);
    const queryStartTime = Date.now();
    
    const result = await DatabaseService.query(`
      SELECT 
        -- Session columns
        ss.id as session_id,
        ss.user_id as candidate_id,
        ss.session_type,
        ss.status as session_status,
        ss.started_at,
        ss.completed_at as session_completed_at,
        ss.time_limit,
        ss.time_remaining,
        ss.time_spent,
        ss.current_task,
        ss.score as session_score,
        ss.answers,
        ss.progress,
        ss.feedback as session_feedback,
        ss.notes,
        ss.github_links,
        ss.created_at as session_created_at,
        ss.updated_at as session_updated_at,
        
        -- User columns
        u.email as candidate_email,
        u.user_type,
        u.status as user_status,
        u.created_at as user_created_at,
        
        -- Candidate profile columns
        cp.first_name,
        cp.last_name,
        cp.phone,
        cp.country,
        cp.city,
        cp.profile_photo_url,
        cp.headline,
        cp.summary,
        cp.linkedin_url,
        cp.github_url,
        cp.profile_completion,
        
        -- Simulation columns
        sim.id as simulation_record_id,
        sim.status as simulation_status,
        sim.scheduled_at,
        sim.started_at as simulation_started_at,
        sim.completed_at as simulation_completed_at,
        sim.time_limit as simulation_time_limit,
        sim.time_spent as simulation_time_spent,
        sim.tasks,
        sim.progress as simulation_progress,
        sim.current_task as simulation_current_task,
        sim.answers as simulation_answers,
        sim.results,
        sim.ai_analysis,
        sim.punctuality_score,
        sim.communication_score,
        sim.problem_solving_score,
        sim.adaptability_score,
        sim.collaboration_score,
        sim.attention_score,
        sim.initiative_score,
        sim.overall_score as simulation_overall_score,
        sim.feedback as simulation_feedback,
        sim.strengths,
        sim.improvements,
        sim.evaluator_notes,
        sim.evaluated_by,
        sim.evaluated_at,
        sim.blockchain_tx_id,
        sim.blockchain_hash,
        sim.metadata as simulation_metadata,
        
        -- Evaluation columns
        e.id as evaluation_id,
        e.overall_score as evaluation_overall_score,
        e.punctuality_score as evaluation_punctuality_score,
        e.communication_score as evaluation_communication_score,
        e.problem_solving_score as evaluation_problem_solving_score,
        e.adaptability_score as evaluation_adaptability_score,
        e.collaboration_score as evaluation_collaboration_score,
        e.attention_to_detail_score,
        e.initiative_score as evaluation_initiative_score,
        e.status as evaluation_status,
        e.completed_at as evaluation_completed_at,
        e.reviewed_at,
        e.reviewer_id,
        e.created_at as evaluation_created_at,
        e.updated_at as evaluation_updated_at,
        
        -- Evaluation sections (aggregated as JSON)
        (
          SELECT jsonb_agg(jsonb_build_object(
            'section_name', es.section_name,
            'score', es.score,
            'max_score', es.max_score,
            'percentage', es.percentage,
            'time_spent_seconds', es.time_spent_seconds,
            'tasks_completed', es.tasks_completed,
            'total_tasks', es.total_tasks
          ))
          FROM evaluation_sections es
          WHERE es.evaluation_id = e.id
        ) as evaluation_sections,
        
        -- Behavioral metrics (aggregated as JSON)
        (
          SELECT jsonb_agg(jsonb_build_object(
            'metric', ebm.metric,
            'score', ebm.score,
            'description', ebm.description,
            'improvement_suggestion', ebm.improvement_suggestion
          ))
          FROM evaluation_behavioral_metrics ebm
          WHERE ebm.evaluation_id = e.id
        ) as behavioral_metrics,
        
        -- Skill assessments (aggregated as JSON)
        (
          SELECT jsonb_agg(jsonb_build_object(
            'skill', esa.skill,
            'level', esa.level,
            'score', esa.score
          ))
          FROM evaluation_skill_assessments esa
          WHERE esa.evaluation_id = e.id
        ) as skill_assessments,
        
        -- AI feedback
        (
          SELECT jsonb_build_object(
            'summary', eaf.summary,
            'detailed_analysis', eaf.detailed_analysis,
            'strengths', eaf.strengths,
            'areas_for_improvement', eaf.areas_for_improvement,
            'recommendations', eaf.recommendations,
            'confidence', eaf.confidence
          )
          FROM evaluation_ai_feedback eaf
          WHERE eaf.evaluation_id = e.id
        ) as ai_feedback,
        
        -- Benchmarks
        (
          SELECT jsonb_build_object(
            'overall_percentile', eb.overall_percentile,
            'role_percentile', eb.role_percentile,
            'industry_percentile', eb.industry_percentile,
            'company_percentile', eb.company_percentile
          )
          FROM evaluation_benchmarks eb
          WHERE eb.evaluation_id = e.id
        ) as benchmarks,
        
        -- Qualitative feedback
        (
          SELECT jsonb_build_object(
            'strengths', eqf.strengths,
            'weaknesses', eqf.weaknesses,
            'recommendations', eqf.recommendations,
            'overall_feedback', eqf.overall_feedback
          )
          FROM evaluation_qualitative_feedback eqf
          WHERE eqf.evaluation_id = e.id
        ) as qualitative_feedback,
        
        -- Interview questions
        (
          SELECT jsonb_agg(jsonb_build_object(
            'question', eiq.question,
            'priority', eiq.priority,
            'category', eiq.category
          ))
          FROM evaluation_interview_questions eiq
          WHERE eiq.evaluation_id = e.id
        ) as interview_questions,
        
        -- Application columns
        a.id as application_id,
        a.application_number,
        a.status as application_status,
        a.applied_at,
        a.match_score,
        a.rating,
        
        -- Job columns
        j.id as job_id,
        j.title as job_title,
        j.job_type,
        j.work_arrangement,
        j.locations,
        j.department,
        j.salary_min,
        j.salary_max,
        j.experience_level,
        
        -- Company columns
        c.id as company_id,
        c.name as company_name,
        c.logo_url,
        c.industry,
        
        -- Simulation template columns
        st.name as simulation_name,
        st.description as simulation_description,
        st.type as simulation_type,
        st.difficulty,
        st.duration_minutes,
        st.tasks as template_tasks,
        st.scoring_rubric,
        st.pass_fail_criteria
        
      FROM simulation_templates st
      INNER JOIN simulations sim ON sim.template_id = st.id
      INNER JOIN simulation_sessions ss ON ss.simulation_id = sim.id
      INNER JOIN users u ON ss.user_id = u.id
      LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
      LEFT JOIN evaluations e ON e.simulation_id = sim.id AND e.candidate_id = ss.user_id
      LEFT JOIN applications a ON sim.application_id = a.id
      LEFT JOIN jobs j ON a.job_id = j.id
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE st.id = $1
      ${statusFilter}
      ORDER BY ss.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...queryParams, validLimit, offset]);
    
    const queryEndTime = Date.now();
    console.log(`📊 Main query executed in ${queryEndTime - queryStartTime}ms`);
    console.log('📊 Query result:', {
      rowCount: result.rows.length,
      hasRows: result.rows.length > 0
    });

    if (result.rows.length > 0) {
      const firstRow = result.rows[0];
      console.log('📊 First result sample:', {
        session_id: firstRow.session_id,
        candidate_id: firstRow.candidate_id,
        candidate_email: firstRow.candidate_email,
        session_status: firstRow.session_status,
        evaluation_status: firstRow.evaluation_status,
        evaluation_overall_score: firstRow.evaluation_overall_score
      });
      
      // Log session counts per candidate
      const sessionCounts = new Map();
      for (const row of result.rows) {
        const key = row.candidate_id;
        sessionCounts.set(key, (sessionCounts.get(key) || 0) + 1);
      }
      console.log('📊 Session counts per candidate:', Object.fromEntries(sessionCounts));
    }

    // Get total count of sessions
    console.log('🔍 Executing count query...');
    const countStartTime = Date.now();
    
    const countResult = await DatabaseService.query(`
      SELECT COUNT(*) as total
      FROM simulation_templates st
      INNER JOIN simulations sim ON sim.template_id = st.id
      INNER JOIN simulation_sessions ss ON ss.simulation_id = sim.id
      WHERE st.id = $1
      ${statusFilter}
    `, queryParams);
    
    const countEndTime = Date.now();
    console.log(`📊 Count query executed in ${countEndTime - countStartTime}ms`);

    const total = parseInt(countResult.rows[0]?.total || '0');
    console.log('📊 Total sessions count:', total);

    // ✅ FIXED: Use proper typing with 'as any' to avoid complex type definition
    const formattedResults = result.rows.map((row: any) => {
      // Determine the effective score and status
      const hasEvaluation = row.evaluation_id !== null;
      const effectiveScore = row.evaluation_overall_score || row.session_score || row.simulation_overall_score || 0;
      const effectiveStatus = hasEvaluation ? row.evaluation_status : row.session_status;
      const effectiveCompletedAt = row.evaluation_completed_at || row.session_completed_at || row.simulation_completed_at;
      
      return {
        // Session Info
        session: {
          id: row.session_id,
          candidate_id: row.candidate_id,
          session_type: row.session_type,
          status: row.session_status,
          started_at: row.started_at,
          completed_at: row.session_completed_at,
          time_limit: row.time_limit,
          time_remaining: row.time_remaining,
          time_spent: row.time_spent,
          current_task: row.current_task,
          score: row.session_score,
          github_links: row.github_links,
          created_at: row.session_created_at,
          updated_at: row.session_updated_at
        },
        
        // Candidate Info
        candidate: {
          id: row.candidate_id,
          email: row.candidate_email,
          user_type: row.user_type,
          first_name: row.first_name,
          last_name: row.last_name,
          full_name: row.first_name && row.last_name 
            ? `${row.first_name} ${row.last_name}` 
            : row.candidate_email?.split('@')[0] || 'Anonymous',
          phone: row.phone,
          country: row.country,
          city: row.city,
          profile_photo_url: row.profile_photo_url,
          headline: row.headline,
          summary: row.summary,
          linkedin_url: row.linkedin_url,
          github_url: row.github_url,
          profile_completion: row.profile_completion
        },
        
        // Simulation Record Info
        simulation_record: {
          id: row.simulation_record_id,
          status: row.simulation_status,
          scheduled_at: row.scheduled_at,
          started_at: row.simulation_started_at,
          completed_at: row.simulation_completed_at,
          time_limit: row.simulation_time_limit,
          time_spent: row.simulation_time_spent,
          current_task: row.simulation_current_task,
          overall_score: row.simulation_overall_score,
          punctuality_score: row.punctuality_score,
          communication_score: row.communication_score,
          problem_solving_score: row.problem_solving_score,
          adaptability_score: row.adaptability_score,
          collaboration_score: row.collaboration_score,
          attention_score: row.attention_score,
          initiative_score: row.initiative_score,
          feedback: row.simulation_feedback,
          strengths: row.strengths,
          improvements: row.improvements,
          blockchain_tx_id: row.blockchain_tx_id,
          metadata: row.simulation_metadata
        },
        
        // Evaluation Info
        evaluation: hasEvaluation ? {
          id: row.evaluation_id,
          overall_score: row.evaluation_overall_score,
          punctuality_score: row.evaluation_punctuality_score,
          communication_score: row.evaluation_communication_score,
          problem_solving_score: row.evaluation_problem_solving_score,
          adaptability_score: row.evaluation_adaptability_score,
          collaboration_score: row.evaluation_collaboration_score,
          attention_to_detail_score: row.attention_to_detail_score,
          initiative_score: row.evaluation_initiative_score,
          status: row.evaluation_status,
          completed_at: row.evaluation_completed_at,
          reviewed_at: row.reviewed_at,
          reviewer_id: row.reviewer_id,
          sections: row.evaluation_sections || [],
          behavioral_metrics: row.behavioral_metrics || [],
          skill_assessments: row.skill_assessments || [],
          ai_feedback: row.ai_feedback,
          benchmarks: row.benchmarks,
          qualitative_feedback: row.qualitative_feedback,
          interview_questions: row.interview_questions || []
        } : null,
        
        // Application Info
        application: {
          id: row.application_id,
          number: row.application_number,
          status: row.application_status,
          applied_at: row.applied_at,
          match_score: row.match_score,
          rating: row.rating
        },
        
        // Job Info
        job: {
          id: row.job_id,
          title: row.job_title,
          type: row.job_type,
          work_arrangement: row.work_arrangement,
          locations: row.locations,
          department: row.department,
          salary_min: row.salary_min,
          salary_max: row.salary_max,
          experience_level: row.experience_level
        },
        
        // Company Info
        company: {
          id: row.company_id,
          name: row.company_name,
          logo_url: row.logo_url,
          industry: row.industry
        },
        
        // Simulation Template Info
        simulation_template: {
          id: id,
          name: row.simulation_name,
          description: row.simulation_description,
          type: row.simulation_type,
          difficulty: row.difficulty,
          duration_minutes: row.duration_minutes,
          tasks: row.template_tasks,
          scoring_rubric: row.scoring_rubric,
          pass_fail_criteria: row.pass_fail_criteria
        },
        
        // Summary Fields (for easy access)
        overall_score: effectiveScore,
        has_evaluation: hasEvaluation,
        passed: effectiveScore >= 70,
        status: effectiveStatus,
        completed_at: effectiveCompletedAt
      };
    });

    console.log('📊 Formatted results count:', formattedResults.length);
    
    // Count sessions with and without evaluations
    const withEvaluation = formattedResults.filter((r: any) => r.has_evaluation).length;
    const withoutEvaluation = formattedResults.filter((r: any) => !r.has_evaluation).length;
    console.log('📊 Session breakdown:', { withEvaluation, withoutEvaluation, total: formattedResults.length });

    const responseData = {
      page: validPage,
      limit: validLimit,
      total: total,
      pages: Math.ceil(total / validLimit),
      has_next: validPage * validLimit < total,
      has_prev: validPage > 1,
      stats: {
        total_sessions: total,
        with_evaluation: withEvaluation,
        without_evaluation: withoutEvaluation,
        unique_candidates: new Set(formattedResults.map((r: any) => r.candidate.id)).size
      }
    };
    
    console.log('📄 Pagination response:', responseData);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ [getSimulationCandidates] COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════');

    ResponseService.paginated(res, formattedResults, responseData);

  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [getSimulationCandidates] ERROR');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    console.error('═══════════════════════════════════════════════════════════════');
    ResponseService.error(res, 'Failed to fetch candidates', 500, null, this.formatError(error));
  }
}

async updateTaskScore(req: AuthenticatedRequest, res: Response): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📞 [updateTaskScore] CALLED');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    const { sessionId, taskIndex } = req.params;
    const { score } = req.body;

    console.log('📋 REQUEST PARAMS:', { sessionId, taskIndex, score });

    if (!sessionId || !ValidationService.isValidUUID(sessionId)) {
      ResponseService.error(res, 'Invalid session ID format', 400);  // ✅ Fixed
      return;
    }

    if (!taskIndex) {
      ResponseService.error(res, 'Task index is required', 400);  // ✅ Fixed
      return;
    }
    
    const parsedTaskIndex = parseInt(taskIndex);
    if (isNaN(parsedTaskIndex) || parsedTaskIndex < 0) {
      ResponseService.error(res, 'Invalid task index. Must be 0 or greater', 400);  // ✅ Fixed
      return;
    }

    if (typeof score !== 'number' || score < 0 || score > 100) {
      ResponseService.error(res, 'Score must be a number between 0 and 100', 400);  // ✅ Fixed
      return;
    }

    // Get session and template details
    const sessionDetails = await DatabaseService.execute(`
      SELECT 
        ss.id, 
        ss.user_id as candidate_id, 
        ss.simulation_id,
        st.name as simulation_name,
        st.tasks as template_tasks,
        st.total_tasks
      FROM simulation_sessions ss
      JOIN simulations sim ON ss.simulation_id = sim.id
      JOIN simulation_templates st ON sim.template_id = st.id
      WHERE ss.id = $1
    `, [sessionId]);

    if (sessionDetails.rows.length === 0) {
      this.sendError(res, 'Session not found', 404);
      return;
    }

    const session = sessionDetails.rows[0];
    
    // Parse template tasks
    let templateTasks = [];
    if (session.template_tasks) {
      if (typeof session.template_tasks === 'object') {
        templateTasks = session.template_tasks;
      } else if (typeof session.template_tasks === 'string') {
        try {
          templateTasks = JSON.parse(session.template_tasks);
        } catch (e) {
          templateTasks = [];
        }
      }
    }
    
    // Validate task exists in template
    const maxTaskIndex = templateTasks.length;
    if (parsedTaskIndex >= maxTaskIndex) {
      this.sendError(res, `Task ${parsedTaskIndex} does not exist. Valid task indices: 0-${maxTaskIndex - 1}`, 400);
      return;
    }
    
    const taskName = templateTasks[parsedTaskIndex]?.title || `Task ${parsedTaskIndex + 1}`;

    // Check permission
    const isRecruiter = req.user.user_type === 'recruiter' || 
                        req.user.user_type === 'company_admin' || 
                        req.user.user_type === 'system_admin';

    if (!isRecruiter) {
      this.sendError(res, 'Only recruiters can set scores', 403);
      return;
    }

    // Update or insert task score
    const existing = await DatabaseService.execute(`
      SELECT id, status, score as current_score
      FROM session_task_progress
      WHERE session_id = $1 AND task_index = $2
    `, [sessionId, parsedTaskIndex]);

    let result;
    if (existing.rows.length > 0) {
      result = await DatabaseService.execute(`
        UPDATE session_task_progress
        SET score = $1, updated_at = NOW()
        WHERE session_id = $2 AND task_index = $3
        RETURNING *
      `, [score, sessionId, parsedTaskIndex]);
    } else {
      result = await DatabaseService.execute(`
        INSERT INTO session_task_progress (session_id, task_index, score, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'completed', NOW(), NOW())
        RETURNING *
      `, [sessionId, parsedTaskIndex, score]);
    }

   ResponseService.success(res, {  // ✅ Fixed
      ...result.rows[0],
      task_name: taskName,
      task_index: parsedTaskIndex
    }, `Task ${parsedTaskIndex + 1} (${taskName}) score updated to ${score}`);
    
  } catch (error: any) {
    console.error('Update task score error:', error);
    ResponseService.error(res, 'Failed to update task score', 500, null, this.formatError(error));  // ✅ Fixed
  }
}

async updateTaskFeedback(req: AuthenticatedRequest, res: Response): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📞 [updateTaskFeedback] CALLED');
  console.log('═══════════════════════════════════════════════════════════════');
  
  try {
    const { sessionId, taskIndex } = req.params;
    const { feedback } = req.body;

    console.log('📋 REQUEST PARAMS:', { sessionId, taskIndex, feedbackLength: feedback?.length });

    if (!sessionId || !ValidationService.isValidUUID(sessionId)) {
      ResponseService.error(res, 'Invalid session ID format', 400);  // ✅ Fixed
      return;
    }

    if (!taskIndex) {
      ResponseService.error(res, 'Task index is required', 400);  // ✅ Fixed
      return;
    }
    
    const parsedTaskIndex = parseInt(taskIndex);
    if (isNaN(parsedTaskIndex) || parsedTaskIndex < 0) {
      ResponseService.error(res, 'Invalid task index. Must be 0 or greater', 400);  // ✅ Fixed
      return;
    }

    if (!feedback || typeof feedback !== 'string') {
      ResponseService.error(res, 'Feedback text is required', 400);  // ✅ Fixed
      return;
    }


    // Get session and template details
    const sessionDetails = await DatabaseService.execute(`
      SELECT 
        ss.id, 
        ss.user_id as candidate_id, 
        ss.simulation_id,
        st.name as simulation_name,
        st.tasks as template_tasks,
        st.total_tasks
      FROM simulation_sessions ss
      JOIN simulations sim ON ss.simulation_id = sim.id
      JOIN simulation_templates st ON sim.template_id = st.id
      WHERE ss.id = $1
    `, [sessionId]);

    if (sessionDetails.rows.length === 0) {
      this.sendError(res, 'Session not found', 404);
      return;
    }

    const session = sessionDetails.rows[0];
    
    // Parse template tasks
    let templateTasks = [];
    if (session.template_tasks) {
      if (typeof session.template_tasks === 'object') {
        templateTasks = session.template_tasks;
      } else if (typeof session.template_tasks === 'string') {
        try {
          templateTasks = JSON.parse(session.template_tasks);
        } catch (e) {
          templateTasks = [];
        }
      }
    }
    
    // Validate task exists in template
    const maxTaskIndex = templateTasks.length;
    if (parsedTaskIndex >= maxTaskIndex) {
      this.sendError(res, `Task ${parsedTaskIndex} does not exist. Valid task indices: 0-${maxTaskIndex - 1}`, 400);
      return;
    }
    
    const taskName = templateTasks[parsedTaskIndex]?.title || `Task ${parsedTaskIndex + 1}`;

    // Check permission
    const isRecruiter = req.user.user_type === 'recruiter' || 
                        req.user.user_type === 'company_admin' || 
                        req.user.user_type === 'system_admin';

    if (!isRecruiter) {
      this.sendError(res, 'Only recruiters can set feedback', 403);
      return;
    }

    // Update or insert feedback
    const existing = await DatabaseService.execute(`
      SELECT id, status, score
      FROM session_task_progress
      WHERE session_id = $1 AND task_index = $2
    `, [sessionId, parsedTaskIndex]);

    let result;
    if (existing.rows.length > 0) {
      result = await DatabaseService.execute(`
        UPDATE session_task_progress
        SET feedback = $1, updated_at = NOW()
        WHERE session_id = $2 AND task_index = $3
        RETURNING *
      `, [feedback, sessionId, parsedTaskIndex]);
    } else {
      result = await DatabaseService.execute(`
        INSERT INTO session_task_progress (session_id, task_index, feedback, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'in_progress', NOW(), NOW())
        RETURNING *
      `, [sessionId, parsedTaskIndex, feedback]);
    }

    ResponseService.success(res, {  // ✅ Fixed
      ...result.rows[0],
      task_name: taskName,
      task_index: parsedTaskIndex
    }, `Task ${parsedTaskIndex + 1} (${taskName}) feedback updated`);
    
  } catch (error: any) {
    console.error('Update task feedback error:', error);
    ResponseService.error(res, 'Failed to update task feedback', 500, null, this.formatError(error));  // ✅ Fixed
  }
}

// In SimulationController.ts - Add this endpoint

/**
 * @desc    Start a new simulation session for a candidate
 * @route   POST /api/v1/simulations/start-session
 * @access  Private (Candidate)
 */
async startSimulationSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  const client = await DatabaseService.getClient();
  
  try {
    const { templateId, applicationId, candidateGitHubUsername } = req.body;
    
    if (!templateId || !applicationId) {
      ResponseService.error(res, 'Template ID and Application ID are required', 400);
      return;
    }
    
    // Check if user already has an active session
    const existingSession = await DatabaseService.query(`
      SELECT ss.id, ss.status, s.template_id
      FROM simulation_sessions ss
      JOIN simulations s ON ss.simulation_id = s.id
      WHERE ss.user_id = $1 AND s.template_id = $2 AND ss.status = 'in_progress'
    `, [req.user.id, templateId]);
    
    if (existingSession.rows[0]) {
      ResponseService.success(res, {
        sessionId: existingSession.rows[0].id,
        status: 'in_progress',
        message: 'Existing session found'
      });
      return;
    }
    
    await client.query('BEGIN');
    
    // Get template
    const template = await client.query(`
      SELECT * FROM simulation_templates WHERE id = $1 AND is_active = true
    `, [templateId]);
    
    if (!template.rows[0]) {
      await client.query('ROLLBACK');
      ResponseService.error(res, 'Template not found', 404);
      return;
    }
    
    // Check if template is available (check availability dates)
    const availabilityCheck = await this.isTemplateAvailable(templateId);
    if (!availabilityCheck.available) {
      await client.query('ROLLBACK');
      ResponseService.error(res, availabilityCheck.reason || 'Simulation is not available', 400);
      return;
    }
    
    // Create simulation record
    const simulation = await client.query(`
      INSERT INTO simulations (
        template_id, application_id, job_id, user_id, status,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'in_progress', NOW(), NOW())
      RETURNING id
    `, [templateId, applicationId, template.rows[0].job_id, req.user.id]);
    
    // Create simulation session
    const session = await client.query(`
      INSERT INTO simulation_sessions (
        simulation_id, user_id, application_id, session_type,
        status, started_at, time_limit, created_at, updated_at
      ) VALUES ($1, $2, $3, 'candidate', 'in_progress', NOW(), $4, NOW(), NOW())
      RETURNING id
    `, [
      simulation.rows[0].id,
      req.user.id,
      applicationId,
      template.rows[0].duration_minutes * 60
    ]);
    
    // Create task progress records
    const tasks = template.rows[0].tasks;
    for (let i = 0; i < tasks.length; i++) {
      await client.query(`
        INSERT INTO session_task_progress (
          session_id, task_index, status, created_at, updated_at
        ) VALUES ($1, $2, 'not_started', NOW(), NOW())
      `, [session.rows[0].id, i]);
    }
    
    // Create GitHub repository if username provided
    let githubRepo = null;
    if (candidateGitHubUsername) {
      try {
        const repoResult = await githubController.createSimulationRepo({
          body: {
            candidateId: req.user.id,
            simulationId: simulation.rows[0].id,
            candidateGitHubUsername,
            tasks
          },
          user: req.user
        } as any, {} as Response);
        
        githubRepo = {
          repoName: `sim-${simulation.rows[0].id.substring(0, 8)}`,
          status: 'created'
        };
      } catch (githubError) {
        console.error('GitHub repo creation failed:', githubError);
      }
    }
    
    await client.query('COMMIT');
    
    ResponseService.success(res, {
      sessionId: session.rows[0].id,
      simulationId: simulation.rows[0].id,
      tasks: tasks,
      totalTasks: tasks.length,
      duration: template.rows[0].duration_minutes,
      githubRepo,
      startedAt: new Date().toISOString()
    }, 'Session started successfully');
    
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Start session error:', error);
    ResponseService.error(res, error.message || 'Failed to start session', 500);
  } finally {
    client.release();
  }
}

/**
 * Get blockchain record for a simulation
 * @route GET /api/v1/simulations/sessions/:sessionId/blockchain
 */
public async getBlockchainRecord(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;

    if (!sessionId || !ValidationService.isValidUUID(sessionId)) {
      ResponseService.error(res, 'Invalid session ID format', 400);
      return;
    }

    // Get the simulation session
    const sessionResult = await DatabaseService.query(`
      SELECT ss.id, ss.simulation_id, ss.user_id
      FROM simulation_sessions ss
      WHERE ss.id = $1 AND ss.user_id = $2
    `, [sessionId, req.user.id]);

    if (!sessionResult.rows[0]) {
      ResponseService.notFound(res, 'Session not found');
      return;
    }

    // Get blockchain record
    const blockchainResult = await DatabaseService.query(`
      SELECT 
        br.tx_id,
        br.block_hash,
        br.data_hash,
        br.data,
        br.timestamp as blockchain_timestamp,
        vc.credential_hash,
        vc.credential_data,
        vc.issued_at,
        vc.revoked_at,
        s.blockchain_tx_id as simulation_tx_id,
        s.blockchain_hash as simulation_hash
      FROM blockchain_records br
      JOIN simulations s ON br.simulation_id = s.id
      LEFT JOIN verifiable_credentials vc ON vc.simulation_id = s.id
      WHERE s.id = (
        SELECT simulation_id FROM simulation_sessions WHERE id = $1
      )
    `, [sessionId]);

    if (!blockchainResult.rows[0]) {
      ResponseService.success(res, {
        hasBlockchainRecord: false,
        message: 'No blockchain record found for this simulation'
      });
      return;
    }

    ResponseService.success(res, {
      hasBlockchainRecord: true,
      transaction: {
        txId: blockchainResult.rows[0].tx_id,
        blockHash: blockchainResult.rows[0].block_hash,
        dataHash: blockchainResult.rows[0].data_hash,
        timestamp: blockchainResult.rows[0].blockchain_timestamp,
        simulationTxId: blockchainResult.rows[0].simulation_tx_id,
        simulationHash: blockchainResult.rows[0].simulation_hash
      },
      credential: {
        hash: blockchainResult.rows[0].credential_hash,
        data: blockchainResult.rows[0].credential_data,
        issuedAt: blockchainResult.rows[0].issued_at,
        revokedAt: blockchainResult.rows[0].revoked_at,
        isRevoked: blockchainResult.rows[0].revoked_at !== null
      },
      verificationUrl: `/api/v1/simulations/verify/${blockchainResult.rows[0].credential_hash}`
    });
  } catch (error: any) {
    console.error('Error getting blockchain record:', error);
    ResponseService.error(res, 'Failed to get blockchain record', 500);
  }
}

/**
 * Verify a simulation credential by hash
 * @route GET /api/v1/simulations/verify/:credentialHash
 */
public async verifyCredential(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { credentialHash } = req.params;

    if (!credentialHash) {
      ResponseService.error(res, 'Credential hash is required', 400);
      return;
    }

    // Find the credential
    const credentialResult = await DatabaseService.query(`
      SELECT 
        vc.*,
        s.overall_score,
        s.punctuality_score,
        s.communication_score,
        s.problem_solving_score,
        s.adaptability_score,
        s.collaboration_score,
        s.github_score,
        u.email as candidate_email,
        cp.first_name,
        cp.last_name,
        br.tx_id,
        br.block_hash,
        br.timestamp as blockchain_timestamp
      FROM verifiable_credentials vc
      JOIN simulations s ON vc.simulation_id = s.id
      JOIN users u ON vc.candidate_id = u.id
      LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
      LEFT JOIN blockchain_records br ON br.simulation_id = s.id
      WHERE vc.credential_hash = $1
    `, [credentialHash]);

    if (!credentialResult.rows[0]) {
      ResponseService.notFound(res, 'Credential not found or invalid');
      return;
    }

    const credential = credentialResult.rows[0];
    const isRevoked = credential.revoked_at !== null;

    ResponseService.success(res, {
      verified: !isRevoked,
      credential: {
        hash: credential.credential_hash,
        issuedAt: credential.issued_at,
        revokedAt: credential.revoked_at,
        isRevoked: isRevoked,
        revokedReason: credential.revoked_reason
      },
      simulation: {
        id: credential.simulation_id,
        overallScore: credential.overall_score,
        punctualityScore: credential.punctuality_score,
        communicationScore: credential.communication_score,
        problemSolvingScore: credential.problem_solving_score,
        adaptabilityScore: credential.adaptability_score,
        collaborationScore: credential.collaboration_score,
        githubScore: credential.github_score
      },
      candidate: {
        email: credential.candidate_email,
        name: `${credential.first_name || ''} ${credential.last_name || ''}`.trim() || credential.candidate_email,
        firstName: credential.first_name,
        lastName: credential.last_name
      },
      blockchain: {
        txId: credential.tx_id,
        blockHash: credential.block_hash,
        timestamp: credential.blockchain_timestamp
      },
      verificationTimestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error verifying credential:', error);
    ResponseService.error(res, 'Failed to verify credential', 500);
  }
}


}



export default new SimulationController();
