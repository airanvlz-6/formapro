<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# FORGE architecture invariants

- Carrera and CrossFit/Box are initial validation domains, not a closed list of specialties. Shared authorities must consume requirements, capabilities and evidence; keep sport-specific rules in domain adapters/catalogs. Adding a specialty must not require rebuilding shared decision engines.
- Web and React Native/Expo are clients of the same backend/shared contracts. Do not duplicate planning authority in client components. Keep authority independent of React, Next components, DOM, browser APIs, local UI state and rendered strings. Client-facing decisions and question requirements must be serializable and preserve provenance.
- Keep legitimate domain knowledge (such as reference compatibility) explicit; do not erase it through artificial generalization. See `docs/sufficiency-pre-gate.md` for the 3C.1 boundary and tests.
