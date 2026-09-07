# Chat-only Career Agent Design

## Goal

Replace the landing page and structured workbench with one persistent Agent conversation surface. Resume diagnosis, job discovery, tailored resume generation, and interview preparation remain available only as conversational tools and inline results.

## Chosen approach

Use a Codex-like application shell:

- A dark left sidebar owns new-chat creation and local conversation history.
- A single central column owns the active conversation, contextual status, and composer.
- Tool calls appear as compact progress rows and result cards inside the transcript.
- There are no downstream workflow sections, anchor navigation, radar modal, or separate resume/interview workspace.
- The existing CloudFront video becomes a restrained empty-conversation atmosphere, not a landing-page hero.

This is preferred over retaining a hero or a hidden tool drawer because both would preserve the old page/workbench mental model.

## Data model

Persist a versioned object in `localStorage`:

```text
ChatState
  activeConversationId
  conversations[]
    id, title, createdAt, updatedAt
    messages[]
    context
      material, profile, diagnosis
      jobs, selectedJob
      variant, formalResume
```

The first user message creates the conversation title. Selecting a job or completing a tool updates the same conversation context, so later prompts can reuse it after refresh.

## Agent tools

- `analyze`: parse pasted or uploaded resume material and return completeness, strengths, and gaps.
- `search-jobs`: query the local job library and return selectable job cards.
- `select-job`: save a job as the conversation target.
- `generate-resume`: generate a role-targeted variant from the saved profile and target job.
- `prepare-interview`: render the generated variant's project questions, technical topics, and seven-day plan.

Missing prerequisites are handled in chat with a concrete request, never by navigating elsewhere.

## Visual system

- Canvas: `#F6F7F5`; sidebar: `#18201F`; ink: `#171A19`; muted: `#6E7471`.
- Signal: `#B9F36B`, used only for active state and tool completion.
- Display: Inria Serif for the empty-state thesis; Helvetica Neue for the product UI; IBM Plex Mono for tool/status labels.
- Signature: a cropped, desaturated video field appears only behind the empty-state prompt and dissolves once work begins.
- Layout: 280px desktop sidebar, 44px mobile top rail, 820px message column, composer anchored at the bottom.

## Error handling

API failures become assistant messages with a retryable explanation. Invalid saved state falls back to a fresh conversation. File upload errors do not erase earlier messages or context.

## Verification

- Unit tests cover conversation creation, title generation, append/update/delete, persistence recovery, and Agent prerequisite routing.
- A UI contract test proves the legacy workbench is absent.
- Browser verification covers new chat, history switching, refresh persistence, job selection, resume generation, interview preparation, mobile layout, and video fallback.
