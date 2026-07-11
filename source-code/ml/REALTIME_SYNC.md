# Real-Time Recommendation Sync   How It Works

This explains the "candidate updated their profile / job changed / candidate
did something" pipeline that keeps `hybrid_job_recommender.py` up to date
without a full cold retrain. Two halves: a **sender** (Node backend) and a
**receiver** (the hybrid ML service).

```
Node backend write (profile edit, job edit, view/save/apply/ignore/search)
        │
        ▼
RecommendationSyncService.queueEvent({ ... })      [source-code/backend/src/services/recommendation-sync.service.ts]
        │  batches in memory, flushes every 750ms or 50 events
        ▼
POST {RECOMMENDER_WEBHOOK_URL}/batch               [http://127.0.0.1:8003/webhooks/recommendation-events/batch]
        │
        ▼
hybrid_job_recommender.py: enqueue_realtime_events()
        │  background worker thread drains the queue (debounced)
        ▼
_apply_realtime_batch()  →  in-memory upsert (candidate/job) or
                             in-memory frame append (view/save/apply/ignore/search)
        │
        ▼
_schedule_collaborative_refresh()  →  debounced partial refit of ONLY the
                                       collaborative-filtering matrix
                                       (default 8s after the last event)
```

No full `engine.prepare()` reload is needed for any of this   that's reserved
for `POST /refresh` and service startup.

## 1. The parameters you send   `queueEvent(event)`

```ts
RecommendationSyncService.queueEvent({
  event_type: 'recommendation_update',   // always this value in practice
  entity_type: 'saved_jobs',             // what kind of thing changed   see table below
  operation: 'insert',                   // 'insert'| 'update'| 'delete'(or 'upsert')
  candidate_id: userId,                  // the users.id whose data changed
  job_id: jobId,                         // present for job-related/behavior events
  entity_id: someRowId,                  // optional   e.g. the application id
  payload: { seconds_spent: 12 },        // event-specific extra data, see table below
  source: 'backend',                     // always 'backend'from Node; the sync service also stamps this
});
```

| Field | Required? | Notes |
|---|---|---|
| `event_type` | always sent, ignored by the receiver's dispatch logic (kept for future use / logging) |
| `entity_type` | **yes** | drives which branch of `_apply_realtime_batch()` runs   see table below for every value it understands |
| `operation` | **yes** | `'delete'`/`'removed'` removes a candidate/job snapshot; anything else upserts/appends |
| `candidate_id` | usually | falls back to `payload.candidate_id` / `payload.user_id` if omitted |
| `job_id` | for job/behavior events | falls back to `payload.job_id` |
| `entity_id` | optional | not read by the current dispatch logic, but is included in the record for future auditing/logging |
| `payload` | optional | free-form; only specific keys are read per entity_type (below) |
| `source` | cosmetic | always `'backend'`   `RecommendationSyncService` stamps it automatically even if you don't pass it |

`queueEvent()` is fire-and-forget: it just appends to an in-memory array and
returns immediately   it never awaits the HTTP call, so it can't slow down
or fail the request that triggered it. If `RECOMMENDER_WEBHOOK_URL` is unset,
it's a silent no-op (this was the actual production bug found and fixed:
the env var was never set on the server, so *every* call site   old and
new   was silently doing nothing).

## 2. `entity_type`   what each one does on the receiving end

| `entity_type` you send | What happens in `hybrid_job_recommender.py` | Extra `payload` fields it reads |
|---|---|---|
| `candidate` / `candidate_profile` / `candidate_profiles` / `profile` | `operation=delete` → removes the candidate's row from the in-memory model entirely. Anything else → re-fetches *that one candidate* from Postgres and upserts their content-model vector (skills/education/work text). Triggers a debounced collaborative-model refresh. | none read directly   the upsert re-reads the candidate fresh from the DB by id |
| `job` / `jobs` | Same idea for a single job: `delete` removes it, otherwise re-fetches and upserts it (feeds the content model + freshness/popularity signals). Triggers a debounced collaborative-model refresh. | none   re-fetched fresh from the DB |
| `view` / `job_views` | Appends one row to the in-memory "views" frame (feeds behavior model + freshness). | `event_date` (defaults to now) |
| `saved_job` / `saved_jobs` / `save` | Appends to the "saves" frame (a positive interest signal). | `event_date` |
| `application` / `applications` | Appends to the "applications" frame   the **strongest** positive signal for both the behavior model and collaborative filtering. | `event_date`, `status` (defaults to the `operation` value, or `'submitted'`) |
| `ignored_job` / `ignored_jobs` / `ignore` | Appends to the "ignored" frame   used as a **hard negative** in collaborative-filtering training (explicitly *not* just absence-of-interaction). | none |
| `search` / `job_searches` | Appends to the "search_events" frame   feeds the behavior model's query-to-job TF-IDF matching. | `query` (the raw search text) |

