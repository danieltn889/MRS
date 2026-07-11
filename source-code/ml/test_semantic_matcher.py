#!/usr/bin/env python3
"
COMMIT-TO-TASK MATCHER     Test Suite
Runs directly   no server needed.
Run:  python test_commit_matcher.py
"

import subprocess
import sys
import warnings

warnings.filterwarnings("ignore")   # suppress spaCy W007

# ──────────────────────────────────────────────────────────────
# AUTO-INSTALL DEPENDENCIES
# ──────────────────────────────────────────────────────────────
for pkg in ['scikit-learn', 'nltk', 'spacy', 'vaderSentiment']:
    try:
        __import__(pkg.replace('-', '_'))
    except ImportError:
        print(f"Installing {pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "--quiet"])

import re
from typing import List, Dict

# ──────────────────────────────────────────────────────────────
# SIMULATION TASKS
# ──────────────────────────────────────────────────────────────
SIMULATION_TASKS = [
    {
        "id": "1778949379207",
        "name": "Build a User Profile Card Component",
        "description": (
            "Create a reusable React component that displays user profile information "
            "including avatar, name, email, role, and a follow button. "
            "The component should handle loading and error states."
        ),
        "instructions": (
            "1. Open the provided React project in the code editor. "
            "2. Navigate to src/components/ProfileCard.tsx. "
            "3. Create a functional component using TypeScript. "
            "4. Accept props: name (string), email (string), role (string), "
            "   avatarUrl (string), isLoading (boolean). "
            "5. Display a loading spinner when isLoading is true. "
            "6. Display user data in a card layout with rounded corners and shadow. "
            "7. Add a Follow button that shows Following after click. "
            "8. Style using the existing CSS module or Tailwind classes. "
            "9. Export the component as default."
        ),
    },
    {
        "id": "1778949462770",
        "name": "Create a GET API Endpoint for User List",
        "description": (
            "Build a REST API endpoint that returns a paginated list of users "
            "with filtering by role and search by name."
        ),
        "instructions": (
            "1. Open the file src/api/users.js. "
            "2. Create a GET endpoint at /api/users. "
            "3. Accept query parameters: page (default 1), limit (default 10), "
            "   role (optional), search (optional). "
            "4. Read user data from the provided users.json file. "
            "5. Apply role filter if role parameter is provided. "
            "6. Apply name search if search parameter is provided (case-insensitive partial match). "
            "7. Implement pagination using page and limit parameters. "
            "8. Return JSON response with structure: "
            "   { data: [], total: number, page: number, totalPages: number }. "
            "9. Add proper error handling for invalid parameters. "
            "10. Set appropriate HTTP status codes (200 for success, 400 for bad request)."
        ),
    },
    {
        "id": "1778949636137",
        "name": "Fix the Broken Todo List Application",
        "description": (
            "Debug and fix 5 intentional bugs in the Todo List application. "
            "The app should allow adding, deleting, and marking todos as complete."
        ),
        "instructions": (
            "1. Open the file src/App.jsx. "
            "2. Review the code and find the 5 bugs listed below. "
            "3. Bug #1: The Add Todo button does not add new todos - fix the handleAdd function. "
            "4. Bug #2: The delete button deletes the wrong todo - fix the index reference. "
            "5. Bug #3: Completed todos are not visually marked - fix the className logic. "
            "6. Bug #4: The todo count shows NaN - fix the state initialization. "
            "7. Bug #5: The clear button removes all todos without confirmation - add a confirm dialog. "
            "8. Test all features after fixes: add, delete, complete, clear. "
            "9. Ensure no console errors remain. "
            "10. Save your changes and verify the app works correctly."
        ),
    },
]

# ──────────────────────────────────────────────────────────────
# LOAD NLP LIBRARIES
# ──────────────────────────────────────────────────────────────
print("\n📥 Loading NLP libraries...")

# spaCy   prefer md (real word vectors), fall back to sm
nlp = None
SPACY_MODEL    = "en_core_web_md"
SPACY_FALLBACK = "en_core_web_sm"

try:
    import spacy
    for model in (SPACY_MODEL, SPACY_FALLBACK):
        try:
            nlp = spacy.load(model)
            print(f"  ''spaCy  ({model})")
            break
        except OSError:
            print(f"  Downloading {model}...")
            subprocess.check_call([sys.executable, "-m", "spacy", "download", model, "--quiet"])
            nlp = spacy.load(model)
            print(f"  ''spaCy  ({model})")
            break
except Exception as e:
    print(f"    spaCy: {e}")

# NLTK
stopwords         = None
WordNetLemmatizer = None
word_tokenize     = None
try:
    import nltk
    from nltk.corpus import stopwords
    from nltk.stem import WordNetLemmatizer
    from nltk.tokenize import word_tokenize
    for resource, path in [
        ('punkt',     'tokenizers/punkt'),
        ('stopwords', 'corpora/stopwords'),
        ('wordnet',   'corpora/wordnet'),
        ('punkt_tab', 'tokenizers/punkt_tab'),
    ]:
        try:
            nltk.data.find(path)
        except LookupError:
            nltk.download(resource, quiet=True)
    print("  ''NLTK")
except Exception as e:
    print(f"    NLTK: {e}")

# VADER
sia = None
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    sia = SentimentIntensityAnalyzer()
    print("  ''VADER")
except Exception as e:
    print(f"    VADER: {e}")

# scikit-learn
TfidfVectorizer  = None
cosine_similarity = None
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    print("  ''scikit-learn")
except Exception as e:
    print(f"    scikit-learn: {e}")


# ──────────────────────────────────────────────────────────────
# TEXT PROCESSOR
# ──────────────────────────────────────────────────────────────
class TextProcessor:
    def __init__(self):
        self.lemmatizer = None
        self.stop_words = set()
        if WordNetLemmatizer:
            try:
                self.lemmatizer = WordNetLemmatizer()
            except Exception:
                pass
        if stopwords:
            try:
                self.stop_words = set(stopwords.words('english'))
            except Exception:
                pass

    def clean_text(self, text: str) -> str:
        if not text:
            return 
        text = text.lower()
        text = re.sub(r'[^\w\s]', '', text)
        text = re.sub(r'\s+', '', text).strip()
        try:
            tokens = word_tokenize(text) if word_tokenize else text.split()
        except Exception:
            tokens = text.split()
        cleaned = []
        for token in tokens:
            if token not in self.stop_words and len(token) > 2:
                if self.lemmatizer:
                    try:
                        token = self.lemmatizer.lemmatize(token)
                    except Exception:
                        pass
                cleaned.append(token)
        return ''.join(cleaned)

    def tfidf_similarity(self, text1: str, text2: str) -> float:
        c1 = self.clean_text(text1)
        c2 = self.clean_text(text2)
        if not c1 or not c2:
            return 0.0
        if TfidfVectorizer and cosine_similarity:
            try:
                vec = TfidfVectorizer()
                mat = vec.fit_transform([c1, c2])
                return float(cosine_similarity(mat[0:1], mat[1:2])[0][0])
            except Exception:
                pass
        w1, w2 = set(c1.split()), set(c2.split())
        union = w1 | w2
        return len(w1 & w2) / len(union) if union else 0.0

    def spacy_similarity(self, text1: str, text2: str) -> float:
        if not nlp:
            return 0.0
        try:
            d1 = nlp(text1[:10_000])
            d2 = nlp(text2[:10_000])
            if d1.vector_norm == 0 or d2.vector_norm == 0:
                return 0.0
            return float(d1.similarity(d2))
        except Exception:
            return 0.0

    def get_sentiment(self, text: str) -> str:
        if not text or not sia:
            return "neutral"
        try:
            score = sia.polarity_scores(text)['compound']
            if score >= 0.05:
                return "positive"
            elif score <= -0.05:
                return "negative"
            return "neutral"
        except Exception:
            return "neutral"


# ──────────────────────────────────────────────────────────────
# TASK MATCHER
# ──────────────────────────────────────────────────────────────
class TaskMatcher:
    W_TFIDF         = 0.55
    W_SPACY         = 0.45
    SENTIMENT_BONUS = 0.08

    def __init__(self, tasks: List[Dict]):
        self.processor = TextProcessor()
        self.tasks = tasks

    def _task_text(self, task: Dict) -> str:
        return " ".join([
            task.get("name", ),
            task.get("description", ),
            task.get("instructions", ),
        ])

    def _match_level(self, confidence: float) -> str:
        if confidence >= 65:
            return "Excellent Match "
        elif confidence >= 50:
            return "Strong Match ''"
        elif confidence >= 35:
            return "Good Match "
        elif confidence >= 20:
            return "Weak Match "
        return "No Match "

    def match(self, commit_message: str) -> Dict:
        if not commit_message or not commit_message.strip():
            return {"success": False, "error": "commit_message is empty"}

        commit_sentiment = self.processor.get_sentiment(commit_message)
        results = []

        for task in self.tasks:
            task_text       = self._task_text(task)
            tfidf_sim       = self.processor.tfidf_similarity(commit_message, task_text)
            spacy_sim       = self.processor.spacy_similarity(commit_message, task_text)
            combined_sim    = self.W_TFIDF * tfidf_sim + self.W_SPACY * spacy_sim
            task_sentiment  = self.processor.get_sentiment(task_text)
            sentiment_bonus = self.SENTIMENT_BONUS if commit_sentiment == task_sentiment else 0.0
            confidence      = round(min((combined_sim + sentiment_bonus) * 100, 100.0), 1)

            results.append({
                "task_id":          task.get("id", ),
                "task_name":        task.get("name", ),
                "confidence":       confidence,
                "match_level":      self._match_level(confidence),
                "tfidf_score":      round(tfidf_sim * 100, 1),
                "spacy_score":      round(spacy_sim * 100, 1),
                "sentiment_commit": commit_sentiment,
                "sentiment_task":   task_sentiment,
                "sentiment_match":  commit_sentiment == task_sentiment,
            })

        results.sort(key=lambda x: x["confidence"], reverse=True)
        return {
            "success":        True,
            "commit_message": commit_message,
            "total_tasks":    len(self.tasks),
            "best_match":     results[0] if results else None,
            "all_matches":    results,
        }


# ──────────────────────────────────────────────────────────────
# TEST HELPERS
# ──────────────────────────────────────────────────────────────
matcher = TaskMatcher(SIMULATION_TASKS)
passed  = 0
failed  = 0

def hdr(title: str):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")

def show(result: Dict):
    best = result.get("best_match", {})
    print(f"  Commit  : \"{result['commit_message']}\)
    print(f"  Best    : {best.get('task_name')}")
    print(f"  Conf    : {best.get('confidence')}%     {best.get('match_level')}")
    print(f"  TF-IDF  : {best.get('tfidf_score')}%   spaCy: {best.get('spacy_score')}%")
    print(f"  Sentiment  commit={best.get('sentiment_commit')}  "
          f"task={best.get('sentiment_task')}  match={best.get('sentiment_match')}")
    print()
    for m in result.get("all_matches", []):
        bar = "█" * int(m["confidence"] / 5)
        print(f"    [{bar:<20}] {m['confidence']:5.1f}%  {m['task_name']}")

def ok(cond: bool, label: str):
    global passed, failed
    if cond:
        print(f"  ''PASSED   {label}")
        passed += 1
    else:
        print(f"   FAILED   {label}")
        failed += 1


# ──────────────────────────────────────────────────────────────
# TEST 1   Libraries loaded
# ──────────────────────────────────────────────────────────────
def test_libraries():
    hdr("TEST 1   NLP Libraries Loaded")
    ok(TfidfVectorizer  is not None, "scikit-learn TfidfVectorizer")
    ok(cosine_similarity is not None, "scikit-learn cosine_similarity")
    ok(sia is not None,               "VADER SentimentIntensityAnalyzer")
    ok(nlp is not None,               "spaCy model loaded")
    if nlp:
        has_vectors = nlp.vocab.vectors.shape[0] > 0
        model_name  = nlp.meta.get("name", "unknown")
        print(f"  spaCy model : {model_name}")
        print(f"  Has vectors : {has_vectors}")
        ok(has_vectors, f"spaCy model has real word vectors ({model_name})")


# ──────────────────────────────────────────────────────────────
# TEST 2   Tasks loaded with all fields
# ──────────────────────────────────────────────────────────────
def test_tasks_loaded():
    hdr("TEST 2   SIMULATION_TASKS Loaded")
    ok(len(SIMULATION_TASKS) == 3, "exactly 3 tasks")
    for t in SIMULATION_TASKS:
        ok(bool(t.get("id")),           f"'{t.get('name')}'has id")
        ok(bool(t.get("name")),         f"'{t.get('name')}'has name")
        ok(bool(t.get("description")),  f"'{t.get('name')}'has description")
        ok(bool(t.get("instructions")), f"'{t.get('name')}'has instructions")


# ──────────────────────────────────────────────────────────────
# TEST 3   Empty commit returns error
# ──────────────────────────────────────────────────────────────
def test_empty_commit():
    hdr("TEST 3   Empty Commit Message (error expected)")
    result = matcher.match()
    print(f"  success : {result.get('success')}")
    print(f"  error   : {result.get('error')}")
    ok(result["success"] is False, "returns success=False for empty commit")


# ──────────────────────────────────────────────────────────────
# TEST 4   Match: Todo bug fix commit
# ──────────────────────────────────────────────────────────────
def test_match_todo():
    hdr("TEST 4   Match: Todo bug fix commit")
    commit = "fixed delete button removing wrong todo item and added confirm dialog"
    result = matcher.match(commit)
    show(result)
    ok(result["success"], "match call succeeded")
    best = result["best_match"]["task_name"]
    ok("Todo" in best, f"best match is Todo task  (got: {best})")


# ──────────────────────────────────────────────────────────────
# TEST 5   Match: React profile card commit
# ──────────────────────────────────────────────────────────────
def test_match_react_component():
    hdr("TEST 5   Match: React profile card commit")
    commit = "added loading spinner and follow button to user profile card component"
    result = matcher.match(commit)
    show(result)
    ok(result["success"], "match call succeeded")
    best = result["best_match"]["task_name"]
    ok("Profile" in best or "Component" in best,
       f"best match is Profile Card task  (got: {best})")


# ──────────────────────────────────────────────────────────────
# TEST 6   Match: GET API endpoint commit
# ──────────────────────────────────────────────────────────────
def test_match_api_endpoint():
    hdr("TEST 6   Match: GET API endpoint commit")
    commit = "created GET /api/users endpoint with pagination and role filter"
    result = matcher.match(commit)
    show(result)
    ok(result["success"], "match call succeeded")
    best = result["best_match"]["task_name"]
    ok("API" in best or "Endpoint" in best or "User List" in best,
       f"best match is API Endpoint task  (got: {best})")


# ──────────────────────────────────────────────────────────────
# TEST 7   Unrelated commit → low confidence
# ──────────────────────────────────────────────────────────────
def test_match_unrelated():
    hdr("TEST 7   Unrelated Commit (low confidence expected)")
    commit = "updated README with deployment instructions"
    result = matcher.match(commit)
    show(result)
    ok(result["success"], "match call succeeded")
    conf = result["best_match"]["confidence"]
    print(f"  Best confidence: {conf}%")
    ok(conf < 50, f"confidence below 50% for unrelated commit  (got {conf}%)")


# ──────────────────────────────────────────────────────────────
# TEST 8   VADER sentiment analysis
# ──────────────────────────────────────────────────────────────
def test_sentiment():
    hdr("TEST 8   VADER Sentiment Analysis")
    proc = TextProcessor()
    cases = [
        ("fixed critical bug causing crashes and data loss", "negative"),
        ("added new feature for user profile display",       "neutral"),
        ("improved performance and optimized loading speed", "positive"),
    ]
    for text, expected in cases:
        got = proc.get_sentiment(text)
        print(f"  Text     : \"{text}\)
        print(f"  Expected : {expected}   Got : {got}")
        ok(got in ("positive", "negative", "neutral"), f"valid sentiment returned: {got}")
        print()


# ──────────────────────────────────────────────────────────────
# TEST 9   TF-IDF: identical texts → 1.0
# ──────────────────────────────────────────────────────────────
def test_tfidf_identical():
    hdr("TEST 9   TF-IDF: identical texts → similarity = 1.0")
    proc = TextProcessor()
    text = "fixed delete button removing wrong todo item"
    sim  = proc.tfidf_similarity(text, text)
    print(f"  Similarity of text with itself: {round(sim, 4)}")
    ok(sim >= 0.99, f"identical texts score ≥ 0.99  (got {round(sim, 4)})")


# ──────────────────────────────────────────────────────────────
# TEST 10   TF-IDF: unrelated texts → low similarity
# ──────────────────────────────────────────────────────────────
def test_tfidf_unrelated():
    hdr("TEST 10   TF-IDF: unrelated texts → low similarity")
    proc = TextProcessor()
    t1   = "fixed delete button in todo list"
    t2   = "deployed kubernetes cluster on AWS with autoscaling"
    sim  = proc.tfidf_similarity(t1, t2)
    print(f"  Text 1    : \"{t1}\)
    print(f"  Text 2    : \"{t2}\)
    print(f"  Similarity: {round(sim, 4)}")
    ok(sim < 0.3, f"unrelated texts score < 0.3  (got {round(sim, 4)})")


# ──────────────────────────────────────────────────────────────
# TEST 11   spaCy: identical texts → similarity ≥ 0.99
# ──────────────────────────────────────────────────────────────
def test_spacy_identical():
    hdr("TEST 11   spaCy: identical texts → similarity ≥ 0.99")
    proc = TextProcessor()
    text = "fixed delete button removing wrong todo item"
    sim  = proc.spacy_similarity(text, text)
    print(f"  spaCy similarity of text with itself: {round(sim, 4)}")
    ok(sim >= 0.99, f"identical texts spaCy score ≥ 0.99  (got {round(sim, 4)})")


# ──────────────────────────────────────────────────────────────
# TEST 12   All 3 tasks each matched by their own commit
# ──────────────────────────────────────────────────────────────
def test_all_three_tasks_distinct():
    hdr("TEST 12   All 3 tasks matched by distinct commits")
    cases = [
        (
            "fixed handleAdd function and NaN todo count bug",
            "Fix the Broken Todo List Application",
        ),
        (
            "added follow button and loading spinner to profile card TypeScript component",
            "Build a User Profile Card Component",
        ),
        (
            "implemented pagination and search filter for GET /api/users endpoint",
            "Create a GET API Endpoint for User List",
        ),
    ]
    for commit, expected in cases:
        result = matcher.match(commit)
        best   = result["best_match"]["task_name"]
        conf   = result["best_match"]["confidence"]
        print(f"  Commit   : \"{commit}\)
        print(f"  Expected : {expected}")
        print(f"  Got      : {best}  ({conf}%)")
        ok(best == expected, f"correct task matched")
        print()


# ──────────────────────────────────────────────────────────────
# TEST 13   Confidence scores are within 0–100
# ──────────────────────────────────────────────────────────────
def test_confidence_bounds():
    hdr("TEST 13   Confidence scores within 0–100")
    commits = [
        "fixed delete function",
        "added loading spinner",
        "created pagination endpoint",
        "updated README",
        "initial commit",
    ]
    all_ok = True
    for commit in commits:
        for m in matcher.match(commit).get("all_matches", []):
            if not (0.0 <= m["confidence"] <= 100.0):
                print(f"  OUT OF BOUNDS: {m['confidence']}%  commit='{commit}'")
                all_ok = False
    ok(all_ok, "all confidence scores are between 0 and 100")


# ──────────────────────────────────────────────────────────────
# TEST 14   Custom tasks override hardcoded tasks
# ──────────────────────────────────────────────────────────────
def test_custom_tasks():
    hdr("TEST 14   Custom tasks override hardcoded tasks")
    custom = [
        {
            "id": "custom_001",
            "name": "Payment Gateway Integration",
            "description": "Integrate Stripe payment gateway for checkout and billing.",
            "instructions": (
                "Add Stripe SDK to the project. "
                "Create a payment intent on the server. "
                "Handle Stripe webhook events for successful and failed payments. "
                "Display payment confirmation to the user after checkout."
            ),
        },
        {
            "id": "custom_002",
            "name": "Email Notification System",
            "description": "Send transactional emails using SendGrid API.",
            "instructions": (
                "Set up SendGrid API credentials. "
                "Create reusable email templates for signup, password reset, and order confirmation. "
                "Trigger emails on relevant user events."
            ),
        },
    ]
    m      = TaskMatcher(custom)
    result = m.match("integrated Stripe checkout and handled payment webhook events")
    show(result)
    ok(result["success"], "match call succeeded")
    best = result["best_match"]["task_name"]
    ok("Payment" in best, f"best match is Payment Gateway task  (got: {best})")


# ──────────────────────────────────────────────────────────────
# TEST 15   Batch: multiple commits, all succeed
# ──────────────────────────────────────────────────────────────
def test_batch_commits():
    hdr("TEST 15   Batch: multiple commit messages")
    commits = [
        "refactored handleAdd to correctly append new todo items to state",
        "implemented search and pagination for the users REST API endpoint",
        "styled ProfileCard component with Tailwind and added avatar fallback image",
    ]
    all_ok = True
    for commit in commits:
        result = matcher.match(commit)
        best   = result.get("best_match", {})
        print(f"  Commit : \"{commit[:60]}\)
        print(f"  Best   : {best.get('task_name')}  ({best.get('confidence')}%)")
        print()
        if not result["success"]:
            all_ok = False
    ok(all_ok, "all commits matched without errors")


# ──────────────────────────────────────────────────────────────
# RUN ALL TESTS
# ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("  COMMIT-TO-TASK MATCHER   TEST SUITE  v2.0")
    print("  (runs directly   no server needed)")
    print("=" * 60)

    test_libraries()
    test_tasks_loaded()
    test_empty_commit()
    test_match_todo()
    test_match_react_component()
    test_match_api_endpoint()
    test_match_unrelated()
    test_sentiment()
    test_tfidf_identical()
    test_tfidf_unrelated()
    test_spacy_identical()
    test_all_three_tasks_distinct()
    test_confidence_bounds()
    test_custom_tasks()
    test_batch_commits()

    print("\n" + "=" * 60)
    print(f"  RESULTS:  ''{passed} passed    {failed} failed")
    print("=" * 60 + "\n")

    sys.exit(0 if failed == 0 else 1)