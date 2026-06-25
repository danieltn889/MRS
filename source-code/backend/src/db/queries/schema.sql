-- =====================================================
-- RECRUITMENT PLATFORM - COMPLETE DATABASE SCHEMA
-- For 195 Stories: React + Node.js + Python + PostgreSQL
-- Production-Ready Version (All ALTERs merged into CREATE)
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "citext";

-- =====================================================
-- PART 1: CORE AUTHENTICATION & SECURITY (Stories 1-15)
-- =====================================================

CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email              CITEXT UNIQUE NOT NULL,
    password_hash      VARCHAR(255) NOT NULL,
    user_type          VARCHAR(50) NOT NULL CHECK (user_type IN ('candidate', 'recruiter', 'company_admin', 'system_admin')),
    status             VARCHAR(50) DEFAULT 'unverified' CHECK (status IN ('unverified', 'verified', 'active', 'locked', 'suspended', 'deleted')),
    verification_token VARCHAR(255),
    verification_code  VARCHAR(10),
    token_expiry       TIMESTAMP WITH TIME ZONE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret  VARCHAR(255),
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at      TIMESTAMP WITH TIME ZONE,
    login_attempts     INTEGER DEFAULT 0,
    locked_until       TIMESTAMP WITH TIME ZONE,
    deleted_at         TIMESTAMP WITH TIME ZONE,
    terms_accepted_at  TIMESTAMP WITH TIME ZONE,
    terms_version      VARCHAR(50),
    metadata           JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_users_email              ON users(email);
CREATE INDEX idx_users_status             ON users(status);
CREATE INDEX idx_users_type               ON users(user_type);
CREATE INDEX idx_users_created            ON users(created_at);
CREATE INDEX idx_users_verification_token ON users(verification_token) WHERE verification_token IS NOT NULL;
CREATE INDEX idx_users_verification_code  ON users(verification_code)  WHERE verification_code  IS NOT NULL;

CREATE TABLE login_history (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address     INET,
    user_agent     TEXT,
    device_type    VARCHAR(100),
    device_model   VARCHAR(100),
    os             VARCHAR(100),
    browser        VARCHAR(100),
    location       JSONB,
    status         VARCHAR(50) CHECK (status IN ('success', 'failed')),
    failure_reason TEXT,
    session_id     UUID
);

CREATE INDEX idx_login_history_user ON login_history(user_id);
CREATE INDEX idx_login_history_date ON login_history(login_at);
CREATE INDEX idx_login_history_ip   ON login_history(ip_address);

CREATE TABLE sessions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token            VARCHAR(500) UNIQUE NOT NULL,
    refresh_token    VARCHAR(500) UNIQUE,
    device_info      JSONB,
    ip_address       INET,
    location         JSONB,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_current       BOOLEAN DEFAULT FALSE,
    is_remember_me   BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_sessions_user          ON sessions(user_id);
CREATE INDEX idx_sessions_token         ON sessions(token);
CREATE INDEX idx_sessions_refresh       ON sessions(refresh_token);
CREATE INDEX idx_sessions_expires       ON sessions(expires_at);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity_at);

CREATE TABLE password_resets (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at    TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_ip INET
);

CREATE INDEX idx_password_resets_token   ON password_resets(token);
CREATE INDEX idx_password_resets_user    ON password_resets(user_id);
CREATE INDEX idx_password_resets_expires ON password_resets(expires_at);

CREATE TABLE recovery_codes (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code       VARCHAR(50) NOT NULL,
    used       BOOLEAN DEFAULT FALSE,
    used_at    TIMESTAMP WITH TIME ZONE,
    used_ip    INET,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, code)
);

CREATE INDEX idx_recovery_codes_user ON recovery_codes(user_id);
CREATE INDEX idx_recovery_codes_code ON recovery_codes(code);

CREATE TABLE security_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_type      VARCHAR(100) NOT NULL,
    severity        VARCHAR(50) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    metadata        JSONB,
    acknowledged    BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_security_alerts_user    ON security_alerts(user_id);
CREATE INDEX idx_security_alerts_created ON security_alerts(created_at);
CREATE INDEX idx_security_alerts_type    ON security_alerts(alert_type);

-- =====================================================
-- PART 2: CANDIDATE PROFILES (Stories 16-25)
-- =====================================================

CREATE TABLE candidate_profiles (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    phone               VARCHAR(50),
    country             VARCHAR(100),
    city                VARCHAR(100),
    timezone            VARCHAR(100),
    date_of_birth       DATE,
    gender              VARCHAR(50),
    profile_photo_url   TEXT,
    profile_photo_key   VARCHAR(255),
    linkedin_url        TEXT,
    github_url          TEXT,
    portfolio_url       TEXT,
    website_url         TEXT,
    willing_to_relocate BOOLEAN DEFAULT FALSE,
    willing_to_travel   BOOLEAN DEFAULT FALSE,
    notice_period_days  INTEGER,
    current_salary      JSONB,
    expected_salary     JSONB,
    currency            VARCHAR(3) DEFAULT 'USD',
    profile_completion  INTEGER DEFAULT 0 CHECK (profile_completion BETWEEN 0 AND 100),
    headline            VARCHAR(255),
    summary             TEXT,
    languages           JSONB DEFAULT '[]'::JSONB,
    privacy_settings    JSONB DEFAULT '{
        "profile_visibility": "public",
        "show_contact_info": false,
        "show_current_employer": false,
        "data_sharing_consent": false
    }'::JSONB,
    job_preferences     JSONB DEFAULT '{
        "job_types": [],
        "locations": [],
        "remote_preference": "any",
        "industries": [],
        "company_sizes": [],
        "employment_types": []
    }'::JSONB,
    availability        JSONB DEFAULT '{
        "status": "not_looking",
        "available_from": null,
        "notice_period": null,
        "open_to_opportunities": false
    }'::JSONB,
    metadata            JSONB DEFAULT '{}'::JSONB,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_candidate_names        ON candidate_profiles(first_name, last_name);
CREATE INDEX idx_candidate_location     ON candidate_profiles(country, city);
CREATE INDEX idx_candidate_completion   ON candidate_profiles(profile_completion);
CREATE INDEX idx_candidate_availability ON candidate_profiles((availability->>'status'));

