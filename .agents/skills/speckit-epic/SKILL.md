---
name: speckit-epic
description: Create or update a minimal epic that groups feature specifications.
---

# Epic

Use `$ARGUMENTS` to create or update one epic.

For a new epic, run:

```bash
.specify/scripts/bash/create-new-epic.sh --json --short-name "<slug>" "$ARGUMENTS"
```

Fill only the template's outcome and completion condition. Keep `status: Pending`. Do not add
metadata or planning sections. Epics do not create branches.

For an update, change only the requested prose. Never edit the generated Features block.

Finish by running `.specify/scripts/bash/sync-docs.sh`.
