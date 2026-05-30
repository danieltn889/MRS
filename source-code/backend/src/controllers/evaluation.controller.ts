import { Request, Response } from 'express';
import { pool } from '../config/database';
import { logger } from '../config/logger';

export class EvaluationController {
  // Get evaluation for a specific candidate and simulation
  async getEvaluation(req: Request, res: Response): Promise<void> {
    try {
      const { candidateId, simulationId } = req.params;

      // Get basic evaluation data
      const evaluationQuery = `
        SELECT
          e.*,
          c.first_name,
          c.last_name,
          c.email,
          s.title as simulation_title,
          s.description as simulation_description
        FROM evaluations e
        JOIN candidates c ON e.candidate_id = c.id
        JOIN simulations s ON e.simulation_id = s.id
        WHERE e.candidate_id = $1 AND e.simulation_id = $2
      `;

      const evaluationResult = await pool.query(evaluationQuery, [candidateId, simulationId]);

      if (evaluationResult.rows.length === 0) {
        res.status(404).json({ error: 'Evaluation not found' });
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
          c.first_name,
          c.last_name,
          c.current_role,
          c.years_experience
        FROM evaluation_similar_candidates sc
        JOIN candidates c ON sc.similar_candidate_id = c.id
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
            role: candidate.current_role,
            experience: `${candidate.years_experience} years`
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
      res.status(500).json({ error: 'Internal server error' });
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
        res.status(404).json({ error: 'Evaluation not found' });
        return;
      }

      res.json({ evaluation: result.rows[0] });

    } catch (error) {
      logger.error('Error updating evaluation status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get all evaluations for a recruiter/company
  async getEvaluations(req: Request, res: Response): Promise<void> {
    try {
      const { companyId, status, page = 1, limit = 20 } = req.query;

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (companyId) {
        whereClause += ` AND s.company_id = $${paramIndex}`;
        params.push(companyId);
        paramIndex++;
      }

      if (status) {
        whereClause += ` AND e.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      const offset = (Number(page) - 1) * Number(limit);

      const evaluationsQuery = `
        SELECT
          e.*,
          c.first_name,
          c.last_name,
          c.email,
          c.current_role,
          s.title as simulation_title,
          s.company_id,
          comp.name as company_name
        FROM evaluations e
        JOIN candidates c ON e.candidate_id = c.id
        JOIN simulations s ON e.simulation_id = s.id
        JOIN companies comp ON s.company_id = comp.id
        ${whereClause}
        ORDER BY e.completed_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const evaluations = await pool.query(evaluationsQuery, params);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM evaluations e
        JOIN simulations s ON e.simulation_id = s.id
        ${whereClause.replace('s.company_id', 's.company_id').replace('e.status', 'e.status')}
      `;

      const countParams = params.slice(0, -2); // Remove limit and offset
      const countResult = await pool.query(countQuery, countParams);

      res.json({
        evaluations: evaluations.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: Number(countResult.rows[0].total),
          totalPages: Math.ceil(Number(countResult.rows[0].total) / Number(limit))
        }
      });

    } catch (error) {
      logger.error('Error fetching evaluations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Generate AI feedback for evaluation
  async generateAIFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { evaluationId } = req.params;

      if (!evaluationId) {
        res.status(400).json({ error: 'Evaluation ID is required' });
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
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Calculate benchmarks for evaluation
  async calculateBenchmarks(req: Request, res: Response): Promise<void> {
    try {
      const { evaluationId } = req.params;

      // Get evaluation data
      const evaluationQuery = `
        SELECT e.*, s.company_id, c.industry, c.current_role
        FROM evaluations e
        JOIN simulations s ON e.simulation_id = s.id
        JOIN candidates c ON e.candidate_id = c.id
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
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Update AI scoring weights (admin only)
  async updateAIScoringWeights(req: Request, res: Response): Promise<void> {
    try {
      const { weights } = req.body;

      // Validate weights sum to 100
      const totalWeight = Object.values(weights).reduce((sum: number, weight: any) => sum + weight, 0);
      if (totalWeight !== 100) {
        res.status(400).json({ error: 'Weights must sum to 100' });
        return;
      }

      // Save weights to database
      const insertQuery = `
        INSERT INTO ai_scoring_weights (weights, updated_at)
        VALUES ($1, NOW())
      `;

      await pool.query(insertQuery, [JSON.stringify(weights)]);

      res.json({ message: 'AI scoring weights updated successfully' });

    } catch (error) {
      logger.error('Error updating AI scoring weights:', error);
      res.status(500).json({ error: 'Internal server error' });
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

      res.json({ message: 'Communication standards updated successfully' });

    } catch (error) {
      logger.error('Error updating communication standards:', error);
      res.status(500).json({ error: 'Internal server error' });
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

      res.json({ message: 'Minimum score thresholds updated successfully' });

    } catch (error) {
      logger.error('Error updating minimum scores:', error);
      res.status(500).json({ error: 'Internal server error' });
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
      role: 75, // Mock values
      industry: 80,
      company: 70
    };
  }

  private async findSimilarCandidates(evalData: any) {
    // Find candidates with similar profiles
    const query = `
      SELECT
        c.id,
        e.overall_score,
        (1 - ABS(e.overall_score - $1) / 100.0) * 100 as similarity
      FROM candidates c
      JOIN evaluations e ON c.id = e.candidate_id
      WHERE c.industry = $2 AND c.current_role = $3
      AND c.id != $4
      ORDER BY similarity DESC
      LIMIT 5
    `;

    const result = await pool.query(query, [
      evalData.overall_score,
      evalData.industry,
      evalData.current_role,
      evalData.candidate_id
    ]);

    return result.rows.map(row => ({
      id: row.id,
      score: row.overall_score,
      similarity: Math.round(row.similarity)
    }));
  }
}

export const evaluationController = new EvaluationController();