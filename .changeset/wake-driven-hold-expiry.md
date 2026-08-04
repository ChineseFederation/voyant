---
"@voyant-travel/core": minor
"@voyant-travel/framework": minor
"@voyant-travel/operations": minor
"@voyant-travel/inventory": patch
"@voyant-travel/runtime": patch
---

Wake the expired-hold reaper instead of polling for it.

An availability hold records the instant it becomes reapable, so nothing has to
poll to discover that work. `operations.release-expired-availability-holds` is
now `wakeup: true`: placing or extending a hold reports the new expiry, the
reaper re-arms itself from the earliest outstanding expiry after every run, and
the cron drops to a six-hourly backstop for a wake lost to a restart.

Hosts gain a target-neutral way to carry that request.
`VoyantRuntimeHostPrimitives.jobs.wakeAt(jobId, at)` asks the deployment to
invoke a wakeable job at an instant; the Node host arms one in-process timer per
job, keeps the earliest pending instant, and declines anything past its horizon.
A requested wake is a prompt and never durable — the declared cadence stays the
recovery authority, as it already is for a wake arriving over
`POST /__voyant/jobs/:id`.

On a managed deployment this is what stops an idle tenant from paying for its
database. A tenant with no live holds now arms nothing and never wakes its
compute for this job; one with holds wakes exactly when there is capacity to
give back, which is sooner than the fifteen-minute sweep it replaces.
