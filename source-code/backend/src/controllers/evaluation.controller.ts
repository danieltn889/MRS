import { Request, Response } from 'express';
import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import DatabaseService from '../services/database.service.js';
import ResponseService from '../services/response.service.js';
import { AuthenticatedRequest } from '../types/auth.types.js';

export class EvaluationController {
  // Get evaluation for a specific candidate and simulation
  async getEvaluation(req: Request, res: Response): Promise<void> {
    try {
      const { candidateId, simulationId } = req.params;

      // Get basic evaluation data
      const evaluationQuery = `
        SELECT
          e.*,
          u.email,
          cp.first_name,
          cp.last_name,
          s.title as simulation_title,
          s.description as simulation_description
        FROM evaluations e
        LEFT JOIN users u ON e.candidate_id = u.id
        LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
        JOIN simulations s ON e.simulation_id = s.id
        WHERE e.candidate_id = $1 AND e.simulation_id = $2
      `;

      const evaluationResult = await pool.query(evaluationQuery, [candidateId, simulationId]);

      if (evaluationResult.rows.length === 0) {
        res.status(404).json({ error: 'Evaluation not found'});
        return;
      }

      const evaluation = evaluationResult.rows[0];

      // Get section breakdown
      const sectionBreakdownQuery = `
        SELECT
          es.*,
          s.name as section_name
        FROM evaluation_sections es
        JOIN simulation_sections s ON es.section_id = s.id
        WHERE es.evaluation_id = $1
        ORDER BY s.order_index
      `;

      const sectionBreakdown = await pool.query(sectionBreakdownQuery, [evaluation.id]);

      // Get behavioral metrics
      const behavioralMetricsQuery = `
        SELECT * FROM evaluation_behavioral_metrics
        WHERE evaluation_id = $1
        ORDER BY metric
      `;

      const behavioralMetrics = await pool.query(behavioralMetricsQuery, [evaluation.id]);

      // Get skill assessments
      const skillAssessmentsQuery = `
        SELECT * FROM evaluation_skill_assessments
        WHERE evaluation_id = $1
        ORDER BY skill
      `;

      const skillAssessments = await pool.query(skillAssessmentsQuery, [evaluation.id]);

      // Get AI feedback
      const aiFeedbackQuery = `
        SELECT * FROM evaluation_ai_feedback
        WHERE evaluation_id = $1
      `;

      const aiFeedback = await pool.query(aiFeedbackQuery, [evaluation.id]);

      // Get benchmark comparison
      const benchmarkComparisonQuery = `
        SELECT * FROM evaluation_benchmarks
        WHERE evaluation_id = $1
      `;

      const benchmarkComparison = await pool.query(benchmarkComparisonQuery, [evaluation.id]);

      // Get similar candidates
      const similarCandidatesQuery = `
        SELECT
          sc.*,
          u.email,
          cp.first_name,
          cp.last_name,
          cp.headline as current_role
        FROM evaluation_similar_candidates sc
        JOIN users u ON sc.similar_candidate_id = u.id
        LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
        WHERE sc.evaluation_id = $1
        ORDER BY sc.similarity DESC
        LIMIT 5
      `;

      const similarCandidates = await pool.query(similarCandidatesQuery, [evaluation.id]);

      // Get qualitative feedback
      const qualitativeFeedbackQuery = `
        SELECT * FROM evaluation_qualitative_feedback
        WHERE evaluation_id = $1
      `;

      const qualitativeFeedback = await pool.query(qualitativeFeedbackQuery, [evaluation.id]);

      // Get interview questions
      const interviewQuestionsQuery = `
        SELECT * FROM evaluation_interview_questions
        WHERE evaluation_id = $1
        ORDER BY priority DESC
      `;

      const interviewQuestions = await pool.query(interviewQuestionsQuery, [evaluation.id]);

      // Compile the complete evaluation response
      const completeEvaluation = {
        id: evaluation.id,
        candidateId: evaluation.candidate_id,
        simulationId: evaluation.simulation_id,
        overallScore: evaluation.overall_score,
        status: evaluation.status,
        completedAt: evaluation.completed_at,
        reviewedAt: evaluation.reviewed_at,
        reviewerId: evaluation.reviewer_id,

        // Core scores
        punctualityScore: evaluation.punctuality_score,
        communicationScore: evaluation.communication_score,
        problemSolvingScore: evaluation.problem_solving_score,
        adaptabilityScore: evaluation.adaptability_score,
        collaborationScore: evaluation.collaboration_score,
        attentionToDetailScore: evaluation.attention_to_detail_score,
        initiativeScore: evaluation.initiative_score,

        // Candidate info
        candidate: {
          email: evaluation.email,
          firstName: evaluation.first_name,
          lastName: evaluation.last_name,
          fullName: `${evaluation.first_name || ''} ${evaluation.last_name || ''}`.trim() || evaluation.email?.split('@')[0]
        },

        // Detailed breakdowns
        sectionBreakdown: sectionBreakdown.rows.map(section => ({
          sectionId: section.section_id,
          sectionName: section.section_name,
          score: section.score,
          maxScore: section.max_score,
          percentage: section.percentage,
          timeSpent: section.time_spent_seconds,
          tasksCompleted: section.tasks_completed,
          totalTasks: section.total_tasks
        })),

        behavioralMetrics: behavioralMetrics.rows.map(metric => ({
          metric: metric.metric,
          score: metric.score,
          description: metric.description,
          examples: metric.examples || [],
          improvement: metric.improvement_suggestion
        })),

        skillAssessments: skillAssessments.rows.map(skill => ({
          skill: skill.skill,
          level: skill.level,
          score: skill.score,
          evidence: skill.evidence || []
        })),

        // AI analysis
        aiFeedback: aiFeedback.rows[0] ? {
          summary: aiFeedback.rows[0].summary,
          detailedAnalysis: aiFeedback.rows[0].detailed_analysis,
          strengths: aiFeedback.rows[0].strengths || [],
          areasForImprovement: aiFeedback.rows[0].areas_for_improvement || [],
          recommendations: aiFeedback.rows[0].recommendations || [],
          confidence: aiFeedback.rows[0].confidence
        } : null,

        // Benchmark comparisons
        benchmarkComparison: benchmarkComparison.rows[0] ? {
          overallPercentile: benchmarkComparison.rows[0].overall_percentile,
          rolePercentile: benchmarkComparison.rows[0].role_percentile,
          industryPercentile: benchmarkComparison.rows[0].industry_percentile,
          companyPercentile: benchmarkComparison.rows[0].company_percentile,
          similarCandidates: similarCandidates.rows.map(candidate => ({
            id: candidate.similar_candidate_id,
            score: candidate.score,
            similarity: candidate.similarity,
            role: candidate.current_role
          }))
        } : null,

        // Qualitative feedback
        strengths: qualitativeFeedback.rows[0]?.strengths || [],
        weaknesses: qualitativeFeedback.rows[0]?.weaknesses || [],
        recommendations: qualitativeFeedback.rows[0]?.recommendations || [],
        interviewQuestions: interviewQuestions.rows.map(q => q.question)
      };

      res.json({ evaluation: completeEvaluation });

    } catch (error) {
      logger.error('Error fetching evaluation:', error);
      res.status(500).json({ error: 'Internal server error'});
    }
  }

