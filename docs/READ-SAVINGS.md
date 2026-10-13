# Firestore read savings

The counting fixture contains 40 tasks, 20 projects, 15 meetings, 80 notes, 200 activity records, 80 undo records, 20 agendas and 5 drafts. These are illustrative test records, not your production workspace. Query counts include the minimum one read for an empty query. Index-entry billing and Firebase Auth calls are not modeled.

| Operation | Earlier path with the fixture | Optimized path |
| --- | ---: | ---: |
| Full visible workspace load | 923 document/query reads (full membership scan plus repeated full load) | 383 reads |
| Unchanged scheduled workspace check | 923 reads | 2 document reads: current profile and membership/revision |
| Task edit plus the old follow-up full reload | 1,846 reads | 78 reads, with task/activity/version patches sent in the save response |
| Profile GET | 2 profile reads | 1 profile read |
| Workspace AI quota reservation transaction | 461 reads | 1 workspace-record read |

The task-edit example excludes a periodic log-compaction pass. Such a pass reads the stored activity/undo records when needed, at most once per 15 minutes while append operations are occurring. Existing workspaces also incur a one-time revision initialization transaction. In the example an unchanged check uses over 99% fewer document reads than a full optimized snapshot; this is not an overall production savings guarantee.

The complete task set is deliberately retained where dependency validation, per-workspace caps, deduplication and board ordering need it. This avoids incorrectly accepting a cycle, duplicating an approved task or producing partial dashboard/export results. A narrowly planned transaction refuses to persist changes to any collection it did not load.

Background checks keep their two-minute cadence. App changes trigger a full visible refresh at the next check; task-save responses update their committed rows immediately. The hourly safety scan, manual refreshes and initial page loads still read the visible data. Empty browser tabs are already skipped when the document is hidden.

No cache is relied upon across server instances. Revisions are stored on the workspace document and written transactionally. Request-local read reuse is discarded after that HTTP request and invalidated after a mutation or revision change. Permissions are read independently of that reuse.
