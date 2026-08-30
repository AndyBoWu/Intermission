# Repository Instructions

## External marketplace operations

- Treat the live marketplace issue as the source of truth for submission status.
  Keep `docs/MarketplaceChecklist.md` as the tracked repository snapshot.
- Before creating, updating, transferring, or closing a marketplace request,
  read the current upstream submission guide and resolve the exact owner,
  repository, issue form, required headings, and required confirmations.
- The current canonical submission target is
  `omacom/omarchy-plugin-marketplace`. Do not infer the destination from the
  Omarchy product repository; re-verify the target because upstream processes
  can change.
- Show the exact final title and body to the plugin owner and obtain explicit
  approval of every attestation before creating a request.
- After an external write, read the created issue back and confirm the expected
  marketplace labels and validation comments. An issue with no submission
  automation is a failed postcondition that must be investigated immediately.
- Cross-link superseded requests in both directions and preserve the old issue
  as an audit record.

