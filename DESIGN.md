# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-09-07
- Primary surface: a single persistent Career Agent chat.
- Evidence reviewed: src/main.jsx, src/chatStore.js, src/agentIntent.js, and docs/plans/2026-09-07-chat-only-agent-design.md.

## Product intent

Resume Protocol is a conversation-first career agent for job seekers. The product has one job: let the user paste a resume, a JD, or a goal and complete the next career task without learning a dashboard.

The UI must not expose a separate resume workbench, job radar, interview room, multi-step form, landing-page section stack, or anchor navigation. Those capabilities exist as tools invoked from the conversation and rendered as inline results.

## Brand

- Personality: calm, precise, evidence-bound, and proactive.
- Trust signals: local conversation persistence, visible context readiness, explicit tool progress, and source-faithful resume output.
- Avoid: universal-AI claims, fake account controls, decorative statistics, excessive glow, and chatbot mascots.

## Information architecture

- Left: brand, new chat, persistent conversation history, and local-storage notice.
- Top: active Agent identity and readiness for profile, target role, and tailored resume.
- Center: one message stream containing user messages, Agent replies, tool progress, and result cards.
- Bottom: one persistent composer with file upload.
- Empty conversation: a restrained video atmosphere, one thesis, and four starter prompts.

## Agent capabilities

- Resume diagnosis: pasted or uploaded material becomes a structured profile with strengths, gaps, and completeness.
- Job matching: the Agent returns selectable job cards inside the conversation.
- Tailored resume: the selected job and saved profile produce a role-specific summary, skills, and project bullets.
- Interview preparation: the generated variant produces technical topics, project questions, and a seven-day plan.
- Prerequisites are requested in chat; the Agent never navigates to another page.

## Conversation memory

- Storage key: resume-protocol.chat.v1.
- Every conversation stores messages and its own profile, job list, selected target, and generated variant.
- The first user message creates the history title.
- Refresh, new-chat creation, and history switching must preserve the associated context.
- Invalid saved state falls back to a fresh conversation.

## Visual language

- Colors: Canvas #F6F7F5, Surface #FFFFFF, Sidebar #18201F, Ink #171A19, Muted #6E7471, Signal #B9F36B.
- Type: Inria Serif for the empty-state thesis, Helvetica Neue for interaction text, IBM Plex Mono for status labels.
- Layout: 280px sidebar on desktop, full-height conversation stage, 850px message column, 820px composer.
- Signature: the supplied CloudFront video is desaturated and visible only in the empty conversation.
- Motion: one message-entry motion and restrained hover feedback; respect reduced motion.

## Responsive behavior

- Desktop: persistent sidebar and context readiness pills.
- Mobile: sidebar becomes a dismissible drawer, context pills collapse, message cards become one column, composer remains reachable.
- Required validation widths: 390px and the default desktop viewport.
- No horizontal page overflow at supported widths.

## Accessibility

- Enter sends and Shift+Enter adds a line break.
- Buttons and composer have visible keyboard focus.
- Conversation uses a live log region; status controls use explicit labels.
- Video is decorative, muted, inline, and has a static fallback.

## Constraints

- React + Vite + existing Express APIs; no new runtime dependencies.
- Chat history is local browser storage, not a user account or cloud sync.
- Generated claims remain constrained to parsed user material.
- Real job applications and platform automation are not triggered by the chat UI.

## Verification contract

- Unit tests: chat state, persistence recovery, result normalization, and intent prerequisites.
- Source contract: no legacy workbench sections or workflow anchors in src/main.jsx.
- Browser flow: resume analysis → job search → target selection → tailored resume → interview plan → refresh persistence.
- Responsive flow: mobile drawer, composer, result cards, and zero horizontal overflow.
