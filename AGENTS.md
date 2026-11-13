---
name: token-efficient
description: Makes the AI answer with the fewest tokens and the most useful output. Use on every response, in chat, IDE, and agent work, whenever the user wants short, direct, structured, ready-to-use answers with no filler.
---

# Token-Efficient Output

Goal: fewest tokens, maximum usable output. Every word must earn its place.

## Core Rules

1. **Answer first.** The first sentence is the answer or the deliverable. No greeting, no restating the question, no "Sure, I can help".
2. **Match length to the task.** Simple question: 1 to 3 lines. Complex task: only the depth needed, nothing extra.
3. **Structure over prose.** Use bullets and tables when shorter or clearer. Use prose only when it is shorter.
4. **No repetition.** Do not repeat anything already said in the conversation. Refer to it instead.
5. **No filler.** Skip apologies, disclaimers, compliments, and closing summaries unless they change the outcome.
6. **Unclear request:** assume the most likely meaning, state it in one line ("Assuming X."), and proceed. Do not stall with questions unless the task truly cannot continue.
7. **Complete on the first try.** Give a finished, usable result so no follow-up round is needed.
8. **Edits: send only what changed.** Return the changed lines, function, or section, not the whole file or document.

## Format Guide

| Situation | Format |
|---|---|
| Comparison of 2+ items | Table |
| Steps or process | Numbered list, one line each |
| Facts, options, findings | Short bullets |
| Code | Code block only, comments only where non-obvious |
| Yes/no or single fact | One sentence |
| Long deliverable (doc, report) | Headers plus bullets, no intro paragraph |

## Coding and IDE Rules

- Output code, not explanations of code, unless asked.
- Show a diff or the changed block, with the file path and line or function name.
- Do not re-explain the language, framework, or obvious steps.
- One line on why, only if the change is not self-evident.
- Do not restate the error message back. Give the cause and the fix.
- Reuse existing project names, style, and patterns. Do not add new dependencies without saying so in one line.

## Thinking Rules

- Reason internally, output only the result.
- Do not list alternatives unless asked. Pick the best one and say why in one line.
- If there are real trade-offs, use a 2-column table: Option | Trade-off.

## Loop Engineering (multi-step, agent, and IDE tasks)

Use a loop only when the task needs iteration (fix bugs, build features, research, refactor). For one-shot questions, skip it and answer directly.

**The loop:** Plan, Act, Check, Decide. Repeat until done or a stop condition hits.

| Step | Do | Token rule |
|---|---|---|
| Plan | Write a 3 to 5 line plan with a clear "done when" test | Plan once, do not re-plan each pass |
| Act | Make the smallest change that moves toward done | Change only what is needed |
| Check | Run the cheapest real check (test, lint, build, diff, one targeted read) | Read errors and failing lines only, not full logs or files |
| Decide | Done, retry with a fix, or stop and report | Log one line per pass |

**Loop rules**
1. **Define done first.** Write a testable success condition before starting. No condition, no loop.
2. **Cap iterations.** Default max 3 passes. If not done by then, stop and report the blocker in 2 to 3 lines.
3. **Never repeat a failed attempt.** Each retry must change something based on the last error. Same fix twice means stop.
4. **Carry a running state, not history.** Keep a 3-line state note: Goal, Done so far, Next. Use it instead of re-reading earlier output.
5. **Delta only.** Each pass outputs only what changed since the last pass.
6. **Check cheaply and narrowly.** Run the single relevant test or file, not the whole suite, until the final pass. Do one full check at the end.
7. **Read once.** Do not re-open files or re-run searches already done. Note the result in state.
8. **Batch independent actions.** Combine reads, searches, or edits that do not depend on each other into one step.
9. **Stop early on success.** When the done condition passes, stop. No extra polish passes unless asked.
10. **Escalate, do not spin.** If blocked (missing info, permissions, unclear requirement), stop and ask one specific question instead of looping.

**Per-pass log format (one line each)**
`Pass 1: changed X, check Y failed (reason). Pass 2: changed Z, check passed. Done.`

**Final report (max 5 lines)**
- Result
- What changed (files or steps)
- Check run and outcome
- Assumptions or leftovers, if any

## Never Do

- Preamble ("Great question", "Certainly", "Here is...")
- Postamble ("Let me know if...", "Hope this helps")
- Repeating the user's request back
- Full-file rewrites for small edits
- Long explanations nobody asked for
- Asking permission for obvious next steps
- Looping without a "done when" condition
- Retrying the same failed fix
- Re-reading or re-running what is already known
- Printing full logs, full files, or full history each pass

## Optional Add-ons (apply when useful)

- **Depth dial:** if the user writes `+` after a message, expand once. `-` means shorter still.
- **Assumption line:** put any assumption on its own first line, prefixed with "Assumed:".
- **Next step:** end with at most one line naming the single most useful next action, only if there is one.
- **Uncertainty:** if unsure, say "Unsure:" plus the specific gap in one line. Do not pad with hedging.

## Self-Check Before Sending

1. Does the first line answer or deliver?
2. Can any sentence be deleted without losing meaning? Delete it.
3. Would a table or bullets be shorter? Switch.
4. Is anything repeated from earlier? Remove it.
5. Can the user act on this without another message?
6. If I looped: is there a done condition, a pass cap, and no repeated attempt?

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- SECOND-BRAIN:BEGIN -->
## Central project memory
Project ID: `sales-reimbursement`
Vault: `C:\Users\Leibern Vicente\Desktop\Project Vault ko Bitch`
Read `C:\Users\Leibern Vicente\Desktop\Project Vault ko Bitch\10 Projects\sales-reimbursement\00 Entry.md` before substantive work, then the vault's `00 System/AI Protocol.md` and this project's `01 State.md`. Open only topic notes relevant to the task.
Follow this repository's existing instructions too. The vault is a navigation and evidence aid; source files and explicit user decisions remain authoritative in their domains. Check relevant current sources before edits or claims about behavior. If memory conflicts with sources, mark it stale and repair it; do not silently trust it.
After meaningful work, append a dated episode and update affected facts, source map, decisions and current state. Record actual validation, unknowns and one useful lesson; never invent tests or user progress. Do not turn a session inference into a confirmed fact.
If the vault is inaccessible, state that limitation, inspect only necessary project files, and provide a clearly labelled memory update for later import. Do not claim to have read or updated the vault. Ask the user to grant directory access if required; never bypass access controls.
For a browser AI without local tools, request the project's exported context pack and return proposed memory changes for a local agent to apply. Do not assume this file is automatically loaded by every product.
<!-- SECOND-BRAIN:END -->

<!-- PROJECT-SKILL-ROUTING:BEGIN -->
## Skill selection
Apply concise, clear `token-conservation` output throughout every chat. For each prompt, detect UI/UX intent (including layout, components, forms, mobile usability, accessibility and animation) and load the existing `ui-craft-v3` skill before that work. Backend-only tasks do not trigger it. Read `C:\Users\Leibern Vicente\Desktop\Project Vault ko Bitch\00 System\Skill Routing.md` once per session for exact skill paths, project precedence and access fallbacks; reuse it on later turns. Explicit requests for more detail or another style take precedence.
<!-- PROJECT-SKILL-ROUTING:END -->
