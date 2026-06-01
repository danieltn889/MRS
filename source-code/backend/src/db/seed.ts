import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';
import { logger } from '../utils/logger.js';
import 'dotenv/config';

type SeedCandidateProfile = {
  firstName: string;
  lastName: string;
  country: string;
  city: string;
  timezone: string;
  profileCompletion: number;
  summary: string;
};

const seedDatabase = async (): Promise<void> => {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '8090'),
    database: process.env.DB_NAME || 'recruitment_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'TN12',
  });

  try {
    await client.connect();
    logger.info('Connected to database for seeding');

    await client.query('BEGIN');

    // =====================================================
    // CLEAN DUPLICATE RECORDS
    // =====================================================
    logger.info('Cleaning duplicate records...');

    const dedupeQueries: Array<{ table: string; partition: string }> = [
      { table: 'candidate_profiles', partition: 'user_id' },
      { table: 'company_team', partition: 'company_id, user_id' },
      { table: 'user_skills', partition: 'user_id, skill_id' },
      { table: 'education', partition: 'user_id, institution, degree, field_of_study, start_date, end_date' },
      { table: 'work_experience', partition: 'user_id, company, title, start_date, end_date' },
      { table: 'jobs', partition: 'company_id, title' },
    ];

    for (const { table, partition } of dedupeQueries) {
      await client.query(`
        WITH ranked AS (
          SELECT ctid,
                 ROW_NUMBER() OVER (
                   PARTITION BY ${partition}
                   ORDER BY created_at ASC NULLS LAST, ctid
                 ) AS rn
          FROM ${table}
        )
        DELETE FROM ${table}
        WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1)
      `);
    }
    logger.info('Duplicate cleanup done');

    // =====================================================
    // DEFAULT / SYSTEM COMPANY
    // =====================================================
    logger.info('Ensuring default company exists...');

    const defaultCompanyRes = await client.query(`
      INSERT INTO companies (
        name, legal_name, slug, industry, size, founded_year,
        headquarters_location, website, description, verification_status,
        verification_badge, created_at, updated_at
      )
      VALUES (
        'Default Company', 'Default Company Inc.', 'default-company',
        'Technology', '51-200', 2020,
        '{"country": "USA", "city": "San Francisco", "state": "CA"}',
        'https://defaultcompany.com',
        'Default company for job templates and system use.',
        'verified', true, NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        updated_at = EXCLUDED.updated_at
      RETURNING id
    `);
    const defaultCompanyId: string = defaultCompanyRes.rows[0].id;
    logger.info(`Default company id: ${defaultCompanyId}`);

    // =====================================================
    // JOB TEMPLATES
    // =====================================================
    logger.info('Seeding job templates...');

    type JobTemplate = {
      id: string;
      slug: string;
      title: string;
      department: string;
      team: string;
      job_type: string;
      work_arrangement: string;
      locations: string;
      description: string;
      summary: string;
      responsibilities: string;
      qualifications: string;
      preferred_qualifications: string;
      requirements: string;
      salary_min: number;
      salary_max: number;
      benefits: string;
      skills_required: string;
      skills_preferred: string;
      experience_min: number;
      experience_max: number;
      experience_level: string;
      education_required: string;
      screening_questions: string;
      application_instructions: string;
      documents: string;
      department_info: string;
      tags: string[];
      application_limit: number;
      metadata: string;
    };

    const jobTemplates: JobTemplate[] = [
      {
        id: '323e4567-e89b-12d3-a456-426614174003',
        slug: 'software-engineer-template',
        title: 'Software Engineer',
        department: 'Engineering',
        team: 'Development',
        job_type: 'full-time',
        work_arrangement: 'hybrid',
        locations: '[{"city":"San Francisco","country":"USA","is_remote":false},{"city":"Remote","country":"Remote","is_remote":true}]',
        description: 'We are looking for a skilled software engineer to join our team. You will be responsible for designing, developing, and maintaining high-quality software solutions.',
        summary: 'Join our engineering team to build scalable web applications.',
        responsibilities: '["Design and develop software applications","Collaborate with cross-functional teams","Write clean, maintainable code","Participate in code reviews","Troubleshoot and debug applications","Mentor junior developers"]',
        qualifications: "Bachelor's degree in Computer Science or related field",
        preferred_qualifications: "Master's degree preferred",
        requirements: '["3+ years of software development experience","Proficiency in JavaScript/TypeScript","Experience with React and Node.js","Strong problem-solving skills","Experience with Git and version control"]',
        salary_min: 80000,
        salary_max: 120000,
        benefits: '["Health Insurance","401k Matching","Flexible Hours","Remote Work Options","Paid Time Off","Professional Development Budget"]',
        skills_required: '[{"name":"JavaScript","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"React","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"Node.js","proficiency_level":3,"is_required":true,"importance":"required"},{"name":"TypeScript","proficiency_level":3,"is_required":true,"importance":"required"}]',
        skills_preferred: '[{"name":"Python","proficiency_level":3,"is_required":false,"importance":"preferred"},{"name":"AWS","proficiency_level":2,"is_required":false,"importance":"preferred"},{"name":"Docker","proficiency_level":2,"is_required":false,"importance":"preferred"}]',
        experience_min: 3,
        experience_max: 7,
        experience_level: 'senior',
        education_required: '{"minimum_degree":"Bachelor\'s Degree","fields_of_study":["Computer Science","Software Engineering","Information Technology"],"is_degree_required":true,"certifications":["AWS Certified Developer","Microsoft Certified"],"additional_requirements":["Strong portfolio of projects"]}',
        screening_questions: '[{"question":"Why are you interested in this position?","type":"text","required":true},{"question":"How many years of React experience do you have?","type":"number","required":true},{"question":"Are you legally authorized to work in this country?","type":"yes_no","required":true},{"question":"What is your expected salary range?","type":"text","required":false}]',
        application_instructions: 'Please submit your resume and a cover letter explaining your experience. Include links to your GitHub profile and portfolio if available.',
        documents: '["Resume","Cover Letter","Portfolio Links"]',
        department_info: 'Engineering Department - Frontend Team',
        tags: ['React', 'JavaScript', 'Frontend', 'Web Development', 'Full Stack'],
        application_limit: 200,
        metadata: '{"priority":"high","remote_level":"hybrid","team_size":10,"reporting_to":"Engineering Manager","hiring_urgency":"medium"}',
      },
      {
        id: '323e4567-e89b-12d3-a456-426614174002',
        slug: 'product-manager-template',
        title: 'Product Manager',
        department: 'Product',
        team: 'Product Management',
        job_type: 'full-time',
        work_arrangement: 'remote',
        locations: '[{"city":"Remote","country":"Worldwide","is_remote":true}]',
        description: 'Join our product team to drive product strategy and execution. You will be responsible for defining product roadmap, gathering requirements, and working with engineering teams.',
        summary: 'Lead product development from ideation to launch.',
        responsibilities: '["Define product roadmap and strategy","Work closely with engineering and design teams","Conduct market research and competitive analysis","Manage product launches and go-to-market strategies","Gather and prioritize product requirements","Analyze product metrics and user feedback"]',
        qualifications: "Bachelor's degree in Business, Marketing, or related field",
        preferred_qualifications: 'MBA or Product Management certification',
        requirements: '["5+ years of product management experience","Experience with agile development methodologies","Strong analytical and communication skills","Technical background preferred","Experience with product analytics tools"]',
        salary_min: 100000,
        salary_max: 150000,
        benefits: '["Health Insurance","Stock Options","Unlimited PTO","Remote Work Stipend","Wellness Budget","Learning & Development Allowance"]',
        skills_required: '[{"name":"Product Strategy","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"Agile Methodologies","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"Market Research","proficiency_level":3,"is_required":true,"importance":"required"}]',
        skills_preferred: '[{"name":"Data Analysis","proficiency_level":3,"is_required":false,"importance":"preferred"},{"name":"SQL","proficiency_level":2,"is_required":false,"importance":"preferred"},{"name":"UI/UX Design","proficiency_level":2,"is_required":false,"importance":"preferred"}]',
        experience_min: 5,
        experience_max: 10,
        experience_level: 'senior',
        education_required: '{"minimum_degree":"Bachelor\'s Degree","fields_of_study":["Business","Marketing","Computer Science","Product Management"],"is_degree_required":true,"certifications":["Certified Scrum Product Owner (CSPO)","Product Management Certification"],"additional_requirements":["Experience with B2B SaaS products"]}',
        screening_questions: '[{"question":"What product are you most proud of launching?","type":"text","required":true},{"question":"How do you prioritize features?","type":"text","required":true},{"question":"How many years of product management experience do you have?","type":"number","required":true}]',
        application_instructions: 'Please submit your resume and a brief description of a successful product you have launched.',
        documents: '["Resume","Product Portfolio","Case Study"]',
        department_info: 'Product Management Department',
        tags: ['Product', 'Management', 'Agile', 'Strategy', 'Roadmap'],
        application_limit: 150,
        metadata: '{"priority":"high","remote_level":"fully_remote","team_size":5,"reporting_to":"Director of Product","hiring_urgency":"high"}',
      },
      {
        id: '323e4567-e89b-12d3-a456-426614174004',
        slug: 'devops-engineer-template',
        title: 'DevOps Engineer',
        department: 'Engineering',
        team: 'Infrastructure',
        job_type: 'full-time',
        work_arrangement: 'remote',
        locations: '[{"city":"Remote","country":"USA","is_remote":true}]',
        description: 'Join our infrastructure team to build and maintain cloud infrastructure, CI/CD pipelines, and deployment systems.',
        summary: 'Automate and optimize our cloud infrastructure.',
        responsibilities: '["Design and maintain CI/CD pipelines","Manage cloud infrastructure (AWS/Azure/GCP)","Implement monitoring and alerting systems","Ensure security best practices","Automate deployment processes","Troubleshoot infrastructure issues"]',
        qualifications: "Bachelor's degree in Computer Science or related field",
        preferred_qualifications: 'Cloud certifications (AWS, Azure, GCP)',
        requirements: '["3+ years of DevOps or SRE experience","Experience with Docker and Kubernetes","Proficiency with AWS or Azure","Experience with CI/CD tools (Jenkins, GitLab CI, GitHub Actions)","Knowledge of infrastructure as code (Terraform, CloudFormation)"]',
        salary_min: 90000,
        salary_max: 140000,
        benefits: '["Health Insurance","401k Matching","Flexible Hours","Home Office Setup","Cloud Certification Reimbursement","On-call Bonus"]',
        skills_required: '[{"name":"AWS","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"Docker","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"Kubernetes","proficiency_level":3,"is_required":true,"importance":"required"},{"name":"Terraform","proficiency_level":3,"is_required":true,"importance":"required"}]',
        skills_preferred: '[{"name":"Python","proficiency_level":3,"is_required":false,"importance":"preferred"},{"name":"GitHub Actions","proficiency_level":3,"is_required":false,"importance":"preferred"},{"name":"Prometheus","proficiency_level":2,"is_required":false,"importance":"preferred"}]',
        experience_min: 3,
        experience_max: 8,
        experience_level: 'senior',
        education_required: '{"minimum_degree":"Bachelor\'s Degree","fields_of_study":["Computer Science","Information Technology","Systems Engineering"],"is_degree_required":true,"certifications":["AWS Solutions Architect","CKA (Certified Kubernetes Administrator)"],"additional_requirements":["Experience with high-traffic systems"]}',
        screening_questions: '[{"question":"What cloud platforms have you worked with?","type":"text","required":true},{"question":"Describe your experience with CI/CD pipelines.","type":"text","required":true},{"question":"Are you comfortable with on-call rotations?","type":"yes_no","required":true}]',
        application_instructions: 'Please submit your resume and links to any open-source contributions or GitHub repositories.',
        documents: '["Resume","GitHub Profile","Certifications"]',
        department_info: 'Infrastructure Engineering Department',
        tags: ['DevOps', 'Cloud', 'Kubernetes', 'AWS', 'CI/CD'],
        application_limit: 100,
        metadata: '{"priority":"medium","remote_level":"fully_remote","team_size":8,"reporting_to":"Infrastructure Manager","hiring_urgency":"medium","on_call_required":true}',
      },
    ];

    for (const t of jobTemplates) {
      await client.query(
        `
        INSERT INTO jobs (
          id, company_id, title, slug, department, team, job_type, work_arrangement,
          locations, description, summary, responsibilities, qualifications,
          preferred_qualifications, requirements, salary_min, salary_max,
          salary_currency, salary_period, salary_visible, benefits, skills_required,
          skills_preferred, experience_min, experience_max, experience_level,
          education_required, screening_questions, application_instructions,
          documents, department_info, tags, application_limit,
          status, visibility, published_at, expires_at,
          created_at, updated_at, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9::JSONB, $10, $11, $12::JSONB, $13,
          $14, $15::JSONB, $16, $17,
          'USD', 'year', true, $18::JSONB, $19::JSONB,
          $20::JSONB, $21, $22, $23,
          $24::JSONB, $25::JSONB, $26,
          $27::JSONB, $28, $29, $30,
          'active', 'public', NOW(), NOW() + INTERVAL '30 days',
          NOW(), NOW(), $31::JSONB
        )
        ON CONFLICT (id) DO UPDATE SET
          title               = EXCLUDED.title,
          slug                = EXCLUDED.slug,
          description         = EXCLUDED.description,
          salary_min          = EXCLUDED.salary_min,
          salary_max          = EXCLUDED.salary_max,
          status              = EXCLUDED.status,
          published_at        = COALESCE(jobs.published_at, EXCLUDED.published_at),
          expires_at          = COALESCE(jobs.expires_at, EXCLUDED.expires_at),
          updated_at          = NOW()
        `,
        [
          t.id, defaultCompanyId, t.title, t.slug, t.department, t.team, t.job_type, t.work_arrangement,
          t.locations, t.description, t.summary, t.responsibilities, t.qualifications,
          t.preferred_qualifications, t.requirements, t.salary_min, t.salary_max,
          t.benefits, t.skills_required,
          t.skills_preferred, t.experience_min, t.experience_max, t.experience_level,
          t.education_required, t.screening_questions, t.application_instructions,
          t.documents, t.department_info, t.tags, t.application_limit,
          t.metadata,
        ]
      );
      logger.info(`Job template upserted: ${t.title}`);
    }

    // =====================================================
    // USERS
    // =====================================================
    logger.info('Seeding users...');
    const hashedPassword = await bcrypt.hash('password123', 12);

    type SeedUser = {
      email: string;
      user_type: 'system_admin' | 'recruiter' | 'company_admin' | 'candidate';
    };

    const seedUsers: SeedUser[] = [
      { email: 'admin@recruitment.com', user_type: 'system_admin' },
      { email: 'danieltn889@gmail.com', user_type: 'recruiter' },
      { email: 'turikumwenimanadaniel0@gmail.com', user_type: 'company_admin' },
      { email: 'turikumwenimanadaniel727@gmail.com', user_type: 'candidate' },
      { email: 'candidate2@email.com', user_type: 'candidate' },
      { email: 'candidate3@email.com', user_type: 'candidate' },
    ];

    for (const u of seedUsers) {
      await client.query(
        `
        INSERT INTO users (
          email, password_hash, user_type, status,
          two_factor_enabled, created_at, updated_at
        )
        VALUES ($1, $2, $3, 'verified', false, NOW(), NOW())
        ON CONFLICT (email) DO UPDATE SET
          user_type = EXCLUDED.user_type,
          status = 'verified',
          updated_at = NOW()
        `,
        [u.email, hashedPassword, u.user_type]
      );
    }
    logger.info('Users upserted');

    // =====================================================
    // COMPANIES
    // =====================================================
    logger.info('Seeding companies...');

    type SeedCompany = {
      name: string;
      legal_name: string;
      slug: string;
      industry: string;
      size: string;
      founded_year: number;
      location: string;
      website: string;
      description: string;
    };

    const seedCompanies: SeedCompany[] = [
      {
        name: 'TechCorp Solutions', legal_name: 'TechCorp Solutions Inc.',
        slug: 'techcorp-solutions', industry: 'Technology', size: '51-200', founded_year: 2018,
        location: '{"country":"USA","city":"San Francisco","state":"CA"}',
        website: 'https://techcorp.com',
        description: 'Leading technology solutions provider specializing in AI and cloud computing.',
      },
      {
        name: 'InnovateLabs', legal_name: 'InnovateLabs LLC',
        slug: 'innovatelabs', industry: 'Software Development', size: '11-50', founded_year: 2020,
        location: '{"country":"Canada","city":"Toronto","state":"ON"}',
        website: 'https://innovatelabs.ca',
        description: 'Cutting-edge software development company focused on innovative solutions.',
      },
    ];

    for (const c of seedCompanies) {
      await client.query(
        `
        INSERT INTO companies (
          name, legal_name, slug, industry, size, founded_year,
          headquarters_location, website, description,
          verification_status, verification_badge, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB, $8, $9, 'verified', true, NOW(), NOW())
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = NOW()
        `,
        [c.name, c.legal_name, c.slug, c.industry, c.size, c.founded_year,
         c.location, c.website, c.description]
      );
    }
    logger.info('Companies upserted');

    // =====================================================
    // COMPANY TEAM
    // =====================================================
    logger.info('Seeding company team members...');

    const techCorpRes = await client.query(`SELECT id FROM companies WHERE slug = 'techcorp-solutions'`);
    const techCorpId: string | undefined = techCorpRes.rows[0]?.id;

    if (techCorpId) {
      type TeamMemberSeed = {
        email: string;
        role: 'admin' | 'recruiter' | 'reviewer' | 'viewer';
        name: string;
        title: string;
      };

      const teamMembers: TeamMemberSeed[] = [
        { email: 'danieltn889@gmail.com', role: 'recruiter', name: 'Daniel TN', title: 'Senior Recruiter' },
        { email: 'turikumwenimanadaniel0@gmail.com', role: 'admin', name: 'Daniel Company Admin', title: 'Company Administrator' },
      ];

      for (const m of teamMembers) {
        const userRes = await client.query(`SELECT id FROM users WHERE email = $1`, [m.email]);
        const userId: string | undefined = userRes.rows[0]?.id;

        if (!userId) {
          logger.warn(`User not found for team member: ${m.email}`);
          continue;
        }

        await client.query(
          `
          INSERT INTO company_team (
            company_id, user_id, role, name, title, email,
            joined_at, created_at, updated_at, display_on_profile
          )
          SELECT $1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW(), true
          WHERE NOT EXISTS (
            SELECT 1 FROM company_team 
            WHERE company_id = $1 AND user_id = $2
          )
          `,
          [techCorpId, userId, m.role, m.name, m.title, m.email]
        );
      }
    }
    logger.info('Company team upserted');

    // =====================================================
    // CANDIDATE PROFILES
    // =====================================================
    logger.info('Seeding candidate profiles...');

    const candidateProfiles: SeedCandidateProfile[] = [
      { firstName: 'John', lastName: 'Doe', country: 'USA', city: 'New York', timezone: 'America/New_York', profileCompletion: 85, summary: 'Experienced software developer with 5+ years in full-stack development.' },
      { firstName: 'Jane', lastName: 'Smith', country: 'Canada', city: 'Toronto', timezone: 'America/Toronto', profileCompletion: 90, summary: 'Passionate about creating innovative solutions and leading development teams.' },
      { firstName: 'Mike', lastName: 'Johnson', country: 'UK', city: 'London', timezone: 'Europe/London', profileCompletion: 75, summary: 'Full-stack developer specializing in React and Node.js applications.' },
    ];

    const candidateUsersRes = await client.query(`
      SELECT id FROM users WHERE user_type = 'candidate' ORDER BY created_at ASC
    `);

    for (let i = 0; i < candidateUsersRes.rows.length; i++) {
      const userId: string = candidateUsersRes.rows[i].id;
      const profile: SeedCandidateProfile = candidateProfiles[i] || {
        firstName: `Candidate`,
        lastName: `${i + 1}`,
        country: 'USA',
        city: 'Unknown',
        timezone: 'UTC',
        profileCompletion: 50,
        summary: 'Profile pending completion.',
      };

      await client.query(
        `
        INSERT INTO candidate_profiles (
          user_id, first_name, last_name, phone, country, city,
          timezone, profile_completion, summary, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          country = EXCLUDED.country,
          city = EXCLUDED.city,
          timezone = EXCLUDED.timezone,
          profile_completion = EXCLUDED.profile_completion,
          summary = EXCLUDED.summary,
          updated_at = NOW()
        `,
        [
          userId,
          profile.firstName,
          profile.lastName,
          `+1-555-010${i}`,
          profile.country,
          profile.city,
          profile.timezone,
          profile.profileCompletion,
          profile.summary,
        ]
      );
    }
    logger.info('Candidate profiles upserted');

    // =====================================================
    // SKILLS
    // =====================================================
    logger.info('Seeding skills...');

    type SeedSkill = { name: string; category: string; skill_type: string };

    const skills: SeedSkill[] = [
      { name: 'JavaScript', category: 'Programming Languages', skill_type: 'technical' },
      { name: 'TypeScript', category: 'Programming Languages', skill_type: 'technical' },
      { name: 'React', category: 'Frontend Frameworks', skill_type: 'technical' },
      { name: 'Node.js', category: 'Backend Frameworks', skill_type: 'technical' },
      { name: 'Python', category: 'Programming Languages', skill_type: 'technical' },
      { name: 'AWS', category: 'Cloud Platforms', skill_type: 'tool' },
      { name: 'Docker', category: 'DevOps Tools', skill_type: 'tool' },
      { name: 'Kubernetes', category: 'DevOps Tools', skill_type: 'tool' },
      { name: 'Terraform', category: 'DevOps Tools', skill_type: 'tool' },
      { name: 'Product Strategy', category: 'Product Management', skill_type: 'soft' },
      { name: 'Agile Methodologies', category: 'Project Management', skill_type: 'soft' },
      { name: 'Market Research', category: 'Product Management', skill_type: 'soft' },
      { name: 'SQL', category: 'Databases', skill_type: 'technical' },
      { name: 'Git', category: 'Version Control', skill_type: 'tool' },
      { name: 'GitHub Actions', category: 'CI/CD', skill_type: 'tool' },
    ];

    for (const s of skills) {
      await client.query(
        `
        INSERT INTO skills (name, category, skill_type, is_verified, created_at, updated_at)
        VALUES ($1, $2, $3, true, NOW(), NOW())
        ON CONFLICT (name) DO UPDATE SET
          category = EXCLUDED.category,
          skill_type = EXCLUDED.skill_type,
          updated_at = NOW()
        `,
        [s.name, s.category, s.skill_type]
      );
    }
    logger.info('Skills upserted');

    // =====================================================
    // GITHUB CONNECTIONS
    // =====================================================
    logger.info('Seeding GitHub connections...');

    const allCandidatesRes = await client.query(`
      SELECT id, email FROM users WHERE user_type = 'candidate'
    `);

    for (const candidate of allCandidatesRes.rows) {
      const githubUsername = candidate.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
      
      await client.query(`
        INSERT INTO github_connections (user_id, github_username, connected_at, last_synced_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          github_username = EXCLUDED.github_username,
          last_synced_at = NOW()
      `, [candidate.id, githubUsername]);
    }
    logger.info('GitHub connections seeded');

    // =====================================================
    // SIMULATION TEMPLATE with GitHub tasks
    // =====================================================
    logger.info('Seeding GitHub-based simulation template...');

    const simulationTemplateId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    
    await client.query(`
      INSERT INTO simulation_templates (
        id, company_id, name, slug, description, type, difficulty, 
        duration_minutes, tasks, scoring_rubric, pass_fail_criteria, is_public, is_active, created_at, updated_at
      )
      VALUES (
        $1, $2, 'GitHub Developer Assessment', 'github-dev-assessment',
        'Complete a series of GitHub-based development tasks to demonstrate your skills.',
        'technical', 'intermediate', 120,
        '[
          {
            "task_index": 1,
            "task_name": "Fork and Clone Repository",
            "task_type": "github_setup",
            "description": "Fork the provided repository and clone it to your local machine.",
            "requires_github_repo": true,
            "instructions": "1. Fork the repository\\n2. Clone your fork\\n3. Verify setup"
          },
          {
            "task_index": 2,
            "task_name": "Fix Bug and Commit",
            "task_type": "code_fix",
            "description": "Fix the authentication bug in the codebase.",
            "requires_github_repo": true,
            "min_commits": 1,
            "depends_on": 1
          },
          {
            "task_index": 3,
            "task_name": "Write Unit Tests",
            "task_type": "testing",
            "description": "Write unit tests for the authentication module.",
            "requires_github_repo": true,
            "min_commits": 1,
            "depends_on": 2,
            "min_score": 80
          },
          {
            "task_index": 4,
            "task_name": "Create Pull Request",
            "task_type": "github_pr",
            "description": "Create a Pull Request with your changes.",
            "requires_pr": true,
            "depends_on": 3
          }
        ]'::JSONB,
        '{"passing_score": 70, "weights": {"technical": 40, "communication": 30, "github_usage": 30}}'::JSONB,
        '{"passing_score": 70, "min_tasks_completed": 3}'::JSONB,
        true, true, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        tasks = EXCLUDED.tasks,
        updated_at = NOW()
    `, [simulationTemplateId, defaultCompanyId]);

    logger.info('Simulation template seeded');

    // =====================================================
    // SIMULATION for candidate
    // =====================================================
    logger.info('Seeding simulation for candidate...');

    const targetCandidate = await client.query(`
      SELECT id FROM users WHERE email = 'turikumwenimanadaniel727@gmail.com'
    `);
    
    const candidateId = targetCandidate.rows[0]?.id;

    if (candidateId) {
      const simulationId = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
      
      await client.query(`
        INSERT INTO simulations (
          id, template_id, user_id, status, tasks, created_at, updated_at
        )
        VALUES ($1, $2, $3, 'scheduled', 
          '[
            {"task_index": 1, "task_name": "Fork and Clone Repository", "status": "pending"},
            {"task_index": 2, "task_name": "Fix Bug and Commit", "status": "locked"},
            {"task_index": 3, "task_name": "Write Unit Tests", "status": "locked"},
            {"task_index": 4, "task_name": "Create Pull Request", "status": "locked"}
          ]'::JSONB,
          NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          updated_at = NOW()
      `, [simulationId, simulationTemplateId, candidateId]);
      
      logger.info('Simulation seeded for candidate');
    }

    // =====================================================
    // TASK DEPENDENCIES
    // =====================================================
    logger.info('Seeding task dependencies...');

    const tasksResult = await client.query(`
      SELECT id, task_index FROM simulation_tasks WHERE simulation_id = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
    `);

    const tasksMap = new Map();
    for (const task of tasksResult.rows) {
      tasksMap.set(task.task_index, task.id);
    }

    if (tasksMap.size >= 4) {
      const dependencies = [
        { taskIdx: 2, dependsOn: 1, type: 'completion' },
        { taskIdx: 3, dependsOn: 2, type: 'score_minimum', minScore: 80 },
        { taskIdx: 4, dependsOn: 3, type: 'completion' },
      ];

      for (const dep of dependencies) {
        await client.query(`
          INSERT INTO task_dependencies (
            simulation_id, task_id, depends_on_task_id, dependency_type, min_score_required
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (task_id, depends_on_task_id) DO NOTHING
        `, [
          'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          tasksMap.get(dep.taskIdx),
          tasksMap.get(dep.dependsOn),
          dep.type,
          dep.minScore || null
        ]);
      }
      logger.info('Task dependencies seeded');
    }

    // =====================================================
    // SUBSCRIPTION PLANS
    // =====================================================
    logger.info('Seeding subscription plans...');

    type SeedPlan = {
      name: string;
      slug: string;
      description: string;
      features: string;
      limits: string;
      price_monthly: number;
      price_yearly: number;
      currency: string;
      sort_order: number;
    };

    const plans: SeedPlan[] = [
      {
        name: 'Starter', slug: 'starter',
        description: 'For small teams getting started',
        features: '{"max_team_members":5,"active_jobs":10,"simulations_per_month":50,"basic_analytics":true}',
        limits: '{"users":5,"active_jobs":10,"simulations_per_month":50,"api_calls_per_day":1000}',
        price_monthly: 49, price_yearly: 490, currency: 'USD', sort_order: 1,
      },
      {
        name: 'Professional', slug: 'professional',
        description: 'For growing recruitment teams',
        features: '{"max_team_members":20,"active_jobs":50,"simulations_per_month":200,"advanced_analytics":true,"ai_scoring":true,"api_access":true}',
        limits: '{"users":20,"active_jobs":50,"simulations_per_month":200,"api_calls_per_day":10000}',
        price_monthly: 149, price_yearly: 1490, currency: 'USD', sort_order: 2,
      },
      {
        name: 'Enterprise', slug: 'enterprise',
        description: 'For large organizations with custom needs',
        features: '{"unlimited_team_members":true,"unlimited_active_jobs":true,"unlimited_simulations":true,"enterprise_analytics":true,"blockchain_verification":true,"custom_integrations":true,"dedicated_support":true}',
        limits: '{"users":-1,"active_jobs":-1,"simulations_per_month":-1,"api_calls_per_day":100000}',
        price_monthly: 499, price_yearly: 4990, currency: 'USD', sort_order: 3,
      },
    ];

    for (const p of plans) {
      await client.query(
        `
        INSERT INTO subscription_plans (
          name, slug, description, features, limits,
          price_monthly, price_yearly, currency, is_public, sort_order,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4::JSONB, $5::JSONB, $6, $7, $8, true, $9, NOW(), NOW())
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          price_monthly = EXCLUDED.price_monthly,
          price_yearly = EXCLUDED.price_yearly,
          updated_at = NOW()
        `,
        [p.name, p.slug, p.description, p.features, p.limits,
         p.price_monthly, p.price_yearly, p.currency, p.sort_order]
      );
    }
    logger.info('Subscription plans upserted');

    // =====================================================
    // AI SCORING WEIGHTS
    // =====================================================
    logger.info('Seeding AI scoring weights...');

    await client.query(`
      INSERT INTO ai_scoring_weights (weights)
      SELECT '{
        "technical": 15,
        "communication": 15,
        "problemSolving": 20,
        "adaptability": 10,
        "collaboration": 10,
        "attentionToDetail": 10,
        "initiative": 10,
        "punctuality": 10
      }'::JSONB
      WHERE NOT EXISTS (SELECT 1 FROM ai_scoring_weights LIMIT 1)
    `);
    logger.info('AI scoring weights seeded');

    // =====================================================
    // FAQS
    // =====================================================
    logger.info('Seeding FAQs...');

    type SeedFaq = { question: string; answer: string; category: string; helpful_count: number };

    const faqs: SeedFaq[] = [
      { question: 'How do I create a job posting?', answer: 'Go to the Jobs section and click "Create Job". Fill in the required fields and publish.', category: 'Jobs', helpful_count: 45 },
      { question: 'How do I search for candidates?', answer: 'Use the Candidates section with filters for skills, location, and experience.', category: 'Candidates', helpful_count: 67 },
      { question: 'What payment methods do you accept?', answer: 'We accept credit cards, PayPal, and bank transfers for subscription payments.', category: 'Billing', helpful_count: 30 },
      { question: 'How do I reset my password?', answer: 'Click "Forgot Password" on the login page and follow the email instructions.', category: 'Account', helpful_count: 25 },
      { question: 'How do I create an account?', answer: 'Click the "Sign Up" button in the top right corner and follow the instructions.', category: 'Account', helpful_count: 80 },
      { question: 'How do I apply for a job?', answer: 'Browse available jobs, click on a position, and click "Apply Now". You can apply with your saved profile.', category: 'Applications', helpful_count: 72 },
      { question: 'What are virtual work simulations?', answer: 'Simulations are realistic job tasks that allow you to demonstrate your skills. They take 30-60 minutes.', category: 'Simulations', helpful_count: 55 },
      { question: 'How are my simulation results used?', answer: 'Your results are shared with recruiters. You can also share verified results with other employers.', category: 'Privacy', helpful_count: 40 },
      { question: 'How do I connect my GitHub account?', answer: 'Go to your profile settings and click "Connect GitHub". You will be redirected to authorize the connection.', category: 'GitHub', helpful_count: 35 },
      { question: 'How does GitHub-based assessment work?', answer: 'You will complete tasks in your own GitHub repository. Our system analyzes your commits, PRs, and code quality.', category: 'Simulations', helpful_count: 28 },
    ];

    for (const f of faqs) {
      const existingFaq = await client.query(
        `SELECT id FROM faqs WHERE question = $1`,
        [f.question]
      );
      
      if (existingFaq.rows.length > 0) {
        await client.query(
          `
          UPDATE faqs 
          SET answer = $1, 
              category = $2, 
              helpful_count = $3,
              updated_at = NOW()
          WHERE question = $4
          `,
          [f.answer, f.category, f.helpful_count, f.question]
        );
      } else {
        await client.query(
          `
          INSERT INTO faqs (
            question, answer, category, is_published, 
            helpful_count, not_helpful_count, sort_order, 
            created_at, updated_at
          )
          VALUES ($1, $2, $3, true, $4, 0, 0, NOW(), NOW())
          `,
          [f.question, f.answer, f.category, f.helpful_count]
        );
      }
    }
    logger.info('FAQs upserted');

    // =====================================================
    // SYSTEM ANNOUNCEMENTS
    // =====================================================
    logger.info('Seeding system announcements...');

    type SeedAnnouncement = {
      title: string;
      content: string;
      announcement_type: string;
      severity: string;
      target_audience: string;
    };

    const announcements: SeedAnnouncement[] = [
      {
        title: 'Welcome to Recruitment Platform',
        content: 'Welcome to our comprehensive recruitment platform. Explore all features and get started with your first job posting!',
        announcement_type: 'general', severity: 'info', target_audience: 'all',
      },
      {
        title: 'New GitHub Integration Available',
        content: 'You can now assess candidates through GitHub-based simulations! Connect your GitHub account to get started.',
        announcement_type: 'feature', severity: 'info', target_audience: 'all',
      },
      {
        title: 'AI-Powered Scoring Now Live',
        content: 'Our new AI scoring system provides more accurate candidate assessments based on code quality and behavior.',
        announcement_type: 'feature', severity: 'info', target_audience: 'recruiters',
      },
    ];

    for (const a of announcements) {
      const existingAnnouncement = await client.query(
        `SELECT id FROM system_announcements WHERE title = $1`,
        [a.title]
      );
      
      if (existingAnnouncement.rows.length === 0) {
        await client.query(
          `
          INSERT INTO system_announcements (
            title, content, announcement_type, severity, target_audience,
            channels, published_at, expires_at, created_at
          )
          VALUES ($1, $2, $3, $4, $5, ARRAY['email', 'in_app']::TEXT[], NOW(), NOW() + INTERVAL '30 days', NOW())
          `,
          [a.title, a.content, a.announcement_type, a.severity, a.target_audience]
        );
      }
    }
    logger.info('System announcements upserted');

    // =====================================================
    // COMMIT
    // =====================================================
    await client.query('COMMIT');
    logger.info('✅ Database seeding completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Seeding failed, rolled back:', error);
    throw error;
  } finally {
    await client.end();
  }
};

// =====================================================
// ENTRYPOINT
// =====================================================
const seed = async (): Promise<void> => {
  try {
    logger.info('Starting database seeding...');
    await seedDatabase();
  } catch (error) {
    logger.error('Seeding process failed:', error);
    process.exit(1);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}

export { seed };