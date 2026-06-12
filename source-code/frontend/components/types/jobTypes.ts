// ============================================================
// JOB MANAGEMENT TYPES
// ============================================================

export interface Skill {
  name: string;
  proficiency_level?: number;
  importance?: string;
}

export interface ScreeningQuestion {
  question: string;
  type: 'text' | 'yes_no' | 'number' | 'date' | 'multiple_choice';
  required: boolean;
  options?: string[];
  scoring_weight?: number;
  help_text?: string;
}

export interface Language {
  id: string;
  name: string;
  proficiency: 'basic' | 'conversational' | 'professional' | 'native';
  is_required: boolean;
}

export interface ExperienceRequirement {
  id: string;
  title: string;
  years: string;
  description: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
}

export interface RequiredDocument {
  id: string;
  name: string;
  is_required: boolean;
}

export interface LocationObject {
  city: string;
  country: string;
  state?: string;
  postal_code?: string;
  is_remote: boolean;
}

// Structured qualification entry — one degree with multiple fields of study
export interface QualificationEntry {
  id: string;
  degree: string;        // e.g. "Bachelor's Degree" or custom
  fields: string[];      // e.g. ["Computer Science", "Information Technology"]
}

export type JobStatus = 'active' | 'draft' | 'closed' | 'pending';
export type WorkArrangement = 'onsite' | 'remote' | 'hybrid' | 'flexible';
export type JobType = 'full-time' | 'part-time' | 'contract' | 'internship' | 'freelance' | 'temporary';
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
export type Visibility = 'public' | 'internal' | 'confidential' | 'unlisted';
export type SalaryType = 'range' | 'above' | 'under' | 'negotiable';

export interface Job {
  id: string;
  title: string;
  department: string;
  status: JobStatus;
  location: string;
  applications_count?: number;
  created_at: string;
  salary_range?: string;
  job_type?: JobType;
  work_arrangement?: WorkArrangement;
  ai_match_required_score?: number;
}

export interface JobFormData {
  // Job Information
  title: string;
  department: string;
  jobType: JobType;
  workArrangement: WorkArrangement;
  locations: string[];
  description: string;
  responsibilities: string[];
  requirements: string[];
  qualifications: string;              // legacy / plain text fallback
  qualificationEntries: QualificationEntry[];  // structured degree + fields

  // Salary & Benefits
  salaryType: SalaryType;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: 'hour' | 'month' | 'year';
  salaryVisible: boolean;
  benefits: string[];

  // Skills & Experience
  requiredSkills: Skill[];
  preferredSkills: Skill[];
  experienceLevel: ExperienceLevel;
  experienceRequirements: ExperienceRequirement[];

  // Languages & Documents
  languages: Language[];
  certifications: Certification[];
  requiredDocuments: RequiredDocument[];
  ageRequirement: string;

  // Screening
  screeningQuestions: ScreeningQuestion[];
  applicationInstructions: string;

  // Dates
  publishedAt: string;
  expiresAt: string;

  // Settings
  visibility: Visibility;
  applicationLimit: string;
  tags: string[];

  // Flags
  noExperienceNeeded: boolean;
  noCertificationsNeeded: boolean;
  noLanguagesNeeded: boolean;
  noDocumentsNeeded: boolean;
  aiMatchRequiredScore: number;
}

export interface ValidationErrors {
  title?: string;
  description?: string;
  locations?: string;
  salaryMin?: string;
  salaryMax?: string;
  expiresAt?: string;
  publishedAt?: string;
  responsibilities?: string;
  screeningQuestions?: string;
  applicationLimit?: string;
  ageRequirement?: string;
  requiredSkills?: string;
  salaryCurrency?: string;
}

export interface JobManagementProps {
  onBack: () => void;
  onCreateJob?: () => void;
  onEditJob?: (jobId: string) => void;
  refreshTrigger?: number;
}

export interface JobPostingScreenProps {
  onBack: () => void;
  jobId?: string;
  isEditing?: boolean;
}