CREATE TABLE education (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution         VARCHAR(255) NOT NULL,
    institution_id      VARCHAR(100),
    degree              VARCHAR(255) NOT NULL,
    field_of_study      VARCHAR(255) NOT NULL,
    start_date          DATE NOT NULL,
    end_date            DATE,
    is_current          BOOLEAN DEFAULT FALSE,
    grade               VARCHAR(50),
    grade_scale         VARCHAR(20),
    description         TEXT,
    activities          TEXT,
    skills              TEXT[],
    attachments         JSONB DEFAULT '[]'::JSONB,
    verified            BOOLEAN DEFAULT FALSE,
    verification_method VARCHAR(100),
    verification_date   TIMESTAMP WITH TIME ZONE,
    display_order       INTEGER DEFAULT 0,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_education_user        ON education(user_id);
CREATE INDEX idx_education_dates       ON education(start_date, end_date);
CREATE INDEX idx_education_institution ON education(institution);
CREATE INDEX idx_education_verified    ON education(verified);

CREATE TABLE work_experience (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company             VARCHAR(255) NOT NULL,
    company_id          VARCHAR(100),
    title               VARCHAR(255) NOT NULL,
    employment_type     VARCHAR(100) CHECK (employment_type IN ('full-time', 'part-time', 'contract', 'internship', 'freelance', 'self-employed')),
    location            VARCHAR(255),
    location_type       VARCHAR(50) CHECK (location_type IN ('onsite', 'hybrid', 'remote')),
    start_date          DATE NOT NULL,
    end_date            DATE,
    is_current          BOOLEAN DEFAULT FALSE,
    description         TEXT,
    achievements        TEXT[],
    skills              TEXT[],
    industry            VARCHAR(255),
    team_size           INTEGER,
    reports_to          VARCHAR(255),
    reason_for_leaving  VARCHAR(255),
    attachments         JSONB DEFAULT '[]'::JSONB,
    verified            BOOLEAN DEFAULT FALSE,
    verification_method VARCHAR(100),
    verification_date   TIMESTAMP WITH TIME ZONE,
    display_order       INTEGER DEFAULT 0,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_experience_user    ON work_experience(user_id);
CREATE INDEX idx_experience_dates   ON work_experience(start_date, end_date);
CREATE INDEX idx_experience_company ON work_experience(company);
CREATE INDEX idx_experience_current ON work_experience(is_current);

CREATE TABLE skills (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) UNIQUE NOT NULL,
    category            VARCHAR(100),
    subcategory         VARCHAR(100),
    skill_type          VARCHAR(50) CHECK (skill_type IN ('technical', 'soft', 'language', 'certification', 'tool')),
    is_verified         BOOLEAN DEFAULT FALSE,
    verification_source VARCHAR(255),
    metadata            JSONB DEFAULT '{}'::JSONB,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_skills_name     ON skills(name);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_type     ON skills(skill_type);

CREATE TABLE user_skills (
    user_id               UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    skill_id              UUID NOT NULL REFERENCES skills(id)  ON DELETE CASCADE,
    proficiency_level     INTEGER CHECK (proficiency_level BETWEEN 1 AND 5),
    proficiency_label     VARCHAR(50) GENERATED ALWAYS AS (
        CASE proficiency_level
            WHEN 1 THEN 'Beginner'
            WHEN 2 THEN 'Intermediate'
            WHEN 3 THEN 'Advanced'
            WHEN 4 THEN 'Expert'
            WHEN 5 THEN 'Master'
        END
    ) STORED,
    years_experience      DECIMAL(3,1),
    months_experience     INTEGER GENERATED ALWAYS AS (FLOOR(years_experience * 12)::INTEGER) STORED,
    is_primary            BOOLEAN DEFAULT FALSE,
    last_used             DATE,
    skill_context         TEXT,
    verified              BOOLEAN DEFAULT FALSE,
    verification_evidence JSONB,
    endorsement_count     INTEGER DEFAULT 0,
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, skill_id)
);

CREATE INDEX idx_user_skills_proficiency ON user_skills(proficiency_level);
CREATE INDEX idx_user_skills_primary     ON user_skills(is_primary) WHERE is_primary = TRUE;
CREATE INDEX idx_user_skills_verified    ON user_skills(verified)    WHERE verified   = TRUE;

CREATE TABLE resumes (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name          VARCHAR(255) NOT NULL,
    file_key           VARCHAR(255) NOT NULL,
    file_url           TEXT,
    file_size          INTEGER,
    mime_type          VARCHAR(100),
    is_primary         BOOLEAN DEFAULT FALSE,
    version            INTEGER DEFAULT 1,
    parsed_data        JSONB,
    parsing_confidence DECIMAL(3,2),
    skills_extracted   TEXT[],
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_resumes_user    ON resumes(user_id);
CREATE INDEX idx_resumes_primary ON resumes(user_id, is_primary) WHERE is_primary = TRUE;

CREATE TABLE portfolio_links (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform          VARCHAR(100) NOT NULL,
    url               TEXT NOT NULL,
    title             VARCHAR(255),
    description       TEXT,
    thumbnail_url     TEXT,
    metadata          JSONB,
    is_verified       BOOLEAN DEFAULT FALSE,
    verification_date TIMESTAMP WITH TIME ZONE,
    display_order     INTEGER DEFAULT 0,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_portfolio_user     ON portfolio_links(user_id);
CREATE INDEX idx_portfolio_platform ON portfolio_links(platform);

CREATE TABLE certifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    issuer              VARCHAR(255) NOT NULL,
    credential_id       VARCHAR(255),
    credential_url      TEXT,
    issue_date          DATE NOT NULL,
    expiry_date         DATE,
    is_expired          BOOLEAN DEFAULT FALSE,
    description         TEXT,
    skills              TEXT[],
    attachments         JSONB DEFAULT '[]'::JSONB,
    verified            BOOLEAN DEFAULT FALSE,
    verification_method VARCHAR(100),
    verification_date   TIMESTAMP WITH TIME ZONE,
    display_order       INTEGER DEFAULT 0,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (expiry_date IS NULL OR expiry_date >= issue_date)
);

CREATE INDEX idx_certifications_user     ON certifications(user_id);
CREATE INDEX idx_certifications_issuer   ON certifications(issuer);
CREATE INDEX idx_certifications_verified ON certifications(verified)   WHERE verified   = TRUE;
CREATE INDEX idx_certifications_expired  ON certifications(is_expired) WHERE is_expired = TRUE;

-- =====================================================
-- PART 3: COMPANY MANAGEMENT (Stories 26-35)
-- =====================================================

CREATE TABLE companies (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                  VARCHAR(255) NOT NULL,
    legal_name            VARCHAR(255),
    slug                  VARCHAR(255) UNIQUE,
    industry              VARCHAR(255),
    industries            TEXT[],
    size                  VARCHAR(50) CHECK (size IN ('1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10000+')),
    founded_year          INTEGER CHECK (founded_year BETWEEN 1800 AND 2100),
    headquarters_location JSONB,
    website               VARCHAR(255),
    description           TEXT,
    short_description     VARCHAR(300),
    mission               TEXT,
    vision                TEXT,
    values                TEXT[],
    culture               JSONB,
    logo_url              TEXT,
    logo_key              VARCHAR(255),
    banner_url            TEXT,
    banner_key            VARCHAR(255),
    social_links          JSONB,
    verification_status   VARCHAR(50) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected', 'expired')),
    verification_badge    BOOLEAN DEFAULT FALSE,
    verification_level    VARCHAR(50),
    verified_at           TIMESTAMP WITH TIME ZONE,
    verified_by           UUID REFERENCES users(id),
    domain                VARCHAR(255),
    tax_id                VARCHAR(100),
    registration_number   VARCHAR(100),
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by            UUID REFERENCES users(id),
    deleted_at            TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_companies_name         ON companies(name);
CREATE INDEX idx_companies_slug         ON companies(slug);
CREATE INDEX idx_companies_industry     ON companies(industry);
CREATE INDEX idx_companies_verification ON companies(verification_status);
CREATE INDEX idx_companies_domain       ON companies(domain);

CREATE TABLE company_locations (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name           VARCHAR(255),
    type           VARCHAR(50) CHECK (type IN ('headquarters', 'branch', 'remote_hub', 'coworking', 'office')),
    address_line1  VARCHAR(255),
    address_line2  VARCHAR(255),
    city           VARCHAR(100) NOT NULL,
    state          VARCHAR(100),
    postal_code    VARCHAR(20),
    country        VARCHAR(100) NOT NULL,
    latitude       DECIMAL(10,8),
    longitude      DECIMAL(11,8),
    location       JSONB,
    phone          VARCHAR(50),
    email          VARCHAR(255),
    hours          JSONB,
    amenities      TEXT[],
    photos         TEXT[],
    is_hiring      BOOLEAN DEFAULT TRUE,
    employee_count INTEGER,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_company_locations_company ON company_locations(company_id);
CREATE INDEX idx_company_locations_city    ON company_locations(city, country);

CREATE TABLE company_culture (
    company_id            UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    attributes            JSONB NOT NULL,
    values                JSONB DEFAULT '[]'::JSONB,
    description           TEXT,
    work_environment      TEXT,
    team_dynamics         TEXT,
    communication_style   TEXT,
    decision_making       TEXT,
    feedback_culture      TEXT,  -- merged from ALTER
    work_life_balance     TEXT,
    diversity_info        TEXT,
    inclusion_info        TEXT,
    employee_testimonials JSONB DEFAULT '[]'::JSONB,
    awards                JSONB DEFAULT '[]'::JSONB,
    updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE team_invitations (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invited_by       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email            CITEXT NOT NULL,
    role             VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'recruiter', 'reviewer', 'viewer')),
    invitation_token VARCHAR(255) UNIQUE NOT NULL,
    status           VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    expires_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at      TIMESTAMP WITH TIME ZONE,
    accepted_by      UUID REFERENCES users(id),
    first_name       VARCHAR(100),
    last_name        VARCHAR(100),
    personal_message TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_team_invitations_company ON team_invitations(company_id);
CREATE INDEX idx_team_invitations_email   ON team_invitations(email);
CREATE INDEX idx_team_invitations_token   ON team_invitations(invitation_token);
CREATE INDEX idx_team_invitations_status  ON team_invitations(status);
CREATE INDEX idx_team_invitations_expires ON team_invitations(expires_at);

CREATE TABLE company_team (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id            UUID REFERENCES users(id),
    invitation_id      UUID REFERENCES team_invitations(id),
    name               VARCHAR(255) NOT NULL,
    title              VARCHAR(255) NOT NULL,
    department         VARCHAR(255),
    email              VARCHAR(255),
    phone              VARCHAR(50),
    bio                TEXT,
    expertise          TEXT[],
    photo_url          TEXT,
    photo_key          VARCHAR(255),
    social_links       JSONB,
    linkedin_url       TEXT,
    role               VARCHAR(50) NOT NULL DEFAULT 'recruiter' CHECK (role IN ('admin', 'recruiter', 'reviewer', 'viewer')),
    permissions        JSONB DEFAULT '{"can_post_jobs": true, "can_view_candidates": true, "can_manage_team": false, "can_edit_company": false}'::JSONB,
    display_on_profile BOOLEAN DEFAULT TRUE,
    is_leadership      BOOLEAN DEFAULT FALSE,
    display_order      INTEGER DEFAULT 0,
    joined_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_company_team_company      ON company_team(company_id);
CREATE INDEX idx_company_team_user         ON company_team(user_id);
CREATE INDEX idx_company_team_invitation   ON company_team(invitation_id);
CREATE INDEX idx_company_team_role         ON company_team(role);
CREATE INDEX idx_company_team_display      ON company_team(company_id, display_on_profile);
CREATE INDEX idx_company_team_company_role ON company_team(company_id, role);

CREATE TABLE company_projects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    client          VARCHAR(255),
    client_industry VARCHAR(255),
    timeframe       JSONB,
    project_type    VARCHAR(100),
    description     TEXT,
    challenge       TEXT,
    solution        TEXT,
    results         JSONB,
    technologies    TEXT[],
    skills          TEXT[],
    media           JSONB DEFAULT '[]'::JSONB,
    featured        BOOLEAN DEFAULT FALSE,
    display_order   INTEGER DEFAULT 0,   -- merged from ALTER
    team_size       INTEGER,             -- merged from ALTER
    website_url     TEXT,                -- merged from ALTER
    github_url      TEXT,                -- merged from ALTER
    team_members    UUID[],
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_company_projects_company  ON company_projects(company_id);
CREATE INDEX idx_company_projects_featured ON company_projects(company_id, featured);

CREATE TABLE company_policies (
    company_id         UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    work_hours         JSONB DEFAULT '{
        "standard_start": "09:00",
        "standard_end": "17:00",
        "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "timezone": "UTC",
        "flexible": true,
        "core_hours": ["10:00", "15:00"]
    }'::JSONB,
    remote_policy      JSONB DEFAULT '{
        "allowed": true,
        "type": "hybrid",
        "days_in_office": 2,
        "equipment_provided": true,
        "home_office_stipend": 0
    }'::JSONB,
    time_off           JSONB DEFAULT '{
        "vacation_days": 20,
        "sick_days": 10,
        "paid_holidays": 8,
        "parental_leave": 12
    }'::JSONB,
    benefits           JSONB DEFAULT '[]'::JSONB,
    performance_review JSONB DEFAULT '{
        "frequency": "annual",
        "probation_period": 3,
        "review_process": []
    }'::JSONB,
    dress_code         VARCHAR(255),
    equipment          JSONB DEFAULT '[]'::JSONB,
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE company_contacts (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    contact_type   VARCHAR(100) CHECK (contact_type IN ('general', 'hr', 'support', 'press', 'legal', 'billing')),
    contact_method VARCHAR(50)  CHECK (contact_method IN ('email', 'phone', 'form', 'chat')),
    contact_value  TEXT NOT NULL,
    is_primary     BOOLEAN DEFAULT FALSE,
    department     VARCHAR(255),
    hours          JSONB,
    verified       BOOLEAN DEFAULT FALSE,
    notes          TEXT,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_company_contacts_company ON company_contacts(company_id);
CREATE INDEX idx_company_contacts_primary ON company_contacts(company_id, is_primary) WHERE is_primary = TRUE;

CREATE TABLE company_verification (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    verification_level VARCHAR(50) CHECK (verification_level IN ('basic', 'standard', 'enhanced', 'premium')),
    documents          JSONB NOT NULL,
    submitted_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at        TIMESTAMP WITH TIME ZONE,
    reviewed_by        UUID REFERENCES users(id),
    status             VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'info_needed')),
    rejection_reason   TEXT,
    reviewer_notes     TEXT,
    expires_at         TIMESTAMP WITH TIME ZONE,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_company_verification_company     ON company_verification(company_id);
CREATE INDEX idx_company_verification_status      ON company_verification(status);
CREATE INDEX idx_company_verification_reviewed_by ON company_verification(reviewed_by);

CREATE TABLE approval_workflows (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    workflow_type VARCHAR(100) CHECK (workflow_type IN ('job_posting', 'offer', 'budget', 'candidate_selection')),
    stages        JSONB NOT NULL,
    rules         JSONB,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by    UUID REFERENCES users(id)
);

CREATE INDEX idx_approval_workflows_company    ON approval_workflows(company_id);
CREATE INDEX idx_approval_workflows_type       ON approval_workflows(workflow_type);
CREATE INDEX idx_approval_workflows_created_by ON approval_workflows(created_by);

CREATE TABLE communication_standards (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
    standards  TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE minimum_score_thresholds (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
    thresholds JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- PART 4: JOB MANAGEMENT (Stories 36-60)
-- =====================================================

CREATE TABLE jobs (
    id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id                    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    external_id                   VARCHAR(255),
    title                         VARCHAR(255) NOT NULL,
    slug                          VARCHAR(255),
    department                    VARCHAR(255),
    team                          VARCHAR(255),
    job_type                      VARCHAR(100) CHECK (job_type IN ('full-time', 'part-time', 'contract', 'internship', 'freelance', 'temporary')),
    work_arrangement              VARCHAR(50)  CHECK (work_arrangement IN ('remote', 'hybrid', 'onsite', 'flexible')),
    locations                     JSONB,
    description                   TEXT NOT NULL,
    summary                       TEXT,
    responsibilities              JSONB DEFAULT '[]'::JSONB,
    qualifications                TEXT,
    preferred_qualifications      TEXT,
    requirements                  JSONB,
    salary_min                    DECIMAL(10,2),
    salary_max                    DECIMAL(10,2),
    salary_currency               VARCHAR(3) DEFAULT 'USD',
    salary_period                 VARCHAR(20) CHECK (salary_period IN ('hour', 'month', 'year')),
    salary_visible                BOOLEAN DEFAULT TRUE,
    benefits                      JSONB DEFAULT '[]'::JSONB,
    skills_required               JSONB,
    skills_preferred              JSONB,
    experience_min                INTEGER,
    experience_max                INTEGER,
    experience_level              VARCHAR(50) CHECK (experience_level IN ('entry', 'mid', 'senior', 'lead', 'executive')),
    education_required            JSONB,
    screening_questions           JSONB DEFAULT '[]'::JSONB,
    application_instructions      TEXT,
    documents                     JSONB DEFAULT '[]'::JSONB,
    department_info               VARCHAR(255),
    tags                          TEXT[],
    application_limit             INTEGER,
    language_requirements         JSONB DEFAULT '[]'::JSONB,
    experience_requirements       JSONB DEFAULT '{
        "min_years": null,
        "max_years": null,
        "field": null,
        "specific_technologies": [],
        "level": null
    }'::JSONB,
    education_requirements        JSONB DEFAULT '{
        "minimum_degree": null,
        "allowed_degrees": [],
        "allowed_fields": [],
        "required": false,
        "certifications": []
    }'::JSONB,
    skill_experience_requirements JSONB DEFAULT '{}'::JSONB,
    ai_match_required_score       INTEGER DEFAULT 70 CHECK (ai_match_required_score BETWEEN 0 AND 100),
    status                        VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'active', 'paused', 'closed', 'archived', 'expired')),
    visibility                    VARCHAR(50) DEFAULT 'public' CHECK (visibility IN ('public', 'internal', 'confidential', 'unlisted')),
    published_at                  TIMESTAMP WITH TIME ZONE,
    expires_at                    TIMESTAMP WITH TIME ZONE,
    paused_at                     TIMESTAMP WITH TIME ZONE,
    closed_at                     TIMESTAMP WITH TIME ZONE,
    created_at                    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at                    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by                    UUID REFERENCES users(id),
    approved_by                   UUID REFERENCES users(id),
    approved_at                   TIMESTAMP WITH TIME ZONE,
    view_count                    INTEGER DEFAULT 0,
    application_count             INTEGER DEFAULT 0,
    metadata                      JSONB DEFAULT '{}'::JSONB,
    deleted_at                    TIMESTAMP WITH TIME ZONE,
    CONSTRAINT salary_range_check     CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max),
    CONSTRAINT experience_range_check CHECK (experience_min IS NULL OR experience_max IS NULL OR experience_min <= experience_max)
);

CREATE INDEX idx_jobs_company        ON jobs(company_id);
CREATE INDEX idx_jobs_status         ON jobs(status);
CREATE INDEX idx_jobs_dates          ON jobs(published_at, expires_at);
CREATE INDEX idx_jobs_title          ON jobs(title);
CREATE INDEX idx_jobs_type           ON jobs(job_type);
CREATE INDEX idx_jobs_department     ON jobs(department);
CREATE INDEX idx_jobs_visibility     ON jobs(visibility);
CREATE INDEX idx_jobs_slug           ON jobs(slug);
CREATE INDEX idx_jobs_tags           ON jobs USING GIN(tags);
CREATE INDEX idx_jobs_company_status ON jobs(company_id, status);
CREATE INDEX idx_jobs_ai_match_score ON jobs(ai_match_required_score);

