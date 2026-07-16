-- =====================================================
-- RECRUITMENT PLATFORM - COMPLETE DATABASE SCHEMA
-- React + Node.js + Python + PostgreSQL
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
    -- Not UNIQUE alone: the same email may have a separate account per role
    -- (e.g. one person who is both a candidate and a recruiter). Unique per
    -- (email, user_type) instead; login disambiguates when more than one
    -- role's password matches (see auth.controller.ts).
    email              CITEXT NOT NULL,
    password_hash      VARCHAR(255) NOT NULL,
    user_type          VARCHAR(50) NOT NULL CHECK (user_type IN ('candidate', 'recruiter', 'company_admin', 'system_admin')),
    status             VARCHAR(50) DEFAULT 'unverified'CHECK (status IN ('unverified', 'verified', 'active', 'locked', 'suspended', 'deleted')),
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

CREATE UNIQUE INDEX idx_users_email_type_unique ON users(email, user_type);
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
    years_experience    INTEGER,
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

-- Rwanda administrative location (nullable   only populated when is_rwandan = true).
-- Non-Rwandan candidates keep using the pre-existing country/city columns above.
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS years_experience INTEGER;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS is_rwandan BOOLEAN;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS province    VARCHAR(100);
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS district    VARCHAR(100);
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS sector      VARCHAR(100);
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS cell        VARCHAR(100);
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS village     VARCHAR(100);

-- =====================================================
-- RWANDA ADMINISTRATIVE LOCATION HIERARCHY (Candidate Signup)
-- =====================================================
-- One row per village, carrying its full ancestor chain (province..village).
-- Denormalized on purpose: cascading-dropdown lookups and hierarchy validation
-- are both a single indexed SELECT instead of a 5-table join. Seeded once from
-- backend/src/db/data/rwanda-locations.json (MIT-licensed public dataset) by
-- src/db/seed.ts   see seedRwandaLocations().
CREATE TABLE IF NOT EXISTS rw_locations (
    id             BIGSERIAL PRIMARY KEY,
    province_code  VARCHAR(20)  NOT NULL,
    province_name  VARCHAR(100) NOT NULL,
    district_code  VARCHAR(20)  NOT NULL,
    district_name  VARCHAR(100) NOT NULL,
    sector_code    VARCHAR(20)  NOT NULL,
    sector_name    VARCHAR(100) NOT NULL,
    cell_code      VARCHAR(20)  NOT NULL,
    cell_name      VARCHAR(100) NOT NULL,
    village_code   VARCHAR(20)  NOT NULL UNIQUE,
    village_name   VARCHAR(100) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rw_locations_province ON rw_locations(province_name);
CREATE INDEX IF NOT EXISTS idx_rw_locations_district ON rw_locations(district_name);
CREATE INDEX IF NOT EXISTS idx_rw_locations_sector   ON rw_locations(district_name, sector_name);
CREATE INDEX IF NOT EXISTS idx_rw_locations_cell      ON rw_locations(sector_name, cell_name);
CREATE INDEX IF NOT EXISTS idx_rw_locations_chain     ON rw_locations(province_name, district_name, sector_name, cell_name, village_name);

-- =====================================================
-- CANDIDATE IDENTITY DOCUMENTS (Signup Verification)
-- =====================================================
-- File contents are NEVER stored here (or under the publicly-served
-- backend/uploads/ static mount)   document_front/document_back hold an
-- internal storage key resolved only via an authenticated, ownership-checked
-- endpoint. See backend/src/routes/v1/candidate.routes.ts identity document
-- routes and backend/private-uploads/identity-documents/.
CREATE TABLE IF NOT EXISTS candidate_documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type       VARCHAR(20) NOT NULL CHECK (document_type IN ('national_id', 'passport')),
    document_number     VARCHAR(50) NOT NULL,
    document_front      TEXT NOT NULL,
    document_back       TEXT,
    verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_documents_number
    ON candidate_documents (document_type, document_number);
CREATE INDEX IF NOT EXISTS idx_candidate_documents_candidate ON candidate_documents(candidate_id);

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
    -- Structured location, same shape as candidate_profiles: Rwanda hierarchy
    -- when is_rwandan, else country/city. `location` above is kept as a
    -- free-text fallback for legacy rows / display.
    is_rwandan          BOOLEAN,
    country             VARCHAR(100),
    province            VARCHAR(100),
    district            VARCHAR(100),
    sector              VARCHAR(100),
    cell                VARCHAR(100),
    village             VARCHAR(100),
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

-- Same structured location as candidate_profiles, mirrored onto
-- work_experience (per-role location, since a candidate's jobs may span
-- different provinces/countries). IF NOT EXISTS here because the CREATE
-- TABLE above already defines these for fresh databases; this covers
-- already-existing ones re-running the migration.
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS is_rwandan BOOLEAN;
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS country    VARCHAR(100);
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS province   VARCHAR(100);
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS district   VARCHAR(100);
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS sector     VARCHAR(100);
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS cell       VARCHAR(100);
ALTER TABLE work_experience ADD COLUMN IF NOT EXISTS village    VARCHAR(100);

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
    verification_status   VARCHAR(50) DEFAULT 'pending'CHECK (verification_status IN ('pending', 'verified', 'rejected', 'expired')),
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
    status           VARCHAR(50) DEFAULT 'pending'CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
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
    role               VARCHAR(50) NOT NULL DEFAULT 'recruiter'CHECK (role IN ('admin', 'recruiter', 'reviewer', 'viewer')),
    permissions        JSONB DEFAULT '{"can_post_jobs": true, "can_view_candidates": true, "can_manage_team": false, "can_edit_company": false}'::JSONB,
    display_on_profile BOOLEAN DEFAULT TRUE,
    is_leadership      BOOLEAN DEFAULT FALSE,
    display_order      INTEGER DEFAULT 0,
    joined_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Which company this user is currently operating as, for users on more than
    -- one company's team (e.g. a recruiter working with two companies). Chosen
    -- at login when ambiguous; at most one TRUE row per user (see unique index).
    is_default         BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_company_team_company      ON company_team(company_id);
CREATE INDEX idx_company_team_user         ON company_team(user_id);
CREATE INDEX idx_company_team_invitation   ON company_team(invitation_id);
CREATE INDEX idx_company_team_role         ON company_team(role);
CREATE INDEX idx_company_team_display      ON company_team(company_id, display_on_profile);
CREATE INDEX idx_company_team_company_role ON company_team(company_id, role);
CREATE UNIQUE INDEX idx_company_team_one_default_per_user ON company_team(user_id) WHERE is_default;

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
    status             VARCHAR(50) DEFAULT 'pending'CHECK (status IN ('pending', 'approved', 'rejected', 'info_needed')),
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
    status                        VARCHAR(50) DEFAULT 'draft'CHECK (status IN ('draft', 'pending', 'active', 'open', 'inactive', 'paused', 'closed', 'filled', 'archived', 'expired')),
    visibility                    VARCHAR(50) DEFAULT 'public'CHECK (visibility IN ('public', 'internal', 'confidential', 'unlisted')),
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
    match_score NUMERIC(5,2),
    PRIMARY KEY (user_id, job_id)
);

