# ICP Evaluation Tools

This folder contains Python tooling used for automated evaluation experiments and README/commit activity analysis. It supports the MRS capstone work by helping evaluate documentation quality and development activity.

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

## Evaluation Criteria

- **README documentation quality:** Checks whether repositories include setup instructions, project description, integration guidance, and contribution notes.
- **Commit activity:** Reviews weekly development patterns and summarizes progress from commit history.

## Setup

Create and activate a virtual environment:

```bash
python -m venv venv
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create an `.env` file with required API keys:

```env
GROQ_API_KEY=your_groq_api_key_here
GITHUB_TOKEN=your_github_token_here
```

## Usage

Run a basic evaluation:

```bash
python main.py input.csv output.csv
```

Run with custom dates:

```bash
python main.py input.csv output.csv --hackathon-start 2024-07-01 --hackathon-end 2024-12-31
```

Run in batch mode:

```bash
python main.py large_dataset.csv output_folder/ --batch-mode
```

## Tests

```bash
python test_evaluator.py
python test_commit_history.py
```

## Output

The tool generates CSV results and detailed text reports with repository-by-repository scoring and weekly development summaries.
