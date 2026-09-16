# Application Core instructions

This folder contains provider-neutral domain rules, use cases, and port contracts. Follow the root instructions and [Application Core specification](../../spec/spec-architecture-application-core.md).

- Keep deterministic domain rules free of I/O and provider SDK types.
- The hours policy accepts a schedule validated by the future configuration adapter; it must not parse raw DB rows or resolve departments.
- Add a port only for a meaningful external boundary or nondeterminism.
- Develop behavior through SPEC-linked failing tests and independently expected outcomes.
- Keep control flow and failure codes explicit; do not add a generic command bus, DI framework, or provider-aware branching.
