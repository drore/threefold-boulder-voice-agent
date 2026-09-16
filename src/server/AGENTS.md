# Server tool boundary

This folder owns the server-side handoff from reasoning to application use cases for voice and future text channels. Follow the [system architecture](../../spec/spec-architecture-system.md), [voice contract](../../spec/spec-design-voice.md), and [Application Core contract](../../spec/spec-architecture-application-core.md).

- Tool names and arguments are model-controlled input. Validate them before invoking a handler; derive conversation scope, channel, time, observation references, configuration, and provider destinations from authenticated server state.
- Stubs return `unavailable` and perform no effects. Replacing one requires its SPEC cases and tests; a service-report proposal may update a draft but cannot directly create a ticket or transfer.
- Keep provider SDK details in adapters and business-hour decisions in core. Test the tool boundary without an OpenAI call using `npm run test -- tests/server/agent-tools.test.ts`.
