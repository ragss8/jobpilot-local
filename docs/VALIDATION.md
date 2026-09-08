# Validation record

Build date: 2026-09-08. Version: 0.1.0.

## Verified in the build environment

- **42 Python tests passed** using `python -m unittest discover -s tests -v`.
- JavaScript syntax passed with `node --check jobpilot/static/app.js`.
- Dependency-free frontend logic checks passed for all seven view renderers, dynamic opportunity data, escaping untrusted company text, and filtering.
- The actual launcher started with `python -S run.py`, with site-packages disabled. Its loopback health endpoint responded successfully.
- Starting a second process against the same data directory was rejected.
- Source modules and launcher compiled successfully.

The Python suite covers skill alias boundaries, strict threshold behavior, required/optional weighting, experience/location/salary filters, duplicate upserts, provider identity updates, atomic limits under concurrency, uncertain-submission recovery, connector response fixtures and pagination, safe URL validation, resume extraction and evidence preservation, HTML escaping, stale packet fingerprints, fallback when model output fails, email signal classification, settings validation, source failure handling, changed live requirements, simulated confirmed submissions, manual submission accounting, HTTP origin/token checks, and import-to-resume-download integration.

The simulated application tests replace the provider fetch and browser send function with controlled fixtures. They verify orchestration and state handling, not an actual employer's acceptance of an application.

Detailed Python test output is in `test-results.txt`.

## Not verified here

- **Visual layout and real browser UI interaction:** the available remote browser rejected access to this environment's loopback address. No tunnel or deployment was created to work around that restriction. Frontend tests inspect rendered HTML strings, not browser layout or full DOM interaction.
- **Real Playwright employer submissions:** the optional Python Playwright installation could not complete under the build environment's network/approval restrictions. No actual employer application was submitted. Browser form compatibility and confirmation patterns need live validation on the user's computer.
- **Live job-feed integration:** adapters were checked against official API documentation and response fixtures. Actual company boards must be configured and synced locally; fixtures are not evidence that a named employer currently has an opening.
- **Actual local model inference:** no Ollama service or downloaded Qwen3 model was available. The integration and fallback are implemented; model performance and hardware requirements are not benchmarked here.
- **Real inbox login and polling:** no mailbox credentials were supplied. Classifier logic is tested, but a real IMAP connection is not verified.
- **Windows and macOS execution:** launch instructions are supplied; this build was exercised on Linux.
- **GitHub repository creation or push:** the available GitHub connector could list accessible repositories but did not expose repository creation, and no authenticated local GitHub CLI was present. No existing repository was modified. `scripts/push_private_repo.py` is supplied for the user's authenticated local CLI.

## Current practical limits

This release implements the local workflow and a conservative browser runner, with setup still needed for the user's resume, target company boards, local AI, browser packages, and mailbox. It does not provide universal web-wide scraping, guaranteed application success, a complete ATS assessment, or guaranteed interview calls.