CREATE TABLE job_skills (
    job_id            UUID NOT NULL REFERENCES jobs(id)   ON DELETE CASCADE,
    skill_id          UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    proficiency_level INTEGER CHECK (proficiency_level BETWEEN 1 AND 5),
    is_required       BOOLEAN DEFAULT TRUE,
    importance        VARCHAR(50) CHECK (importance IN ('nice-to-have', 'preferred', 'required')),
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (job_id, skill_id)
);

CREATE INDEX idx_job_skills_job         ON job_skills(job_id);
CREATE INDEX idx_job_skills_skill       ON job_skills(skill_id);
CREATE INDEX idx_job_skills_proficiency ON job_skills(proficiency_level);

CREATE TABLE saved_jobs (
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id   UUID NOT NULL REFERENCES jobs(id)  ON DELETE CASCADE,
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes    TEXT,
    tags     TEXT[],
    priority VARCHAR(20) CHECK (priority IN ('high', 'medium', 'low')),
    folder   VARCHAR(255),
    notified BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (user_id, job_id)
);

CREATE INDEX idx_saved_jobs_user     ON saved_jobs(user_id);
CREATE INDEX idx_saved_jobs_saved_at ON saved_jobs(saved_at);

CREATE TABLE job_applications_tracking (
    job_id                  UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
    application_count       INTEGER DEFAULT 0,
    last_application_at     TIMESTAMP WITH TIME ZONE,
    daily_application_count JSONB,
    source_breakdown        JSONB,
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- PART 5: APPLICATIONS (Stories 61-80)
-- =====================================================

CREATE TABLE applications (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id             UUID NOT NULL REFERENCES jobs(id)  ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_number VARCHAR(50) UNIQUE,
    status             VARCHAR(50) DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'shortlisted', 'interview', 'assessment', 'reference_check', 'offer', 'hired', 'rejected', 'withdrawn', 'on_hold')),
    current_stage      VARCHAR(100),
    applied_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_data     JSONB,
    screening_answers  JSONB DEFAULT '[]'::JSONB,
    documents          JSONB DEFAULT '[]'::JSONB,
    notes              JSONB DEFAULT '[]'::JSONB,
    internal_notes     JSONB DEFAULT '[]'::JSONB,
    tags               TEXT[],
    rating             INTEGER CHECK (rating BETWEEN 1 AND 5),
    ai_score           JSONB,
    match_score        INTEGER CHECK (match_score BETWEEN 0 AND 100),
    match_details      JSONB,
    withdrawn_at       TIMESTAMP WITH TIME ZONE,
    withdrawn_reason   TEXT,
    withdrawn_by       UUID REFERENCES users(id),
    rejection_reason   TEXT,
    rejection_details  JSONB,
    source             VARCHAR(255),
    source_details     JSONB,
    referrer_id        UUID REFERENCES users(id),
    metadata           JSONB DEFAULT '{}'::JSONB,
    interview_date     TIMESTAMP WITH TIME ZONE,
    assigned_to        UUID REFERENCES users(id),
    profile_data       JSONB,
    feedback           TEXT,
    deleted_at         TIMESTAMP WITH TIME ZONE,
    UNIQUE(job_id, user_id)
);

CREATE INDEX idx_applications_job          ON applications(job_id);
CREATE INDEX idx_applications_user         ON applications(user_id);
CREATE INDEX idx_applications_status       ON applications(status);
CREATE INDEX idx_applications_applied      ON applications(applied_at);
CREATE INDEX idx_applications_number       ON applications(application_number);
CREATE INDEX idx_applications_match        ON applications(match_score);
CREATE INDEX idx_applications_tags         ON applications USING GIN(tags);
CREATE INDEX idx_applications_job_user     ON applications(job_id, user_id);
CREATE INDEX idx_applications_withdrawn_by ON applications(withdrawn_by);
CREATE INDEX idx_applications_assigned_to  ON applications(assigned_to);

CREATE TABLE application_timeline (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    event_type     VARCHAR(100) NOT NULL,
    event_data     JSONB,
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address     INET,
    metadata       JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_timeline_application ON application_timeline(application_id);
CREATE INDEX idx_timeline_created     ON application_timeline(created_at);

CREATE TABLE application_assignments (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    assignee_id    UUID NOT NULL REFERENCES users(id),
    assigned_by    UUID REFERENCES users(id),
    assigned_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    role           VARCHAR(100),
    status         VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'removed')),
    notes          TEXT,
    UNIQUE(application_id, assignee_id),
    CONSTRAINT no_self_assignment CHECK (assignee_id != assigned_by)
);

CREATE INDEX idx_assignments_assignee    ON application_assignments(assignee_id);
CREATE INDEX idx_assignments_application ON application_assignments(application_id);

CREATE TABLE application_reminders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    reminder_type   VARCHAR(100) CHECK (reminder_type IN ('follow_up', 'review', 'interview', 'assessment', 'offer', 'deadline')),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    reminder_time   TIMESTAMP WITH TIME ZONE NOT NULL,
    recurrence      VARCHAR(50),
    status          VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acknowledged', 'cancelled', 'failed')),
    sent_at         TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by      UUID REFERENCES users(id)
);

CREATE INDEX idx_reminders_application ON application_reminders(application_id);
CREATE INDEX idx_reminders_time        ON application_reminders(reminder_time);
CREATE INDEX idx_reminders_status      ON application_reminders(status);

CREATE TABLE application_notes (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id),
    notes          TEXT NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_application_notes_application ON application_notes(application_id);

CREATE TABLE application_answers (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    question_id    INTEGER NOT NULL,
    answer         TEXT NOT NULL,
    answered_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_application_answers_application ON application_answers(application_id);

CREATE TABLE auto_reject_rules (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id           UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    condition        VARCHAR(100) NOT NULL,
    value            TEXT NOT NULL,
    rejection_reason TEXT NOT NULL,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by       UUID REFERENCES users(id)
);

CREATE INDEX idx_auto_reject_rules_job ON auto_reject_rules(job_id);

CREATE TABLE blacklisted_candidates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    reason          VARCHAR(255) NOT NULL,
    reason_category VARCHAR(100) CHECK (reason_category IN ('unprofessional', 'fraud', 'no_show', 'policy_violation', 'security', 'other')),
    description     TEXT,
    evidence        JSONB DEFAULT '[]'::JSONB,
    blacklisted_by  UUID REFERENCES users(id),
    blacklisted_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at      TIMESTAMP WITH TIME ZONE,
    level           VARCHAR(50) CHECK (level IN ('temporary', 'permanent', 'role_specific', 'company_wide')),
    UNIQUE(company_id, user_id)
);

CREATE INDEX idx_blacklisted_company ON blacklisted_candidates(company_id);
CREATE INDEX idx_blacklisted_user    ON blacklisted_candidates(user_id);

-- =====================================================
-- PART 6: SIMULATIONS (Stories 81-110)
-- =====================================================

CREATE TABLE simulation_templates (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id            UUID REFERENCES companies(id) ON DELETE CASCADE,
    name                  VARCHAR(255) NOT NULL,
    slug                  VARCHAR(255),
    description           TEXT,
    type                  VARCHAR(100) CHECK (type IN ('technical', 'behavioral', 'cognitive', 'situational', 'role_play', 'case_study')),
    category              VARCHAR(100),
    difficulty            VARCHAR(50) CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'expert')),
    duration_minutes      INTEGER NOT NULL,
    total_tasks           INTEGER,
    tasks                 JSONB NOT NULL,
    tasks_structure       JSONB,
    scoring_rubric        JSONB,
    pass_fail_criteria    JSONB,
    evaluation_criteria   JSONB,
    technologies          TEXT[],
    skills_assessed       UUID[],
    languages_supported   TEXT[],
    instructions          TEXT,
    preparation_materials JSONB,
    sample_simulation_id  UUID,
    is_public             BOOLEAN DEFAULT FALSE,
    is_active             BOOLEAN DEFAULT TRUE,
    usage_count           INTEGER DEFAULT 0,
    avg_completion_time   INTEGER,
    avg_score             DECIMAL(5,2),
    job_id                UUID REFERENCES jobs(id) ON DELETE CASCADE,
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by            UUID REFERENCES users(id),
    metadata              JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_sim_templates_company    ON simulation_templates(company_id);
CREATE INDEX idx_sim_templates_type       ON simulation_templates(type);
CREATE INDEX idx_sim_templates_difficulty ON simulation_templates(difficulty);
CREATE INDEX idx_sim_templates_public     ON simulation_templates(is_public);
CREATE INDEX idx_simulation_templates_job ON simulation_templates(job_id);

CREATE TABLE simulations (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id           UUID REFERENCES simulation_templates(id),
    application_id        UUID REFERENCES applications(id) ON DELETE CASCADE,
    job_id                UUID REFERENCES jobs(id),
    user_id               UUID NOT NULL REFERENCES users(id),
    external_id           VARCHAR(255),
    status                VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'paused', 'completed', 'expired', 'cancelled', 'failed')),
    scheduled_at          TIMESTAMP WITH TIME ZONE,
    started_at            TIMESTAMP WITH TIME ZONE,
    completed_at          TIMESTAMP WITH TIME ZONE,
    paused_at             TIMESTAMP WITH TIME ZONE,
    resumed_at            TIMESTAMP WITH TIME ZONE,
    time_limit            INTEGER,
    time_remaining        INTEGER,
    time_spent            INTEGER,
    tasks                 JSONB,
    progress              JSONB,
    current_task          INTEGER DEFAULT 0,
    answers               JSONB,
    results               JSONB,
    ai_analysis           JSONB,
    ai_analysis_version   VARCHAR(50),
    punctuality_score     DECIMAL(5,2) CHECK (punctuality_score     BETWEEN 0 AND 100),
    communication_score   DECIMAL(5,2) CHECK (communication_score   BETWEEN 0 AND 100),
    problem_solving_score DECIMAL(5,2) CHECK (problem_solving_score BETWEEN 0 AND 100),
    adaptability_score    DECIMAL(5,2) CHECK (adaptability_score    BETWEEN 0 AND 100),
    collaboration_score   DECIMAL(5,2) CHECK (collaboration_score   BETWEEN 0 AND 100),
    attention_score       DECIMAL(5,2) CHECK (attention_score       BETWEEN 0 AND 100),
    initiative_score      DECIMAL(5,2) CHECK (initiative_score      BETWEEN 0 AND 100),
    overall_score         DECIMAL(5,2),
    feedback              JSONB,
    strengths             TEXT[],
    improvements          TEXT[],
    evaluator_notes       TEXT,
    evaluated_by          UUID REFERENCES users(id),
    evaluated_at          TIMESTAMP WITH TIME ZONE,
    blockchain_tx_id      VARCHAR(255),
    blockchain_hash       VARCHAR(255),
    blockchain_timestamp  TIMESTAMP WITH TIME ZONE,
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata              JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_simulations_user            ON simulations(user_id);
CREATE INDEX idx_simulations_application     ON simulations(application_id);
CREATE INDEX idx_simulations_status          ON simulations(status);
CREATE INDEX idx_simulations_scheduled       ON simulations(scheduled_at);
CREATE INDEX idx_simulations_completed       ON simulations(completed_at);
CREATE INDEX idx_simulations_template        ON simulations(template_id);
CREATE INDEX idx_simulations_blockchain      ON simulations(blockchain_tx_id);
CREATE INDEX idx_simulations_template_status ON simulations(template_id, status);