Anything else is silently ignored (not an error   just not recognized).

`candidate`/`job` events are treated as **structural changes** (the shape of
the candidate/job set changed)   they trigger `_rebuild_cached_interactions()`
and `_refresh_behavior_from_cache()` in addition to the collaborative
refresh. Behavior events (view/save/apply/ignore/search) trigger the same
three steps, just without needing a fresh DB re-fetch first.

## 3. What you get back

**`POST /webhooks/recommendation-events`** (single event) and
**`POST /webhooks/recommendation-events/batch`** (`{ "events": [...] }`) both
return immediately, before the batch is actually processed:

```json
{
  "accepted": 1,
  "queue_size": 1,
  "received_at": "2026-07-06T13:07:19.121452"
}
```

- `accepted`   how many events were validated and queued (not yet applied)
- `queue_size`   how many events are currently waiting in the background worker's queue
- `received_at`   server timestamp

The actual application to the model happens asynchronously on a background
thread shortly after (debounced). To see the *result* of that, poll:

**`GET /realtime/status`**

```json
{
  "queue_size": 0,
  "listener_started": true,
  "collaborative_refresh_pending": false,
  "collaborative_refresh_running": false,
  "last_trained_at": "2026-07-06T13:07:28.744000"
}
```

- `queue_size`   0 once the worker has drained everything queued so far
- `listener_started`   whether the background worker thread (and the optional Postgres `LISTEN` thread) is running
- `collaborative_refresh_pending`   a refresh has been scheduled but the debounce delay (default 8s) hasn't elapsed yet
- `collaborative_refresh_running`   the collaborative-filter refit is actively running right now
- `last_trained_at`   timestamp of the last time *anything* (full retrain, or an applied realtime event) updated the model's state   compare this to when you sent an event to confirm it actually took effect

## 4. Config   environment variables

| Variable | Side | Default | Purpose |
|---|---|---|---|
| `RECOMMENDER_WEBHOOK_URL` | Node backend | *(empty   disabled)* | Base URL the sync service posts to, e.g. `http://127.0.0.1:8003/webhooks/recommendation-events`. **Must be set** or every `queueEvent()` call is a silent no-op. |
| `RECOMMENDER_WEBHOOK_SECRET` | both | *(empty   no auth)* | If set on the Python side, every webhook request must carry a matching `X-Recommendation-Secret` header or gets a 401. |
| `RECOMMENDER_WEBHOOK_TIMEOUT_MS` | Node backend | `1500` | HTTP timeout for the batch POST   kept short so a slow/down ML service never blocks a user request. |
| `RECOMMENDER_WEBHOOK_BATCH_SIZE` | Node backend | `50` | Flushes immediately once this many events are queued, instead of waiting for the flush timer. |
| `RECOMMENDER_WEBHOOK_FLUSH_MS` | Node backend | `750` | Max time an event sits in the in-memory queue before being sent, if the batch size isn't hit first. |

## 5. Where it's wired in the backend (current call sites)

- `candidate.controller.ts`: `updateProfile`, `updatePreferences`, `updateAvailability`, `updatePrivacySettings`, `checkProfileCompletion`, `addEducation`/`updateEducation`/`deleteEducation`, `addWorkExperience`/`updateWorkExperience`/`deleteWorkExperience`, `addSkill`/`updateSkill`/`deleteSkill`   all send `entity_type: 'candidate_profiles'`.
- `job.controller.ts`: `createJob`/`updateJob`/`deleteJob` (`entity_type: 'jobs'`), `saveJob`/`unsaveJob` (`entity_type: 'saved_jobs'`).
- `feed.controller.ts`: `logJobView` (`job_views`), `ignoreJob`/`unignoreJob` (`ignored_jobs`), `saveJob`/`unsaveJob` (`saved_jobs`), `logSearch` (`job_searches`).
- `application.routes.ts`: both application-submission code paths (`entity_type: 'applications'`).

Portfolio links and resume upload/delete are **not** wired   they don't feed
any of the hybrid engine's models (no skills/education/work-experience text),
so there's nothing for a sync event to update.