export const DEFAULT_FORM_DATA: JobFormData = {
  title: '',
  department: '',
  jobType: 'full-time',
  workArrangement: 'onsite',
  locations: [''],
  description: '',
  responsibilities: [],
  requirements: [],
  qualifications: '',
  qualificationEntries: [],
  salaryType: 'range',
  salaryMin: '',
  salaryMax: '',
  salaryCurrency: 'Rwf',
  salaryPeriod: 'month',
  salaryVisible: true,
  benefits: [],
  requiredSkills: [],
  preferredSkills: [],
  experienceLevel: 'mid',
  experienceRequirements: [],
  languages: [],
  certifications: [],
  requiredDocuments: [],
  ageRequirement: '',
  screeningQuestions: [],
  applicationInstructions: '',
  publishedAt: new Date().toISOString().split('T')[0],
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  visibility: 'public',
  applicationLimit: '100000',
  tags: [],
  noExperienceNeeded: false,
  noCertificationsNeeded: false,
  noLanguagesNeeded: false,
  noDocumentsNeeded: false,
  aiMatchRequiredScore: 70,
};

export const STEPS = [
  { id: 1, title: 'Job Information',    shortTitle: 'Info'      },
  { id: 2, title: 'Salary & Benefits',  shortTitle: 'Salary'    },
  { id: 3, title: 'Skills & Experience',shortTitle: 'Skills'    },
  { id: 4, title: 'Languages & Docs',   shortTitle: 'Docs'      },
  { id: 5, title: 'Screening',          shortTitle: 'Questions' },
  { id: 6, title: 'Settings',           shortTitle: 'Settings'  },
];

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  'full-time':  'Full Time',
  'part-time':  'Part Time',
  'contract':   'Contract',
  'internship': 'Internship',
  'freelance':  'Freelance',
  'temporary':  'Temporary',
};

export const WORK_ARRANGEMENT_LABELS: Record<WorkArrangement, string> = {
  onsite:   'On-site',
  remote:   'Remote',
  hybrid:   'Hybrid',
  flexible: 'Flexible',
};

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  entry:     'Entry Level (0–2 yrs)',
  mid:       'Mid Level (3–5 yrs)',
  senior:    'Senior Level (6–9 yrs)',
  lead:      'Lead Level (10+ yrs)',
  executive: 'Executive (15+ yrs)',
};

// ── Static suggestion datasets ───────────────────────────────────────────────

export const DEPARTMENTS = [
  'Engineering', 'Product', 'Design', 'Marketing', 'Sales', 'Operations',
  'Human Resources', 'Finance', 'Legal', 'Data Science', 'DevOps',
  'Customer Success', 'Information Technology', 'Research & Development',
  'Business Development', 'Quality Assurance', 'Security', 'Procurement',
  'Supply Chain', 'Communications', 'Strategy', 'Administration',
];

// ============================================================
// DEGREE TYPES - Complete list for qualification selection
// ============================================================
export const DEGREE_TYPES = [
  "Bachelor's Degree",
  "Master's Degree",
  "PhD / Doctorate",
  "Associate Degree",
  "High School Diploma",
  "Professional Certificate",
  "Vocational Training",
  "No Degree Required",
  // Additional degree types for more options
  "Bachelor of Science (BSc)",
  "Bachelor of Arts (BA)",
  "Bachelor of Business Administration (BBA)",
  "Bachelor of Commerce (BCom)",
  "Master of Business Administration (MBA)",
  "Master of Science (MSc)",
  "Master of Arts (MA)",
  "Postgraduate Diploma",
  "Advanced Certificate",
  "Executive Education",
];

