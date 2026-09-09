# Validation record

Updated 2026-09-09 on the configured Mac.

- 71 Python tests passed with `JOBPILOT_BROWSER_TESTS=1 .venv/bin/python -m unittest discover -s tests`.
- Eight frontend views passed rendering, escaping, and filtering checks.
- Seven real Chrome fixture tests cover resume upload, exact saved answers, a confirmed fixture submission, pause, unanswered fields, and custom required radio groups. All fixture requests are intercepted; they are not employer submissions.
- The running local dashboard was opened in isolated Chrome with no page errors. Application-agent layout was visually inspected; screenshot is under `data/qa`.
- Local Qwen3 4B inference was verified on the live WisdomAI job. Response schema and evidence validation reject incomplete output, invalid references, and contradictory strong decisions containing gaps.
- Live Greenhouse/Ashby feeds and LinkedIn public postings were fetched. Naukri returned no public results and Indeed denied access in the last cycle. No challenge bypass was attempted.
- JobPilot and Ollama user LaunchAgents started successfully. Both loopback health checks passed. Ollama uses local models and cloud-disabled mode.
- An initial 253-record ranking was reduced to approximately 3.8 seconds, with later requests cached.

Employer submissions and outcomes are recorded individually in the local application's attempts table; fixture passes do not prove a real application was accepted. Check the current application tracker for live results.

Real IMAP login, account-only job-board applications, Windows startup, and GitHub push remain unverified. The Mac must be awake and logged in for the local routine to run. There is no guaranteed interview or shortlist outcome.


## Live application results in this session

- WisdomAI, Software Engineer Frontend/Fullstack, Bengaluru: employer explicitly rejected the submission as possible spam. No confirmed application. Screenshot retained; no automatic retry of this posting.
- Skild AI, React Native Developer, Bengaluru: stopped before submission on unsupported form controls. The repaired adapter subsequently passed a live submission-disabled preflight, including required degree, office, contact fields and resume upload. It is queued for the next day allowed by the company attempt limit. This is not a submitted application.
- Two application attempts have been recorded; neither is confirmed submitted.