CREATE INDEX idx_saved_jobs_user     ON saved_jobs(user_id);
CREATE INDEX idx_saved_jobs_saved_at ON saved_jobs(saved_at);

-- Personalized job feed   activity tracking (previously only applied ad hoc via
-- migrations/feed_tables.sql; folded in here so `npm run migrate` alone is complete).
CREATE TABLE job_views (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id        UUID NOT NULL REFERENCES jobs(id)  ON DELETE CASCADE,
    seconds_spent INTEGER NOT NULL DEFAULT 0,
    viewed_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, job_id)
);
CREATE INDEX idx_job_views_user ON job_views(user_id);

CREATE TABLE ignored_jobs (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id     UUID NOT NULL REFERENCES jobs(id)  ON DELETE CASCADE,
    ignored_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, job_id)
);
CREATE INDEX idx_ignored_jobs_user ON ignored_jobs(user_id);

CREATE TABLE job_searches (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query       TEXT NOT NULL,
    searched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_job_searches_user ON job_searches(user_id, searched_at DESC);

-- Tracks when a candidate opens the application form for a job (started_at)
-- and whether they ever went on to actually submit it (submitted/submitted_at).
-- A row with submitted = FALSE is a candidate who clicked "Apply" but
-- abandoned the form   a signal the ML behavior model also reads
-- (see hybrid_job_recommender.py fetch_incomplete_application_events()).
CREATE TABLE application_starts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id        UUID NOT NULL REFERENCES jobs(id)  ON DELETE CASCADE,
    started_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    submitted     BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at  TIMESTAMP WITH TIME ZONE,
    UNIQUE (user_id, job_id)
);
CREATE INDEX idx_application_starts_user      ON application_starts(user_id);
CREATE INDEX idx_application_starts_incomplete ON application_starts(user_id) WHERE submitted = FALSE;

