# Architecture

JobPilot is a single-user Python application with a plain JavaScript frontend. Keeping the core dependency-free makes the first local run small and easy to inspect. SQLite supplies persistence and transactional application limits. There is no external backend, deployment configuration, hosted database, cloud AI endpoint, or GitHub Actions workflow.

| Module | Responsibility |
| --- | --- |
| `server.py` | Loopback HTTP server, JSON endpoints, request-origin checks, token validation, private downloads |
| `service.py` | Validated profile/settings, one active worker, matching, source refresh, local schedule |
| `db.py` | SQLite persistence, attempts, audit events, duplicate handling and recovery |
| `locking.py` | Process lock for one running app per data directory |
| `sources.py` | Greenhouse, Lever, Ashby normalization; pagination; HTML-to-text conversion |
| `discovery.py` | Resume-led public discovery, structured postings, observed employer links, source access reports |
| `transport.py` | Verified TLS, public HTTPS destination checks and validated redirects |
| `matching.py` | Skill aliases, explicit technology alternatives, mandatory-skill exclusions and eligibility |
| `assessment.py` | Local semantic fit review with constrained JSON, source references and fail-closed validation |
| `tailoring.py` | Structured factual resume layout preserving project and employment context |
| `resume.py` | Resume extraction, evidence selection, optional local model, validated line references, export |
| `browser.py` | Conservative visible Playwright browser, known answers, uploads, confirmation evidence |
| `mailbox.py` | TLS IMAP read-only polling, deduplication, recruiting signal classification |
| `static/` | Responsive dashboard UI; no CDN fonts, analytics, or third-party scripts |

## End-to-end flow

1. The user saves factual profile information and original resume text.
2. Public discovery derives role/skill/location queries from resume evidence; verified company feeds normalize current jobs.
3. The matcher compares recognized JD skills with skills actually present in the original resume.
4. Role/location/experience/salary filters decide whether the job is eligible for automation.
5. Structured resume preparation reorders factual skills and bullets within project boundaries, preserving experience and education. The packet keeps the original resume and a profile/job fingerprint.
6. Before an automatic application, the worker re-fetches the employer feed or verified posting, checks current requirements, and requires a valid strong local-model fit decision when AI is enabled. It then prepares a fresh packet.
7. A SQLite immediate transaction reserves the daily/company slot and rejects duplicates.
8. The local browser fills only exact known answers and uploads the generated resume. Required unsupported fields and bot challenges stop that application.
9. New employer confirmation text after a submit click records `submitted`. An unconfirmed click or interrupted process records `uncertain`.
10. The read-only mailbox worker detects recruiting signals independently. It does not infer application ownership or mutate application statuses.

## Matching method

For each recognized skill in the JD:

- Weight 1 when treated as required.
- Weight 0.5 when appearing in a line containing an optional/preferred marker.
- Coverage = weight of evidenced skills / weight of all recognized skills × 100.

No recognized requirements yields 0 and manual review, not a perfect match. A score equal to the threshold does not pass because the requested threshold is strictly greater than 80% by default.

This is a vocabulary-based heuristic. It can miss unknown terminology, misread alternative requirements, overcount technology families, and classify a whole line as preferred. It is not an ATS simulator or semantic assessment of the entire job. Extra keywords can extend coverage. No claims about interview probability are made.

Experience extraction recognizes common phrases only. Location matching uses configured text, with Bangalore/Bengaluru normalization; it does not assume all remote jobs are available in India. Salary fields are entered explicitly for imported jobs and are not inferred from arbitrary prose.

## Application states

| State | Meaning |
| --- | --- |
| `new` | Discovered/imported, available for matching |
| `prepared` | Resume packet created |
| `queued` | Recognized eligible queue state for future extensions; current daily runner selects directly |
| `applying` | Attempt reserved and browser running |
| `submitted` | Confirmation observed or user recorded submission |
| `needs_input` | Form could not be completed before a verified submit |
| `uncertain` | A submit may have happened; automatic retry is blocked |
| `closed` | Job missing after a successful board sync or employer page reports closure |
| `interview`, `shortlisted`, `rejected` | Updates recorded by the user |
| `archived` | User set the opportunity aside |

Attempts are durable and unique sends are enforced independently of the displayed job status. A failure still consumes the daily attempt/company slot to prevent loops. A manually recorded submission consumes a slot as well. An uncertain attempt can be reset only after the user explicitly records that no submission occurred.

## Untrusted input boundaries

- Job descriptions, model responses, resumes and emails are data, not instructions.
- Resume selection uses validated source indexes. Fit review returns a constrained decision, source indexes, and exact JD gap excerpts; contradictory strong decisions with gaps are downgraded. Models cannot request tools or author achievements.
- A prepared packet fingerprint changes when profile or JD content changes; the UI warns about stale packets.
- Browser field values come from profile data and exact question-answer mappings, not the JD or mailbox.
- JSON endpoint mutations require a same-origin local request and a per-process token. User text is escaped in the UI and exported HTML.
- Feed hosts are fixed; public discovery additionally validates HTTPS destinations and redirects against private addresses. Imported records are not automatically trusted for submission. Browser navigation is restricted to supported ATS hosts or the verified employer host and rejects private-network destinations.

## Extension priorities

1. Live test and refine each ATS form adapter using permitted test applications, including custom selects, multi-step forms and embedded forms.
2. Add provider OAuth for inboxes where app passwords are unavailable, and incremental IMAP cursors for high-volume mailboxes.
3. Add employer discovery from explicitly permitted sources, source-specific filters, EU Lever feed configuration and salary normalization.
4. Add contextual skills/requirement parsing with evidence and evaluation fixtures, preserving transparent coverage and factual resumes.
5. Improve ATS-specific resume layout and introduce traceable optional phrasing suggestions that require factual validation before use.
6. Add persistent user-owned browser session handoff and OS tray notifications, without CAPTCHA bypass or stealth behavior.

The public-source adapters and browser runner are distinct. Reading a provider's public feed does not guarantee that every employer form on that provider is supported.
