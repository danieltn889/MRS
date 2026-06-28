# V-WES Capstone Project

## Rwanda Polytechnic Capstone Project

**Project title:** A Simulated Virtual Workspace for Recruitment and Culture-Fit Evaluation (V-WES)

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

V-WES is a multi-tenant virtual work simulation platform for recruitment and culture-fit evaluation. The platform helps companies assess candidates for remote and hybrid roles by combining realistic work tasks, AI-based behavior analysis, recruiter dashboards, and blockchain-backed verification of assessment results.

## Main Aim

To design, develop, and validate a cloud-based virtual work simulation platform that leverages AI and blockchain technology to objectively assess technical skills, professional discipline, and cultural fit for roles in Rwanda's technology sector.

## Specific Objectives

- Conduct requirements analysis with Rwandan technology companies to define cultural and professional assessment parameters.
- Design and implement a modular system architecture covering frontend, backend, AI engine, database, and blockchain layers.
- Develop realistic interactive work simulations for software developer roles.
- Implement AI algorithms for behavioral tracking, including punctuality, communication quality, task efficiency, and adaptability.
- Integrate blockchain smart contracts for immutable assessment logging and verifiable credentials.
- Create recruiter dashboards with multi-dimensional analytics and decision-support features.
- Validate the platform through pilot testing with IT students and local technology companies.

## Repository Structure

```text
report/
  capstone_report.tex
  references.bib
  figures/

source-code/
  frontend/
  backend/
  blockchain/
  ml/
  database/
  docs/
  assets/
  scripts/
  tests/

weekly-reports/
```

## Technologies Used

- **Frontend:** React, Vite, Tailwind CSS, Socket.IO client, Monaco Editor
- **Backend:** Node.js, Express.js, TypeScript, PostgreSQL, JWT, Socket.IO
- **AI/ML:** Python, scikit-learn, NLP models, evaluation scripts
- **Blockchain:** Hardhat, Solidity, Ethers.js
- **Database:** PostgreSQL

## Weekly Progress

| Week | Activities |
|------|------------|
| 1 | Repository setup and project documentation |

## Technical Documentation

The full technical documentation for installing, configuring, running, testing, and extending
the application lives under `source-code/`:

- [`source-code/README.md`](source-code/README.md) — main technical README (overview, install, env, run, tests)
- [`source-code/frontend/README.md`](source-code/frontend/README.md) — frontend guide
- [`source-code/backend/README.md`](source-code/backend/README.md) — backend guide
- [`source-code/docs/API_DOCUMENTATION.md`](source-code/docs/API_DOCUMENTATION.md) — API reference
- [`source-code/docs/DATABASE.md`](source-code/docs/DATABASE.md) — database schema & migrations
- [`source-code/docs/AI_EVALUATION.md`](source-code/docs/AI_EVALUATION.md) — AI evaluation flow
- [`source-code/docs/BLOCKCHAIN.md`](source-code/docs/BLOCKCHAIN.md) — blockchain & audit chain
- [`source-code/docs/DEPLOYMENT.md`](source-code/docs/DEPLOYMENT.md) — deployment guide
- [`source-code/docs/DEVELOPER_GUIDE.md`](source-code/docs/DEVELOPER_GUIDE.md) — developer/contribution guide

## Documentation Notes

- Keep company and supervisor information consistent in the report and all project documentation.
- Upload weekly reports in PDF format under `weekly-reports/`.
- Commit changes frequently with meaningful commit messages.
