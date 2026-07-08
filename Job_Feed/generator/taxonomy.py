"""
taxonomy.py
===========
Field-of-study -> skills mapping, grounded in the real `Field_Of_Study` /
`Required_Field_Of_Study` taxonomy that appears in both CSVs (10 categories,
verified against the real data — not invented). Used to generate candidate
skills (from their real field of study) and job skills_required (from the
job's real required field), so the generated skills are consistent with
the record's real data and — deliberately — overlap between candidates and
jobs in the same field, which is what makes the hybrid recommender's
content-based matching meaningful on this dataset.
"""

FIELD_SKILLS = {
    "Education": [
        "Curriculum Development", "Classroom Management", "Lesson Planning",
        "Educational Assessment", "Pedagogy", "Special Needs Education",
        "Student Counseling", "Teacher Training", "E-Learning Tools",
    ],
    "Business, Administration and Law": [
        "Project Management", "Financial Analysis", "Contract Law",
        "Public Administration", "Policy Analysis", "Procurement",
        "Accounting", "Auditing", "Human Resource Management", "Compliance",
    ],
    "Natural Sciences, Mathematics and Statistics": [
        "Statistical Analysis", "Data Analysis", "Laboratory Techniques",
        "Research Methodology", "SPSS", "R Programming", "Scientific Writing",
        "Quality Control", "Chemistry Lab Safety",
    ],
    "Services, Tourism and Hospitality": [
        "Customer Service", "Hospitality Management", "Event Planning",
        "Tour Guiding", "Front Office Operations", "Food & Beverage Service",
        "Guest Relations",
    ],
    "Information and Communication Technologies (ICTs)": [
        "Python", "JavaScript", "SQL", "Network Administration",
        "System Administration", "Cybersecurity", "Cloud Computing",
        "Database Management", "IT Support", "Software Development",
    ],
    "Engineering, Manufacturing and Construction": [
        "AutoCAD", "Structural Design", "Project Supervision",
        "Civil Engineering", "Electrical Systems", "Quality Assurance",
        "Construction Management", "Technical Drawing",
    ],
    "Health and Welfare (Health and Medical Sciences)": [
        "Patient Care", "Clinical Assessment", "Public Health",
        "Medical Records Management", "Nursing Procedures", "First Aid",
        "Health Education", "Epidemiology",
    ],
    "Arts and Humanities": [
        "Creative Writing", "Content Development", "Translation",
        "Public Speaking", "Cultural Research", "Editing", "Graphic Design",
    ],
    "Agriculture, Forestry, Fisheries and Veterinary": [
        "Crop Management", "Animal Husbandry", "Agribusiness",
        "Soil Science", "Veterinary Care", "Irrigation Systems",
        "Sustainable Farming",
    ],
    "Social Sciences, Journalism and Information": [
        "Report Writing", "Media Relations", "Community Engagement",
        "Data Collection", "Policy Research", "Public Relations",
        "Interviewing Techniques",
    ],
}

SOFT_SKILLS = [
    "Communication", "Teamwork", "Problem Solving", "Time Management",
    "Leadership", "Adaptability", "Critical Thinking",
]

GENERIC_JOB_TAGS = ["government", "public-service", "rwanda"]


def skills_for_field(field_of_study: str) -> list:
    return FIELD_SKILLS.get(field_of_study, [])


def extract_known_fields(raw_text: str) -> list:
    """Required_Field_Of_Study can list several categories joined with plain
    commas (e.g. "Business, Administration and Law, Engineering, ..."), and
    several category names themselves contain commas ("Business,
    Administration and Law"), so a naive comma-split mis-parses it. Instead,
    just test which of the 10 known category strings appear as a substring —
    order-independent, and immune to the internal-comma ambiguity."""
    if not isinstance(raw_text, str) or not raw_text.strip():
        return []
    return [cat for cat in FIELD_SKILLS if cat in raw_text]