  // Update evaluation status
  async updateEvaluationStatus(req: Request, res: Response): Promise<void> {
    try {
      const { candidateId, simulationId } = req.params;
      const { status, reviewerId } = req.body;

      const updateQuery = `
        UPDATE evaluations
        SET status = $1, reviewed_at = NOW(), reviewer_id = $2
        WHERE candidate_id = $3 AND simulation_id = $4
        RETURNING *
      `;

      const result = await pool.query(updateQuery, [status, reviewerId, candidateId, simulationId]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Evaluation not found'});
        return;
      }

      res.json({ evaluation: result.rows[0] });

    } catch (error) {
      logger.error('Error updating evaluation status:', error);
      res.status(500).json({ error: 'Internal server error'});
    }
  }

  /**
   * Get evaluations for the current user (recruiter/admin)
   * @route GET /api/v1/evaluations
   */
  async getEvaluations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20', status, candidate_id, simulation_id } = req.query;
      
      console.log('📊 [getEvaluations] Called by user:', {
        userId: req.user.id,
        userType: req.user.user_type,
        timestamp: new Date().toISOString()
      });
      
      // Get user's company ID for permission checks
      let companyId: string | null = null;
      
      if (req.user.user_type === 'company_admin'|| req.user.user_type === 'recruiter') {
        const teamResult = await DatabaseService.query(
          'SELECT company_id FROM company_team WHERE user_id = $1 LIMIT 1',
          [req.user.id]
        );
        companyId = teamResult.rows[0]?.company_id || null;
      }
      