CREATE TABLE simulation_tasks (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    task_index    INTEGER NOT NULL,
    task_name     VARCHAR(255) NOT NULL,
    task_type     VARCHAR(100),
    task_data     JSONB,
    started_at    TIMESTAMP WITH TIME ZONE,
    completed_at  TIMESTAMP WITH TIME ZONE,
    time_spent    INTEGER,
    result        JSONB,
    answer        TEXT,
    score         INTEGER,
    feedback      TEXT,
    ai_analysis   JSONB,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sim_tasks_simulation ON simulation_tasks(simulation_id);
CREATE INDEX idx_sim_tasks_index      ON simulation_tasks(simulation_id, task_index);

CREATE TABLE code_submissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id   UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    task_id         UUID REFERENCES simulation_tasks(id),
    language        VARCHAR(50) NOT NULL,
    code            TEXT NOT NULL,
    code_version    INTEGER DEFAULT 1,
    test_results    JSONB,
    test_passed     INTEGER DEFAULT 0,
    test_total      INTEGER DEFAULT 0,
    execution_time  INTEGER,
    memory_used     INTEGER,
    compiler_output TEXT,
    error_message   TEXT,
    submitted_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_code_submissions_simulation ON code_submissions(simulation_id);

CREATE TABLE whiteboard_submissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id   UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    task_id         UUID REFERENCES simulation_tasks(id),
    whiteboard_data JSONB NOT NULL,
    elements        JSONB,
    annotations     JSONB,
    version         INTEGER DEFAULT 1,
    submitted_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE simulation_sessions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id  UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id),
    session_type   VARCHAR(50) DEFAULT 'candidate' CHECK (session_type IN ('candidate', 'preview', 'practice', 'test')),
    application_id UUID REFERENCES applications(id),
    started_at     TIMESTAMP WITH TIME ZONE,
    completed_at   TIMESTAMP WITH TIME ZONE,
    paused_at      TIMESTAMP WITH TIME ZONE,
    resumed_at     TIMESTAMP WITH TIME ZONE,
    status         VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'paused', 'completed', 'expired', 'cancelled', 'failed')),
    time_limit     INTEGER,
    time_remaining INTEGER,
    time_spent     INTEGER DEFAULT 0,
    current_task   INTEGER DEFAULT 0,
    answers        JSONB DEFAULT '{}'::JSONB,
    progress       JSONB DEFAULT '{}'::JSONB,
    score          DECIMAL(5,2),
    feedback       JSONB,
    notes          TEXT,
    github_links   JSONB DEFAULT '{}'::JSONB,
    submission_results JSONB DEFAULT '{}'::JSONB,
    submission_score INTEGER GENERATED ALWAYS AS ((submission_results->>'score')::INTEGER) STORED,
    submission_passed BOOLEAN GENERATED ALWAYS AS ((submission_results->>'passed')::BOOLEAN) STORED,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_simulation_sessions_simulation ON simulation_sessions(simulation_id);
CREATE INDEX idx_simulation_sessions_user       ON simulation_sessions(user_id);
CREATE INDEX idx_simulation_sessions_status     ON simulation_sessions(status);
CREATE INDEX idx_simulation_sessions_started    ON simulation_sessions(started_at);
CREATE INDEX idx_simulation_sessions_submission_results ON simulation_sessions USING GIN (submission_results);
CREATE INDEX idx_simulation_sessions_submission_score
    ON simulation_sessions(submission_score)
    WHERE submission_score IS NOT NULL;
CREATE INDEX idx_simulation_sessions_submission_passed
    ON simulation_sessions(submission_passed)
    WHERE submission_passed IS NOT NULL;

CREATE TABLE chat_messages (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id   UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id),
    message      TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'notification')),
    timestamp    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_read      BOOLEAN DEFAULT FALSE,
    recipient_id UUID REFERENCES users(id),   -- merged from ALTER
    reply_to     UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    thread_id    UUID,
    reply_count  INTEGER DEFAULT 0,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_session   ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_timestamp ON chat_messages(session_id, timestamp);
CREATE INDEX idx_chat_messages_thread    ON chat_messages(thread_id);
CREATE INDEX idx_chat_messages_reply_to  ON chat_messages(reply_to);
CREATE INDEX idx_chat_messages_recipient ON chat_messages(recipient_id);

CREATE TABLE session_task_progress (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id        UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    task_index        INTEGER NOT NULL,
    status            VARCHAR(50) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
    started_at        TIMESTAMP WITH TIME ZONE,
    completed_at      TIMESTAMP WITH TIME ZONE,
    time_spent        INTEGER DEFAULT 0,
    answer            JSONB,
    score             DECIMAL(5,2),
    feedback          TEXT,
    github_commit_url TEXT,
    prerequisites_met BOOLEAN DEFAULT FALSE,
    unlocked_at       TIMESTAMP WITH TIME ZONE,
    max_attempts      INTEGER DEFAULT 3,
    attempts_used     INTEGER DEFAULT 0,
    can_skip          BOOLEAN DEFAULT FALSE,
    skipped_at        TIMESTAMP WITH TIME ZONE,
    skipped_reason    TEXT,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_session_task_progress_session       ON session_task_progress(session_id);
CREATE INDEX idx_session_task_progress_task          ON session_task_progress(session_id, task_index);
CREATE INDEX idx_session_task_progress_prerequisites ON session_task_progress(prerequisites_met);
CREATE INDEX idx_session_task_progress_unlocked      ON session_task_progress(unlocked_at);
CREATE INDEX idx_session_task_progress_status        ON session_task_progress(session_id, status);

CREATE TABLE scheduled_simulations (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    simulation_id  UUID NOT NULL REFERENCES simulations(id)  ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id),
    scheduled_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    status         VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'missed')),
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_scheduled_simulations_application ON scheduled_simulations(application_id);
CREATE INDEX idx_scheduled_simulations_user        ON scheduled_simulations(user_id);

CREATE TABLE simulation_results (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id         UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    simulation_id      UUID NOT NULL REFERENCES simulations(id)         ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id),
    score              DECIMAL(5,2),
    max_score          DECIMAL(5,2) DEFAULT 100,
    passed             BOOLEAN,
    time_spent         INTEGER,
    answers            JSONB,
    evaluation_details JSONB,
    strengths          TEXT[],
    improvements       TEXT[],
    feedback           TEXT,
    ai_analysis        JSONB,
    completed_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_simulation_results_session    ON simulation_results(session_id);
CREATE INDEX idx_simulation_results_simulation ON simulation_results(simulation_id);
CREATE INDEX idx_simulation_results_user       ON simulation_results(user_id);

-- =====================================================
-- PART 7: AI & ANALYTICS (Stories 111-130)
-- =====================================================

CREATE TABLE ai_analysis (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id        UUID REFERENCES simulations(id)  ON DELETE CASCADE,
    application_id       UUID REFERENCES applications(id) ON DELETE CASCADE,
    user_id              UUID NOT NULL REFERENCES users(id),
    analysis_type        VARCHAR(100) NOT NULL,
    scores               JSONB NOT NULL,
    confidence_intervals JSONB,
    insights             TEXT[],
    recommendations      JSONB,
    raw_data             JSONB,
    model_version        VARCHAR(100),
    processing_time      INTEGER,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_analysis_user       ON ai_analysis(user_id);
CREATE INDEX idx_ai_analysis_type       ON ai_analysis(analysis_type);
CREATE INDEX idx_ai_analysis_simulation ON ai_analysis(simulation_id);

CREATE TABLE skill_gaps (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id             UUID REFERENCES jobs(id),
    skill_id           UUID REFERENCES skills(id),
    current_level      INTEGER,
    required_level     INTEGER,
    gap                INTEGER,
    priority           VARCHAR(50) CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    learning_resources JSONB,
    development_plan   JSONB,
    status             VARCHAR(50) DEFAULT 'identified',
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, job_id, skill_id)
);

CREATE INDEX idx_skill_gaps_user     ON skill_gaps(user_id);
CREATE INDEX idx_skill_gaps_priority ON skill_gaps(priority);

