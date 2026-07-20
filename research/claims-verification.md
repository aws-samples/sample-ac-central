# Claims Verification — AgentCore Central Site Content

Claims from current site content checked against official AWS documentation.

---

## Verified (correct as written)

| Claim | Page(s) | Source |
|-------|---------|--------|
| Cedar policies gate tool invocations at Gateway level | bounded-autonomy.mdx, agentcore-json.mdx | [Policy authorization flow](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-authorization-flow.html) |
| LOG_ONLY and ENFORCE modes for policy engine | bounded-autonomy.mdx | [Policy getting started](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-getting-started.html) |
| Tool naming convention: TargetName___tool_name | agentcore-json.mdx, bounded-autonomy.mdx | [Policy authorization flow](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-authorization-flow.html) |
| Gateway supports MCP protocol for tool federation | index.mdx, workload overviews | [What is AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html) |
| Identity supports Cognito, Okta, Entra ID, Auth0 | conversational/enterprise-features.mdx | [Identity IdP docs](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity-idp-okta.html) + [Microsoft](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity-idp-microsoft.html) |
| Runtime is serverless with microVM isolation | get-started/quickstart.mdx, workload overviews | [What is AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html) — "true session isolation" |
| Memory supports semantic, summarization, episodic, user_preference strategies | agentcore-json.mdx | agentcore.json schema + [Memory docs](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html) |
| Observability uses OTEL-compatible format → CloudWatch | index.mdx, agent-platform/observability-evals.mdx | [Observability](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability.html) |
| Runtime supports HTTP, MCP, A2A, AGUI protocols | agentcore-json.mdx | agentcore.json schema + Runtime docs |
| Framework-agnostic: supports Strands, LangGraph, CrewAI, LlamaIndex, Google ADK, OpenAI Agents SDK | index.mdx, patterns/overview.mdx | [What is AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html) |
| Harness provides managed agent loop with single API call + microVM | get-started/firstagent.mdx | [What is AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html) |
| Code Interpreter supports Python, JavaScript, TypeScript | workloads/coding/overview.mdx | [What is AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html) |
| Browser tool uses Playwright/BrowserUse in managed environment | workloads/coding/overview.mdx | [What is AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html) |
| Cedar policy context can access tool input arguments via `context.input.*` | bounded-autonomy.mdx | [Policy common patterns](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-common-patterns.html) |
| Agent acts on behalf of OAuth user (principal = OAuthUser from JWT sub) | conversational/overview.mdx | [Policy authorization flow](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-authorization-flow.html) |

---

## Contradicted or unverifiable

| Claim | Page(s) | Issue | Recommendation |
|-------|---------|-------|----------------|
| "A/B testing via Gateway traffic splitting" | multi-tenancy.mdx | NOT found in official Gateway docs. agent-ops.mdx correctly says Gateway does NOT natively provide weighted traffic splitting. The `abTests` field in agentcore.json uses config bundles, not Gateway-level traffic weighting. | Remove claim from multi-tenancy.mdx. Replace with: "A/B testing uses config bundles that route different configurations to different sessions, not Gateway-level traffic splitting." |
| "Zero to production in 5 minutes" | get-started/overview.mdx | A 5-minute tutorial creates a prototype with no identity, no policy, no evaluation, no guardrails. It is not production-ready. | Change to "Zero to a working prototype in 5 minutes" |
| "deploy to a production endpoint" | get-started/firstagent.mdx | Harness quickstart says "deploy to a production endpoint" — this conflates having a live URL with being production-ready (no guardrails, no evaluation). | Change to "deploy to a live endpoint" and add callout: "This creates a prototype. See production readiness checklist before serving real traffic." |
| Runtime lifecycle "up to 8 hours" for conversational, "up to 15 minutes" for workflow | workloads/overview.mdx | The 8-hour session affinity figure is stated in the site but needs verification against official docs. The 15-minute limit for workflow is not confirmed in official docs (Lambda has 15min limit but AgentCore Runtime is not Lambda). | Verify against official Runtime session limits documentation. If unverifiable, qualify with "architecture guidance" rather than hard product limits. |
| `restart_service` as default quickstart tool | workflow/quickstart.mdx | Not technically a false claim, but an unsafe default. No production agent should perform destructive actions without policy gating. AWS Prescriptive Guidance explicitly recommends non-destructive defaults. | Replace with `gather_diagnostics` or `create_ticket` as the default action. Move `restart_service` to a "controlled remediation" advanced section. |
| "--api-key sk-..." in CLI example | tutorials/connect-gateway-tool.mdx | Exposes credential in shell history. AWS security guidance says credentials should never appear in CLI commands or logs. | Replace with secure credential provisioning (e.g., `agentcore add credential` or Secrets Manager reference). |
| "Scale-to-zero: no idle cost" | get-started/quickstart.mdx | Runtime scales to zero compute, but memory storage, model access, and other services still incur cost. "No idle cost" is misleading. | Change to "Scale-to-zero compute: no charge when there are no active sessions. Memory storage and model access are billed separately." |
| Gateway supports `openApiSchema` and `smithyModel` target types | agentcore-json.mdx | Listed in the local schema but not individually confirmed in official docs pages reviewed. Likely correct but unverifiable from docs search alone. | Mark as "documented in CLI schema" and link to official Gateway target docs. |

---

## Partially verified (directionally correct, needs nuance)

| Claim | Page(s) | Status | Recommendation |
|-------|---------|--------|----------------|
| Confidence-gated and Dual-Agent (Decide+Act) patterns | workflow/patterns-and-architecture.mdx | These are site-defined reference patterns, not official AWS product features. They are valid architecture guidance. | Label clearly as "architecture patterns recommended by this guide" not as AWS product capabilities. |
| Pattern tier labels ("Tier 1 — Officially Documented") | patterns/overview.mdx | Single Agent+Tools, Agents-as-Tools, Graph, Swarm, Workflow are documented in Strands SDK docs. A2A is in Strands docs. But "Officially Documented AgentCore Patterns" implies AWS docs, not just Strands. | Relabel: "Tier 1 — Documented in Strands SDK and AgentCore samples" to be precise about where the documentation lives. |
| Customer claims (Kavak, Amazon Catalog) | customer/external/ | Multiple TODO markers, no source links for Kavak, Cox Automotive, Blue Origin. | Hide until verified per content-analysis.md Task 3. |
| "agentcore deploy creates Gateway + Lambda + Runtime" | tutorials/connect-gateway-tool.mdx | Deploy creates Runtime. Gateway is created if defined in agentcore.json. Lambda is NOT created by deploy — user must provide an existing Lambda ARN as a Gateway target. | Correct the claim: "deploy creates the AgentCore resources defined in agentcore.json (Runtime, Gateway, Memory, etc). Lambda functions used as Gateway targets must be created separately." |
