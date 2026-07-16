import { Response } from 'express';
import BaseController from './base.controller.js';
import DatabaseService from '../services/database.service.js';
import ResponseService from '../services/response.service.js';
import RecommendationSyncService from '../services/recommendation-sync.service.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import axios from 'axios';

const ML_GATEWAY = process.env.ML_GATEWAY_URL || 'http://localhost:8080';

class FeedController extends BaseController {
  constructor() {
    super('feed');
  }

  // GET /api/v1/feed    returns personalized ranked jobs for the logged-in candidate
  async getPersonalizedFeed(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const topN   = Math.min(parseInt(req.query.top_n as string || '20'), 50);
      const page   = Math.max(1, parseInt(req.query.page as string || '1'));

      // ── 1. Candidate profile ──────────────────────────────
      // candidate_profiles has no skills/years_of_experience/education_level/
      // preferred_job_titles/preferred_locations columns   skills live in the
      // user_skills/skills join table, experience is derived from
      // work_experience date ranges, education level from the education
      // table, and job-title/location preferences inside job_preferences
      // jsonb (see hybrid_job_recommender.py's equivalent queries).
      const profileResult = await DatabaseService.query(`
        SELECT
          cp.job_preferences,
          cp.is_rwandan, cp.province, cp.district, cp.sector, cp.cell, cp.village,
          cp.country, cp.city,
          COALESCE(
            (SELECT array_agg(s.name) FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = cp.user_id),
            ARRAY[]::text[]
          ) AS skills,
          COALESCE(
            (SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(we.end_date, NOW()) - we.start_date)) / (365.25 * 86400))
             FROM work_experience we WHERE we.user_id = cp.user_id),
            0
          ) AS years_of_experience,
          (SELECT edu.degree FROM education edu WHERE edu.user_id = cp.user_id ORDER BY edu.end_date DESC NULLS FIRST LIMIT 1) AS education_level
        FROM candidate_profiles cp
        WHERE cp.user_id = $1
        LIMIT 1
      `, [userId]);

      const profile = profileResult.rows[0] || {};
      const jobPrefs = profile.job_preferences || {};

      // Actual residence   distinct from jobPrefs.locations (where the
      // candidate said they'd LIKE to work). Rwandans store province/
      // district/sector/cell/village instead of country/city.
      const homeLocation = profile.is_rwandan
        ? [profile.sector, profile.district, profile.province, 'Rwanda'].filter(Boolean).join(' ')
        : [profile.city, profile.country].filter(Boolean).join(' ');

      // ── 2. Activity history ───────────────────────────────
      const [viewsRes, appliedRes, savedRes, ignoredRes, searchRes] = await Promise.all([
        DatabaseService.query(`
          SELECT DISTINCT ON (jv.job_id)
            jv.job_id, j.title, j.department AS category,
            COALESCE(j.skills_required::text, '[]') as skills_json
          FROM job_views jv
          JOIN jobs j ON j.id = jv.job_id
          WHERE jv.user_id = $1
          ORDER BY jv.job_id, jv.viewed_at DESC
          LIMIT 50
        `, [userId]),

        DatabaseService.query(`
          SELECT job_id FROM applications
          WHERE user_id = $1
        `, [userId]),

        DatabaseService.query(`
          SELECT DISTINCT ON (sj.job_id)
            sj.job_id, j.title, j.department AS category,
            COALESCE(j.skills_required::text, '[]') as skills_json
          FROM saved_jobs sj
          JOIN jobs j ON j.id = sj.job_id
          WHERE sj.user_id = $1
          ORDER BY sj.job_id, sj.saved_at DESC
          LIMIT 50
        `, [userId]),

        DatabaseService.query(`
          SELECT job_id FROM ignored_jobs WHERE user_id = $1
        `, [userId]),

        DatabaseService.query(`
          SELECT query FROM job_searches
          WHERE user_id = $1
          ORDER BY searched_at DESC
          LIMIT 20
        `, [userId]),
      ]);

      const activity = {
        search_queries:  searchRes.rows.map((r: any) => r.query),
        viewed_jobs:     viewsRes.rows.map((r: any) => ({
          job_id:   r.job_id,
          title:    r.title || '',
          category: r.category || '',
          skills:   this._parseSkillArray(r.skills_json),
        })),
        saved_jobs:      savedRes.rows.map((r: any) => ({
          job_id:   r.job_id,
          title:    r.title || '',
          category: r.category || '',
          skills:   this._parseSkillArray(r.skills_json),
        })),
        saved_job_ids:   savedRes.rows.map((r: any) => r.job_id),
        applied_job_ids: appliedRes.rows.map((r: any) => r.job_id),
        ignored_job_ids: ignoredRes.rows.map((r: any) => r.job_id),
      };

      // ── 3. Fetch all active jobs ──────────────────────────
      const jobsResult = await DatabaseService.query(`
        SELECT
          j.id, j.title, j.department AS category, j.job_type, j.experience_level,
          j.education_required,
          COALESCE(
            (SELECT string_agg(elem->>'city', ', ')
             FROM jsonb_array_elements(j.locations) AS elem WHERE elem->>'city'IS NOT NULL),
            'Remote'
          ) AS location,
          j.skills_required,
          j.created_at AS posted_at,
          COALESCE(
            (SELECT COUNT(*)::int FROM applications a WHERE a.job_id = j.id),
            0
          ) AS application_count
        FROM jobs j
        WHERE j.status = 'active'
        ORDER BY j.created_at DESC
        LIMIT 200
      `);

      const jobs = jobsResult.rows.map((j: any) => ({
        id:               j.id,
        title:            j.title || '',
        category:         j.category || '',
        job_type:         j.job_type || '',
        experience_level: j.experience_level || '',
        education_required: j.education_required || '',
        location:         j.location || '',
        skills_required:  this._parseSkillArray(j.skills_required),
        posted_at:        j.posted_at,
        application_count: j.application_count || 0,
      }));

      if (jobs.length === 0) {
        ResponseService.success(res, { jobs: [], total: 0, cold_start: true }, 'No active jobs found');
        return;
      }

      // ── 4. Call ML gateway ────────────────────────────────
      const mlPayload = {
        candidate: {
          skills:               this._parseSkillArray(profile.skills),
          years_experience:     Number(profile.years_of_experience) || 0,
          education_level:      profile.education_level || '',
          preferred_job_titles: jobPrefs.job_types || jobPrefs.preferred_job_types || [],
          preferred_locations:  jobPrefs.locations || jobPrefs.preferred_locations || [],
          home_location:        homeLocation || '',
        },
        activity,
        jobs,
        top_n: topN * page,
      };

      let scoredJobs: any[] = [];
      let coldStart = false;

      try {
        const mlRes = await axios.post(`${ML_GATEWAY}/feed/score`, mlPayload, { timeout: 15000 });
        scoredJobs = mlRes.data.scored_jobs || [];
        coldStart  = mlRes.data.cold_start || false;
      } catch (mlErr: any) {
        console.warn('[FeedController] ML gateway unavailable, falling back to recency sort:', mlErr?.message);
        // Fallback: sort by date only
        scoredJobs = jobs
          .filter((j: any) => !activity.ignored_job_ids.includes(j.id))
          .map((j: any, idx: number) => ({ job_id: j.id, total_score: 100 - idx, breakdown: {} }));
        coldStart = true;
      }

      // ── 5. Paginate ───────────────────────────────────────
      const offset = (page - 1) * topN;
      const pageSlice = scoredJobs.slice(offset, offset + topN);

      // ── 6. Enrich with full job details ──────────────────
      const jobMap = new Map(jobs.map((j: any) => [j.id, j]));
      const enriched = pageSlice
        .map((s: any) => ({ ...jobMap.get(s.job_id), score: s.total_score, score_breakdown: s.breakdown }))
        .filter((j: any) => j.id);

      // ── 7. Cache scores for this candidate ───────────────
      this._cacheFeedScores(userId, scoredJobs).catch(() => {});

      ResponseService.success(res, {
        jobs:       enriched,
        total:      scoredJobs.length,
        page,
        top_n:      topN,
        cold_start: coldStart,
      }, 'Personalized feed loaded');
    } catch (err: any) {
      ResponseService.error(res, 'Failed to load feed', 500, null, err?.message);
    }
  }

  // POST /api/v1/feed/view/:jobId
  async logJobView(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const secondsSpent = req.body.seconds_spent || 0;
      await DatabaseService.query(`
        INSERT INTO job_views (user_id, job_id, seconds_spent, viewed_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, job_id)
        DO UPDATE SET seconds_spent = GREATEST(job_views.seconds_spent, $3), viewed_at = NOW()
      `, [req.user.id, jobId, secondsSpent]);
      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'job_views',
        operation: 'upsert',
        candidate_id: req.user.id,
        job_id: jobId,
        payload: { seconds_spent: secondsSpent },
        source: 'backend',
      });
      ResponseService.success(res, null, 'View logged');
    } catch (err: any) {
      ResponseService.error(res, 'Failed to log view', 500, null, err?.message);
    }
  }

  // POST /api/v1/feed/ignore/:jobId
  async ignoreJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      await DatabaseService.query(`
        INSERT INTO ignored_jobs (user_id, job_id, ignored_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id, job_id) DO NOTHING
      `, [req.user.id, jobId]);
      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'ignored_jobs',
        operation: 'insert',
        candidate_id: req.user.id,
        job_id: jobId,
        payload: {},
        source: 'backend',
      });
      ResponseService.success(res, null, 'Job hidden from feed');
    } catch (err: any) {
      ResponseService.error(res, 'Failed to ignore job', 500, null, err?.message);
    }
  }

  // DELETE /api/v1/feed/ignore/:jobId    undo ignore
  async unignoreJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      await DatabaseService.query(`
        DELETE FROM ignored_jobs WHERE user_id = $1 AND job_id = $2
      `, [req.user.id, jobId]);
      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'ignored_jobs',
        operation: 'delete',
        candidate_id: req.user.id,
        job_id: jobId,
        payload: {},
        source: 'backend',
      });
      ResponseService.success(res, null, 'Job restored to feed');
    } catch (err: any) {
      ResponseService.error(res, 'Failed to restore job', 500, null, err?.message);
    }
  }

  // POST /api/v1/feed/save/:jobId
  async saveJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      await DatabaseService.query(`
        INSERT INTO saved_jobs (user_id, job_id, saved_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id, job_id) DO NOTHING
      `, [req.user.id, jobId]);
      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'saved_jobs',
        operation: 'insert',
        candidate_id: req.user.id,
        job_id: jobId,
        payload: {},
        source: 'backend',
      });
      ResponseService.success(res, null, 'Job saved');
    } catch (err: any) {
      ResponseService.error(res, 'Failed to save job', 500, null, err?.message);
    }
  }

  // DELETE /api/v1/feed/save/:jobId
  async unsaveJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      await DatabaseService.query(`
        DELETE FROM saved_jobs WHERE user_id = $1 AND job_id = $2
      `, [req.user.id, jobId]);
      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'saved_jobs',
        operation: 'delete',
        candidate_id: req.user.id,
        job_id: jobId,
        payload: {},
        source: 'backend',
      });
      ResponseService.success(res, null, 'Job unsaved');
    } catch (err: any) {
      ResponseService.error(res, 'Failed to unsave job', 500, null, err?.message);
    }
  }

  // POST /api/v1/feed/search-log
  async logSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { query } = req.body;
      if (!query?.trim()) { ResponseService.success(res, null, 'Empty query skipped'); return; }
      await DatabaseService.query(`
        INSERT INTO job_searches (user_id, query, searched_at)
        VALUES ($1, $2, NOW())
      `, [req.user.id, query.trim().substring(0, 200)]);
      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'job_searches',
        operation: 'insert',
        candidate_id: req.user.id,
        payload: { query: query.trim().substring(0, 200) },
        source: 'backend',
      });
      ResponseService.success(res, null, 'Search logged');
    } catch (err: any) {
      ResponseService.error(res, 'Failed to log search', 500, null, err?.message);
    }
  }

  // POST /api/v1/feed/application-start/:jobId    candidate opened the Apply form
  async logApplicationStart(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      await DatabaseService.query(`
        INSERT INTO application_starts (user_id, job_id, started_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id, job_id)
        DO UPDATE SET started_at = NOW()
        WHERE application_starts.submitted = FALSE
      `, [req.user.id, jobId]);
      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'application_started',
        operation: 'upsert',
        candidate_id: req.user.id,
        job_id: jobId,
        payload: {},
        source: 'backend',
      });
      ResponseService.success(res, null, 'Application start logged');
    } catch (err: any) {
      ResponseService.error(res, 'Failed to log application start', 500, null, err?.message);
    }
  }

  // GET /api/v1/feed/activity    full interaction history for "My Activity", grouped by type
  async getActivity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const [viewed, saved, applied, searched, incomplete] = await Promise.all([
        DatabaseService.query(`
          SELECT jv.job_id, jv.viewed_at, jv.seconds_spent,
            j.title, c.name AS company_name
          FROM job_views jv
          JOIN jobs j ON j.id = jv.job_id
          JOIN companies c ON c.id = j.company_id
          WHERE jv.user_id = $1
          ORDER BY jv.viewed_at DESC
          LIMIT 100
        `, [userId]),

        DatabaseService.query(`
          SELECT sj.job_id, sj.saved_at,
            j.title, c.name AS company_name
          FROM saved_jobs sj
          JOIN jobs j ON j.id = sj.job_id
          JOIN companies c ON c.id = j.company_id
          WHERE sj.user_id = $1
          ORDER BY sj.saved_at DESC
          LIMIT 100
        `, [userId]),

        DatabaseService.query(`
          SELECT a.job_id, a.applied_at, a.status,
            j.title, c.name AS company_name
          FROM applications a
          JOIN jobs j ON j.id = a.job_id
          JOIN companies c ON c.id = j.company_id
          WHERE a.user_id = $1 AND a.deleted_at IS NULL
          ORDER BY a.applied_at DESC
          LIMIT 100
        `, [userId]),

        DatabaseService.query(`
          SELECT query, searched_at
          FROM job_searches
          WHERE user_id = $1
          ORDER BY searched_at DESC
          LIMIT 100
        `, [userId]),

        DatabaseService.query(`
          SELECT aps.job_id, aps.started_at,
            j.title, c.name AS company_name
          FROM application_starts aps
          JOIN jobs j ON j.id = aps.job_id
          JOIN companies c ON c.id = j.company_id
          WHERE aps.user_id = $1 AND aps.submitted = FALSE
          ORDER BY aps.started_at DESC
          LIMIT 100
        `, [userId]),
      ]);

      ResponseService.success(res, {
        viewed: viewed.rows,
        saved: saved.rows,
        applied: applied.rows,
        searched: searched.rows,
        incomplete_applications: incomplete.rows,
        counts: {
          viewed: viewed.rowCount,
          saved: saved.rowCount,
          applied: applied.rowCount,
          searched: searched.rowCount,
          incomplete_applications: incomplete.rowCount,
        },
      }, 'Activity history loaded');
    } catch (err: any) {
      ResponseService.error(res, 'Failed to load activity history', 500, null, err?.message);
    }
  }

  // GET /api/v1/feed/ml-status    proxies the ML gateway's behavior/stats so the
  // frontend never has to call the ML gateway directly from the browser (avoids
  // browser-CORS entirely by keeping this a server-to-server call, same as
  // getPersonalizedFeed's own ML gateway call above).
  async getMlStatus(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const mlRes = await axios.get(`${ML_GATEWAY}/hybrid/behavior/stats`, { timeout: 15000 });
      ResponseService.success(res, mlRes.data, 'ML status loaded');
    } catch (err: any) {
      ResponseService.error(res, 'ML service unavailable', 503, null, err?.message);
    }
  }

  // GET /api/v1/feed/saved    list saved jobs
  async getSavedJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await DatabaseService.query(`
        SELECT j.*, sj.saved_at,
          c.name AS company_name, c.logo_url AS company_logo
        FROM saved_jobs sj
        JOIN jobs j ON j.id = sj.job_id
        JOIN companies c ON j.company_id = c.id
        WHERE sj.user_id = $1
        ORDER BY sj.saved_at DESC
      `, [req.user.id]);
      ResponseService.success(res, result.rows, 'Saved jobs');
    } catch (err: any) {
      ResponseService.error(res, 'Failed to fetch saved jobs', 500, null, err?.message);
    }
  }

  // ── PRIVATE HELPERS ──────────────────────────────────────

  private _parseSkillArray(raw: any): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((s: any) => (typeof s === 'string'? s : s?.name || s?.skill_name || '')).filter(Boolean);
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return this._parseSkillArray(parsed);
      } catch { return []; }
    }
    return [];
  }

  private async _cacheFeedScores(userId: string, scoredJobs: any[]): Promise<void> {
    if (!scoredJobs.length) return;
    const values = scoredJobs
      .slice(0, 100)
      .map((s: any) => `('${userId}', '${s.job_id}', ${s.total_score}, NOW())`)
      .join(',');
    await DatabaseService.query(`
      INSERT INTO feed_scores (candidate_id, job_id, score, computed_at)
      VALUES ${values}
      ON CONFLICT (candidate_id, job_id)
      DO UPDATE SET score = EXCLUDED.score, computed_at = EXCLUDED.computed_at
    `);
  }
}

export default new FeedController();
