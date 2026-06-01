// AppliedJobsManager.js - Global state management for applied jobs
class AppliedJobsManager {
  constructor() {
    this.appliedJobs = new Set();
    this.listeners = [];
    this.loadFromStorage();
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem('appliedJobs');
      if (stored) {
        const appliedJobIds = JSON.parse(stored);
        this.appliedJobs = new Set(appliedJobIds);
      }
    } catch (error) {
      console.error('Error loading applied jobs from storage:', error);
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem('appliedJobs', JSON.stringify(Array.from(this.appliedJobs)));
    } catch (error) {
      console.error('Error saving applied jobs to storage:', error);
    }
  }

  addAppliedJob(jobId) {
    this.appliedJobs.add(jobId);
    this.saveToStorage();
    this.notifyListeners();
  }

  removeAppliedJob(jobId) {
    this.appliedJobs.delete(jobId);
    this.saveToStorage();
    this.notifyListeners();
  }

  hasAppliedJob(jobId) {
    return this.appliedJobs.has(jobId);
  }

  getAllAppliedJobs() {
    return Array.from(this.appliedJobs);
  }

  async loadFromAPI() {
    try {
      console.log('AppliedJobsManager: Loading from API...');
      const { getApplications } = await import('../../services/applicationAPI');
      const response = await getApplications();
      console.log('AppliedJobsManager: API response:', response);
      if (response.success) {
        const appliedJobIds = response.data.applications.map((app) => app.job_id);
        console.log('AppliedJobsManager: Applied job IDs from API:', appliedJobIds);
        this.appliedJobs = new Set(appliedJobIds);
        this.saveToStorage();
        this.notifyListeners();
        return appliedJobIds;
      } else {
        console.log('AppliedJobsManager: API call failed:', response);
      }
    } catch (error) {
      console.error('AppliedJobsManager: Error loading applied jobs from API:', error);
    }
    return [];
  }

  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }

  notifyListeners() {
    this.listeners.forEach(callback => callback(this.getAllAppliedJobs()));
  }
}

// Create a singleton instance
const appliedJobsManager = new AppliedJobsManager();

export default appliedJobsManager;