CREATE TABLE performance_trends (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period           VARCHAR(50),
    period_start     DATE,
    period_end       DATE,
    metric_name      VARCHAR(100),
    metric_value     DECIMAL,
    percentile       INTEGER,
    comparison_data  JSONB,
    improvement_rate DECIMAL,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_performance_user   ON performance_trends(user_id);
CREATE INDEX idx_performance_period ON performance_trends(period_start, period_end);

CREATE TABLE ai_model_monitoring (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name      VARCHAR(255) NOT NULL,
    model_version   VARCHAR(100),
    accuracy        DECIMAL(5,2),
    precision       DECIMAL(5,2),
    recall          DECIMAL(5,2),
    f1_score        DECIMAL(5,2),
    confidence_mean DECIMAL(5,2),
    drift_detected  BOOLEAN DEFAULT FALSE,
    drift_score     DECIMAL(5,2),
    sample_size     INTEGER,
    evaluation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metrics         JSONB,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ai_scoring_weights (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    weights    JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- PART 8: BLOCKCHAIN VERIFICATION (Stories 131-145)
-- =====================================================

CREATE TABLE blockchain_credentials (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_type    VARCHAR(100) NOT NULL,
    credential_data    JSONB NOT NULL,
    credential_hash    VARCHAR(255) UNIQUE NOT NULL,
    blockchain_tx_id   VARCHAR(255) UNIQUE NOT NULL,
    blockchain_network VARCHAR(50),
    block_number       INTEGER,
    block_hash         VARCHAR(255),
    timestamp          TIMESTAMP WITH TIME ZONE,
    issuer             VARCHAR(255),
    issuer_did         VARCHAR(255),
    status             VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired', 'suspended')),
    expires_at         TIMESTAMP WITH TIME ZONE,
    revoked_at         TIMESTAMP WITH TIME ZONE,
    revoked_reason     TEXT,
    revoked_by         UUID REFERENCES users(id),
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata           JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_blockchain_user   ON blockchain_credentials(user_id);
CREATE INDEX idx_blockchain_tx     ON blockchain_credentials(blockchain_tx_id);
CREATE INDEX idx_blockchain_hash   ON blockchain_credentials(credential_hash);
CREATE INDEX idx_blockchain_status ON blockchain_credentials(status);

CREATE TABLE blockchain_records (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id  UUID NOT NULL REFERENCES simulations(id)         ON DELETE CASCADE,
    session_id     UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    candidate_id   UUID NOT NULL REFERENCES users(id),
    tx_id          VARCHAR(255) UNIQUE NOT NULL,
    block_hash     VARCHAR(255) NOT NULL,
    data_hash      VARCHAR(255) NOT NULL,
    data           JSONB NOT NULL,
    wallet_address VARCHAR(255),
    timestamp      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id)
);

CREATE INDEX idx_blockchain_records_simulation ON blockchain_records(simulation_id);
CREATE INDEX idx_blockchain_records_tx_id      ON blockchain_records(tx_id);
CREATE INDEX idx_blockchain_records_candidate  ON blockchain_records(candidate_id);
CREATE INDEX idx_blockchain_records_session    ON blockchain_records(session_id);

CREATE TABLE verifiable_credentials (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id   UUID NOT NULL REFERENCES simulations(id)         ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    candidate_id    UUID NOT NULL REFERENCES users(id),
    credential_data JSONB NOT NULL,
    credential_hash VARCHAR(255) UNIQUE NOT NULL,
    issued_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at      TIMESTAMP WITH TIME ZONE,
    revoked_reason  TEXT,
    UNIQUE(session_id)
);

CREATE INDEX idx_verifiable_credentials_simulation ON verifiable_credentials(simulation_id);
CREATE INDEX idx_verifiable_credentials_candidate  ON verifiable_credentials(candidate_id);
CREATE INDEX idx_verifiable_credentials_hash       ON verifiable_credentials(credential_hash);
CREATE INDEX idx_verifiable_credentials_session    ON verifiable_credentials(session_id);

CREATE TABLE credential_access (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_id UUID NOT NULL REFERENCES blockchain_credentials(id) ON DELETE CASCADE,
    granted_to    UUID REFERENCES users(id),
    company_id    UUID REFERENCES companies(id),
    access_level  VARCHAR(50) CHECK (access_level IN ('view', 'verify', 'download', 'share')),
    granted_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by    UUID REFERENCES users(id),
    expires_at    TIMESTAMP WITH TIME ZONE,
    revoked_at    TIMESTAMP WITH TIME ZONE,
    revoked_by    UUID REFERENCES users(id),
    access_token  VARCHAR(255) UNIQUE,
    purpose       TEXT,
    UNIQUE(credential_id, granted_to, company_id, access_level)
);

CREATE INDEX idx_credential_access_cred  ON credential_access(credential_id);
CREATE INDEX idx_credential_access_token ON credential_access(access_token);

CREATE TABLE access_audit (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_id  UUID REFERENCES blockchain_credentials(id) ON DELETE CASCADE,
    accessed_by    UUID REFERENCES users(id),
    accessed_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address     INET,
    user_agent     TEXT,
    action         VARCHAR(100) CHECK (action IN ('viewed', 'verified', 'downloaded', 'shared', 'revoked')),
    resource_type  VARCHAR(50),
    resource_id    VARCHAR(255),
    success        BOOLEAN DEFAULT TRUE,
    failure_reason TEXT,
    metadata       JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_access_audit_credential ON access_audit(credential_id);
CREATE INDEX idx_access_audit_accessed   ON access_audit(accessed_at);

CREATE TABLE blockchain_network_status (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    network         VARCHAR(50) NOT NULL,
    network_name    VARCHAR(100),
    status          VARCHAR(50) CHECK (status IN ('operational', 'degraded', 'outage', 'maintenance')),
    block_height    INTEGER,
    avg_block_time  DECIMAL,
    tx_success_rate DECIMAL(5,2),
    tx_count        INTEGER,
    node_count      INTEGER,
    gas_price       DECIMAL,
    checked_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    response_time   INTEGER,
    error_rate      DECIMAL(5,2),
    metadata        JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_blockchain_network ON blockchain_network_status(network);
CREATE INDEX idx_blockchain_checked ON blockchain_network_status(checked_at);

CREATE TABLE blockchain_wallets (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id            UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id               UUID REFERENCES users(id)    ON DELETE CASCADE,
    wallet_address        VARCHAR(255) UNIQUE NOT NULL,
    wallet_type           VARCHAR(50),
    public_key            TEXT,
    encrypted_private_key TEXT,
    is_active             BOOLEAN DEFAULT TRUE,
    last_used_at          TIMESTAMP WITH TIME ZONE,
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK ((company_id IS NOT NULL) OR (user_id IS NOT NULL))
);

CREATE TABLE external_credentials (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source              VARCHAR(255) NOT NULL,
    source_url          TEXT,
    credential_id       VARCHAR(255),
    credential_type     VARCHAR(100),
    issuer              VARCHAR(255),
    issuance_date       DATE,
    expiry_date         DATE,
    credential_data     JSONB,
    verification_status VARCHAR(50) DEFAULT 'pending',
    verified_at         TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE metamask_nonces (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address    VARCHAR(255) NOT NULL,
    nonce      TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(address)
);

CREATE INDEX idx_metamask_nonces_address ON metamask_nonces(address);

CREATE TABLE wallet_addresses (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id)               ON DELETE CASCADE,
    simulation_id UUID REFERENCES simulations(id)                  ON DELETE SET NULL,
    session_id    UUID REFERENCES simulation_sessions(id)          ON DELETE SET NULL,
    address       VARCHAR(255) NOT NULL,
    private_key   TEXT,
    is_primary    BOOLEAN DEFAULT FALSE,
    status        VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'revoked')),
    used_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(address)
);

CREATE INDEX idx_wallet_addresses_user      ON wallet_addresses(user_id);
CREATE INDEX idx_wallet_addresses_address   ON wallet_addresses(address);
CREATE UNIQUE INDEX idx_unique_address_per_simulation
    ON wallet_addresses(address) WHERE status = 'active';
CREATE UNIQUE INDEX idx_unique_address_per_candidate_simulation
    ON wallet_addresses(user_id, simulation_id) WHERE status = 'active';

-- =====================================================
-- PART 9: DASHBOARD & ANALYTICS (Stories 146-165)
-- =====================================================

CREATE TABLE hiring_funnel (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    job_id               UUID REFERENCES jobs(id),
    date                 DATE NOT NULL,
    stage                VARCHAR(100) NOT NULL,
    count                INTEGER NOT NULL,
    previous_stage_count INTEGER,
    conversion_rate      DECIMAL(5,2),
    time_in_stage        DECIMAL(10,2),
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_funnel_company ON hiring_funnel(company_id);
CREATE INDEX idx_funnel_date    ON hiring_funnel(date);
CREATE INDEX idx_funnel_job     ON hiring_funnel(job_id);

CREATE TABLE time_to_hire (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    job_id         UUID REFERENCES jobs(id),
    candidate_id   UUID REFERENCES users(id),
    days_to_hire   INTEGER NOT NULL,
    days_per_stage JSONB,
    hired_at       TIMESTAMP WITH TIME ZONE,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE source_effectiveness (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    source          VARCHAR(255) NOT NULL,
    source_category VARCHAR(100),
    applicants      INTEGER DEFAULT 0,
    screenings      INTEGER DEFAULT 0,
    interviews      INTEGER DEFAULT 0,
    offers          INTEGER DEFAULT 0,
    hires           INTEGER DEFAULT 0,
    cost            DECIMAL(10,2),
    cost_per_hire   DECIMAL(10,2),
    conversion_rate DECIMAL(5,2),
    period_start    DATE,
    period_end      DATE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE diversity_metrics (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    date       DATE NOT NULL,
    dimension  VARCHAR(100),
    category   VARCHAR(100),
    applicants INTEGER DEFAULT 0,
    interviews INTEGER DEFAULT 0,
    offers     INTEGER DEFAULT 0,
    hires      INTEGER DEFAULT 0,
    percentage DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE cost_per_hire (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    job_id         UUID REFERENCES jobs(id),
    fiscal_period  VARCHAR(50),
    total_cost     DECIMAL(10,2),
    external_costs DECIMAL(10,2),
    internal_costs DECIMAL(10,2),
    hires_count    INTEGER,
    cost_per_hire  DECIMAL(10,2),
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE quality_of_hire (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    candidate_id         UUID REFERENCES users(id),
    job_id               UUID REFERENCES jobs(id),
    hire_date            DATE,
    performance_rating   DECIMAL(3,2),
    retention_days       INTEGER,
    manager_satisfaction INTEGER,
    peer_feedback        JSONB,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE custom_reports (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    report_config JSONB NOT NULL,
    schedule      JSONB,
    recipients    TEXT[],
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE platform_usage (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date                    DATE NOT NULL,
    active_companies        INTEGER DEFAULT 0,
    active_candidates       INTEGER DEFAULT 0,
    new_companies           INTEGER DEFAULT 0,
    new_candidates          INTEGER DEFAULT 0,
    jobs_posted             INTEGER DEFAULT 0,
    applications_submitted  INTEGER DEFAULT 0,
    simulations_started     INTEGER DEFAULT 0,
    simulations_completed   INTEGER DEFAULT 0,
    api_calls               INTEGER DEFAULT 0,
    blockchain_transactions INTEGER DEFAULT 0,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE system_performance (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    endpoint             VARCHAR(255),
    response_time_avg    INTEGER,
    response_time_p95    INTEGER,
    response_time_p99    INTEGER,
    error_rate           DECIMAL(5,2),
    requests_per_minute  INTEGER,
    cpu_usage            DECIMAL(5,2),
    memory_usage         DECIMAL(5,2),
    database_connections INTEGER,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- PART 10: NOTIFICATIONS (Stories 166-175)
-- =====================================================

CREATE TABLE notifications (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type           VARCHAR(100) NOT NULL,
    category       VARCHAR(100) CHECK (category IN ('application', 'simulation', 'message', 'security', 'billing', 'system', 'promotional')),
    title          VARCHAR(255) NOT NULL,
    content        TEXT,
    data           JSONB,
    priority       VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    channels       TEXT[],
    status         VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
    sent_at        TIMESTAMP WITH TIME ZONE,
    delivered_at   TIMESTAMP WITH TIME ZONE,
    read_at        TIMESTAMP WITH TIME ZONE,
    failed_at      TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata       JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_notifications_user         ON notifications(user_id);
CREATE INDEX idx_notifications_status       ON notifications(status);
CREATE INDEX idx_notifications_created      ON notifications(created_at);
CREATE INDEX idx_notifications_category     ON notifications(category);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

CREATE TABLE notification_preferences (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email       JSONB NOT NULL DEFAULT '{
        "application_updates": true,
        "simulation_reminders": true,
        "messages": true,
        "security": true,
        "billing": true,
        "promotional": false
    }'::JSONB,
    sms         JSONB NOT NULL DEFAULT '{
        "application_updates": false,
        "simulation_reminders": true,
        "security": true,
        "billing": false
    }'::JSONB,
    push        JSONB NOT NULL DEFAULT '{
        "application_updates": true,
        "simulation_reminders": true,
        "messages": true,
        "security": true
    }'::JSONB,
    in_app      JSONB NOT NULL DEFAULT '{
        "all": true
    }'::JSONB,
    quiet_hours JSONB DEFAULT '{
        "enabled": false,
        "start": "22:00",
        "end": "07:00",
        "timezone": "UTC",
        "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    }'::JSONB,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_email_prefs CHECK (email ? 'application_updates' AND email ? 'simulation_reminders')
);

CREATE TABLE email_tracking (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID REFERENCES notifications(id),
    email_id        VARCHAR(255),
    recipient       VARCHAR(255) NOT NULL,
    subject         VARCHAR(255),
    opened_at       TIMESTAMP WITH TIME ZONE,
    opened_count    INTEGER DEFAULT 0,
    clicked_at      TIMESTAMP WITH TIME ZONE,
    clicked_url     TEXT,
    bounced         BOOLEAN DEFAULT FALSE,
    bounce_reason   TEXT,
    bounce_type     VARCHAR(100),
    complained      BOOLEAN DEFAULT FALSE,
    complaint_type  VARCHAR(100),
    delivered       BOOLEAN DEFAULT FALSE,
    delivered_at    TIMESTAMP WITH TIME ZONE,
    sent_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata        JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_email_tracking_recipient    ON email_tracking(recipient);
CREATE INDEX idx_email_tracking_notification ON email_tracking(notification_id);

CREATE TABLE notification_delivery_monitoring (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date              DATE NOT NULL,
    channel           VARCHAR(50),
    total_sent        INTEGER DEFAULT 0,
    delivered         INTEGER DEFAULT 0,
    failed            INTEGER DEFAULT 0,
    opened            INTEGER DEFAULT 0,
    clicked           INTEGER DEFAULT 0,
    bounced           INTEGER DEFAULT 0,
    complained        INTEGER DEFAULT 0,
    avg_delivery_time INTEGER,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE system_announcements (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title             VARCHAR(255) NOT NULL,
    content           TEXT NOT NULL,
    announcement_type VARCHAR(50) CHECK (announcement_type IN ('maintenance', 'security', 'feature', 'policy', 'emergency', 'general')),
    severity          VARCHAR(50) CHECK (severity IN ('info', 'warning', 'critical')),
    target_audience   VARCHAR(50) CHECK (target_audience IN ('all', 'candidates', 'recruiters', 'admins')),
    channels          TEXT[],
    scheduled_at      TIMESTAMP WITH TIME ZONE,
    expires_at        TIMESTAMP WITH TIME ZONE,
    published_at      TIMESTAMP WITH TIME ZONE,
    published_by      UUID REFERENCES users(id),
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by        UUID REFERENCES users(id)
);

-- =====================================================
-- PART 11: INTEGRATIONS (Stories 176-185)
-- =====================================================

CREATE TABLE api_keys (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name              VARCHAR(255) NOT NULL,
    key_hash          VARCHAR(255) UNIQUE NOT NULL,
    key_preview       VARCHAR(20),
    scopes            TEXT[],
    ip_whitelist      INET[],
    rate_limit        INTEGER DEFAULT 1000,
    rate_limit_period VARCHAR(20) DEFAULT 'minute',
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at        TIMESTAMP WITH TIME ZONE,
    last_used_at      TIMESTAMP WITH TIME ZONE,
    revoked_at        TIMESTAMP WITH TIME ZONE,
    revoked_reason    TEXT,
    metadata          JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_api_keys_company ON api_keys(company_id);
CREATE INDEX idx_api_keys_hash    ON api_keys(key_hash);

CREATE TABLE webhooks (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    url          TEXT NOT NULL,
    events       TEXT[] NOT NULL,
    secret       VARCHAR(255),
    headers      JSONB,
    status       VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'failed', 'disabled')),
    retry_policy JSONB DEFAULT '{
        "max_attempts": 3,
        "initial_delay": 1000,
        "backoff_factor": 2
    }'::JSONB,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by   UUID REFERENCES users(id)
);

CREATE INDEX idx_webhooks_company ON webhooks(company_id);
CREATE INDEX idx_webhooks_status  ON webhooks(status);

CREATE TABLE webhook_delivery_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id      UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type      VARCHAR(255),
    payload         JSONB,
    response_status INTEGER,
    response_body   TEXT,
    attempt         INTEGER DEFAULT 1,
    success         BOOLEAN,
    duration_ms     INTEGER,
    error_message   TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_webhook ON webhook_delivery_logs(webhook_id);
CREATE INDEX idx_webhook_logs_created ON webhook_delivery_logs(created_at);

CREATE TABLE integration_logs (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    integration_type VARCHAR(100) CHECK (integration_type IN ('hris', 'linkedin', 'calendar', 'background_check', 'job_board', 'email')),
    event            VARCHAR(255),
    request_data     JSONB,
    response_data    JSONB,
    status_code      INTEGER,
    success          BOOLEAN,
    duration_ms      INTEGER,
    error_message    TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_integration_logs_company ON integration_logs(company_id);
CREATE INDEX idx_integration_logs_type    ON integration_logs(integration_type);

CREATE TABLE linkedin_integration (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID REFERENCES users(id)    ON DELETE CASCADE,
    company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
    linkedin_id      VARCHAR(255),
    access_token     TEXT,
    refresh_token    TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    profile_data     JSONB,
    last_sync_at     TIMESTAMP WITH TIME ZONE,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE calendar_integration (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
    calendar_type    VARCHAR(50) CHECK (calendar_type IN ('google', 'outlook', 'apple')),
    calendar_id      VARCHAR(255),
    access_token     TEXT,
    refresh_token    TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    settings         JSONB,
    last_sync_at     TIMESTAMP WITH TIME ZONE,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE background_check_integration (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id     UUID REFERENCES applications(id) ON DELETE CASCADE,
    provider           VARCHAR(100),
    provider_reference VARCHAR(255),
    status             VARCHAR(50),
    consent_given      BOOLEAN DEFAULT FALSE,
    consent_at         TIMESTAMP WITH TIME ZONE,
    consent_ip         INET,
    data_sent          JSONB,
    result_summary     JSONB,
    report_url         TEXT,
    completed_at       TIMESTAMP WITH TIME ZONE,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- PART 12: BILLING & SUBSCRIPTIONS (Stories 186-190)
-- =====================================================

CREATE TABLE subscription_plans (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(255) NOT NULL,
    slug          VARCHAR(255) UNIQUE NOT NULL,
    description   TEXT,
    features      JSONB,
    limits        JSONB,
    price_monthly DECIMAL(10,2),
    price_yearly  DECIMAL(10,2),
    currency      VARCHAR(3) DEFAULT 'USD',
    is_public     BOOLEAN DEFAULT TRUE,
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE subscriptions (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id             UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_id                UUID REFERENCES subscription_plans(id),
    stripe_subscription_id VARCHAR(255),
    status                 VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid')),
    billing_cycle          VARCHAR(50) CHECK (billing_cycle IN ('monthly', 'yearly')),
    started_at             TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_start   TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end     TIMESTAMP WITH TIME ZONE NOT NULL,
    canceled_at            TIMESTAMP WITH TIME ZONE,
    trial_start            TIMESTAMP WITH TIME ZONE,
    trial_end              TIMESTAMP WITH TIME ZONE,
    payment_method_id      VARCHAR(255),
    payment_method_details JSONB,
    metadata               JSONB DEFAULT '{}'::JSONB,
    created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_company ON subscriptions(company_id);
CREATE INDEX idx_subscriptions_status  ON subscriptions(status);
CREATE INDEX idx_subscriptions_period  ON subscriptions(current_period_end);

CREATE TABLE invoices (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    subscription_id    UUID REFERENCES subscriptions(id),
    stripe_invoice_id  VARCHAR(255) UNIQUE,
    invoice_number     VARCHAR(255) UNIQUE NOT NULL,
    amount             DECIMAL(10,2) NOT NULL,
    tax                DECIMAL(10,2) DEFAULT 0,
    tax_rate           DECIMAL(5,2),
    currency           VARCHAR(3) DEFAULT 'USD',
    status             VARCHAR(50) CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
    line_items         JSONB NOT NULL,
    pdf_url            TEXT,
    hosted_invoice_url TEXT,
    paid_at            TIMESTAMP WITH TIME ZONE,
    due_date           DATE,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_number  ON invoices(invoice_number);
CREATE INDEX idx_invoices_status  ON invoices(status);

CREATE TABLE payment_methods (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id               UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    stripe_payment_method_id VARCHAR(255),
    type                     VARCHAR(50) CHECK (type IN ('card', 'bank_account', 'paypal')),
    last_four                VARCHAR(4),
    expiry_month             INTEGER,
    expiry_year              INTEGER,
    card_brand               VARCHAR(50),
    bank_name                VARCHAR(255),
    is_default               BOOLEAN DEFAULT FALSE,
    billing_details          JSONB,
    created_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payment_methods_company ON payment_methods(company_id);
CREATE INDEX idx_payment_methods_default ON payment_methods(company_id, is_default) WHERE is_default = TRUE;

CREATE TABLE usage_tracking (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    resource_type VARCHAR(100) NOT NULL CHECK (resource_type IN ('users', 'jobs', 'simulations', 'api_calls', 'storage')),
    quantity      INTEGER NOT NULL,
    recorded_date DATE NOT NULL,
    metadata      JSONB DEFAULT '{}'::JSONB,
    UNIQUE(company_id, resource_type, recorded_date)
);

CREATE INDEX idx_usage_company ON usage_tracking(company_id);
CREATE INDEX idx_usage_date    ON usage_tracking(recorded_date);

CREATE TABLE coupons (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code             VARCHAR(50) UNIQUE NOT NULL,
    description      TEXT,
    discount_type    VARCHAR(50) CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_months')),
    discount_value   DECIMAL(10,2),
    duration         VARCHAR(50) CHECK (duration IN ('once', 'repeating', 'forever')),
    duration_months  INTEGER,
    max_redemptions  INTEGER,
    redemption_count INTEGER DEFAULT 0,
    applicable_plans UUID[],
    expires_at       TIMESTAMP WITH TIME ZONE,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by       UUID REFERENCES users(id)
);

-- =====================================================
-- PART 13: SUPPORT & HELP (Stories 191-195)
-- =====================================================

CREATE TABLE support_tickets (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_number        VARCHAR(50) UNIQUE,
    subject              VARCHAR(255) NOT NULL,
    description          TEXT NOT NULL,
    category             VARCHAR(100) CHECK (category IN ('technical', 'billing', 'account', 'feature_request', 'bug', 'other')),
    priority             VARCHAR(50) CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    status               VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
    attachments          JSONB DEFAULT '[]'::JSONB,
    assigned_to          UUID REFERENCES users(id),
    resolved_at          TIMESTAMP WITH TIME ZONE,
    closed_at            TIMESTAMP WITH TIME ZONE,
    satisfaction_rating  INTEGER,
    satisfaction_comment TEXT,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_support_tickets_user    ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_status  ON support_tickets(status);
CREATE INDEX idx_support_tickets_created ON support_tickets(created_at);

CREATE TABLE ticket_messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id),
    message     TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::JSONB,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE bug_reports (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL REFERENCES users(id),
    title              VARCHAR(255) NOT NULL,
    description        TEXT NOT NULL,
    steps_to_reproduce TEXT,
    expected_behavior  TEXT,
    actual_behavior    TEXT,
    severity           VARCHAR(50) CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    frequency          VARCHAR(50) CHECK (frequency IN ('always', 'sometimes', 'rarely')),
    url                TEXT,
    browser_info       JSONB,
    device_info        JSONB,
    attachments        JSONB DEFAULT '[]'::JSONB,
    status             VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'fixed', 'cannot_reproduce', 'wont_fix')),
    assigned_to        UUID REFERENCES users(id),
    fixed_in_version   VARCHAR(50),
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE feature_suggestions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    title       VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category    VARCHAR(100),
    votes       INTEGER DEFAULT 0,
    status      VARCHAR(50) DEFAULT 'under_review' CHECK (status IN ('under_review', 'planned', 'in_development', 'launched', 'declined')),
    admin_notes TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE feature_votes (
    user_id       UUID NOT NULL REFERENCES users(id)               ON DELETE CASCADE,
    suggestion_id UUID NOT NULL REFERENCES feature_suggestions(id) ON DELETE CASCADE,
    voted_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, suggestion_id)
);

CREATE TABLE faqs (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question          TEXT NOT NULL,
    answer            TEXT NOT NULL,
    category          VARCHAR(100),
    tags              TEXT[],
    helpful_count     INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,
    sort_order        INTEGER DEFAULT 0,
    is_published      BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- PART 14: EVALUATION SYSTEM (Stories 196-210)
-- =====================================================

CREATE TABLE evaluations (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id              UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
    simulation_id             UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    overall_score             DECIMAL(5,2) NOT NULL CHECK (overall_score             BETWEEN 0 AND 100),
    punctuality_score         DECIMAL(5,2) NOT NULL CHECK (punctuality_score         BETWEEN 0 AND 100),
    communication_score       DECIMAL(5,2) NOT NULL CHECK (communication_score       BETWEEN 0 AND 100),
    problem_solving_score     DECIMAL(5,2) NOT NULL CHECK (problem_solving_score     BETWEEN 0 AND 100),
    adaptability_score        DECIMAL(5,2) NOT NULL CHECK (adaptability_score        BETWEEN 0 AND 100),
    collaboration_score       DECIMAL(5,2) NOT NULL CHECK (collaboration_score       BETWEEN 0 AND 100),
    attention_to_detail_score DECIMAL(5,2) NOT NULL CHECK (attention_to_detail_score BETWEEN 0 AND 100),
    initiative_score          DECIMAL(5,2) NOT NULL CHECK (initiative_score          BETWEEN 0 AND 100),
    quality_score             DECIMAL(5,2) CHECK (quality_score    BETWEEN 0 AND 100),
    speed_score               DECIMAL(5,2) CHECK (speed_score      BETWEEN 0 AND 100),
    behavioral_score          DECIMAL(5,2) CHECK (behavioral_score BETWEEN 0 AND 100),
    quality_weight            INTEGER DEFAULT 40 CHECK (quality_weight    BETWEEN 0 AND 100),
    speed_weight              INTEGER DEFAULT 30 CHECK (speed_weight      BETWEEN 0 AND 100),
    behavioral_weight         INTEGER DEFAULT 30 CHECK (behavioral_weight BETWEEN 0 AND 100),
    status                    VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'reviewed')),
    completed_at              TIMESTAMP WITH TIME ZONE,
    reviewed_at               TIMESTAMP WITH TIME ZONE,
    reviewer_id               UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(candidate_id, simulation_id),
    CONSTRAINT evaluations_total_weight_check CHECK (quality_weight + speed_weight + behavioral_weight = 100)
);

CREATE INDEX idx_evaluations_candidate  ON evaluations(candidate_id);
CREATE INDEX idx_evaluations_simulation ON evaluations(simulation_id);
CREATE INDEX idx_evaluations_status     ON evaluations(status);

CREATE TABLE evaluation_sections (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evaluation_id      UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    section_name       VARCHAR(100) NOT NULL,
    score              INTEGER NOT NULL CHECK (score >= 0),
    max_score          INTEGER NOT NULL CHECK (max_score > 0),
    percentage         DECIMAL(5,2) NOT NULL CHECK (percentage BETWEEN 0 AND 100),
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    tasks_completed    INTEGER NOT NULL DEFAULT 0,
    total_tasks        INTEGER NOT NULL DEFAULT 0,
    metadata           JSONB DEFAULT '{}'::JSONB,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(evaluation_id, section_name)
);

CREATE INDEX idx_evaluation_sections_evaluation ON evaluation_sections(evaluation_id);
CREATE INDEX idx_evaluation_sections_metadata   ON evaluation_sections USING GIN(metadata);

CREATE TABLE evaluation_behavioral_metrics (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evaluation_id          UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    metric                 VARCHAR(100) NOT NULL,
    score                  INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    description            TEXT,
    examples               JSONB DEFAULT '[]'::JSONB,
    improvement_suggestion TEXT,
    created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(evaluation_id, metric)
);

CREATE INDEX idx_evaluation_behavioral_evaluation ON evaluation_behavioral_metrics(evaluation_id);

CREATE TABLE evaluation_skill_assessments (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    skill         VARCHAR(100) NOT NULL,
    level         VARCHAR(20) NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced', 'expert')),
    score         INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    evidence      JSONB DEFAULT '[]'::JSONB,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(evaluation_id, skill)
);

CREATE INDEX idx_evaluation_skills_evaluation ON evaluation_skill_assessments(evaluation_id);

CREATE TABLE evaluation_ai_feedback (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evaluation_id         UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE UNIQUE,
    summary               TEXT,
    detailed_analysis     TEXT,
    strengths             JSONB DEFAULT '[]'::JSONB,
    areas_for_improvement JSONB DEFAULT '[]'::JSONB,
    recommendations       JSONB DEFAULT '[]'::JSONB,
    confidence            DECIMAL(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE evaluation_benchmarks (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evaluation_id       UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE UNIQUE,
    overall_percentile  INTEGER NOT NULL CHECK (overall_percentile  BETWEEN 0 AND 100),
    role_percentile     INTEGER NOT NULL CHECK (role_percentile     BETWEEN 0 AND 100),
    industry_percentile INTEGER NOT NULL CHECK (industry_percentile BETWEEN 0 AND 100),
    company_percentile  INTEGER NOT NULL CHECK (company_percentile  BETWEEN 0 AND 100),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE evaluation_similar_candidates (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evaluation_id        UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    similar_candidate_id UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
    similarity           DECIMAL(5,2) NOT NULL CHECK (similarity BETWEEN 0 AND 100),
    score                INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(evaluation_id, similar_candidate_id)
);

CREATE INDEX idx_evaluation_similar_evaluation ON evaluation_similar_candidates(evaluation_id);

CREATE TABLE evaluation_qualitative_feedback (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evaluation_id    UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE UNIQUE,
    strengths        JSONB DEFAULT '[]'::JSONB,
    weaknesses       JSONB DEFAULT '[]'::JSONB,
    recommendations  JSONB DEFAULT '[]'::JSONB,
    overall_feedback TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE evaluation_interview_questions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    question      TEXT NOT NULL,
    priority      INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
    category      VARCHAR(50),
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_evaluation_questions_evaluation ON evaluation_interview_questions(evaluation_id);

-- =====================================================
-- GITHUB INTEGRATION TABLES
-- =====================================================

CREATE TABLE github_connections (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    github_username  VARCHAR(100) NOT NULL,
    access_token     TEXT,
    refresh_token    TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    connected_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_synced_at   TIMESTAMP WITH TIME ZONE,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id),
    UNIQUE(github_username)
);

CREATE INDEX idx_github_connections_user     ON github_connections(user_id);
CREATE INDEX idx_github_connections_username ON github_connections(github_username);

CREATE TABLE github_simulation_repos (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id    UUID REFERENCES simulations(id) ON DELETE SET NULL,
    candidate_id     UUID NOT NULL REFERENCES users(id),
    repo_name        VARCHAR(255) NOT NULL,
    repo_url         TEXT NOT NULL,
    branch_name      VARCHAR(255),
    created_by       UUID REFERENCES users(id),
    status           VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    commit_count     INTEGER DEFAULT 0,
    pr_opened_at     TIMESTAMP WITH TIME ZONE,
    pr_url           TEXT,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    session_id       UUID REFERENCES simulation_sessions(id) ON DELETE SET NULL,
    attempt_number   INTEGER DEFAULT 1,
    metadata         JSONB DEFAULT '{}'::JSONB,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_github_simulation_repos_candidate  ON github_simulation_repos(candidate_id);
CREATE INDEX idx_github_simulation_repos_simulation ON github_simulation_repos(simulation_id);
CREATE INDEX idx_github_simulation_repos_status     ON github_simulation_repos(status);
CREATE INDEX idx_github_repos_session_id            ON github_simulation_repos(session_id);
CREATE INDEX idx_github_repos_sim_candidate         ON github_simulation_repos(simulation_id, candidate_id);
CREATE INDEX idx_github_repos_lookup                ON github_simulation_repos(simulation_id, candidate_id, session_id, status);
CREATE UNIQUE INDEX idx_unique_repo_per_session
    ON github_simulation_repos(simulation_id, candidate_id, session_id) WHERE status = 'active';
CREATE UNIQUE INDEX idx_unique_active_repo_no_session
    ON github_simulation_repos(simulation_id, candidate_id) WHERE status = 'active' AND session_id IS NULL;

CREATE TABLE github_repo_analysis (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id        UUID REFERENCES users(id),
    simulation_id       UUID REFERENCES simulations(id),
    submission_id       UUID,
    repo_owner          VARCHAR(100) NOT NULL,
    repo_name           VARCHAR(255) NOT NULL,
    repo_url            TEXT NOT NULL,
    is_private          BOOLEAN DEFAULT FALSE,
    total_commits       INTEGER DEFAULT 0,
    total_pull_requests INTEGER DEFAULT 0,
    languages_used      TEXT[],
    commit_frequency    DECIMAL(5,2),
    avg_commit_size     DECIMAL(5,2),
    first_commit_date   TIMESTAMP WITH TIME ZONE,
    last_commit_date    TIMESTAMP WITH TIME ZONE,
    contributors_count  INTEGER DEFAULT 0,
    branch_count        INTEGER DEFAULT 0,
    analysis_data       JSONB,
    analyzed_at         TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_github_repo_analysis_candidate  ON github_repo_analysis(candidate_id);
CREATE INDEX idx_github_repo_analysis_simulation ON github_repo_analysis(simulation_id);
CREATE INDEX idx_github_repo_analysis_repo       ON github_repo_analysis(repo_owner, repo_name);

CREATE TABLE github_submissions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id   UUID NOT NULL REFERENCES users(id),
    task_id        VARCHAR(255) NOT NULL,
    simulation_id  UUID REFERENCES simulations(id),
    repo_owner     VARCHAR(100) NOT NULL,
    repo_name      VARCHAR(255) NOT NULL,
    repo_url       TEXT NOT NULL,
    status         VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'completed', 'failed')),
    analysis_data  JSONB,
    completed_at   TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    submitted_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_github_submissions_candidate  ON github_submissions(candidate_id);
CREATE INDEX idx_github_submissions_simulation ON github_submissions(simulation_id);
CREATE INDEX idx_github_submissions_status     ON github_submissions(status);
CREATE INDEX idx_github_submissions_submitted  ON github_submissions(submitted_at);

-- =====================================================
-- TASK DEPENDENCIES & PROGRESSION TABLES
-- =====================================================

CREATE TABLE task_dependencies (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id      UUID NOT NULL REFERENCES simulations(id)      ON DELETE CASCADE,
    task_id            UUID NOT NULL REFERENCES simulation_tasks(id),
    depends_on_task_id UUID NOT NULL REFERENCES simulation_tasks(id),
    dependency_type    VARCHAR(50) DEFAULT 'completion' CHECK (dependency_type IN (
        'completion', 'score_minimum', 'time_spent',
        'github_repo', 'github_pr', 'github_commit', 'order'
    )),
    min_score_required INTEGER CHECK (min_score_required BETWEEN 0 AND 100),
    min_time_spent     INTEGER,
    min_commits        INTEGER,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(task_id, depends_on_task_id)
);

CREATE INDEX idx_task_dependencies_sim     ON task_dependencies(simulation_id);
CREATE INDEX idx_task_dependencies_task    ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends ON task_dependencies(depends_on_task_id);

CREATE TABLE task_unlock_conditions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_progress_id UUID NOT NULL REFERENCES session_task_progress(id) ON DELETE CASCADE,
    dependency_id    UUID NOT NULL REFERENCES task_dependencies(id),
    condition_type   VARCHAR(50) NOT NULL,
    condition_value  TEXT,
    is_met           BOOLEAN DEFAULT FALSE,
    met_at           TIMESTAMP WITH TIME ZONE,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_unlock_conditions_progress   ON task_unlock_conditions(task_progress_id);
CREATE INDEX idx_unlock_conditions_dependency ON task_unlock_conditions(dependency_id);

CREATE TABLE task_progression_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id  UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
    task_id     UUID NOT NULL REFERENCES simulation_tasks(id),
    from_status VARCHAR(50),
    to_status   VARCHAR(50),
    changed_by  UUID REFERENCES users(id),
    reason      TEXT,
    metadata    JSONB,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_task_history_session ON task_progression_history(session_id);
CREATE INDEX idx_task_history_task    ON task_progression_history(task_id);
CREATE INDEX idx_task_history_created ON task_progression_history(created_at);

CREATE TABLE simulation_task_issues (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id UUID NOT NULL REFERENCES simulations(id)      ON DELETE CASCADE,
    task_id       UUID NOT NULL REFERENCES simulation_tasks(id) ON DELETE CASCADE,
    task_index    INTEGER NOT NULL,
    task_name     VARCHAR(255) NOT NULL,
    task_type     VARCHAR(100),
    issue_number  INTEGER NOT NULL,
    issue_url     TEXT NOT NULL,
    repo_name     VARCHAR(255) NOT NULL,
    repo_owner    VARCHAR(100) NOT NULL,
    depends_on    INTEGER,
    min_commits   INTEGER,
    requires_pr   BOOLEAN DEFAULT FALSE,
    min_score     INTEGER,
    status        VARCHAR(50) DEFAULT 'open',
    completed_at  TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(simulation_id, task_id)
);

CREATE INDEX idx_task_issues_simulation ON simulation_task_issues(simulation_id);
CREATE INDEX idx_task_issues_task       ON simulation_task_issues(task_id);
CREATE INDEX idx_task_issues_repo       ON simulation_task_issues(repo_name, issue_number);

-- =====================================================
-- MATERIALIZED VIEWS
-- =====================================================

CREATE MATERIALIZED VIEW candidate_dashboard AS
SELECT
    u.id,
    u.email,
    COUNT(DISTINCT a.id)               AS total_applications,
    COUNT(DISTINCT s.id)               AS total_simulations,
    AVG(s.punctuality_score)           AS avg_punctuality,
    AVG(s.communication_score)         AS avg_communication,
    AVG(s.problem_solving_score)       AS avg_problem_solving,
    AVG(s.adaptability_score)          AS avg_adaptability,
    MAX(a.applied_at)                  AS last_application,
    MAX(s.completed_at)                AS last_simulation,
    COUNT(DISTINCT sa.job_id)          AS saved_jobs_count
FROM users u
LEFT JOIN applications a  ON u.id = a.user_id
LEFT JOIN simulations  s  ON u.id = s.user_id
LEFT JOIN saved_jobs   sa ON u.id = sa.user_id
WHERE u.user_type = 'candidate'
GROUP BY u.id, u.email;

CREATE UNIQUE INDEX idx_candidate_dashboard ON candidate_dashboard(id);

CREATE MATERIALIZED VIEW recruiter_dashboard AS
SELECT
    u.id,
    u.email,
    COUNT(DISTINCT j.id)                                                AS total_jobs,
    COUNT(DISTINCT a.id)                                                AS total_applications,
    COUNT(DISTINCT CASE WHEN a.status = 'hired' THEN a.id END)         AS total_hires,
    AVG(EXTRACT(EPOCH FROM (a.updated_at - a.applied_at)) / 86400)     AS avg_time_to_hire,
    COUNT(DISTINCT s.id)                                                AS total_simulations
FROM users u
LEFT JOIN jobs         j ON u.id = j.created_by
LEFT JOIN applications a ON j.id = a.job_id
LEFT JOIN simulations  s ON a.id = s.application_id
WHERE u.user_type IN ('recruiter', 'company_admin')
GROUP BY u.id, u.email;

CREATE UNIQUE INDEX idx_recruiter_dashboard ON recruiter_dashboard(id);

-- =====================================================
-- VIEWS
-- =====================================================

CREATE VIEW active_jobs AS
SELECT j.*, c.name AS company_name, c.logo_url
FROM jobs j
JOIN companies c ON j.company_id = c.id
WHERE j.status = 'active'
  AND (j.expires_at IS NULL OR j.expires_at > NOW())
  AND j.deleted_at IS NULL;

CREATE VIEW candidate_summary AS
SELECT
    u.id,
    u.email,
    cp.first_name,
    cp.last_name,
    cp.headline,
    cp.profile_completion,
    COUNT(DISTINCT a.id) AS total_applications,
    COUNT(DISTINCT s.id) AS total_simulations,
    MAX(s.overall_score) AS best_simulation_score
FROM users u
LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
LEFT JOIN applications       a  ON u.id = a.user_id
LEFT JOIN simulations        s  ON u.id = s.user_id
WHERE u.user_type = 'candidate'
GROUP BY u.id, u.email, cp.first_name, cp.last_name, cp.headline, cp.profile_completion;

CREATE VIEW job_application_stats AS
SELECT
    j.id,
    j.title,
    j.company_id,
    COUNT(DISTINCT a.id)                                                        AS total_applications,
    COUNT(DISTINCT CASE WHEN a.status = 'submitted'    THEN a.id END)          AS submitted,
    COUNT(DISTINCT CASE WHEN a.status = 'under_review' THEN a.id END)          AS under_review,
    COUNT(DISTINCT CASE WHEN a.status = 'shortlisted'  THEN a.id END)          AS shortlisted,
    COUNT(DISTINCT CASE WHEN a.status = 'interview'    THEN a.id END)          AS in_interview,
    COUNT(DISTINCT CASE WHEN a.status = 'offer'        THEN a.id END)          AS offers,
    COUNT(DISTINCT CASE WHEN a.status = 'hired'        THEN a.id END)          AS hires,
    AVG(EXTRACT(EPOCH FROM (a.updated_at - a.applied_at)) / 86400)             AS avg_days_in_process
FROM jobs j
LEFT JOIN applications a ON j.id = a.job_id
WHERE j.deleted_at IS NULL
GROUP BY j.id, j.title, j.company_id;

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_candidate_profiles_updated_at
    BEFORE UPDATE ON candidate_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_evaluations_updated_at
    BEFORE UPDATE ON evaluations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_feedback_updated_at
    BEFORE UPDATE ON evaluation_ai_feedback
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_benchmarks_updated_at
    BEFORE UPDATE ON evaluation_benchmarks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qualitative_feedback_updated_at
    BEFORE UPDATE ON evaluation_qualitative_feedback
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION generate_application_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix     TEXT;
    sequence_number INTEGER;
BEGIN
    year_prefix := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(SUBSTRING(application_number FROM '\d+$')::INTEGER), 0) + 1
    INTO sequence_number
    FROM applications
    WHERE application_number LIKE year_prefix || '-%';
    NEW.application_number := year_prefix || '-' || LPAD(sequence_number::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_application_number_trigger
    BEFORE INSERT ON applications
    FOR EACH ROW
    WHEN (NEW.application_number IS NULL)
    EXECUTE FUNCTION generate_application_number();

CREATE OR REPLACE FUNCTION update_job_application_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE jobs
        SET application_count = application_count + 1
        WHERE id = NEW.job_id;

        UPDATE job_applications_tracking
        SET application_count   = application_count + 1,
            last_application_at = NOW()
        WHERE job_id = NEW.job_id;

        IF NOT FOUND THEN
            INSERT INTO job_applications_tracking (job_id, application_count, last_application_at)
            VALUES (NEW.job_id, 1, NOW());
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        UPDATE jobs
        SET application_count = GREATEST(application_count - 1, 0)
        WHERE id = OLD.job_id;

        UPDATE job_applications_tracking
        SET application_count = GREATEST(application_count - 1, 0)
        WHERE job_id = OLD.job_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_job_application_count_trigger
    AFTER INSERT OR DELETE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION update_job_application_count();

CREATE OR REPLACE FUNCTION update_certification_expired()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_expired := (NEW.expiry_date IS NOT NULL AND NEW.expiry_date < CURRENT_DATE);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_certification_expired
    BEFORE INSERT OR UPDATE OF expiry_date ON certifications
    FOR EACH ROW
    EXECUTE FUNCTION update_certification_expired();

CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM sessions         WHERE expires_at < NOW();
    DELETE FROM password_resets  WHERE expires_at < NOW();
    DELETE FROM recovery_codes   WHERE expires_at < NOW();
    DELETE FROM team_invitations WHERE expires_at < NOW() AND status = 'pending';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION database_maintenance()
RETURNS void AS $$
BEGIN
    PERFORM clean_expired_sessions();
    REFRESH MATERIALIZED VIEW CONCURRENTLY candidate_dashboard;
    REFRESH MATERIALIZED VIEW CONCURRENTLY recruiter_dashboard;
    ANALYZE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_task_prerequisites(
    p_session_id UUID,
    p_task_id    UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_prerequisites_met BOOLEAN := TRUE;
    v_dependency        RECORD;
BEGIN
    FOR v_dependency IN
        SELECT td.*, stp.status, stp.score, stp.time_spent, stp.github_commit_url
        FROM task_dependencies td
        LEFT JOIN session_task_progress stp
               ON stp.task_index = (
                      SELECT task_index FROM simulation_tasks WHERE id = td.depends_on_task_id LIMIT 1
                  )
              AND stp.session_id = p_session_id
        WHERE td.task_id = p_task_id
    LOOP
        CASE v_dependency.dependency_type
            WHEN 'completion' THEN
                IF v_dependency.status != 'completed' THEN v_prerequisites_met := FALSE; END IF;
            WHEN 'score_minimum' THEN
                IF COALESCE(v_dependency.score, 0) < v_dependency.min_score_required THEN v_prerequisites_met := FALSE; END IF;
            WHEN 'time_spent' THEN
                IF COALESCE(v_dependency.time_spent, 0) < v_dependency.min_time_spent THEN v_prerequisites_met := FALSE; END IF;
            WHEN 'github_repo' THEN
                IF v_dependency.github_commit_url IS NULL THEN v_prerequisites_met := FALSE; END IF;
            WHEN 'order' THEN
                IF v_dependency.status != 'completed' THEN v_prerequisites_met := FALSE; END IF;
            ELSE NULL;
        END CASE;

        IF NOT v_prerequisites_met THEN RETURN FALSE; END IF;
    END LOOP;

    RETURN v_prerequisites_met;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION auto_unlock_next_task()
RETURNS TRIGGER AS $$
DECLARE
    v_next_task         RECORD;
    v_prerequisites_met BOOLEAN;
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        FOR v_next_task IN
            SELECT stp.id, stp.task_index
            FROM session_task_progress stp
            JOIN simulation_tasks st ON st.task_index = stp.task_index
                AND st.simulation_id = (
                    SELECT simulation_id FROM simulation_sessions WHERE id = NEW.session_id
                )
            WHERE stp.session_id = NEW.session_id
              AND stp.status = 'not_started'
            ORDER BY stp.task_index ASC
            LIMIT 1
        LOOP
            v_prerequisites_met := check_task_prerequisites(
                NEW.session_id,
                (SELECT id FROM simulation_tasks
                 WHERE task_index = v_next_task.task_index
                   AND simulation_id = (
                       SELECT simulation_id FROM simulation_sessions WHERE id = NEW.session_id
                   )
                 LIMIT 1)
            );

            IF v_prerequisites_met THEN
                UPDATE session_task_progress
                SET prerequisites_met = TRUE, unlocked_at = NOW()
                WHERE id = v_next_task.id;

                INSERT INTO task_progression_history
                    (session_id, task_id, from_status, to_status, reason, metadata)
                VALUES (
                    NEW.session_id,
                    (SELECT id FROM simulation_tasks
                     WHERE task_index = v_next_task.task_index
                       AND simulation_id = (
                           SELECT simulation_id FROM simulation_sessions WHERE id = NEW.session_id
                       )
                     LIMIT 1),
                    'not_started', 'available',
                    'Auto-unlocked by completion of task index ' || NEW.task_index,
                    jsonb_build_object('triggered_by_task_index', NEW.task_index)
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_unlock_next_task
    AFTER UPDATE OF status ON session_task_progress
    FOR EACH ROW
    EXECUTE FUNCTION auto_unlock_next_task();
    
    
    
    
-- =====================================================
-- FUNCTION: Extract task duration from tasks JSONB
-- DEFAULT DELAY: 60 MINUTES
-- =====================================================
CREATE OR REPLACE FUNCTION extract_task_durations()
RETURNS TRIGGER AS $$
DECLARE
    task_record JSONB;
    tasks_array JSONB;
    task_index INTEGER;
    task_duration INTEGER;
    extracted_durations JSONB := '[]'::JSONB;
BEGIN
    -- Handle the tasks JSONB array
    tasks_array := NEW.tasks;
    
    -- If tasks is a string (during insert/update from API), parse it
    IF jsonb_typeof(tasks_array) = 'string' THEN
        BEGIN
            tasks_array := tasks_array::JSONB;
        EXCEPTION WHEN OTHERS THEN
            tasks_array := NEW.tasks;
        END;
    END IF;
    
    -- Extract duration from each task
    IF jsonb_typeof(tasks_array) = 'array' THEN
        FOR task_index IN 0..jsonb_array_length(tasks_array) - 1 LOOP
            task_record := tasks_array->task_index;
            task_duration := (task_record->>'duration')::INTEGER;
            
            -- If duration not found, try duration_minutes
            IF task_duration IS NULL THEN
                task_duration := (task_record->>'duration_minutes')::INTEGER;
            END IF;
            
            -- If still NULL, use default 60 minutes
            IF task_duration IS NULL OR task_duration <= 0 THEN
                task_duration := 60;
            END IF;
            
            -- Build extracted durations JSON
            extracted_durations := extracted_durations || jsonb_build_object(
                'task_index', task_index,
                'duration_minutes', task_duration,
                'duration_seconds', task_duration * 60
            );
        END LOOP;
        
        -- Store extracted durations in metadata for quick access
        NEW.metadata = jsonb_set(
            COALESCE(NEW.metadata, '{}'::JSONB),
            '{task_durations}',
            extracted_durations
        );
        
        -- Store total duration sum
        NEW.metadata = jsonb_set(
            NEW.metadata,
            '{total_duration_minutes}',
            to_jsonb(
                (SELECT SUM((value->>'duration_minutes')::INTEGER) 
                 FROM jsonb_array_elements(extracted_durations))
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- FUNCTION: Extract task duration from tasks JSONB
-- DEFAULT DELAY: 60 MINUTES
-- =====================================================
CREATE OR REPLACE FUNCTION extract_task_durations()
RETURNS TRIGGER AS $$
DECLARE
    task_record JSONB;
    tasks_array JSONB;
    task_index INTEGER;
    task_duration INTEGER;
    extracted_durations JSONB := '[]'::JSONB;
BEGIN
    -- Handle the tasks JSONB array
    tasks_array := NEW.tasks;
    
    -- If tasks is a string (during insert/update from API), parse it
    IF jsonb_typeof(tasks_array) = 'string' THEN
        BEGIN
            tasks_array := tasks_array::JSONB;
        EXCEPTION WHEN OTHERS THEN
            tasks_array := NEW.tasks;
        END;
    END IF;
    
    -- Extract duration from each task
    IF jsonb_typeof(tasks_array) = 'array' THEN
        FOR task_index IN 0..jsonb_array_length(tasks_array) - 1 LOOP
            task_record := tasks_array->task_index;
            task_duration := (task_record->>'duration')::INTEGER;
            
            -- If duration not found, try duration_minutes
            IF task_duration IS NULL THEN
                task_duration := (task_record->>'duration_minutes')::INTEGER;
            END IF;
            
            -- If still NULL, use default 60 minutes
            IF task_duration IS NULL OR task_duration <= 0 THEN
                task_duration := 60;
            END IF;
            
            -- Build extracted durations JSON
            extracted_durations := extracted_durations || jsonb_build_object(
                'task_index', task_index,
                'duration_minutes', task_duration,
                'duration_seconds', task_duration * 60
            );
        END LOOP;
        
        -- Store extracted durations in metadata for quick access
        NEW.metadata = jsonb_set(
            COALESCE(NEW.metadata, '{}'::JSONB),
            '{task_durations}',
            extracted_durations
        );
        
        -- Store total duration sum
        NEW.metadata = jsonb_set(
            NEW.metadata,
            '{total_duration_minutes}',
            to_jsonb(
                (SELECT SUM((value->>'duration_minutes')::INTEGER) 
                 FROM jsonb_array_elements(extracted_durations))
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SEED DATA
-- =====================================================

INSERT INTO subscription_plans
    (name, slug, description, features, limits, price_monthly, price_yearly, currency, sort_order)
VALUES
(
    'Starter', 'starter', 'For small teams getting started',
    '["Up to 5 team members", "10 active jobs", "50 simulations per month", "Basic analytics"]'::JSONB,
    '{"users": 5, "active_jobs": 10, "simulations_per_month": 50, "api_calls_per_day": 1000}'::JSONB,
    49.00, 490.00, 'USD', 1
),
(
    'Professional', 'professional', 'For growing recruitment teams',
    '["Up to 20 team members", "50 active jobs", "200 simulations per month", "Advanced analytics", "AI scoring", "API access"]'::JSONB,
    '{"users": 20, "active_jobs": 50, "simulations_per_month": 200, "api_calls_per_day": 10000}'::JSONB,
    149.00, 1490.00, 'USD', 2
),
(
    'Enterprise', 'enterprise', 'For large organizations with custom needs',
    '["Unlimited team members", "Unlimited active jobs", "Unlimited simulations", "Enterprise analytics", "Blockchain verification", "Custom integrations", "Dedicated support"]'::JSONB,
    '{"users": -1, "active_jobs": -1, "simulations_per_month": -1, "api_calls_per_day": 100000}'::JSONB,
    499.00, 4990.00, 'USD', 3
)
ON CONFLICT (slug) DO UPDATE SET
    name          = EXCLUDED.name,
    description   = EXCLUDED.description,
    features      = EXCLUDED.features,
    limits        = EXCLUDED.limits,
    price_monthly = EXCLUDED.price_monthly,
    price_yearly  = EXCLUDED.price_yearly,
    currency      = EXCLUDED.currency,
    sort_order    = EXCLUDED.sort_order,
    updated_at    = NOW();

INSERT INTO ai_scoring_weights (weights)
SELECT '{
    "technical":         15,
    "communication":     15,
    "problemSolving":    20,
    "adaptability":      10,
    "collaboration":     10,
    "attentionToDetail": 10,
    "initiative":        10,
    "punctuality":       10
}'::JSONB
WHERE NOT EXISTS (SELECT 1 FROM ai_scoring_weights LIMIT 1);

INSERT INTO faqs (question, answer, category, sort_order, is_published, helpful_count, not_helpful_count, created_at, updated_at)
SELECT 'How do I create an account?',
       'Click the "Sign Up" button in the top right corner and follow the instructions. You''ll need to provide your email and create a password.',
       'Account', 1, true, 0, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE question = 'How do I create an account?');

INSERT INTO faqs (question, answer, category, sort_order, is_published, helpful_count, not_helpful_count, created_at, updated_at)
SELECT 'How do I apply for a job?',
       'Browse available jobs, click on a position that interests you, and click the "Apply Now" button. You can apply with your saved profile or upload a new resume.',
       'Applications', 2, true, 0, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE question = 'How do I apply for a job?');

INSERT INTO faqs (question, answer, category, sort_order, is_published, helpful_count, not_helpful_count, created_at, updated_at)
SELECT 'What are virtual work simulations?',
       'Simulations are realistic job tasks that allow you to demonstrate your skills. They typically take 30-60 minutes and are scored by our AI system.',
       'Simulations', 3, true, 0, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE question = 'What are virtual work simulations?');

INSERT INTO faqs (question, answer, category, sort_order, is_published, helpful_count, not_helpful_count, created_at, updated_at)
SELECT 'How are my simulation results used?',
       'Your results are shared with recruiters who can see your scores and performance analysis. You can also share verified results with other employers.',
       'Privacy', 4, true, 0, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE question = 'How are my simulation results used?');

-- =====================================================
-- END OF SCHEMA
-- =====================================================


-- Ensure attachments column exists in both tables
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::JSONB;
ALTER TABLE education ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::JSONB;

-- Ensure other columns exist
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS achievements TEXT[];
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS skills TEXT[];
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::JSONB;
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS verification_method VARCHAR(100);
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS verification_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Education table
ALTER TABLE education ADD COLUMN IF NOT EXISTS activities TEXT;
ALTER TABLE education ADD COLUMN IF NOT EXISTS skills TEXT[];
ALTER TABLE education ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::JSONB;
ALTER TABLE education ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
ALTER TABLE education ADD COLUMN IF NOT EXISTS verification_method VARCHAR(100);
ALTER TABLE education ADD COLUMN IF NOT EXISTS verification_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE education ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;