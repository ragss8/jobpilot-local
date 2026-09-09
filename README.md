# JobPilot Local

A private, local web app for finding relevant jobs, preparing evidence-based resumes, tracking applications, and watching for recruiting emails.

**Runs at `http://127.0.0.1:8765`. Nothing is deployed. No paid AI API, API key, or per-token billing is required.** The core app runs on Python 3.11+ without installing third-party packages.

The application agent discovers public jobs, screens mandatory requirements, uses a local model for a second fit review, prepares factual resumes, and attempts supported employer forms. Account-only pages, verification challenges, and unanswered required questions are recorded while other jobs continue. Employer shortlisting cannot be guaranteed.

## Start in two commands

Extract the ZIP, open a terminal in its parent directory, and run:

```bash
cd jobpilot-local
python run.py
```

Open **http://127.0.0.1:8765** in your browser. On macOS/Linux, use `python3` if `python` is not available. On Windows, use `py -3 run.py` or double-click `start.bat`.

Keep the terminal open. Press **Ctrl+C** to stop. There is no cloud scheduler, hosting, Docker requirement, Node build step, or account required to use the core workspace.

For another port:

```bash
python run.py --port 8766
```

The server always binds to `127.0.0.1`. There is deliberately no `--host 0.0.0.0` option. Run one app process per data directory.

## What is implemented

| Feature | Current behavior |
| --- | --- |
| Local dashboard | Overview, application agent, opportunities, profile, application tracker, job sources, inbox signals, settings |
| Resume intake | Paste text or upload TXT; PDF/DOCX import with optional dependencies |
| Job discovery | Resume-derived public searches, LinkedIn guest listings, structured employer postings, observed employer board links, and Greenhouse/Lever/Ashby feeds |
| Other job websites | Public Naukri/Indeed search attempts report access failures; no login or challenge bypass |
| Matching | Explainable weighted coverage of recognized JD skills against the original resume |
| Eligibility | Strictly greater than 80% by default, job-title/location filters, experience checks, salary policy, company exclusions |
| Tailored resumes | Reorder relevant skills and bullets within their original projects; retain experience, education and factual context; export TXT/HTML/PDF/DOCX |
| Local AI | Ollama Qwen3 selects source evidence and screens core-role fit; uncertain or invalid fit reviews block submission |
| Application runner | Optional local Playwright browser for supported ATS hosts, exact known field answers, resume upload, conservative submission detection |
| Daily limits | Default 25, maximum 30 automated attempts, at most one per company per local calendar day |
| Duplicate protection | SQLite transactions; confirmed and uncertain applications cannot be automatically repeated |
| Job freshness | Re-fetch company feed before applying; close disappeared jobs only after a successful complete board sync |
| Scheduling | Once per day after the configured time, including a same-day catch-up after starting the app |
| Inbox | Read-only IMAP polling, email deduplication, interview/shortlist/offer/rejection/acknowledgement signals |
| Notifications | In-app alerts and optional browser desktop notifications while the dashboard is open |
| Data | SQLite, resumes, and application evidence stored locally; no personal data in the source repository |

## First setup

1. Open **Resume & profile**. Add your actual name, email, phone, location and professional experience.
2. Paste your complete resume, or install optional packages and upload PDF/DOCX. Review extracted text, especially PDF line breaks and tables.
3. Add LinkedIn/GitHub/portfolio links if relevant. Add exact answers for custom application questions you already know.
4. Check the profile verification box and save. Saving profile changes pauses automatic submission.
5. Open **Application agent** to inspect resume-derived search queries. Verified company boards can also be added in **Job sources**.
6. Click **Sync all sources**. Errors appear in Overview activity; a failed source does not close its cached jobs.
7. Open **Opportunities**, inspect the score and full JD, and click **Prepare tailored resume**.
8. Download the resume. Confirm that its content and formatting suit the role.
9. In **Settings**, adjust titles, locations, salary preference, and the attempt limit. Default location is Bengaluru/Bangalore, minimum salary preference ₹15 LPA, threshold strictly above 80%.
10. When your profile and browser dependencies are ready, enable **Submit eligible applications automatically** and optionally the daily schedule. The application tracker distinguishes confirmed submissions, unanswered questions, and uncertain outcomes.

A strong match score is not an ATS score, a complete qualification assessment, or a probability of receiving a call. Keywords do not establish proficiency, work authorization, degree equivalence, seniority, or country-specific remote eligibility. Review the JD and configure factual answers. A 100% skill score never guarantees an interview.

## Add PDF/DOCX support and browser automation

Creating a virtual environment is recommended so project packages stay separate from your other work.