// ============================================================
// FIELDS OF STUDY - Complete list for qualification selection
// ============================================================
export const FIELDS_OF_STUDY = [
  // Technology & Engineering
  'Computer Science', 'Information Technology', 'Software Engineering',
  'Computer Engineering', 'Data Science', 'Cybersecurity',
  'Artificial Intelligence', 'Machine Learning', 'Network Engineering',
  'Cloud Computing', 'DevOps', 'Database Management', 'Web Development',
  'Mobile Development', 'Embedded Systems', 'Robotics', 'Bioinformatics',
  'Electrical Engineering', 'Mechanical Engineering', 'Civil Engineering',
  'Industrial Engineering', 'Chemical Engineering', 'Aerospace Engineering',
  'Biomedical Engineering', 'Environmental Engineering', 'Petroleum Engineering',
  
  // Business & Management
  'Business Administration', 'Finance', 'Accounting', 'Marketing',
  'Management', 'Human Resources', 'Project Management', 'Economics',
  'Business Analytics', 'International Business', 'Supply Chain Management',
  'Logistics', 'Operations Management', 'Entrepreneurship', 'Strategic Management',
  'Risk Management', 'Real Estate', 'Hospitality Management', 'Tourism Management',
  'Nonprofit Management', 'Public Administration',
  
  // Marketing Specific (Critical for your role)
  'Marketing Analytics', 'Digital Marketing', 'Market Research',
  'Consumer Behavior', 'Brand Management', 'Social Media Marketing',
  'Content Marketing', 'SEO/SEM', 'Email Marketing', 'Product Marketing',
  'Advertising', 'Public Relations', 'Communications', 'Media Studies',
  'Corporate Communications', 'Integrated Marketing Communications',
  
  // Data & Analytics
  'Statistics', 'Data Analytics', 'Business Intelligence', 'Big Data',
  'Predictive Analytics', 'Quantitative Methods', 'Econometrics',
  'Mathematics', 'Applied Mathematics', 'Operations Research',
  
  // Science & Healthcare
  'Biology', 'Chemistry', 'Physics', 'Biochemistry', 'Biotechnology',
  'Genetics', 'Neuroscience', 'Pharmacology', 'Nursing', 'Medicine',
  'Public Health', 'Epidemiology', 'Pharmacy', 'Dentistry', 'Veterinary Medicine',
  'Environmental Science', 'Geology', 'Astronomy', 'Marine Biology',
  
  // Social Sciences & Humanities
  'Psychology', 'Sociology', 'Anthropology', 'Political Science',
  'International Relations', 'History', 'Philosophy', 'Theology',
  'Linguistics', 'English Literature', 'Foreign Languages', 'Translation',
  'Journalism', 'Creative Writing', 'Library Science', 'Archival Studies',
  
  // Arts & Design
  'Graphic Design', 'UI/UX Design', 'Product Design', 'Industrial Design',
  'Interior Design', 'Fashion Design', 'Game Design', 'Animation',
  'Visual Arts', 'Fine Arts', 'Photography', 'Film Studies', 'Music Production',
  'Performing Arts', 'Architecture', 'Landscape Architecture', 'Urban Planning',
  
  // Law & Legal
  'Law', 'Legal Studies', 'Criminal Justice', 'Paralegal Studies',
  'Intellectual Property Law', 'Corporate Law', 'Tax Law', 'International Law',
  
  // Education
  'Education', 'Early Childhood Education', 'Primary Education',
  'Secondary Education', 'Special Education', 'Educational Leadership',
  'Curriculum Development', 'Instructional Design', 'TESOL', 'Linguistics',
  
  // Sports & Recreation
  'Sports Management', 'Kinesiology', 'Exercise Science', 'Physical Education',
  'Sports Psychology', 'Athletic Training', 'Recreation Management',
  
  // Trades & Vocational
  'Culinary Arts', 'Baking and Pastry Arts', 'Wine Studies', 'Hospitality',
  'Automotive Technology', 'Construction Management', 'Welding', 'Plumbing',
  'Electrical Technology', 'HVAC', 'Cosmetology', 'Barbering',
];

// ============================================================
// SUGGESTIONS FOR RESPONSIBILITIES, REQUIREMENTS, BENEFITS, SKILLS
// ============================================================

export const RESPONSIBILITIES_SUGGESTIONS = [
  'Design and develop scalable software solutions',
  'Lead technical discussions and code reviews',
  'Collaborate with cross-functional teams',
  'Write clean, maintainable, and efficient code',
  'Troubleshoot and debug production issues',
  'Participate in agile sprint planning and retrospectives',
  'Mentor junior team members',
  'Document technical specifications and architecture',
  'Conduct performance optimizations',
  'Deploy and monitor applications in production',
  'Manage project timelines and deliverables',
  'Present progress reports to senior management',
  'Develop and implement strategic plans',
  'Analyze data to inform business decisions',
  'Manage client relationships and expectations',
  'Recruit, train, and evaluate staff',
  'Prepare budgets and financial reports',
  'Identify and mitigate project risks',
  'Coordinate with vendors and external partners',
  'Ensure compliance with regulatory standards',
  // Marketing specific responsibilities
  'Conduct market research and competitive analysis',
  'Analyze customer behavior and market trends',
  'Track and report on marketing campaign performance',
  'Create dashboards and visualizations for stakeholders',
  'Provide data-driven recommendations for marketing strategies',
  'Monitor social media and digital marketing KPIs',
];

