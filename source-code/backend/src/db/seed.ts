import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type SeedCandidateProfile = {
  firstName: string;
  lastName: string;
  country: string;
  city: string;
  timezone: string;
  profileCompletion: number;
  summary: string;
};

type CandidateRow = {
  id: string;
  email: string;
};

type UserRow = {
  id: string;
  email: string;
  user_type: string;
};

type CompanyRow = {
  id: string;
};

const seedDatabase = async (): Promise<void> => {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '8090'),
    database: process.env.DB_NAME || 'SVWR-CFE_DB',
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
      { table: 'candidate_profiles', partition: 'user_id'},
      { table: 'company_team', partition: 'company_id, user_id'},
      { table: 'user_skills', partition: 'user_id, skill_id'},
      { table: 'education', partition: 'user_id, institution, degree, field_of_study, start_date, end_date'},
      { table: 'work_experience', partition: 'user_id, company, title, start_date, end_date'},
      { table: 'jobs', partition: 'company_id, title'},
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

    const defaultCompanyRes = await client.query<CompanyRow>(`
      INSERT INTO companies (
        id, name, legal_name, slug, industry, size, founded_year,
        headquarters_location, website, description, verification_status,
        verification_badge, created_at, updated_at
      )
      VALUES (
        'c45f052d-e9f3-496e-bf1e-c5164df32b61'::UUID,
        'Normal Company', 'Normal Company Inc.', 'normal-company',
        'Technology', '51-200', 2020,
        '{"country": "USA", "city": "San Francisco", "state": "CA"}'::JSONB,
        'https://normalcompany.com',
        'Default company for job templates and system use.',
        'verified', true, NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        updated_at = EXCLUDED.updated_at
      RETURNING id
    `);

    const defaultCompanyId = defaultCompanyRes.rows[0]?.id;
    if (!defaultCompanyId) {
      throw new Error('Failed to get or create default company');
    }
    logger.info(`Default company id: ${defaultCompanyId}`);

    // =====================================================
    // JOB TEMPLATES - UPDATED WITH COMPLETE STRUCTURE
    // =====================================================
    logger.info('Seeding job templates with complete education_required structure...');

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
      salary_currency: string;
      salary_period: string;
      salary_visible: boolean;
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
        qualifications: "Bachelor's Degree in Computer Science or related field",
        preferred_qualifications: "Master's degree preferred",
        requirements: '["3+ years of software development experience","Proficiency in JavaScript/TypeScript","Experience with React and Node.js","Strong problem-solving skills","Experience with Git and version control"]',
        salary_min: 80000,
        salary_max: 120000,
        salary_currency: 'USD',
        salary_period: 'year',
        salary_visible: true,
        benefits: '["Health Insurance","401k Matching","Flexible Hours","Remote Work Options","Paid Time Off","Professional Development Budget"]',
        skills_required: '[{"name":"JavaScript","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"React","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"Node.js","proficiency_level":3,"is_required":true,"importance":"required"}]',
        skills_preferred: '[{"name":"Python","proficiency_level":3,"is_required":false,"importance":"preferred"},{"name":"AWS","proficiency_level":2,"is_required":false,"importance":"preferred"}]',
        experience_min: 3,
        experience_max: 7,
        experience_level: 'senior',
        // UPDATED: Complete education_required structure matching frontend
        education_required: JSON.stringify({
          minimum_degree: "Bachelor's Degree",
          qualification_entries: [
            {
              degree: "Bachelor's Degree",
              fields_of_study: ["Computer Science", "Software Engineering", "Information Technology"]
            },
            {
              degree: "Master's Degree",
              fields_of_study: ["Computer Science", "Data Science"]
            }
          ],
          certifications: ["AWS Certified Developer", "Microsoft Certified: Azure Developer"],
          languages: [
            { name: "English", proficiency: "professional", is_required: true },
            { name: "Spanish", proficiency: "basic", is_required: false }
          ],
          experience_requirements: [
            { title: "Software Development", years: "3", description: "in a professional environment" },
            { title: "Team Leadership", years: "1", description: "leading small teams" }
          ],
          age_requirement: "18+",
          is_degree_required: true,
          no_experience_needed: false,
          no_languages_needed: false,
          no_certifications_needed: false,
          no_documents_needed: false
        }),
        screening_questions: JSON.stringify([
          { question: "Why are you interested in this position?", type: "text", required: true, scoring_weight: 1 },
          { question: "How many years of React experience do you have?", type: "number", required: true, scoring_weight: 2 },
          { question: "Are you legally authorized to work in this country?", type: "yes_no", required: true, scoring_weight: 1 },
          { question: "What is your expected salary range?", type: "text", required: false, scoring_weight: 1 }
        ]),
        application_instructions: JSON.stringify({
          method: "platform",
          instructions: "Please submit your resume and a cover letter explaining your experience. Include links to your GitHub profile and portfolio if available.",
          documents: ["Resume", "Cover Letter", "Portfolio Links"]
        }),
        documents: '["Resume","Cover Letter","Portfolio Links"]',
        department_info: 'Engineering Department - Frontend Team',
        tags: ['React', 'JavaScript', 'Frontend', 'Web Development', 'Full Stack'],
        application_limit: 200,
        metadata: '{"priority":"high","remote_level":"hybrid","team_size":10,"hiring_urgency":"medium"}',
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
        qualifications: "Bachelor's Degree in Business, Marketing, or related field",
        preferred_qualifications: "MBA or Product Management certification",
        requirements: '["5+ years of product management experience","Experience with agile development methodologies","Strong analytical and communication skills","Technical background preferred","Experience with product analytics tools"]',
        salary_min: 100000,
        salary_max: 150000,
        salary_currency: 'USD',
        salary_period: 'year',
        salary_visible: true,
        benefits: '["Health Insurance","Stock Options","Unlimited PTO","Remote Work Stipend","Wellness Budget","Learning & Development Allowance"]',
        skills_required: '[{"name":"Product Strategy","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"Agile Methodologies","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"Market Research","proficiency_level":3,"is_required":true,"importance":"required"}]',
        skills_preferred: '[{"name":"Data Analysis","proficiency_level":3,"is_required":false,"importance":"preferred"},{"name":"SQL","proficiency_level":2,"is_required":false,"importance":"preferred"},{"name":"UI/UX Design","proficiency_level":2,"is_required":false,"importance":"preferred"}]',
        experience_min: 5,
        experience_max: 10,
        experience_level: 'senior',
        // UPDATED: Complete education_required structure
        education_required: JSON.stringify({
          minimum_degree: "Bachelor's Degree",
          qualification_entries: [
            {
              degree: "Bachelor's Degree",
              fields_of_study: ["Business Administration", "Marketing", "Computer Science"]
            },
            {
              degree: "Master of Business Administration (MBA)",
              fields_of_study: ["Product Management", "Strategic Management"]
            }
          ],
          certifications: ["Certified Scrum Product Owner (CSPO)", "Product Management Certification"],
          languages: [
            { name: "English", proficiency: "professional", is_required: true }
          ],
          experience_requirements: [
            { title: "Product Management", years: "5", description: "in SaaS or technology products" },
            { title: "Team Leadership", years: "2", description: "leading cross-functional teams" }
          ],
          is_degree_required: true,
          no_experience_needed: false,
          no_languages_needed: false,
          no_certifications_needed: false,
          no_documents_needed: false
        }),
        screening_questions: JSON.stringify([
          { question: "What product are you most proud of launching?", type: "text", required: true, scoring_weight: 2 },
          { question: "How do you prioritize features?", type: "text", required: true, scoring_weight: 2 },
          { question: "How many years of product management experience do you have?", type: "number", required: true, scoring_weight: 1 }
        ]),
        application_instructions: JSON.stringify({
          method: "platform",
          instructions: "Please submit your resume and a brief description of a successful product you've launched.",
          documents: ["Resume", "Product Portfolio", "Case Study"]
        }),
        documents: '["Resume","Product Portfolio","Case Study"]',
        department_info: 'Product Management Department',
        tags: ['Product', 'Management', 'Agile', 'Strategy', 'Roadmap'],
        application_limit: 150,
        metadata: '{"priority":"high","remote_level":"fully_remote","team_size":5,"hiring_urgency":"high"}',
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
        qualifications: "Bachelor's Degree in Computer Science or related field",
        preferred_qualifications: "Cloud certifications (AWS, Azure, GCP)",
        requirements: '["3+ years of DevOps or SRE experience","Experience with Docker and Kubernetes","Proficiency with AWS or Azure","Experience with CI/CD tools (Jenkins, GitLab CI, GitHub Actions)","Knowledge of infrastructure as code (Terraform, CloudFormation)"]',
        salary_min: 90000,
        salary_max: 140000,
        salary_currency: 'USD',
        salary_period: 'year',
        salary_visible: true,
        benefits: '["Health Insurance","401k Matching","Flexible Hours","Home Office Setup","Cloud Certification Reimbursement","On-call Bonus"]',
        skills_required: '[{"name":"AWS","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"Docker","proficiency_level":4,"is_required":true,"importance":"required"},{"name":"Kubernetes","proficiency_level":3,"is_required":true,"importance":"required"},{"name":"Terraform","proficiency_level":3,"is_required":true,"importance":"required"}]',
        skills_preferred: '[{"name":"Python","proficiency_level":3,"is_required":false,"importance":"preferred"},{"name":"GitHub Actions","proficiency_level":3,"is_required":false,"importance":"preferred"},{"name":"Prometheus","proficiency_level":2,"is_required":false,"importance":"preferred"}]',
        experience_min: 3,
        experience_max: 8,
        experience_level: 'senior',
        // UPDATED: Complete education_required structure
        education_required: JSON.stringify({
          minimum_degree: "Bachelor's Degree",
          qualification_entries: [
            {
              degree: "Bachelor's Degree",
              fields_of_study: ["Computer Science", "Information Technology", "Systems Engineering"]
            }
          ],
          certifications: ["AWS Solutions Architect", "CKA (Certified Kubernetes Administrator)"],
          languages: [],
          experience_requirements: [
            { title: "DevOps / SRE", years: "3", description: "in cloud infrastructure" },
            { title: "Kubernetes", years: "2", description: "in production environments" }
          ],
          is_degree_required: true,
          no_experience_needed: false,
          no_languages_needed: true,
          no_certifications_needed: false,
          no_documents_needed: false
        }),
        screening_questions: JSON.stringify([
          { question: "What cloud platforms have you worked with?", type: "text", required: true, scoring_weight: 2 },
          { question: "Describe your experience with CI/CD pipelines.", type: "text", required: true, scoring_weight: 2 },
          { question: "Are you comfortable with on-call rotations?", type: "yes_no", required: true, scoring_weight: 1 }
        ]),
        application_instructions: JSON.stringify({
          method: "platform",
          instructions: "Please submit your resume and links to any open-source contributions or GitHub repositories.",
          documents: ["Resume", "GitHub Profile", "Certifications"]
        }),
        documents: '["Resume","GitHub Profile","Certifications"]',
        department_info: 'Infrastructure Engineering Department',
        tags: ['DevOps', 'Cloud', 'Kubernetes', 'AWS', 'CI/CD'],
        application_limit: 100,
        metadata: '{"priority":"medium","remote_level":"fully_remote","team_size":8,"hiring_urgency":"medium","on_call_required":true}',
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
          $1::UUID, $2::UUID, $3::VARCHAR, $4::VARCHAR, $5::VARCHAR, $6::VARCHAR,
          $7::VARCHAR, $8::VARCHAR,
          $9::JSONB, $10::TEXT, $11::TEXT, $12::JSONB, $13::TEXT,
          $14::TEXT, $15::JSONB, $16::NUMERIC, $17::NUMERIC,
          $18::VARCHAR, $19::VARCHAR, $20::BOOLEAN,
          $21::JSONB, $22::JSONB, $23::JSONB,
          $24::INTEGER, $25::INTEGER, $26::VARCHAR,
          $27::JSONB, $28::JSONB, $29::JSONB,
          $30::JSONB, $31::TEXT, $32::TEXT[], $33::INTEGER,
          'active'::VARCHAR, 'public'::VARCHAR,
          NOW(), NOW() + INTERVAL '30 days',
          NOW(), NOW(), $34::JSONB
        )
        ON CONFLICT (id) DO UPDATE SET
          title              = EXCLUDED.title,
          slug               = EXCLUDED.slug,
          description        = EXCLUDED.description,
          salary_min         = EXCLUDED.salary_min,
          salary_max         = EXCLUDED.salary_max,
          salary_currency    = EXCLUDED.salary_currency,
          salary_period      = EXCLUDED.salary_period,
          salary_visible     = EXCLUDED.salary_visible,
          benefits           = EXCLUDED.benefits,
          skills_required    = EXCLUDED.skills_required,
          skills_preferred   = EXCLUDED.skills_preferred,
          education_required = EXCLUDED.education_required,
          screening_questions = EXCLUDED.screening_questions,
          application_instructions = EXCLUDED.application_instructions,
          documents          = EXCLUDED.documents,
          tags               = EXCLUDED.tags,
          status             = EXCLUDED.status,
          visibility         = EXCLUDED.visibility,
          published_at       = COALESCE(jobs.published_at, EXCLUDED.published_at),
          expires_at         = COALESCE(jobs.expires_at,   EXCLUDED.expires_at),
          updated_at         = NOW()
        `,
        [
          t.id, defaultCompanyId, t.title, t.slug, t.department, t.team,
          t.job_type, t.work_arrangement,
          t.locations, t.description, t.summary, t.responsibilities, t.qualifications,
          t.preferred_qualifications, t.requirements, t.salary_min, t.salary_max,
          t.salary_currency, t.salary_period, t.salary_visible,
          t.benefits, t.skills_required, t.skills_preferred,
          t.experience_min, t.experience_max, t.experience_level,
          t.education_required, t.screening_questions, t.application_instructions,
          t.documents, t.department_info, t.tags, t.application_limit,
          t.metadata,
        ]
      );
      logger.info(`Job template upserted: ${t.title}`);
    }

    // =====================================================
    // USERS (keep existing)
    // =====================================================
    logger.info('Seeding users...');
    const hashedPassword = await bcrypt.hash('password123', 12);

    type SeedUser = {
      email: string;
      user_type: 'system_admin'| 'recruiter'| 'company_admin'| 'candidate';
    };

    const seedUsers: SeedUser[] = [
      { email: 'admin@recruitment.com',                    user_type: 'system_admin'  },
      { email: 'danieltn889@gmail.com',                    user_type: 'recruiter'     },
      { email: 'turikumwenimanadaniel0@gmail.com',         user_type: 'company_admin' },
      { email: 'turikumwenimanadaniel727@gmail.com',       user_type: 'candidate'     },
      { email: 'candidate2@email.com',                     user_type: 'candidate'     },
      { email: 'candidate3@email.com',                     user_type: 'candidate'     },
    ];

    for (const u of seedUsers) {
      await client.query(
        `
        INSERT INTO users (
          email, password_hash, user_type, status,
          two_factor_enabled, created_at, updated_at
        )
        VALUES ($1::CITEXT, $2::VARCHAR, $3::VARCHAR, 'verified'::VARCHAR, false, NOW(), NOW())
        ON CONFLICT (email, user_type) DO NOTHING
        `,
        [u.email, hashedPassword, u.user_type]
      );
    }
    logger.info('Users seeded');

    // =====================================================
    // COMPANIES (keep existing)
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
        VALUES (
          $1::VARCHAR, $2::VARCHAR, $3::VARCHAR, $4::VARCHAR, $5::VARCHAR, $6::INTEGER,
          $7::JSONB, $8::VARCHAR, $9::TEXT,
          'verified'::VARCHAR, true, NOW(), NOW()
        )
        ON CONFLICT (slug) DO NOTHING
        `,
        [c.name, c.legal_name, c.slug, c.industry, c.size, c.founded_year,
         c.location, c.website, c.description]
      );
    }
    logger.info('Companies seeded');

    // =====================================================
    // COMPANY TEAM (keep existing)
    // =====================================================
    logger.info('Seeding company team members...');

    const techCorpRes = await client.query<CompanyRow>(
      `SELECT id FROM companies WHERE slug = $1::VARCHAR`,
      ['techcorp-solutions']
    );
    const techCorpId = techCorpRes.rows[0]?.id;

    if (techCorpId) {
      type TeamMemberSeed = {
        email: string;
        role: 'admin'| 'recruiter'| 'reviewer'| 'viewer';
        name: string;
        title: string;
      };

      const teamMembers: TeamMemberSeed[] = [
        { email: 'danieltn889@gmail.com',            role: 'recruiter', name: 'Daniel TN',            title: 'Senior Recruiter'     },
        { email: 'turikumwenimanadaniel0@gmail.com', role: 'admin',     name: 'Daniel Company Admin', title: 'Company Administrator'},
      ];

      for (const m of teamMembers) {
        const userRes = await client.query<CompanyRow>(
          `SELECT id FROM users WHERE email = $1::CITEXT`,
          [m.email]
        );
        const userId = userRes.rows[0]?.id;

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
          SELECT $1::UUID, $2::UUID, $3::VARCHAR, $4::VARCHAR, $5::VARCHAR, $6::VARCHAR,
                 NOW(), NOW(), NOW(), true
          WHERE NOT EXISTS (
            SELECT 1 FROM company_team
            WHERE company_id = $1::UUID AND user_id = $2::UUID
          )
          `,
          [techCorpId, userId, m.role, m.name, m.title, m.email]
        );
      }
    }
    logger.info('Company team seeded');

    // =====================================================
    // CANDIDATE PROFILES (keep existing)
    // =====================================================
    logger.info('Seeding candidate profiles...');

    const candidateProfiles: SeedCandidateProfile[] = [
      { firstName: 'John',  lastName: 'Doe',     country: 'USA',    city: 'New York', timezone: 'America/New_York', profileCompletion: 85, summary: 'Experienced software developer with 5+ years in full-stack development.'},
      { firstName: 'Jane',  lastName: 'Smith',   country: 'Canada', city: 'Toronto',  timezone: 'America/Toronto',  profileCompletion: 90, summary: 'Passionate about creating innovative solutions and leading development teams.'},
      { firstName: 'Mike',  lastName: 'Johnson', country: 'UK',     city: 'London',   timezone: 'Europe/London',    profileCompletion: 75, summary: 'Full-stack developer specializing in React and Node.js applications.'},
    ];

    const candidateUsersRes = await client.query<CompanyRow>(`
      SELECT id FROM users WHERE user_type = 'candidate'ORDER BY created_at ASC
    `);

    for (let i = 0; i < candidateUsersRes.rows.length; i++) {
      const row = candidateUsersRes.rows[i];
      if (!row) continue;
      
      const userId = row.id;
      const existingProfile = candidateProfiles[i];
      
      const profile: SeedCandidateProfile = existingProfile ?? {
        firstName: 'Candidate',
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
        VALUES (
          $1::UUID, $2::VARCHAR, $3::VARCHAR, $4::VARCHAR, $5::VARCHAR, $6::VARCHAR,
          $7::VARCHAR, $8::INTEGER, $9::TEXT, NOW(), NOW()
        )
        ON CONFLICT (user_id) DO NOTHING
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
    logger.info('Candidate profiles seeded');

    // =====================================================
    // SKILLS (keep existing)
    // =====================================================
    logger.info('Seeding skills...');

    type SeedSkill = { name: string; category: string; skill_type: string };

    const skills: SeedSkill[] = [
      { name: 'JavaScript',        category: 'Programming Languages', skill_type: 'technical'},
      { name: 'TypeScript',        category: 'Programming Languages', skill_type: 'technical'},
      { name: 'React',             category: 'Frontend Frameworks',   skill_type: 'technical'},
      { name: 'Node.js',           category: 'Backend Frameworks',    skill_type: 'technical'},
      { name: 'Python',            category: 'Programming Languages', skill_type: 'technical'},
      { name: 'AWS',               category: 'Cloud Platforms',       skill_type: 'tool'     },
      { name: 'Docker',            category: 'DevOps Tools',          skill_type: 'tool'     },
      { name: 'Kubernetes',        category: 'DevOps Tools',          skill_type: 'tool'     },
      { name: 'Terraform',         category: 'DevOps Tools',          skill_type: 'tool'     },
      { name: 'Product Strategy',  category: 'Product Management',    skill_type: 'soft'     },
      { name: 'Agile Methodologies', category: 'Project Management',  skill_type: 'soft'     },
      { name: 'Market Research',   category: 'Product Management',    skill_type: 'soft'     },
      { name: 'SQL',               category: 'Databases',             skill_type: 'technical'},
      { name: 'Git',               category: 'Version Control',       skill_type: 'tool'     },
      { name: 'GitHub Actions',    category: 'CI/CD',                 skill_type: 'tool'     },
    ];

    for (const s of skills) {
      await client.query(
        `
        INSERT INTO skills (name, category, skill_type, is_verified, created_at, updated_at)
        VALUES ($1::VARCHAR, $2::VARCHAR, $3::VARCHAR, true, NOW(), NOW())
        ON CONFLICT (name) DO NOTHING
        `,
        [s.name, s.category, s.skill_type]
      );
    }
    logger.info('Skills seeded');

    // =====================================================
    // COMPLETE CANDIDATE PROFILE   turikumwenimanadaniel727@gmail.com
    // Fully fills this candidate's profile (bio, links, education, experience,
    // skills, preferences) so they pass the 80% profile gate and receive job
    // feeds / can apply. Idempotent   safe to re-run.
    // =====================================================
    logger.info('Seeding complete profile for primary candidate...');

    const primaryCandRes = await client.query<CompanyRow>(
      `SELECT id FROM users WHERE email = $1::CITEXT`,
      ['turikumwenimanadaniel727@gmail.com']
    );
    const primaryCandId = primaryCandRes.rows[0]?.id;

    if (primaryCandId) {
      // 1) rich candidate_profiles (override the generic placeholder)
      await client.query(
        `
        INSERT INTO candidate_profiles (
          user_id, first_name, last_name, phone, country, city, timezone,
          date_of_birth, gender, linkedin_url, github_url, portfolio_url,
          willing_to_relocate, willing_to_travel, notice_period_days,
          expected_salary, currency, profile_completion, headline, summary,
          languages, job_preferences, availability, created_at, updated_at
        )
        VALUES (
          $1::UUID, 'Daniel', 'Turikumwenimana', '+250-788-000727', 'Rwanda', 'Kigali', 'Africa/Kigali',
          '1999-05-12'::DATE, 'male',
          'https://linkedin.com/in/daniel-turikumwenimana',
          'https://github.com/turikumwenimanadaniel727', 'https://daniel-portfolio.dev',
          true, true, 30,
          '{"min":40000,"max":60000,"period":"year"}'::JSONB, 'USD', 90,
          'Full-Stack Software Engineer',
          'Full-stack engineer with 4+ years building web apps using React, Node.js, TypeScript and PostgreSQL. Passionate about clean architecture, CI/CD, and shipping reliable products.',
          '["English","French","Kinyarwanda"]'::JSONB,
          '{"job_types":["full_time"],"locations":["Kigali","Remote"],"remote_preference":"hybrid","industries":["Software","FinTech"],"company_sizes":["startup","mid"],"employment_types":["full_time"]}'::JSONB,
          '{"status":"actively_looking","available_from":null,"notice_period":"1 month","open_to_opportunities":true}'::JSONB,
          NOW(), NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, phone=EXCLUDED.phone,
          country=EXCLUDED.country, city=EXCLUDED.city, timezone=EXCLUDED.timezone,
          date_of_birth=EXCLUDED.date_of_birth, gender=EXCLUDED.gender,
          linkedin_url=EXCLUDED.linkedin_url, github_url=EXCLUDED.github_url, portfolio_url=EXCLUDED.portfolio_url,
          willing_to_relocate=EXCLUDED.willing_to_relocate, willing_to_travel=EXCLUDED.willing_to_travel,
          notice_period_days=EXCLUDED.notice_period_days, expected_salary=EXCLUDED.expected_salary,
          currency=EXCLUDED.currency, profile_completion=EXCLUDED.profile_completion,
          headline=EXCLUDED.headline, summary=EXCLUDED.summary, languages=EXCLUDED.languages,
          job_preferences=EXCLUDED.job_preferences, availability=EXCLUDED.availability, updated_at=NOW()
        `,
        [primaryCandId]
      );

      // 2) education (fixed id → idempotent)
      await client.query(
        `
        INSERT INTO education (
          id, user_id, institution, degree, field_of_study, start_date, end_date,
          is_current, grade, grade_scale, description, display_order, created_at, updated_at
        )
        VALUES (
          'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380e01'::UUID, $1::UUID,
          'University of Rwanda', 'BSc', 'Computer Science',
          '2017-09-01'::DATE, '2021-07-01'::DATE, false, '4.0', 'GPA',
          'Graduated with honors. Focus on software engineering and data structures.', 1, NOW(), NOW()
        )
        ON CONFLICT (id) DO NOTHING
        `,
        [primaryCandId]
      );

      // 3) work experience (fixed id → idempotent; employment_type/location_type per CHECK)
      await client.query(
        `
        INSERT INTO work_experience (
          id, user_id, company, title, employment_type, location, location_type,
          start_date, end_date, is_current, description, achievements, skills,
          industry, display_order, created_at, updated_at
        )
        VALUES (
          'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380e02'::UUID, $1::UUID,
          'LMB Tech', 'Software Engineer', 'full-time', 'Kigali, Rwanda', 'hybrid',
          '2021-08-01'::DATE, NULL, true,
          'Full-stack software development of web applications using React, Node.js, TypeScript and PostgreSQL. Led a small team of engineers and mentored junior developers, providing technical leadership across delivery.',
          ARRAY['Cut API latency 40% via query optimization', 'Led migration to TypeScript', 'Led a small team of 4 engineers'],
          ARRAY['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Software Development', 'Team Leadership'],
          'Software', 1, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title, description=EXCLUDED.description,
          achievements=EXCLUDED.achievements, skills=EXCLUDED.skills, updated_at=NOW()
        `,
        [primaryCandId]
      );

      // 4) link proficiency skills to existing seeded skills
      await client.query(
        `
        INSERT INTO user_skills (user_id, skill_id, proficiency_level, years_experience, is_primary, verified, created_at, updated_at)
        SELECT $1::UUID, s.id, 4, 4, true, true, NOW(), NOW()
        FROM skills s
        WHERE s.name IN ('JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'SQL', 'Git', 'AWS', 'Docker')
        ON CONFLICT (user_id, skill_id) DO NOTHING
        `,
        [primaryCandId]
      );

      logger.info('Complete candidate profile seeded for turikumwenimanadaniel727@gmail.com');
    } else {
      logger.warn('Primary candidate not found   complete profile skipped');
    }

    // =====================================================
    // GITHUB CONNECTIONS (keep existing)
    // =====================================================
    logger.info('Seeding GitHub connections...');

    const allCandidatesRes = await client.query<CandidateRow>(`
      SELECT id, email FROM users WHERE user_type = 'candidate'
    `);

    for (const candidate of allCandidatesRes.rows) {
      const githubUsername = (candidate.email.split('@')[0] || '').replace(/[^a-zA-Z0-9]/g, '');

      await client.query(
        `
        INSERT INTO github_connections (user_id, github_username, connected_at, last_synced_at)
        VALUES ($1::UUID, $2::VARCHAR, NOW(), NOW())
        ON CONFLICT DO NOTHING
        `,
        [candidate.id, githubUsername]
      );
    }
    logger.info('GitHub connections seeded');

    // =====================================================
    // SUBSCRIPTION PLANS (keep existing)
    // =====================================================
    logger.info('Seeding subscription plans...');

    type SeedPlan = {
      name: string; slug: string; description: string;
      features: string; limits: string;
      price_monthly: number; price_yearly: number;
      currency: string; sort_order: number;
    };

    const plans: SeedPlan[] = [
      {
        name: 'Starter', slug: 'starter',
        description: 'For small teams getting started',
        features: '{"max_team_members":5,"active_jobs":10,"basic_analytics":true}',
        limits:   '{"users":5,"active_jobs":10,"api_calls_per_day":1000}',
        price_monthly: 49, price_yearly: 490, currency: 'USD', sort_order: 1,
      },
      {
        name: 'Professional', slug: 'professional',
        description: 'For growing recruitment teams',
        features: '{"max_team_members":20,"active_jobs":50,"advanced_analytics":true,"ai_scoring":true,"api_access":true}',
        limits:   '{"users":20,"active_jobs":50,"api_calls_per_day":10000}',
        price_monthly: 149, price_yearly: 1490, currency: 'USD', sort_order: 2,
      },
      {
        name: 'Enterprise', slug: 'enterprise',
        description: 'For large organizations with custom needs',
        features: '{"unlimited_team_members":true,"unlimited_active_jobs":true}',
        limits:   '{"users":-1,"active_jobs":-1,"api_calls_per_day":100000}',
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
        VALUES (
          $1::VARCHAR, $2::VARCHAR, $3::TEXT, $4::JSONB, $5::JSONB,
          $6::NUMERIC, $7::NUMERIC, $8::VARCHAR, true, $9::INTEGER,
          NOW(), NOW()
        )
        ON CONFLICT (slug) DO NOTHING
        `,
        [p.name, p.slug, p.description, p.features, p.limits,
         p.price_monthly, p.price_yearly, p.currency, p.sort_order]
      );
    }
    logger.info('Subscription plans seeded');

    // =====================================================
    // AI SCORING WEIGHTS (keep existing)
    // =====================================================
    logger.info('Seeding AI scoring weights...');

    await client.query(`
      INSERT INTO ai_scoring_weights (weights)
      SELECT '{
        "technical":15,"communication":15,"problemSolving":20,
        "adaptability":10,"collaboration":10,"attentionToDetail":10,
        "initiative":10,"punctuality":10
      }'::JSONB
      WHERE NOT EXISTS (SELECT 1 FROM ai_scoring_weights LIMIT 1)
    `);
    logger.info('AI scoring weights seeded');

    // =====================================================
    // FAQs (keep existing)
    // =====================================================
    logger.info('Seeding FAQs...');

    type SeedFaq = { question: string; answer: string; category: string; helpful_count: number };

    const faqs: SeedFaq[] = [
      { question: 'How do I create a job posting?',         answer: 'Go to the Jobs section and click "Create Job". Fill in the required fields and publish.',                                                           category: 'Jobs',         helpful_count: 45 },
      { question: 'How do I search for candidates?',        answer: 'Use the Candidates section with filters for skills, location, and experience.',                                                                     category: 'Candidates',   helpful_count: 67 },
      { question: 'What payment methods do you accept?',    answer: 'We accept credit cards, PayPal, and bank transfers for subscription payments.',                                                                     category: 'Billing',      helpful_count: 30 },
      { question: 'How do I reset my password?',            answer: 'Click "Forgot Password" on the login page and follow the email instructions.',                                                                      category: 'Account',      helpful_count: 25 },
      { question: 'How do I create an account?',            answer: 'Click the "Sign Up" button in the top right corner and follow the instructions.',                                                                   category: 'Account',      helpful_count: 80 },
      { question: 'How do I apply for a job?',              answer: 'Browse available jobs, click on a position, and click "Apply Now". You can apply with your saved profile.',                                         category: 'Applications', helpful_count: 72 },
      { question: 'How do I connect my GitHub account?',    answer: 'Go to your profile settings and click "Connect GitHub". You will be redirected to authorize the connection.',                                       category: 'GitHub',       helpful_count: 35 },
    ];

    for (const f of faqs) {
      await client.query(
        `
        INSERT INTO faqs (
          question, answer, category, is_published,
          helpful_count, not_helpful_count, sort_order,
          created_at, updated_at
        )
        SELECT $1::TEXT, $2::TEXT, $3::VARCHAR, true, $4::INTEGER, 0, 0, NOW(), NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM faqs WHERE question = $1::TEXT
        )
        `,
        [f.question, f.answer, f.category, f.helpful_count]
      );
    }
    logger.info('FAQs seeded');

    // =====================================================
    // SYSTEM ANNOUNCEMENTS (keep existing)
    // =====================================================
    logger.info('Seeding system announcements...');

    type SeedAnnouncement = {
      title: string; content: string;
      announcement_type: string; severity: string; target_audience: string;
    };

    const announcements: SeedAnnouncement[] = [
      {
        title: 'Welcome to Recruitment Platform',
        content: 'Welcome to our comprehensive recruitment platform. Explore all features and get started with your first job posting!',
        announcement_type: 'general', severity: 'info', target_audience: 'all',
      },
      {
        title: 'AI-Powered Scoring Now Live',
        content: 'Our new AI scoring system provides more accurate candidate assessments based on code quality and behavior.',
        announcement_type: 'feature', severity: 'info', target_audience: 'recruiters',
      },
    ];

    for (const a of announcements) {
      await client.query(
        `
        INSERT INTO system_announcements (
          title, content, announcement_type, severity, target_audience,
          channels, published_at, expires_at, created_at
        )
        SELECT
          $1::VARCHAR, $2::TEXT, $3::VARCHAR, $4::VARCHAR, $5::VARCHAR,
          ARRAY['email','in_app']::TEXT[],
          NOW(), NOW() + INTERVAL '30 days', NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM system_announcements WHERE title = $1::VARCHAR
        )
        `,
        [a.title, a.content, a.announcement_type, a.severity, a.target_audience]
      );
    }
    logger.info('System announcements seeded');

    // =====================================================
    // NOTIFICATION PREFERENCES (keep existing)
    // =====================================================
    logger.info('Seeding notification preferences...');

    const seededUsersRes = await client.query<UserRow>(`
      SELECT id, email, user_type
      FROM users
      WHERE email = ANY($1::CITEXT[])
      ORDER BY email
    `, [seedUsers.map(u => u.email)]);

    for (const user of seededUsersRes.rows) {
      await client.query(
        `
        INSERT INTO notification_preferences (
          user_id, email, sms, push, in_app, quiet_hours, updated_at
        )
        VALUES (
          $1::UUID,
          '{"application_updates":true,"messages":true,"security":true,"billing":true,"promotional":false}'::JSONB,
          '{"application_updates":false,"security":true,"billing":false}'::JSONB,
          '{"application_updates":true,"messages":true,"security":true}'::JSONB,
          '{"all":true}'::JSONB,
          '{"enabled":false,"start":"22:00","end":"07:00","timezone":"Africa/Kigali","days":["Monday","Tuesday","Wednesday","Thursday","Friday"]}'::JSONB,
          NOW()
        )
        ON CONFLICT (user_id) DO NOTHING
        `,
        [user.id]
      );
    }
    logger.info('Notification preferences seeded');

    // =====================================================
    // NOTIFICATIONS (keep existing)
    // =====================================================
    logger.info('Seeding notifications...');

    const userByEmail = new Map<string, string>(
      seededUsersRes.rows.map((u: UserRow) => [u.email, u.id])
    );

    type SeedNotification = {
      id: string;
      email: string;
      type: string;
      category: string;
      title: string;
      content: string;
      data: string;
      priority: string;
      channels: string[];
      status: string;
      sentOffset: string | null;
      deliveredOffset: string | null;
      readOffset: string | null;
    };

    const notifications: SeedNotification[] = [
      {
        id: '9a000001-9c0b-4ef8-bb6d-6bb9bd380a01',
        email: 'turikumwenimanadaniel727@gmail.com',
        type: 'application_submitted', category: 'application',
        title: 'Application submitted successfully',
        content: 'Your application for Software Engineer has been received.',
        data: '{"job_title":"Software Engineer","company":"Default Company","action_url":"/applications"}',
        priority: 'normal', channels: ['in_app', 'email'], status: 'delivered',
        sentOffset: '25 minutes', deliveredOffset: '24 minutes', readOffset: null,
      },
      {
        id: '9a000003-9c0b-4ef8-bb6d-6bb9bd380a03',
        email: 'danieltn889@gmail.com',
        type: 'new_candidate_match', category: 'application',
        title: 'New candidate match available',
        content: 'A candidate profile matches your active Software Engineer job posting.',
        data: '{"job_title":"Software Engineer","match_score":87}',
        priority: 'normal', channels: ['in_app'], status: 'read',
        sentOffset: '45 minutes', deliveredOffset: '44 minutes', readOffset: '30 minutes',
      },
      {
        id: '9a000004-9c0b-4ef8-bb6d-6bb9bd380a04',
        email: 'turikumwenimanadaniel0@gmail.com',
        type: 'security_notice', category: 'security',
        title: 'Security notice',
        content: 'A successful login was recorded for your company administrator account.',
        data: '{"event":"login_success","ip":"127.0.0.1","location":"Kigali, Rwanda"}',
        priority: 'high', channels: ['in_app', 'email'], status: 'delivered',
        sentOffset: '15 minutes', deliveredOffset: '14 minutes', readOffset: null,
      },
    ];

    for (const n of notifications) {
      const userId = userByEmail.get(n.email);
      if (!userId) continue;

      await client.query(
        `
        INSERT INTO notifications (
          id, user_id, type, category, title, content, data, priority,
          channels, status, sent_at, delivered_at, read_at, created_at, metadata
        )
        VALUES (
          $1::UUID, $2::UUID, $3::VARCHAR, $4::VARCHAR,
          $5::VARCHAR, $6::TEXT, $7::JSONB, $8::VARCHAR,
          $9::TEXT[], $10::VARCHAR,
          CASE WHEN $11::TEXT IS NULL THEN NULL ELSE NOW() - ($11::TEXT)::INTERVAL END,
          CASE WHEN $12::TEXT IS NULL THEN NULL ELSE NOW() - ($12::TEXT)::INTERVAL END,
          CASE WHEN $13::TEXT IS NULL THEN NULL ELSE NOW() - ($13::TEXT)::INTERVAL END,
          NOW(),
          '{"seeded":true}'::JSONB
        )
        ON CONFLICT (id) DO NOTHING
        `,
        [
          n.id, userId, n.type, n.category, n.title, n.content, n.data,
          n.priority, n.channels, n.status,
          n.sentOffset, n.deliveredOffset, n.readOffset,
        ]
      );
    }
    logger.info('Notifications seeded');

    // =====================================================
    // SECURITY ALERTS (keep existing)
    // =====================================================
    logger.info('Seeding security alerts...');

    type SeedSecurityAlert = {
      id: string; email: string; alertType: string; severity: string;
      title: string; description: string; metadata: string; acknowledged: boolean;
    };

    const securityAlerts: SeedSecurityAlert[] = [
      {
        id: '8b000001-9c0b-4ef8-bb6d-6bb9bd380a01',
        email: 'turikumwenimanadaniel0@gmail.com',
        alertType: 'login_success', severity: 'low',
        title: 'New login detected',
        description: 'A login was recorded for your company administrator account.',
        metadata: '{"ip":"127.0.0.1","device":"Seed Browser","location":"Kigali, Rwanda"}',
        acknowledged: false,
      },
      {
        id: '8b000002-9c0b-4ef8-bb6d-6bb9bd380a02',
        email: 'danieltn889@gmail.com',
        alertType: 'password_changed', severity: 'medium',
        title: 'Password changed',
        description: 'Your recruiter account password was changed successfully.',
        metadata: '{"method":"account_settings","requires_action":false}',
        acknowledged: true,
      },
      {
        id: '8b000003-9c0b-4ef8-bb6d-6bb9bd380a03',
        email: 'turikumwenimanadaniel727@gmail.com',
        alertType: 'profile_security_check', severity: 'low',
        title: 'Profile security check completed',
        description: 'Your candidate profile security settings were checked.',
        metadata: '{"profile_completion":85,"two_factor_enabled":false}',
        acknowledged: false,
      },
    ];

    for (const a of securityAlerts) {
      const userId = userByEmail.get(a.email);
      if (!userId) continue;

      await client.query(
        `
        INSERT INTO security_alerts (
          id, user_id, alert_type, severity, title, description,
          metadata, acknowledged, acknowledged_at, created_at
        )
        VALUES (
          $1::UUID, $2::UUID, $3::VARCHAR, $4::VARCHAR,
          $5::VARCHAR, $6::TEXT, $7::JSONB, $8::BOOLEAN,
          CASE WHEN $8::BOOLEAN THEN NOW() ELSE NULL END,
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
        `,
        [
          a.id, userId, a.alertType, a.severity,
          a.title, a.description, a.metadata, a.acknowledged,
        ]
      );
    }
    logger.info('Security alerts seeded');

    // =====================================================
    // EMAIL TRACKING (keep existing)
    // =====================================================
    logger.info('Seeding email tracking...');

    await client.query(`
      INSERT INTO email_tracking (
        id, notification_id, email_id, recipient, subject,
        opened_count, delivered, delivered_at, sent_at, metadata
      )
      VALUES (
        '7c000001-9c0b-4ef8-bb6d-6bb9bd380a01'::UUID,
        '9a000001-9c0b-4ef8-bb6d-6bb9bd380a01'::UUID,
        'seed-email-application-submitted'::VARCHAR,
        'turikumwenimanadaniel727@gmail.com'::VARCHAR,
        'Application submitted successfully'::VARCHAR,
        0::INTEGER, true::BOOLEAN,
        NOW() - INTERVAL '24 minutes',
        NOW() - INTERVAL '25 minutes',
        '{"seeded":true}'::JSONB
      )
      ON CONFLICT (id) DO NOTHING
    `);
    logger.info('Email tracking seeded');

    // =====================================================
    // NOTIFICATION DELIVERY MONITORING (keep existing)
    // =====================================================
    logger.info('Seeding notification delivery monitoring...');

    const today = new Date().toISOString().split('T')[0];

    const monitoringRows = [
      { channel: 'email',  total: 3, delivered: 2, failed: 0, opened: 1, clicked: 0, avg: 12 },
      { channel: 'in_app', total: 4, delivered: 4, failed: 0, opened: 0, clicked: 0, avg: 2  },
      { channel: 'push',   total: 1, delivered: 0, failed: 1, opened: 0, clicked: 0, avg: 2  },
    ];

    for (const row of monitoringRows) {
      await client.query(
        `
        INSERT INTO notification_delivery_monitoring (
          date, channel, total_sent, delivered, failed,
          opened, clicked, bounced, complained, avg_delivery_time, created_at
        )
        SELECT
          $1::DATE, $2::VARCHAR, $3::INTEGER, $4::INTEGER, $5::INTEGER,
          $6::INTEGER, $7::INTEGER, 0, 0, $8::INTEGER, NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM notification_delivery_monitoring
          WHERE date = $1::DATE AND channel = $2::VARCHAR
        )
        `,
        [today, row.channel, row.total, row.delivered, row.failed,
         row.opened, row.clicked, row.avg]
      );
    }
    logger.info('Notification delivery monitoring seeded');

    // =====================================================
    // COMMIT
    // =====================================================
    await client.query('COMMIT');
    logger.info('Database seeding completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(' Seeding failed, rolled back:', error);
    throw error;
  } finally {
    await client.end();
  }
};

// =====================================================
// RWANDA ADMINISTRATIVE LOCATIONS (Candidate Signup)
// =====================================================
// Populates rw_locations from the bundled MIT-licensed dataset
// (db/data/rwanda-locations.json   sourced from jnkindi/rwanda-locations-json:
// 5 provinces, 30 districts, 416 sectors, 2,148 cells, 14,842 villages).
// Runs as its own connection/transaction, guarded by a row-count check, so
// it's safe to re-run alongside seedDatabase().
type RwLocationRow = {
  province_code: string;
  province_name: string;
  district_code: string;
  district_name: string;
  sector_code: string;
  sector_name: string;
  cell_code: string;
  cell_name: string;
  village_code: string;
  village_name: string;
};

const seedRwandaLocations = async (): Promise<void> => {
  const dataPath = path.join(__dirname, 'data', 'rwanda-locations.json');
  if (!fs.existsSync(dataPath)) {
    logger.warn(`Rwanda locations dataset not found at ${dataPath}   skipping`);
    return;
  }

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '8090'),
    database: process.env.DB_NAME || 'SVWR-CFE_DB',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'TN12',
  });

  try {
    await client.connect();

    const { rows: countRows } = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM rw_locations'
    );
    if (parseInt(countRows[0]!.count, 10) > 0) {
      logger.info('rw_locations already populated   skipping Rwanda locations seed');
      return;
    }

    const locations: RwLocationRow[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    logger.info(`Seeding rw_locations with ${locations.length} villages...`);

    const columns = [
      'province_code', 'province_name', 'district_code', 'district_name',
      'sector_code', 'sector_name', 'cell_code', 'cell_name', 'village_code', 'village_name',
    ];
    const batchSize = 1000;

    await client.query('BEGIN');
    for (let i = 0; i < locations.length; i += batchSize) {
      const batch = locations.slice(i, i + batchSize);
      const values: string[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;
      for (const row of batch) {
        const rowPlaceholders = columns.map(() => `$${paramIndex++}`);
        placeholders.push(`(${rowPlaceholders.join(', ')})`);
        values.push(
          row.province_code, row.province_name, row.district_code, row.district_name,
          row.sector_code, row.sector_name, row.cell_code, row.cell_name,
          row.village_code, row.village_name
        );
      }
      await client.query(
        `INSERT INTO rw_locations (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`,
        values
      );
    }
    await client.query('COMMIT');
    logger.info('Rwanda locations seeded successfully!');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error(' Rwanda locations seeding failed:', error);
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
    await seedRwandaLocations();
    await seedDatabase();
    logger.info('Seeding completed, exiting...');
    process.exit(0);
  } catch (error) {
    logger.error('Seeding process failed:', error);
    process.exit(1);
  }
};

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
const isTsxRun = process.argv[1]?.includes('seed.ts');

if (isMainModule || isTsxRun) {
  seed();
}

export { seed };