### Windows PowerShell

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-optional.txt
.\.venv\Scripts\python.exe -m playwright install chromium
.\.venv\Scripts\python.exe run.py
```

### macOS / Linux

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-optional.txt
.venv/bin/python -m playwright install chromium
.venv/bin/python run.py
```

On some Linux distributions, Chromium also needs OS libraries. Follow the error from Playwright; its documented `python -m playwright install --with-deps chromium` command may require administrator access. The core app remains usable without Chromium.

PDF export uses a locally installed DejaVu Sans or Arial font for Unicode when available. If a suitable font is unavailable, use DOCX or HTML for Unicode text. Open the downloaded HTML in a browser and print to PDF if needed. HTML is always escaped and has no executable content.

## Free local model: Ollama + Qwen3

Install Ollama from [the official download page](https://ollama.com/download), then download a local model:

```bash
ollama pull qwen3:4b
```

Use Settings to enable local AI and select:

| Model | Intended use |
| --- | --- |
| `qwen3:1.7b` | Smaller download and lighter local workload |
| `qwen3:4b` | Default balance for selecting resume evidence |
| `qwen3:8b` | Optional larger model if your computer has sufficient memory |

These are local model tags, not cloud models. Inference uses your hardware; there is no token purchase or usage quota from an AI API. Models still process tokens internally, and hardware, electricity, download bandwidth, and memory are not free resources. Performance depends on your computer. No particular model is claimed to be the market's best.

Set **`OLLAMA_NO_CLOUD=1` in the environment of the Ollama process itself**, then restart Ollama. Setting it only for JobPilot does not alter an already running Ollama service.

Examples from Ollama's documented environment configuration:

- Windows: quit Ollama, add the user environment variable `OLLAMA_NO_CLOUD` with value `1`, and restart Ollama.
- macOS app: run `launchctl setenv OLLAMA_NO_CLOUD 1`, then fully quit and reopen Ollama.
- Linux service: add `Environment="OLLAMA_NO_CLOUD=1"` under `[Service]` using `systemctl edit ollama.service`, reload systemd, and restart the service.
- If you start it manually, run `OLLAMA_NO_CLOUD=1 ollama serve` in its own terminal on macOS/Linux.

JobPilot only calls `http://127.0.0.1:11434`, disables proxy use for local AI calls, and allows only the three listed model names. In **Settings**, click **Check model connection**. You can leave AI off: matching and evidence-only resume preparation work without Ollama.

The model receives resume lines and the JD and returns line IDs. Code validates every ID and copies only original lines. If the model is missing, times out, or returns invalid IDs, the app falls back to deterministic selection. The separate pre-submission fit review must return a valid strong decision; model failure never authorizes an application. Full original experience and education remain in every packet to retain factual context. The current implementation prioritizes evidence; it does not freely rewrite achievements or invent cover-letter claims.

## Company sources

Find the company segment in the employer's careers URL:

```text
https://job-boards.greenhouse.io/company-slug
https://jobs.lever.co/company-slug
https://jobs.ashbyhq.com/company-slug
```

Enter the provider, company display name and slug in **Job sources**. A company's display name is not always its slug. No guessed company boards or sample openings are loaded automatically.

Public feed reads need no employer API credential. Greenhouse's application API requires an employer key, so JobPilot does not attempt to use that endpoint. Submissions use the browser adapter instead.

Discovery uses generic role, skill, and location queries derived from the resume; it never sends contact information or full resume text to search engines. LinkedIn public listings are supported. Naukri and Indeed public searches can return no results or block access; the source report shows this explicitly. Employer links found on public company pages can expand the board list. Search coverage is bounded, not exhaustive. Account-only applications and unsupported portals still require an adapter or account access.

### JSON job import

Import a UTF-8 JSON array from **Job sources**. The example below is a fictional test record, not a real opening:

```json
[
  {
    "company": "Example Company",
    "title": "Full Stack Engineer",
    "url": "https://careers.example.com/jobs/example-role",
    "location": "Bengaluru, India",
    "description": "Full job description copied from the original employer posting. React, TypeScript, Node.js and PostgreSQL experience required.",
    "min_years": 3,
    "salary_max_lpa": 25
  }
]
```

Only enter salary and experience values when the posting explicitly provides them. Omit unknown values. Sources currently do not normalize arbitrary salary currencies or ranges from feed text. With the strict salary setting off, an unknown salary is a warning; with it on, unknown-salary jobs are ineligible.

## Approved resume layout

The configured PDF template follows `M-Raghu-Gaikwad (1).pdf`: one US Letter page, Times New Roman 10 pt body text, a centered uppercase name, centered contact details and underlined blue links, ruled uppercase section headings, bold labels, and italic projects and dates. There is no added target-role heading. Confirmed experience and education are preserved; relevant bullets can move only within their original project.

Automatic applications use this PDF template. The matching exports are PDF, HTML, and plain text; the previous Word layout is not offered for this template. If content cannot fit one page at the approved readable type size, generation stops rather than clipping facts or reverting to the rejected layout. Times New Roman must be installed locally. Earlier resume files are backed up before replacement.

## Fresh listings in this workspace

Fresh-only mode is enabled for this configured workspace. LinkedIn, Indeed, Naukri, and other job-board listings must have a verified posting time within the last 24 hours. Missing, date-only, invalid, or future timestamps are hidden unless the listing supplies a usable relative age. Rounded relative ages use the oldest possible time; discovering a listing again never resets its age.

Company career openings are shown while verified active, regardless of original posting age. The active check must be no more than 24 hours old, and enabled scheduling refreshes company feeds hourly. Closed or expired listings disappear from opportunities. Failed requests never count as proof that a listing is active.

The backend re-evaluates freshness on every state request, before preparation, and before submission. An open opportunities page removes expired entries on its regular refresh. Application history and duplicate-protection records remain available in the tracker. Old listings are hidden rather than deleting submission evidence.

## Application behavior and limits

- The app uses regular Playwright Chromium, visible by default. It does not spoof a human identity, use stealth plugins, solve CAPTCHAs, bypass logins, or evade site restrictions.
- Supported main-page hosts are Lever, Greenhouse, Ashby, and verified public employer pages. Aggregator listings need an employer application link; job-board account applications are not implemented.
- The generic adapter fills native fields identified by labels or a small exact name allowlist. Exact-option comboboxes are supported. Other custom widgets, multi-step applications, embedded forms, ambiguous submit controls, and unknown required fields can stop the attempt.
- Resume uploads use the tailored PDF or DOCX. Browser evidence is saved under `data/evidence/`.
- Work authorization, sponsorship, expected salary, sensitive personal questions, and consent are answered only when you supplied an exact answer in the profile's question bank. A required unanswered question becomes `needs_input`.
- CAPTCHAs and login challenges become `needs_input`; the app continues with other employers. This version does not hand over a persistent browser session: it saves evidence and closes the automation browser.
- The current generic adapter is intentionally conservative and may require manual completion even on supported ATS platforms. Provider-specific form refinements and live tests are still necessary before trusting unattended runs.
- The company feed is rechecked immediately before an application. Changed requirements are scored again.
- An attempt is reserved atomically before browser actions. Missing fields and browser failures consume an attempt and the company slot for that day, avoiding retry loops.
- Submission is recorded only after new confirmation text appears after the submit click. A click without observed confirmation becomes `uncertain` and cannot be retried automatically, even the next day.
- A process interruption during application is recovered as `uncertain` on the next start.
- You can record a manual submission, interview, shortlist, rejection, or archive from the opportunity dialog. Manually recorded submissions count toward the day's budget. If an uncertain application truly was not submitted, record that explicit check before making it eligible for retry.
- **Pause automation** turns off the schedule and future submit clicks. It cannot recall an application already sent or interrupt a click that has already started.

## Inbox and notifications

The app reads a mailbox via IMAP over TLS. It never sends messages, deletes them, moves them, or marks them read. App passwords are configured locally and are not sent to an AI model.

For Gmail, use an account where IMAP access and app passwords are available under its settings/policy. Some providers or organizations require OAuth instead; OAuth mailbox setup is not implemented. Do not put passwords into chat or commit them to Git.

### Windows PowerShell

```powershell
$env:JOBPILOT_IMAP_HOST = "imap.gmail.com"
$env:JOBPILOT_IMAP_USER = "your-email@example.com"
$securePassword = Read-Host "Mail app password" -AsSecureString
$env:JOBPILOT_IMAP_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
.\.venv\Scripts\python.exe run.py
Remove-Item Env:JOBPILOT_IMAP_PASSWORD
```

### macOS / Linux (Bash)

```bash
export JOBPILOT_IMAP_HOST="imap.gmail.com"
export JOBPILOT_IMAP_USER="your-email@example.com"
read -r -s -p "Mail app password: " JOBPILOT_IMAP_PASSWORD
export JOBPILOT_IMAP_PASSWORD
.venv/bin/python run.py
unset JOBPILOT_IMAP_PASSWORD
```

Enable **Inbox monitoring** in Settings, or click **Check inbox**. The worker checks at most 250 recent emails from the last 14 days every five minutes. Configure `JOBPILOT_IMAP_LOOKBACK_DAYS` for 1–90 days. This bounded scan can miss older messages in a high-volume mailbox; it is not a full-mailbox archival integration.

Messages are deduplicated by mailbox and Message-ID. Classifications are heuristic signals, not proof of a hiring decision. They do not update application status automatically and are not automatically assigned to a company. Review the original email. Recruiting snippets are stored locally.

Enable desktop notifications in Inbox signals if desired. Browser notifications require the dashboard to remain open and browser permission. There is no mobile push, SMS, outgoing email, phone-call monitoring, or OS tray notification service in this release.

## Local schedule

Default: **09:30 Asia/Kolkata**, schedule initially disabled until setup.

The app checks the clock every 20 seconds. After the configured time, it runs one daily cycle: sync sources, rank jobs, attempt eligible roles when automatic submission is enabled, then optionally check mail. Missed past days are not replayed. An interrupted or failed daily cycle is recorded for that day and is not automatically repeated; click **Run today's search** after correcting the issue.

The computer must be awake and the user logged in for a local login-started routine. On macOS, `python scripts/install_local_agent.py --start` installs user LaunchAgents for JobPilot and Ollama, starts them, and restarts them after process failure. It uses the project virtual environment, local model directory, loopback-only services, and Ollama cloud-disabled mode. Logs are under `data/logs`. The services run without keeping a terminal open. On this configured Mac the daily routine is enabled for 09:30 Asia/Kolkata, with 25 attempts maximum.

## Put the source in your private GitHub repository

The connected GitHub integration available during this build could inspect and write existing repositories, but did not expose repository creation. No new GitHub repository was created or pushed from this session. Existing repositories were left untouched.

Install [Git](https://git-scm.com/downloads) and [GitHub CLI](https://cli.github.com/), then run:

```bash
gh auth login
python scripts/push_private_repo.py
```

This creates **`ragss8/jobpilot-local` as private**, commits only selected source paths, and pushes the source code. It does not deploy the app or enable GitHub Pages. The helper checks the connected username and verifies repository privacy afterward. The extracted package is also a Git repository once the helper initializes it.

If the private repository already exists, the helper deliberately stops. Verify its owner and privacy, then use your normal Git workflow or provide that exact repository URL to the connected GitHub integration. For an empty private repository, from this project folder:

```bash
git init -b main
git add jobpilot tests scripts docs README.md LICENSE run.py start.bat start.sh requirements-optional.txt .gitignore .env.example
git commit -m "Build JobPilot local application workspace"
git remote add origin https://github.com/ragss8/jobpilot-local.git
git push -u origin main
```

If Git asks for author identity, configure your own name and a GitHub no-reply email locally. Do not add a second origin if one already exists. Do not force-push over existing work.

## Data and privacy

Default local files:

```text
data/jobpilot.sqlite3       Profile, jobs, settings, recruiting signals, attempts and audit events
data/packets/<job-id>/      Resume variants and evidence selections
data/evidence/             Browser screenshots of application state
```

The source ZIP contains no user resume, actual job applications, mailbox password, model weights or browser session. `data/`, `.env`, SQLite files and local environments are ignored by Git. Custom data directories should be outside the repository. The GitHub helper stages a source allowlist.

The app is single-user local software, not a production public server. Local data is not encrypted by the app; protect it with your operating system account and disk encryption. Anyone with access to your OS session can use the local dashboard. Host/origin checks, a per-process mutation token, no CORS, and CSP protect against ordinary cross-site requests. AI cannot issue browser commands. Outbound browser requests reject private-address destinations, but the browser runner is not a security sandbox for arbitrary hostile websites. Only use trusted employer boards.

No resume leaves your computer for AI processing. Enabling browser submission sends the relevant application details and resume to the selected employer. Job-feed requests contact those providers; inbox monitoring contacts your mail provider. Local-only means computation and storage are local, not that searching and applying work without the internet.

To back up data, stop the app and copy the entire `data` directory. To reset, stop the app and move that directory aside. Do not delete uncertain-attempt records before checking employer portals, because they prevent duplicate sends.

## Verify and extend

```bash
python -m unittest discover -s tests -v
node --check jobpilot/static/app.js
node tests/test_frontend.cjs
```

Node is only needed for the optional frontend logic test, not for running the app. See `docs/VALIDATION.md` for what was exercised and what remains unverified, and `docs/ARCHITECTURE.md` for the implementation map.

## Official references

- [Ollama Qwen3 4B model](https://ollama.com/library/qwen3:4b)
- [Ollama local-only mode and environment configuration](https://docs.ollama.com/faq)
- [Greenhouse public Job Board API](https://docs.greenhouse.io/job-board.html)
- [Lever public Postings API](https://github.com/lever/postings-api)
- [Ashby public Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [Playwright Python browser installation](https://playwright.dev/python/docs/browsers)

MIT licensed source. Third-party libraries and model weights retain their own licenses.
