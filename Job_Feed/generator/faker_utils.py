"
faker_utils.py
==============
Realistic value generation for fields the source CSVs simply don't have
(names, contact info, bios, job description prose, ...). Every generated
value is seeded (reproducible) and, where possible, derived FROM the real
fields already present for that record (e.g. a job's generated description
references its real title/institution/field of study) rather than being
generic filler   the goal is "plausible and consistent," not "random text."

Faker has no Kinyarwanda locale, and inventing ethnically-marked names
algorithmically risks getting them wrong, so first/last names are drawn
from a small curated bank of common, genuinely-used Rwandan given/family
names (no real individuals, no public figures) rather than Faker's default
en_US bank, since the underlying dataset is Rwandan public-service jobs.
"

from __future__ import annotations

import random
from datetime import date, timedelta
from typing import Optional, Tuple

from faker import Faker

_fake = Faker()

MALE_FIRST_NAMES = [
    "Jean", "Emmanuel", "Eric", "Patrick", "Innocent", "Olivier", "Fabrice",
    "Vincent", "Aime", "Bertrand", "Claude", "Didier", "Elias", "Fred",
    "Gilbert", "Hamza", "Ivan", "Janvier", "Kevin", "Leon", "Moses",
    "Norbert", "Pacifique", "Robert", "Samuel", "Theogene", "Yves",
]
FEMALE_FIRST_NAMES = [
    "Marie", "Grace", "Diane", "Clarisse", "Aline", "Divine", "Esperance",
    "Francine", "Gloria", "Henriette", "Immaculee", "Josiane", "Keza",
    "Liliane", "Marceline", "Noella", "Olive", "Pelagie", "Queen",
    "Rosine", "Solange", "Therese", "Uwase", "Vestine", "Yvette", "Zaninka",
]
LAST_NAMES = [
    "Uwimana", "Mukamana", "Niyonzima", "Habimana", "Ingabire", "Mugisha",
    "Nzeyimana", "Mutoni", "Iradukunda", "Nshimiyimana", "Uwera", "Bizimana",
    "Nkurunziza", "Twizeyimana", "Ndayisenga", "Uwamahoro", "Nsengiyumva",
    "Mukandayisenga", "Habyarimana", "Rukundo", "Byiringiro", "Umutoni",
    "Ntawukuriryayo", "Gasana", "Munyaneza", "Kagabo", "Musabyimana",
]
EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "protonmail.com"]

JOB_BENEFITS_POOL = [
    "RSSB pension contribution", "Medical insurance (RAMA/RSSB)",
    "Annual leave (21+ working days)", "Transport allowance",
    "Professional development / training budget", "Performance bonus",
    "Housing allowance", "Communication allowance", "Maternity/paternity leave",
]
EMPLOYMENT_TYPES = ["full-time", "contract", "part-time", "internship"]
WORK_ARRANGEMENTS = ["onsite", "hybrid", "remote"]

RWANDA_DISTRICTS = [
    "Gasabo", "Kicukiro", "Nyarugenge", "Nyamasheke", "Rusizi", "Musanze",
    "Gicumbi", "Burera", "Karongi", "Gakenke", "Nyamagabe", "Rubavu",
    "Huye", "Nyagatare", "Muhanga", "Rutsiro", "Kayonza", "Bugesera",
    "Ngoma", "Rwamagana",
]
RWANDA_PROVINCES = ["Iburengerazuba", "Amajyepfo", "Iburasirazuba", "Amajyaruguru", "Umujyi wa Kigali"]


def seed_all(seed: int) -> None:
    random.seed(seed)
    Faker.seed(seed)


def person_name() -> Tuple[str, str, str]:
    "Returns (first_name, last_name, gender)."
    if random.random() < 0.5:
        return random.choice(MALE_FIRST_NAMES), random.choice(LAST_NAMES), "male"
    return random.choice(FEMALE_FIRST_NAMES), random.choice(LAST_NAMES), "female"


def email_for(first: str, last: str, salt: str) -> str:
    domain = random.choice(EMAIL_DOMAINS)
    suffix = abs(hash(salt)) % 10000
    return f"{first.lower()}.{last.lower()}{suffix}@{domain}"


