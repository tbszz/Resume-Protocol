# Cloud deployment

Server: Ubuntu 24.04, 2 CPU / 2 GiB RAM.
SSH: `ssh -p 10322 root@218.11.5.249`.
Public application origin: http://218.11.5.249:10321 (mapped to port 50000).

- Service: `resume-protocol.service`, runs as `resume-protocol`.
- Release: `/opt/resume-protocol/releases/20260912-pdf-ocr` (source commit `677221c`).
- Active release: `/opt/resume-protocol/current`.
- Configuration: `/etc/resume-protocol/app.env` (root and service group only).
- Persistent accounts, uploads and encryption key: `/var/lib/resume-protocol/data`.
- Node runtime: `/opt/resume-protocol/node`.
- Python environment: `/opt/resume-protocol/venv`.

Operations:

```sh
systemctl status resume-protocol
journalctl -u resume-protocol -n 100 --no-pager
systemctl restart resume-protocol
curl -fsS http://127.0.0.1:50000/api/health
```

Local accounts and uploads were not included in the release. Register a new account on the server. Future upgrades must preserve the persistent data directory. For a consistent backup, stop the service, copy the entire data directory including the model-settings encryption key, and restart the service.

The initial endpoint uses HTTP. Configure a domain and HTTPS before sending sensitive resumes or using a reused password. Set RESUME_PROTOCOL_ORIGIN to that HTTPS origin and RESUME_PROTOCOL_SECURE_COOKIES=true when HTTPS is enabled. The alternative mobile public IP is not configured as an accepted browser origin.

Verification (2026-09-12): local npm test and production build passed; public HTML/assets/health returned 200; anonymous private API returned 401; untrusted Origin returned 403. On the server, PDF and DOCX exports and one real Claude Agent SDK / MiniMax call passed. Service enabled for boot and successfully restarted. Initial runtime: Node v22.23.2. Full live resume-generation workflow was not rerun on the server.

Restart observation: the first stop hit the 60-second systemd deadline and was force-terminated; the cause was not established. A subsequent restart completed cleanly in 2 seconds with Deactivated successfully in the journal, followed by successful public endpoint checks. Monitor future restarts for recurrence.

## PDF OCR update — 2026-09-12

Deployed `677221c` to `/opt/resume-protocol/releases/20260912-pdf-ocr`. Installed Ubuntu packages `tesseract-ocr` and `tesseract-ocr-chi-sim`; Chinese and English language data are available. Windows retains its native OCR path, while Linux uses Tesseract before the configured vision model fallback.

Before switching the active symlink, the full test suite passed as the service user. An image-only Chinese PDF passed extraction and authenticated upload against an isolated temporary database: OCR returned 153 characters and the upload was parsed. The test made no external model calls. Public HTML, current JavaScript/CSS assets and health returned 200 after activation; anonymous conversations returned 401 and an untrusted origin returned 403.

A consistent pre-upgrade data backup is stored at `/opt/resume-protocol/backups/20260912-pdf-ocr/data` (root access only). Account, conversation and document counts, and all uploaded file sizes, were checked before/after activation. Persistent data and model configuration paths are unchanged. The prior release remains available at `/opt/resume-protocol/releases/20260912-initial`; reverting the active symlink and restarting the service rolls back code without removing user data.