CREATE TABLE feed_scores (
    candidate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id       UUID NOT NULL REFERENCES jobs(id)  ON DELETE CASCADE,
    score        NUMERIC(6,2) NOT NULL DEFAULT 0,
    computed_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (candidate_id, job_id)
);
CREATE INDEX idx_feed_scores_candidate ON feed_scores(candidate_id, score DESC);

-- Job status audit trail   previously only applied ad hoc via
-- queries/2026_job_status_history.sql; folded in here for the same reason.
CREATE TABLE job_status_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status      VARCHAR(50) NOT NULL,
    changed_by      UUID REFERENCES users(id),
    reason          TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_job_status_history_job     ON job_status_history(job_id);
CREATE INDEX idx_job_status_history_created ON job_status_history(created_at DESC);

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
    status             VARCHAR(50) DEFAULT 'submitted'CHECK (status IN ('submitted', 'under_review', 'shortlisted', 'interview', 'assessment', 'reference_check', 'offer', 'hired', 'rejected', 'withdrawn', 'on_hold')),
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
    status         VARCHAR(50) DEFAULT 'active'CHECK (status IN ('active', 'completed', 'removed')),
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
    status          VARCHAR(50) DEFAULT 'pending'CHECK (status IN ('pending', 'sent', 'acknowledged', 'cancelled', 'failed')),
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
-- PART 7: AI & ANALYTICS (Stories 111-130)
-- =====================================================

CREATE TABLE ai_analysis (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id        UUID,
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
    priority       VARCHAR(20) DEFAULT 'normal'CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    channels       TEXT[],
    status         VARCHAR(50) DEFAULT 'pending'CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
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
        "messages": true,
        "security": true,
        "billing": true,
        "promotional": false
    }'::JSONB,
    sms         JSONB NOT NULL DEFAULT '{
        "application_updates": false,
        "security": true,
        "billing": false
    }'::JSONB,
    push        JSONB NOT NULL DEFAULT '{
        "application_updates": true,
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
    CONSTRAINT valid_email_prefs CHECK (email ? 'application_updates')
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
    status       VARCHAR(50) DEFAULT 'active'CHECK (status IN ('active', 'paused', 'failed', 'disabled')),
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
    status                 VARCHAR(50) DEFAULT 'active'CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid')),
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
    status               VARCHAR(50) DEFAULT 'open'CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
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
    status             VARCHAR(50) DEFAULT 'new'CHECK (status IN ('new', 'in_progress', 'fixed', 'cannot_reproduce', 'wont_fix')),
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
    status      VARCHAR(50) DEFAULT 'under_review'CHECK (status IN ('under_review', 'planned', 'in_development', 'launched', 'declined')),
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

CREATE VIEW job_application_stats AS
SELECT
    j.id,
    j.title,
    j.company_id,
    COUNT(DISTINCT a.id)                                                        AS total_applications,
    COUNT(DISTINCT CASE WHEN a.status = 'submitted'   THEN a.id END)          AS submitted,
    COUNT(DISTINCT CASE WHEN a.status = 'under_review'THEN a.id END)          AS under_review,
    COUNT(DISTINCT CASE WHEN a.status = 'shortlisted' THEN a.id END)          AS shortlisted,
    COUNT(DISTINCT CASE WHEN a.status = 'interview'   THEN a.id END)          AS in_interview,
    COUNT(DISTINCT CASE WHEN a.status = 'offer'       THEN a.id END)          AS offers,
    COUNT(DISTINCT CASE WHEN a.status = 'hired'       THEN a.id END)          AS hires,
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

CREATE TRIGGER update_candidate_documents_updated_at
    BEFORE UPDATE ON candidate_documents
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
    NEW.application_number := year_prefix || '-'|| LPAD(sequence_number::TEXT, 6, '0');
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
    IF TG_OP = 'INSERT'THEN
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

    ELSIF TG_OP = 'DELETE'THEN
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
    ANALYZE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RECOMMENDER REALTIME NOTIFICATIONS
-- =====================================================

CREATE OR REPLACE FUNCTION notify_recommender_realtime_update()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
    full_row JSONB;
    row_data JSONB;
    entity_id TEXT;
    candidate_id TEXT;
    job_id TEXT;