def phone_number() -> str:
    prefix = random.choice(["78", "72", "73"])
    return f"+250{prefix}{random.randint(1000000, 9999999)}"


def date_of_birth(graduation_year: Optional[float], degree: str) -> date:
    "Back-calculate a plausible DOB from graduation year + degree level so
    age is internally consistent with the candidate's real education record."
    grad_age = {
        "PhD": 30, "Master's": 26, "Post Graduate Diploma": 25,
        "Bachelor's(A0)": 23, "Advanced Diploma(A1)": 22, "Diploma(A1)": 21,
        "Diploma(A2)": 20, "O-Level": 19, "General Primary": 16,
    }.get(degree, 24)
    year = int(graduation_year) if graduation_year and graduation_year == graduation_year else 2020
    birth_year = year - grad_age + random.randint(-2, 2)
    birth_year = min(max(birth_year, 1965), 2004)
    return date(birth_year, random.randint(1, 12), random.randint(1, 28))


def headline_for(degree: str, field_of_study: str) -> str:
    return f"{degree} in {field_of_study}" if field_of_study else degree


def bio_for(first: str, field_of_study: str, district: str, years_experience: float) -> str:
    exp_phrase = (f"with {years_experience:.0f}+ years of professional experience"
                  if years_experience and years_experience >= 1 else "early in their career")
    field_phrase = field_of_study or "their field"
    return (f"{first} is a motivated professional {exp_phrase} in {field_phrase}, "
            f"based in {district}, Rwanda, seeking new opportunities to contribute "
            f"and grow.")


def expected_salary(degree: str, years_experience: float) -> Tuple[int, int]:
    "RWF/month bands, roughly scaled to Rwandan public-service pay grades."
    base = {
        "PhD": 900_000, "Master's": 650_000, "Post Graduate Diploma": 550_000,
        "Bachelor's(A0)": 400_000, "Advanced Diploma(A1)": 300_000,
        "Diploma(A1)": 260_000, "Diploma(A2)": 220_000, "O-Level": 150_000,
        "General Primary": 100_000, "Driving License": 150_000, "Diplome": 220_000,
    }.get(degree, 250_000)
    exp_bump = int((years_experience or 0) * 25_000)
    lo = base + exp_bump
    hi = int(lo * random.uniform(1.15, 1.4))
    return lo, hi


def linkedin_url(first: str, last: str) -> str:
    return f"https://linkedin.com/in/{first.lower()}-{last.lower()}-{random.randint(100,999)}"


def github_url(first: str, last: str) -> Optional[str]:
    return f"https://github.com/{first.lower()}{last.lower()}{random.randint(10,99)}" if random.random() < 0.35 else None


def random_datetime_between(start: date, end: date) -> date:
    delta_days = (end - start).days
    if delta_days <= 0:
        return start
    return start + timedelta(days=random.randint(0, delta_days))


# ── Job text generation (templated FROM the real job fields) ────────────

def job_description(title: str, institution: str, field_of_study: str, experience_years: int) -> str:
    exp_phrase = f"a minimum of {experience_years} years" if experience_years else "no prior experience requirement"
    return (
        f"{institution} is recruiting a qualified {title} to strengthen its team. "
        f"The successful candidate will bring expertise in {field_of_study or 'the relevant field'} "
        f"and {exp_phrase} of related professional experience. This is a public-service "
        f"position governed by Rwanda's civil service employment regulations."
    )


def job_responsibilities(title: str, field_of_study: str) -> list:
    return [
        f"Perform core {title} duties in line with institutional objectives",
        f"Apply technical knowledge of {field_of_study or 'the relevant domain'} to daily operations",
        "Prepare periodic reports and contribute to planning processes",
        "Collaborate with other departments to achieve institutional targets",
        "Ensure compliance with applicable laws, policies, and procedures",
    ]


def job_benefits() -> list:
    return random.sample(JOB_BENEFITS_POOL, k=random.randint(3, 5))


def job_summary(title: str, institution: str) -> str:
    return f"{title} position at {institution}."
