# Source Code

This folder contains the implementation of the V-WES capstone project: **A Simulated Virtual Workspace for Recruitment and Culture-Fit Evaluation**.

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

## Folder Structure

```text
frontend/    React and Vite user interface for candidates, recruiters, and dashboards
backend/     Express and TypeScript API for authentication, jobs, simulations, analytics, and integrations
blockchain/  Hardhat smart contract layer for immutable simulation result verification
ml/          Python AI and NLP scripts for matching, scoring, and behavior analysis
database/    Database scripts, schemas, and migration support
docs/        Technical documentation and architecture notes
assets/      Images, icons, and static project assets
tests/       Shared testing resources
scripts/     Automation and helper scripts
```

## Main Components

- **Frontend:** Provides the candidate and recruiter experience, including dashboards, task views, and simulation interfaces.
- **Backend:** Exposes REST and real-time APIs for users, jobs, applications, simulations, AI services, notifications, and blockchain verification.
- **AI/ML:** Supports candidate-job matching, communication analysis, and simulation scoring.
- **Blockchain:** Stores verifiable simulation results and supports credential integrity.

## Development Notes

Install dependencies inside each component folder before running it. Keep environment files local and do not commit secrets such as database passwords, API keys, blockchain private keys, or email credentials.