      const validPage = Math.max(1, Number(page));
      const validLimit = Math.min(100, Number(limit));
      const offset = (validPage - 1) * validLimit;
      
      let whereConditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;
      
      // Build WHERE clause based on user role
      if (req.user.user_type === 'system_admin') {
        // System admin sees all evaluations
        console.log('🔐 System admin: showing all evaluations');
      } else if (companyId) {
        // Recruiter/Company admin: only see evaluations for their company's simulations
        whereConditions.push(`
          EXISTS (
            SELECT 1 FROM simulations s
            JOIN simulation_templates st ON s.template_id = st.id
            WHERE s.id = e.simulation_id AND st.company_id = $${paramIndex++}
          )
        `);
        params.push(companyId);
        console.log('🔐 Company user: showing evaluations for company:', companyId);
      } else {
        // Fallback: only evaluations the user is directly involved with
        whereConditions.push(`e.reviewer_id = $${paramIndex++} OR e.candidate_id = $${paramIndex++}`);
        params.push(req.user.id, req.user.id);
        console.log('🔐 Limited access: showing only user\'s evaluations');
      }
      
      // Apply filters
      if (status && status !== 'all') {
        whereConditions.push(`e.status = $${paramIndex++}`);
        params.push(status);
      }
      
      if (candidate_id) {
        whereConditions.push(`e.candidate_id = $${paramIndex++}`);
        params.push(candidate_id);
      }
      