export const REQUIREMENTS_SUGGESTIONS = [
  'Strong communication and interpersonal skills',
  'Ability to work independently and in a team',
  'Problem-solving and critical-thinking mindset',
  'High attention to detail',
  'Ability to manage multiple priorities under pressure',
  'Strong analytical and data interpretation skills',
  'Experience with Agile / Scrum methodologies',
  'Excellent written and verbal communication in English',
  'Proven track record of meeting deadlines',
  'Strong leadership and decision-making abilities',
  'Customer-oriented approach',
  'Willingness to learn and adapt',
  'Experience in a fast-paced startup environment',
  'Strong organizational skills',
  // Marketing specific requirements
  'Proficiency in Excel, SQL, or data analysis tools',
  'Experience with Google Analytics or similar platforms',
  'Strong presentation and storytelling skills',
  'Knowledge of marketing automation tools',
  'Ability to translate data into actionable insights',
];

export const BENEFITS_SUGGESTIONS = [
  'Health insurance',
  'Dental and vision coverage',
  'Remote work options',
  'Flexible working hours',
  'Annual performance bonus',
  'Professional development budget',
  'Stock options / equity',
  'Pension / retirement plan',
  'Paid parental leave',
  'Generous paid time off (PTO)',
  'Company laptop and equipment',
  'Home office allowance',
  'Mental health and wellness support',
  'Annual team retreats',
  'Learning and development programs',
  'Meal allowance',
  'Transportation allowance',
  'Life and disability insurance',
  'Employee discounts',
  'On-site gym / fitness benefit',
  'Visa sponsorship',
  'Relocation assistance',
  'Childcare assistance',
];

export const SKILLS_SUGGESTIONS: string[] = [
  // Programming
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'PHP', 'Swift', 'Kotlin',
  // Frontend
  'React', 'Vue.js', 'Angular', 'Next.js', 'HTML5', 'CSS3', 'Tailwind CSS', 'SASS',
  // Backend
  'Node.js', 'Express', 'Django', 'FastAPI', 'Spring Boot', 'Laravel', 'Ruby on Rails',
  // Databases
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
  // Cloud & DevOps
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Jenkins', 'GitHub Actions',
  // Data & Analytics
  'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Power BI', 'Tableau',
  'Data Analysis', 'Statistical Analysis', 'Excel', 'Google Analytics', 'SQL Queries',
  // Marketing Skills
  'Market Research', 'Competitive Analysis', 'Customer Segmentation', 'Campaign Analysis',
  'Digital Marketing', 'SEO', 'SEM', 'Social Media Analytics', 'Content Strategy',
  'Email Marketing', 'Marketing Automation', 'HubSpot', 'Salesforce', 'CRM',
  'Business Intelligence', 'Data Visualization', 'Dashboards', 'KPI Tracking',
  // Tools
  'Git', 'Jira', 'Confluence', 'Figma', 'Sketch', 'REST API', 'GraphQL', 'Microservices',
  // Soft Skills
  'Leadership', 'Communication', 'Problem Solving', 'Project Management', 'Agile', 'Scrum',
  'Critical Thinking', 'Attention to Detail', 'Time Management', 'Teamwork', 'Adaptability',
];

export const EXPERIENCE_YEAR_OPTIONS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '15', '20',
];

export const EXPERIENCE_TITLE_SUGGESTIONS = [
  'Software Development', 'Backend Development', 'Frontend Development',
  'Full-Stack Development', 'Mobile Development', 'DevOps / Infrastructure',
  'Data Analysis', 'Machine Learning / AI', 'Cloud Architecture',
  'Product Management', 'Project Management', 'Team Leadership',
  'Business Analysis', 'Sales', 'Marketing', 'Customer Support',
  'Financial Analysis', 'Accounting', 'HR Management', 'Recruitment',
  'UX / UI Design', 'Graphic Design', 'Content Writing', 'SEO',
  'Network Administration', 'Cybersecurity', 'Database Administration',
  // Marketing specific experience titles
  'Marketing Analysis', 'Market Research', 'Brand Management',
  'Digital Marketing Strategy', 'Social Media Management', 'Content Marketing',
  'Marketing Operations', 'Campaign Management', 'Customer Insights',
];