BEGIN
    full_row := CASE WHEN TG_OP = 'DELETE'THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    entity_id := COALESCE(
        full_row->>'id',
        full_row->>'user_id',
        full_row->>'job_id'
    );
    candidate_id := COALESCE(
        full_row->>'candidate_id',
        full_row->>'user_id'
    );
    job_id := COALESCE(
        full_row->>'job_id',
        full_row->>'id'
    );

    -- pg_notify() hard-caps payloads at 8000 bytes   embedding the FULL row
    -- (to_jsonb(NEW)) blew past that for jobs/applications with long text
    -- fields (description, notes, feedback...), hard-failing the triggering
    -- UPDATE with "payload string too long". The realtime listener
    -- (hybrid_job_recommender.py) only ever reads a handful of scalar
    -- fields from this nested payload   never the full row   so only those
    -- are kept; anything else it needs, it re-fetches by id.
    row_data := jsonb_build_object(
        'candidate_id', full_row->>'candidate_id',
        'user_id', full_row->>'user_id',
        'job_id', full_row->>'job_id',
        'query', full_row->>'query',
        'searched_at', full_row->>'searched_at',
        'event_date', full_row->>'created_at',
        'weight', COALESCE(full_row->>'weight', full_row->>'score')
    );

    payload := jsonb_build_object(
        'event_type', 'recommendation_update',
        'entity_type', TG_TABLE_NAME,
        'operation', lower(TG_OP),
        'entity_id', entity_id,
        'candidate_id', candidate_id,
        'job_id', job_id,
        'payload', row_data,
        'source', 'database_trigger',
        'created_at', NOW()
    );

    PERFORM pg_notify('recommender_events', payload::text);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notify_recommender_candidate_profiles ON candidate_profiles;
CREATE TRIGGER notify_recommender_candidate_profiles
    AFTER INSERT OR UPDATE OR DELETE ON candidate_profiles
    FOR EACH ROW EXECUTE FUNCTION notify_recommender_realtime_update();

DROP TRIGGER IF EXISTS notify_recommender_jobs ON jobs;
CREATE TRIGGER notify_recommender_jobs
    AFTER INSERT OR UPDATE OR DELETE ON jobs
    FOR EACH ROW EXECUTE FUNCTION notify_recommender_realtime_update();

DROP TRIGGER IF EXISTS notify_recommender_applications ON applications;
CREATE TRIGGER notify_recommender_applications
    AFTER INSERT OR UPDATE OR DELETE ON applications
    FOR EACH ROW EXECUTE FUNCTION notify_recommender_realtime_update();

DROP TRIGGER IF EXISTS notify_recommender_job_views ON job_views;
CREATE TRIGGER notify_recommender_job_views
    AFTER INSERT OR UPDATE OR DELETE ON job_views
    FOR EACH ROW EXECUTE FUNCTION notify_recommender_realtime_update();

DROP TRIGGER IF EXISTS notify_recommender_saved_jobs ON saved_jobs;
CREATE TRIGGER notify_recommender_saved_jobs
    AFTER INSERT OR UPDATE OR DELETE ON saved_jobs
    FOR EACH ROW EXECUTE FUNCTION notify_recommender_realtime_update();

DROP TRIGGER IF EXISTS notify_recommender_ignored_jobs ON ignored_jobs;
CREATE TRIGGER notify_recommender_ignored_jobs
    AFTER INSERT OR UPDATE OR DELETE ON ignored_jobs
    FOR EACH ROW EXECUTE FUNCTION notify_recommender_realtime_update();

DROP TRIGGER IF EXISTS notify_recommender_job_searches ON job_searches;
CREATE TRIGGER notify_recommender_job_searches
    AFTER INSERT OR UPDATE OR DELETE ON job_searches
    FOR EACH ROW EXECUTE FUNCTION notify_recommender_realtime_update();


-- =====================================================
-- SEED DATA
-- =====================================================

INSERT INTO subscription_plans
    (name, slug, description, features, limits, price_monthly, price_yearly, currency, sort_order)
VALUES
(
    'Starter', 'starter', 'For small teams getting started',
    '["Up to 5 team members", "10 active jobs", "Basic analytics"]'::JSONB,
    '{"users": 5, "active_jobs": 10, "api_calls_per_day": 1000}'::JSONB,
    49.00, 490.00, 'USD', 1
),
(
    'Professional', 'professional', 'For growing recruitment teams',
    '["Up to 20 team members", "50 active jobs", "Advanced analytics", "AI scoring", "API access"]'::JSONB,
    '{"users": 20, "active_jobs": 50, "api_calls_per_day": 10000}'::JSONB,
    149.00, 1490.00, 'USD', 2
),
(
    'Enterprise', 'enterprise', 'For large organizations with custom needs',
    '["Unlimited team members", "Unlimited active jobs", "Enterprise analytics", "Custom integrations", "Dedicated support"]'::JSONB,
    '{"users": -1, "active_jobs": -1, "api_calls_per_day": 100000}'::JSONB,
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