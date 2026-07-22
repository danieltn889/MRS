# HRS Capstone Project

## Rwanda Polytechnic Capstone Project

**Project title:** MIFOTRA Hybrid recommender system (SimuHire) — an AI-powered job matching and recruitment platform

**Student name:** TURIKUMWENIMANA Daniel
**Registration number:** 25RP19824
**Academic supervisor:** NIYONSHUTI Yves

## Company Information

| Item | Details |
|------|---------|
| Company name | Mpuza Inc. |
| Physical address | Kk737St, Kigali, Rwanda |
| Official email | info@mpuza.com |
| Phone | +250786397515 |
| Industry supervisor | Derek J. Blair |
| Supervisor job title | CTO |
| Supervisor email | jbderek@mpuza.com |
| Supervisor phone | +16505077742 |

## Project Overview

SimuHire (MIFOTRA Hybrid recommender system) is a multi-tenant recruitment platform that scores every
candidate–job pair using two independent engines blended together: a rule-based Matcher (four
weighted, fully explainable factors — Skills, Qualifications, Experience, Preferences) and a
5-signal AI Hybrid Recommender (Content, Behavior, Collaborative, Freshness, Popularity) that
learns from candidate activity. The two are combined into a single transparent match score shown
on every job card, with a full breakdown of what matched and what didn't.

The platform supports three roles — candidates, company recruiters/admins, and a system admin —
including multi-role accounts (the same email can hold separate candidate/recruiter accounts) and
multi-company login for recruiters who work across more than one company.

## Main Aim

To design, develop, and validate a cloud-based recruitment platform that leverages an explainable
rule-based matching engine and a machine-learning recommender to objectively connect candidates
with roles that fit their skills, qualifications, experience, and preferences in Rwanda's
technology sector.

## Specific Objectives

- Conduct requirements analysis with Rwandan technology companies to define matching and
  screening parameters relevant to the local labour market (including TVET/NQF qualification
  levels).
- Design and implement a modular system architecture covering frontend, backend, database, and
  AI matching/recommendation layers.
- Implement a rule-based profile matcher scoring candidates on Skills, Qualifications, Experience,
  and Preferences, with full transparency into every score component.
- Implement a 5-signal machine-learning hybrid recommender (content-based, behavioral,
  collaborative filtering, freshness, popularity) that improves recommendations as candidates
  interact with the platform.
- Create recruiter/company dashboards with candidate ranking, analytics, and multi-company support.
- Validate the platform through pilot testing with IT students and local technology companies.

## Repository Structure

```text
report/
  capstone_report.tex
  USER_GUIDE.md
  references.bib
  figures/

source-code/
  frontend/     React + Vite + Tailwind CSS
  backend/      Node.js + Express + TypeScript + PostgreSQL
  ml/           Python/FastAPI hybrid matching & recommendation engine

deploy/
  bootstrap-server.sh
  nginx.conf
```

## Technologies Used

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** Node.js, Express.js, TypeScript, PostgreSQL, JWT
- **AI/ML:** Python, FastAPI, scikit-learn, PyTorch (matrix-factorization collaborative model),
  sentence-transformers (semantic content matching)
- **Process management:** pm2, nginx (production reverse proxy)

## Documentation

- [`report/USER_GUIDE.md`](report/USER_GUIDE.md) — architecture, the hybrid matching engine, and
  how the job feed is scored
- [`source-code/frontend/README.md`](source-code/frontend/README.md) — frontend setup guide
- [`source-code/ml/README.md`](source-code/ml/README.md) — ML services setup guide (venv,
  requirements, spaCy model, running `gateway.py`)
- [`report/capstone_report.tex`](report/capstone_report.tex) — full capstone report

## Documentation Notes

- Keep company and supervisor information consistent in the report and all project documentation.
- Commit changes frequently with meaningful commit messages.
