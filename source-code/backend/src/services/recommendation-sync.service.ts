import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger.js';

export interface RecommendationSyncEvent {
  event_type: string;
  entity_type: string;
  operation: string;
  entity_id?: string | null;
  candidate_id?: string | null;
  job_id?: string | null;
  payload?: Record<string, any>;
  source?: string;
  created_at?: string;
}

class RecommendationSyncService {
  private readonly webhookUrl: string;
  private readonly webhookSecret: string;
  private readonly timeoutMs: number;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly http: AxiosInstance;
  private queue: RecommendationSyncEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor() {
    this.webhookUrl = (process.env.RECOMMENDER_WEBHOOK_URL || '').trim();
    this.webhookSecret = (process.env.RECOMMENDER_WEBHOOK_SECRET || '').trim();
    this.timeoutMs = Math.max(250, Number(process.env.RECOMMENDER_WEBHOOK_TIMEOUT_MS || 1500));
    this.batchSize = Math.max(1, Number(process.env.RECOMMENDER_WEBHOOK_BATCH_SIZE || 50));
    this.flushIntervalMs = Math.max(100, Number(process.env.RECOMMENDER_WEBHOOK_FLUSH_MS || 750));
    this.http = axios.create({
      timeout: this.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        ...(this.webhookSecret ? { 'X-Recommendation-Secret': this.webhookSecret } : {}),
      },
    });
  }

  queueEvent(event: RecommendationSyncEvent): void {
    if (!this.webhookUrl) {
      return;
    }

    this.queue.push({
      source: 'backend',
      created_at: new Date().toISOString(),
      ...event,
    });

    if (this.queue.length >= this.batchSize) {
      void this.flushSoon();
      return;
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flushSoon();
      }, this.flushIntervalMs);
    }
  }

  queueMany(events: RecommendationSyncEvent[]): void {
    for (const event of events) {
      this.queueEvent(event);
    }
  }

  private async flushSoon(): Promise<void> {
    if (this.flushing || this.queue.length === 0 || !this.webhookUrl) {
      return;
    }

    this.flushing = true;
    const batch = this.queue.splice(0, this.batchSize);

    try {
      await this.http.post(`${this.webhookUrl.replace(/\/$/, '')}/batch`, { events: batch });
    } catch (error) {
      logger.warn('Recommendation sync webhook batch failed:', error);
    } finally {
      this.flushing = false;
      if (this.queue.length > 0) {
        void this.flushSoon();
      }
    }
  }
}

export default new RecommendationSyncService();