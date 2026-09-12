# Resume Protocol Design

Updated: 2026-09-08. Supersedes the previous video conversation design.

## Entrance and workspace

Independent editorial landing page with Resume Protocol branding, supplied one-shot video, serif display headings and sans-serif body. Login/register use real accounts; Get Started enters the workspace. Hash navigation restores the workspace on refresh.

Three columns: expandable projects and conversations; transcript and composer; original PDF, evidence annotations and optimized downloads. Account and model settings are bottom-left. Solid white/black conversation backgrounds, neutral secondary surfaces, modest sans-serif Chinese headings, safe wrapping and dismissible mobile drawers. Four colored loading dots track real model work; respect reduced motion.

## Data and model truth

SQLite stores user-scoped projects, conversations and documents. HttpOnly sessions; encrypted custom model keys never returned. Default or custom OpenAI/Anthropic-compatible endpoints. Public conversation text does not name the default provider. Preserve existing records and explicit legacy import.

Uploaded material receives model annotations before its first substantive answer. Quotes must occur in the source; unsupported numbers and extra technologies in edits are rejected. Rule fallback is labeled. Completed tool replies summarize validated results; material-based freeform replies undergo a separate factual review.

Qualification precedes ranking: source completeness, job type, freshness, degree, major, experience, work authorization and required skills. Failed checks exclude; missing evidence goes to verification. Aggregator metadata is not a complete JD or proof of an open role. Preferred qualifications are not hard requirements.

## Deliverables and checks

Original PDF retained; quote-matched highlights added in a separate annotated copy. Generated resumes have authenticated PDF and editable DOCX downloads. Do not show active downloads before generation. Preserve source facts and Chinese text.

Verify light/dark desktop and narrow layouts, real model annotation/generation, ownership and persistence, qualification regressions, PDF/DOCX content and actual PDF highlight coordinates. Secrets remain outside the browser bundle. Test with isolated accounts and data.

## Workspace update — 2026-09-12
Only the authenticated workspace uses assistant-ui React primitives and a warm Claude-inspired layout. Landing markup, original stylesheet and document head remain unchanged from the start of this update, guarded by workspaceRuntime.test.js. Business result cards, upload parse status, job selection, previews and exports retain the existing server contracts. The runtime adapts server messages without persisting synthetic loading messages.

Validation: npm test, node src/workspaceRuntime.test.js and npm run test:workspace-ui pass. Browser coverage uses the real React production build, isolated database and a deterministic model fixture; it covers sending, copying, cancellation, upload, preview, settings, conversation switching and mobile overflow. This browser run does not call the live model.