      if (simulation_id) {
        whereConditions.push(`e.simulation_id = $${paramIndex++}`);
        params.push(simulation_id);
      }
      
      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join('AND ')}`
        : '';
      
      // Main query - Use users and candidate_profiles instead of candidates
      const result = await DatabaseService.query(`
        SELECT 
          e.id,
          e.candidate_id,
          e.simulation_id,
          e.overall_score,
          e.punctuality_score,
          e.communication_score,
          e.problem_solving_score,
          e.adaptability_score,
          e.collaboration_score,
          e.attention_to_detail_score,
          e.initiative_score,
          e.status,
          e.completed_at,
          e.reviewed_at,
          e.reviewer_id,
          e.created_at,
          e.updated_at,
          
          -- Get candidate info from users + candidate_profiles
          u.email as candidate_email,
          u.user_type as candidate_user_type,
          cp.first_name as candidate_first_name,
          cp.last_name as candidate_last_name,
          cp.profile_photo_url as candidate_photo_url,
          cp.headline as candidate_headline,
          cp.github_url as candidate_github_url,
          cp.linkedin_url as candidate_linkedin_url,
          
          -- Simulation info
          sim.template_id,
          sim.status as simulation_status,
          sim.created_at as simulation_created_at,
          sim.completed_at as simulation_completed_at,
          
          -- Template info
          st.name as simulation_name,
          st.type as simulation_type,
          st.difficulty,
          st.duration_minutes,
          st.scoring_rubric,
          st.pass_fail_criteria,
          
          -- Job info
          j.id as job_id,
          j.title as job_title,
          
          -- Company info
          c.id as company_id,
          c.name as company_name,
          c.logo_url as company_logo,
          
          -- Reviewer info (if exists)
          reviewer.email as reviewer_email,
          reviewer.user_type as reviewer_type,
          reviewer_cp.first_name as reviewer_first_name,
          reviewer_cp.last_name as reviewer_last_name,
          
          -- Get AI feedback summary (aggregated)
          (
            SELECT jsonb_build_object(
              'summary', eaf.summary,
              'strengths', eaf.strengths,
              'areas_for_improvement', eaf.areas_for_improvement,
              'recommendations', eaf.recommendations,
              'confidence', eaf.confidence
            )
            FROM evaluation_ai_feedback eaf
            WHERE eaf.evaluation_id = e.id
            LIMIT 1
          ) as ai_feedback,
          
          -- Get behavioral metrics (aggregated)
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'metric', ebm.metric,
                'score', ebm.score,
                'description', ebm.description
              )
            )
            FROM evaluation_behavioral_metrics ebm
            WHERE ebm.evaluation_id = e.id
          ) as behavioral_metrics,
          
          -- Get section scores (aggregated)
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'section_name', es.section_name,
                'score', es.score,
                'max_score', es.max_score,
                'percentage', es.percentage,
                'tasks_completed', es.tasks_completed,
                'total_tasks', es.total_tasks
              ) ORDER BY es.section_name
            )
            FROM evaluation_sections es
            WHERE es.evaluation_id = e.id
          ) as section_scores
          
        FROM evaluations e
        
        -- Join with users and candidate_profiles instead of candidates
        LEFT JOIN users u ON e.candidate_id = u.id
        LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
        
        LEFT JOIN simulations sim ON e.simulation_id = sim.id
        LEFT JOIN simulation_templates st ON sim.template_id = st.id
        LEFT JOIN jobs j ON sim.job_id = j.id
        LEFT JOIN companies c ON j.company_id = c.id
        
        -- Reviewer info
        LEFT JOIN users reviewer ON e.reviewer_id = reviewer.id
        LEFT JOIN candidate_profiles reviewer_cp ON reviewer.id = reviewer_cp.user_id
        
        ${whereClause}
        
        ORDER BY e.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `, [...params, validLimit, offset]);
      
      // Get total count for pagination
      const countParams = params.slice(0, paramIndex - 3);
      const countResult = await DatabaseService.query(`
        SELECT COUNT(*) as total
        FROM evaluations e
        ${whereClause}
      `, countParams);
      
      const total = parseInt(countResult.rows[0]?.total || '0');
      
      // Format the results
      const formattedResults = result.rows.map((row: any) => ({
        id: row.id,
        candidate: {
          id: row.candidate_id,
          email: row.candidate_email,
          name: `${row.candidate_first_name || ''} ${row.candidate_last_name || ''}`.trim() || row.candidate_email?.split('@')[0],
          first_name: row.candidate_first_name,
          last_name: row.candidate_last_name,
          photo_url: row.candidate_photo_url,
          headline: row.candidate_headline,
          github_url: row.candidate_github_url,
          linkedin_url: row.candidate_linkedin_url
        },
        simulation: {
          id: row.simulation_id,
          name: row.simulation_name,
          type: row.simulation_type,
          difficulty: row.difficulty,
          duration_minutes: row.duration_minutes,
          status: row.simulation_status,
          created_at: row.simulation_created_at,
          completed_at: row.simulation_completed_at
        },
        job: row.job_id ? {
          id: row.job_id,
          title: row.job_title,
          company: {
            id: row.company_id,
            name: row.company_name,
            logo: row.company_logo
          }
        } : null,
        scores: {
          overall: row.overall_score,
          punctuality: row.punctuality_score,
          communication: row.communication_score,
          problem_solving: row.problem_solving_score,
          adaptability: row.adaptability_score,
          collaboration: row.collaboration_score,
          attention_to_detail: row.attention_to_detail_score,
          initiative: row.initiative_score
        },
        status: row.status,
        completed_at: row.completed_at,
        reviewed_at: row.reviewed_at,
        reviewer: row.reviewer_id ? {
          id: row.reviewer_id,
          email: row.reviewer_email,
          name: `${row.reviewer_first_name || ''} ${row.reviewer_last_name || ''}`.trim() || row.reviewer_email?.split('@')[0]
        } : null,
        ai_feedback: row.ai_feedback,
        behavioral_metrics: row.behavioral_metrics || [],
        section_scores: row.section_scores || [],
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
      
      const paginationResponse = {
        page: validPage,
        limit: validLimit,
        total: total,
        pages: Math.ceil(total / validLimit),
        has_next: validPage * validLimit < total,
        has_prev: validPage > 1
      };
      
      console.log(`📊 [getEvaluations] Returning ${formattedResults.length} evaluations (total: ${total})`);
      
      ResponseService.paginated(res, formattedResults, paginationResponse);
      
    } catch (error: any) {
      console.error(' [getEvaluations] Error:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
        detail: error.detail
      });
      ResponseService.error(res, 'Failed to fetch evaluations', 500);
    }
  }

  // Generate AI feedback for evaluation
  async generateAIFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { evaluationId } = req.params;

      if (!evaluationId) {
        res.status(400).json({ error: 'Evaluation ID is required'});
        return;
      }

      // Get evaluation data for AI analysis
      const evaluationData = await this.getEvaluationDataForAI(evaluationId);

      // Call AI service to generate feedback
      const aiFeedback = await this.callAIService(evaluationData);

      // Save AI feedback to database
      const insertQuery = `
        INSERT INTO evaluation_ai_feedback (
          evaluation_id, summary, detailed_analysis, strengths,
          areas_for_improvement, recommendations, confidence, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (evaluation_id)
        DO UPDATE SET
          summary = EXCLUDED.summary,
          detailed_analysis = EXCLUDED.detailed_analysis,
          strengths = EXCLUDED.strengths,
          areas_for_improvement = EXCLUDED.areas_for_improvement,
          recommendations = EXCLUDED.recommendations,
          confidence = EXCLUDED.confidence,
          updated_at = NOW()
      `;

      await pool.query(insertQuery, [
        evaluationId,
        aiFeedback.summary,
        aiFeedback.detailedAnalysis,
        JSON.stringify(aiFeedback.strengths),
        JSON.stringify(aiFeedback.areasForImprovement),
        JSON.stringify(aiFeedback.recommendations),
        aiFeedback.confidence
      ]);

      res.json({ aiFeedback });

    } catch (error) {
      logger.error('Error generating AI feedback:', error);
      res.status(500).json({ error: 'Internal server error'});
    }
  }

  // Calculate benchmarks for evaluation
  async calculateBenchmarks(req: Request, res: Response): Promise<void> {
    try {
      const { evaluationId } = req.params;

      // Get evaluation data
      const evaluationQuery = `
        SELECT e.*, s.company_id
        FROM evaluations e
        JOIN simulations s ON e.simulation_id = s.id
        WHERE e.id = $1
      `;

      const evaluation = await pool.query(evaluationQuery, [evaluationId]);
      const evalData = evaluation.rows[0];

      // Calculate percentiles
      const benchmarks = await this.calculatePercentiles(evalData);

      // Find similar candidates
      const similarCandidates = await this.findSimilarCandidates(evalData);

      // Save benchmark data
      const insertBenchmarkQuery = `
        INSERT INTO evaluation_benchmarks (
          evaluation_id, overall_percentile, role_percentile,
          industry_percentile, company_percentile, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (evaluation_id)
        DO UPDATE SET
          overall_percentile = EXCLUDED.overall_percentile,
          role_percentile = EXCLUDED.role_percentile,
          industry_percentile = EXCLUDED.industry_percentile,
          company_percentile = EXCLUDED.company_percentile,
          updated_at = NOW()
      `;

      await pool.query(insertBenchmarkQuery, [
        evaluationId,
        benchmarks.overall,
        benchmarks.role,
        benchmarks.industry,
        benchmarks.company
      ]);

      // Save similar candidates
      const insertSimilarQuery = `
        DELETE FROM evaluation_similar_candidates WHERE evaluation_id = $1
      `;
      await pool.query(insertSimilarQuery, [evaluationId]);

      for (const candidate of similarCandidates) {
        await pool.query(`
          INSERT INTO evaluation_similar_candidates (
            evaluation_id, similar_candidate_id, similarity, score
          ) VALUES ($1, $2, $3, $4)
        `, [evaluationId, candidate.id, candidate.similarity, candidate.score]);
      }

      res.json({ benchmarks, similarCandidates });

    } catch (error) {
      logger.error('Error calculating benchmarks:', error);
      res.status(500).json({ error: 'Internal server error'});
    }
  }

  // Update AI scoring weights (admin only)
  async updateAIScoringWeights(req: Request, res: Response): Promise<void> {
    try {
      const { weights } = req.body;

      // Validate weights sum to 100
      const totalWeight = Object.values(weights).reduce((sum: number, weight: any) => sum + weight, 0);
      if (totalWeight !== 100) {
        res.status(400).json({ error: 'Weights must sum to 100'});
        return;
      }

      // Save weights to database
      const insertQuery = `
        INSERT INTO ai_scoring_weights (weights, updated_at)
        VALUES ($1, NOW())
      `;

      await pool.query(insertQuery, [JSON.stringify(weights)]);

      res.json({ message: 'AI scoring weights updated successfully'});

    } catch (error) {
      logger.error('Error updating AI scoring weights:', error);
      res.status(500).json({ error: 'Internal server error'});
    }
  }

  // Update communication standards (admin only)
  async updateCommunicationStandards(req: Request, res: Response): Promise<void> {
    try {
      const { standards, companyId } = req.body;

      const insertQuery = `
        INSERT INTO communication_standards (company_id, standards, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (company_id)
        DO UPDATE SET standards = EXCLUDED.standards, updated_at = NOW()
      `;

      await pool.query(insertQuery, [companyId, standards]);

      res.json({ message: 'Communication standards updated successfully'});

    } catch (error) {
      logger.error('Error updating communication standards:', error);
      res.status(500).json({ error: 'Internal server error'});
    }
  }

  // Update minimum score thresholds (admin only)
  async updateMinimumScores(req: Request, res: Response): Promise<void> {
    try {
      const { thresholds, companyId } = req.body;

      const insertQuery = `
        INSERT INTO minimum_score_thresholds (company_id, thresholds, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (company_id)
        DO UPDATE SET thresholds = EXCLUDED.thresholds, updated_at = NOW()
      `;

      await pool.query(insertQuery, [companyId, JSON.stringify(thresholds)]);

      res.json({ message: 'Minimum score thresholds updated successfully'});

    } catch (error) {
      logger.error('Error updating minimum scores:', error);
      res.status(500).json({ error: 'Internal server error'});
    }
  }

  // Helper methods
  private async getEvaluationDataForAI(evaluationId: string) {
    // Implementation for gathering evaluation data for AI analysis
    const query = `
      SELECT
        e.*,
        json_agg(es.*) as sections,
        json_agg(ebm.*) as behavioral_metrics,
        json_agg(esa.*) as skill_assessments
      FROM evaluations e
      LEFT JOIN evaluation_sections es ON e.id = es.evaluation_id
      LEFT JOIN evaluation_behavioral_metrics ebm ON e.id = ebm.evaluation_id
      LEFT JOIN evaluation_skill_assessments esa ON e.id = esa.evaluation_id
      WHERE e.id = $1
      GROUP BY e.id
    `;

    const result = await pool.query(query, [evaluationId]);
    return result.rows[0];
  }

  private async callAIService(evaluationData: any) {
    // Mock AI service call - in real implementation, this would call an actual AI service
    return {
      summary: "This candidate demonstrates strong technical skills and good problem-solving abilities...",
      detailedAnalysis: "Detailed analysis of the candidate's performance...",
      strengths: ["Strong technical foundation", "Good communication skills"],
      areasForImprovement: ["Could improve time management", "More attention to detail needed"],
      recommendations: ["Consider for technical roles", "Provide training in project management"],
      confidence: 85
    };
  }

  private async calculatePercentiles(evalData: any) {
    // Calculate percentile rankings
    const overallQuery = `
      SELECT PERCENT_RANK() OVER (ORDER BY overall_score) as percentile
      FROM evaluations
      WHERE overall_score <= $1
      ORDER BY percentile DESC
      LIMIT 1
    `;

    const overallPercentile = await pool.query(overallQuery, [evalData.overall_score]);

    // Similar calculations for role, industry, and company percentiles
    return {
      overall: Math.round((overallPercentile.rows[0]?.percentile || 0) * 100),
      role: 75,
      industry: 80,
      company: 70
    };
  }

  private async findSimilarCandidates(evalData: any) {
    // Find candidates with similar profiles
    const query = `
      SELECT
        e.candidate_id as id,
        e.overall_score,
        (1 - ABS(e.overall_score - $1) / 100.0) * 100 as similarity
      FROM evaluations e
      WHERE e.id != $2
      ORDER BY similarity DESC
      LIMIT 5
    `;

    const result = await pool.query(query, [evalData.overall_score, evalData.id]);

    return result.rows.map(row => ({
      id: row.id,
      score: row.overall_score,
      similarity: Math.round(row.similarity)
    }));
  }
}

export const evaluationController = new EvaluationController();