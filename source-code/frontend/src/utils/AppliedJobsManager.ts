// AppliedJobsManager.ts - Global state management for applied jobs

export interface ApplicationResponse {
  success: boolean;
  data?: {
    applications: Array<{ job_id: string }>;
  };
  message?: string;
}

export type ListenerCallback = (jobs: string[]) => void;

class AppliedJobsManager {
  private appliedJobs: Set<string>;
  private listeners: ListenerCallback[];

  constructor() {
    this.appliedJobs = new Set<string>();
    this.listeners = [];
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('appliedJobs');
      if (stored) {
        const appliedJobIds = JSON.parse(stored) as string[];
        if (Array.isArray(appliedJobIds)) {
          this.appliedJobs = new Set(appliedJobIds);
        }
      }
    } catch (error) {
      console.error('Error loading applied jobs from storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('appliedJobs', JSON.stringify(Array.from(this.appliedJobs)));
    } catch (error) {
      console.error('Error saving applied jobs to storage:', error);
    }
  }

  addAppliedJob(jobId: string): void {
    if (!jobId) {
      console.error('AppliedJobsManager: jobId is required');
      return;
    }
    this.appliedJobs.add(jobId);
    this.saveToStorage();
    this.notifyListeners();
  }

  removeAppliedJob(jobId: string): void {
    if (!jobId) {
      console.error('AppliedJobsManager: jobId is required');
      return;
    }
    this.appliedJobs.delete(jobId);
    this.saveToStorage();
    this.notifyListeners();
  }

  hasAppliedJob(jobId: string): boolean {
    if (!jobId) {
      return false;
    }
    return this.appliedJobs.has(jobId);
  }

  getAllAppliedJobs(): string[] {
    return Array.from(this.appliedJobs);
  }

  async loadFromAPI(): Promise<string[]> {
    try {
      console.log('AppliedJobsManager: Loading from API...');
      const { getApplications } = await import('../../services/applicationAPI');
      const response = (await getApplications()) as ApplicationResponse;
      console.log('AppliedJobsManager: API response:', response);
      
      if (response.success && response.data?.applications && Array.isArray(response.data.applications)) {
        const appliedJobIds = response.data.applications
          .map((app) => app.job_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
        
        console.log('AppliedJobsManager: Applied job IDs from API:', appliedJobIds);
        this.appliedJobs = new Set(appliedJobIds);
        this.saveToStorage();
        this.notifyListeners();
        return appliedJobIds;
      } else {
        console.log('AppliedJobsManager: API call failed or invalid response:', response);
        return [];
      }
    } catch (error) {
      console.error('AppliedJobsManager: Error loading applied jobs from API:', error);
      return [];
    }
  }

  addListener(callback: ListenerCallback): void {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    } else {
      console.error('AppliedJobsManager: addListener callback must be a function');
    }
  }

  removeListener(callback: ListenerCallback): void {
    if (typeof callback === 'function') {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    }
  }

  private notifyListeners(): void {
    const jobs = this.getAllAppliedJobs();
    this.listeners.forEach(callback => {
      try {
        callback(jobs);
      } catch (error) {
        console.error('AppliedJobsManager: Error in listener callback:', error);
      }
    });
  }

  clear(): void {
    this.appliedJobs.clear();
    this.saveToStorage();
    this.notifyListeners();
  }

  getCount(): number {
    return this.appliedJobs.size;
  }
}

// Create a singleton instance
const appliedJobsManager = new AppliedJobsManager();

export default appliedJobsManager;