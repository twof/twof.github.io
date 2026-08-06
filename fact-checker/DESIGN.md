# Fact Checker: Grounded Turn Verification with Corrective Context Editing

An experiment in whether correcting an agent's factual errors *in its live
context* — rather than appending corrections after the fact — reduces
downstream error propagation over long sessions. Built as a
[Pi](https://github.com/badlogic/pi-mono) extension.

## Architecture

### 1. Trigger

A Pi extension hooks turn completion. After each assistant turn, the verifier
runs. To control latency, this can be gated to only turns containing checkable
factual or technical claims.

### 2. Verify with tools, not judgment

A second model audits the last request/response pair, but grounded: re-run the
code, read the actual file, check the docs. If a claim can't be externally
verified, abstain — no edit. A wrong "correction" is worse than the original
error, so abstention is the default.

### 3. Edit at the tail only

On a confirmed error, branch the session tree from the node before the bad
turn and continue from there, injecting the corrected content as a
`custom_message` entry (Pi's extension-injected type that participates in LLM
context). Tail-only editing avoids the orphaned-reference problem WebClipper
hit, since nothing downstream exists yet to desynchronize.

### 4. Provenance for free

Pi's tree-structured JSONL sessions keep the tainted branch on disk while the
live context follows the corrected branch. Clean inference context, faithful
audit log; `/tree` lets you inspect both.

## Why Pi specifically

- Native branching — rollback-and-replace is a first-class operation, not a hack
- Context-participating injected messages (`custom_message`)
- Minimal system prompt
- Plain JSONL you can rewrite in the worst case
- Hooks at the right lifecycle points

## Open design risks

The steelman still applies:

- Rewritten turns are off-distribution — the "assistant" said something it
  never said.
- Verifier errors get laundered into authoritative context.
- Visible failures carry information that sanitized history loses.
- Regeneration-with-critique may beat rewriting outright.

## Run it as an experiment, not a feature

The literature has pruning (SWPruner, AgentDiet) and verified compaction
(Slipstream), but nobody has tested corrective replacement in live context.

Implement three modes behind the same verifier:

1. **Append** — append the critique after the bad turn.
2. **Regenerate** — roll back and regenerate the turn with the critique
   injected.
3. **Rewrite** — roll back and rewrite the turn directly.

Measure downstream error propagation over long sessions. Pi's branching makes
running all three from identical starting states easy.

**Decision rule:** if the rewrite mode doesn't clearly beat regeneration, ship
regeneration — it gets the error out of context while keeping the replacement
authentic model output.
