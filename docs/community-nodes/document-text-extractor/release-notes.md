# Release Notes

## Runtime limits and awaited worker shutdown

- Numeric limits now enforce the [documented ranges and types](node-operations.md#runtime-enforced-limits) at runtime. Imported workflows and expressions that previously supplied out-of-range, fractional integer, nonnumeric or nonfinite settings now fail with the offending parameter name. Correct those values; the node does not coerce, round or clamp them.
- Unknown PDF mode and page-segmentation identifiers now reject before binary/provider work. Existing identifiers, defaults and successful output shapes are unchanged.
- A failed item's valid successor can still run with Continue On Fail. Worker timeout/failure recovery now awaits actual termination before replacing a worker or advancing the batch. Processing may take longer than its configured timeout while shutdown completes.
- Worker shutdown rejection stops execution even with Continue On Fail, because worker exit cannot be confirmed. Cleanup failures no longer silently disappear or replace the original extraction failure; both are reported, with the original retained as cause.
- Shutdown caused by an idle OCR worker failure is also awaited before retrieving the next document, including text-only PDFs that do not use OCR.
- A required built-worker smoke test verifies the shipped PDF worker using a local deterministic PDF fixture without OCR or network downloads.
