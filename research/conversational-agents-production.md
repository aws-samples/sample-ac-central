# Conversational Agents — Production Challenges & Considerations

Research findings for the new `workloads/conversational/challenges.mdx` page. Sourced from AWS Well-Architected Agentic AI Lens, Generative AI Lens, AWS Prescriptive Guidance, OWASP GenAI, NIST AI 600-1, and AWS security blogs.

---

## 1. Context Window Overflow

**What it is:** When accumulated conversation history, RAG content, system prompts, and memory injections exceed the model's context window, critical instructions (including safety rules) get truncated or overshadowed.

**Why it matters for conversational agents:** Long-lived multi-turn sessions accumulate context. Naive "append everything" approaches to history management silently drop system prompts when the window fills.

**Failure modes:**
- Safety instructions disappear from effective context → de facto jailbreak without adversarial action
- Response quality degrades as relevant context is pushed out
- Cost scales linearly with prompt length (token-based pricing)
- Latency increases with longer prompts

**Must-dos:**
- Implement explicit context window budgets per component (system prompt, history, RAG, memory)
- Summarize long histories rather than appending full transcripts
- Always ensure system/safety prompts remain at fixed positions that won't be truncated
- Monitor prompt token counts and alert on drift

**Sources:**
- [AWS Security Blog: Context Window Overflow — Breaking the Barrier](https://aws.amazon.com/blogs/security/context-window-overflow-breaking-the-barrier/)
- [AWS Well-Architected Generative AI Lens — Cost Optimization](https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/cost-optimization.html)

---

## 2. PII Leakage in Memory

**What it is:** Personally identifiable information captured in short-term or long-term memory that gets exposed to unauthorized contexts — other users, other tenants, logs, or the model itself.

**Failure modes:**
- User A's PII stored in memory retrieved during User B's session (namespace collision)
- Sensitive data in memory indexed by RAG and surfaced in unrelated queries
- PII in logs and observability traces accessible to operators without need-to-know
- Memory containing credentials, tokens, or session identifiers

**Must-dos:**
- Memory MUST be namespaced by both user AND tenant (never use "default-user" or shared namespaces in production)
- Apply PII detection/redaction on inputs before storage (Amazon Bedrock Guardrails, application-level)
- Define retention policies — auto-expire memory that doesn't need indefinite persistence
- Classify memory content by sensitivity and apply access controls accordingly
- Never store credentials or tokens in agent memory

**Sources:**
- [AWS Prescriptive Guidance: Security Considerations for Data in Generative AI](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-data-considerations-gen-ai/security.html)
- [AWS Prescriptive Guidance: Memory-Augmented Agents](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/memory-augmented-agents.html)
- [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) — privacy risks in AI systems

---

## 3. Session Hijacking & Cross-Session Contamination

**What it is:** Unauthorized access to another user's session state, or inadvertent leakage of one session's context into another.

**Failure modes:**
- Session IDs guessable or enumerable → attacker attaches to existing session
- Tokens embedded in prompts or stored in memory → replay attacks
- Shared memory stores without tenant-aware filtering → cross-tenant leakage
- Caching mechanisms reusing responses across users without authorization checks

**Must-dos:**
- Session identifiers must be cryptographically random and unpredictable
- Tokens and credentials never appear in prompts, memory, or logs
- Memory retrieval MUST include tenant + user filters at query time, not just storage time
- Session lifetime limits (AgentCore Runtime supports up to 8h — but consider shorter for security)
- Implement session binding to authenticated identity (no anonymous sessions accessing tools)

**Sources:**
- [AWS SaaS Tenant Isolation Strategies](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/full-stack-isolation.html)
- [AWS Well-Architected Agentic AI Lens](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentic-ai-lens.html) — security pillar

---

## 4. Prompt Injection on Tool-Calling Agents

**What it is:** Adversarial inputs that cause the agent to ignore its instructions, call unauthorized tools, or exfiltrate data — especially dangerous when the agent has real tool-calling capability.

**Failure modes:**
- Direct injection: user crafts input that overrides system prompt → agent calls high-privilege tool
- Indirect injection: RAG retrieves document containing embedded instructions → agent follows them
- Role confusion: user persuades agent it's in "admin mode" → agent attempts actions beyond scope
- Cross-layer attacks: prompt injection combined with XSS or other web vulnerabilities

**Must-dos:**
- Deploy Amazon Bedrock Guardrails with prompt attack filters enabled
- Implement multi-layered input sanitization (application code + WAF + guardrails)
- Tool selection MUST be constrained by Cedar policies — agent cannot invoke tools solely based on model output
- High-risk tools require human approval regardless of model confidence
- Test continuously with adversarial prompt suites (role confusion, context manipulation, obfuscation)
- Monitor guardrail metrics for trends (spikes in blocking = attack pattern emerging)

**Sources:**
- [AWS Prescriptive Guidance: Input Validation Best Practices for Agentic AI](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/best-practices-input-validation.html)
- [AWS Security Blog: Safeguard Generative AI Workloads from Prompt Injections](https://aws.amazon.com/blogs/security/safeguard-your-generative-ai-workloads-from-prompt-injections/)
- [OWASP GenAI Security Project](https://genai.owasp.org/)
- [NIST AI 600-1 — Prompt Injection](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)

---

## 5. Identity Misconfiguration

**What it is:** The agent operating with broader permissions than the user it represents, or failing to propagate the user's identity to downstream tools.

**Failure modes:**
- Agent's IAM role has broader access than the user's entitlements → privilege escalation via agent
- Tools trust the agent's identity without checking the originating user → shared-role bypass
- Default-user fallback in memory/tool calls → all users share one identity context
- System prompt incorrectly claims admin authority → agent behaves accordingly

**Must-dos:**
- Agent IAM role must follow least privilege — only the permissions needed for its specific task
- Tools MUST enforce user-level authorization (check the user's token/claims, not just trust the agent)
- Identity propagation: pass user's JWT/OAuth context through to Gateway → Cedar evaluates per-user
- Never use fallback/default identities in production — require verified identity before accessing durable state
- Align system prompt claims with actual permissions (don't tell the model it's an admin if it's not)

**Sources:**
- [AWS IAM Identity-Based Policy Examples for Bedrock Agents](https://docs.aws.amazon.com/bedrock/latest/userguide/security_iam_id-based-policy-examples-agent.html)
- [AgentCore Policy Authorization Flow](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-authorization-flow.html) — shows principal = OAuthUser from JWT sub
- [AWS Well-Architected Agentic AI Lens — Security](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentic-ai-lens.html)

---

## 6. Cost Blowup from Long-Lived Sessions

**What it is:** Conversational agents with long sessions, verbose prompts, or uncontrolled RAG retrieval can generate unexpected cost spikes.

**Cost drivers:**
- Token usage scales with prompt + response length × number of turns
- Long-lived sessions (up to 8h) with continuous inference = sustained model cost
- Repeated RAG retrieval injecting large documents into every turn
- Retries and fallback chains multiplying inference calls
- Memory storage and extraction at scale

**Must-dos:**
- Set session length limits appropriate to the use case (not always 8h)
- Enforce maximum prompt size budgets
- Use model tiering: route simple queries to smaller/cheaper models, escalate only when needed
- Implement concise summarization of history rather than full replay
- Apply cost tagging (per-tenant, per-application) for attribution and budget alerts
- Monitor token consumption trends and set CloudWatch alarms on spend thresholds

**Sources:**
- [AWS Prescriptive Guidance: Cost Optimization for Serverless AI](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/cost-optimization.html)
- [AWS Well-Architected Generative AI Lens — Cost Optimization](https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/cost-optimization.html)

---

## 7. Evaluation & Quality Monitoring

**What it is:** Conversational agents require both pre-deployment evaluation (catch problems before users see them) and continuous post-deployment monitoring (catch regressions and emerging issues).

**Pre-deployment must-dos:**
- Automated adversarial testing with prompt injection, role confusion, context manipulation
- Functional testing across representative multi-turn scenarios
- Red teaming by humans with domain expertise
- Benchmark against labeled datasets for accuracy, helpfulness, safety
- LLM-as-judge evaluation for response quality

**Post-deployment must-dos:**
- Log all prompts, tool calls, and responses (with PII controls)
- Monitor guardrail metrics (blocking/masking rates) for trend detection
- Track GoalSuccessRate, Helpfulness, Correctness metrics
- Collect user feedback (thumbs up/down, explicit corrections)
- Detect quality drift over time (model updates, knowledge base changes)
- Alert on anomalies: unusual tool invocation patterns, spike in errors, new attack patterns

**Sources:**
- [AWS Blog: Custom Observability for Generative AI](https://aws.amazon.com/blogs/machine-learning/empower-your-generative-ai-application-with-a-comprehensive-custom-observability-solution/)
- [AWS Prescriptive Guidance: Input Validation](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/best-practices-input-validation.html) — testing suites
- [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) — continuous evaluation
- [Confident AI: LLM Agent Evaluation Guide](https://www.confident-ai.com/blog/llm-agent-evaluation-complete-guide)

---

## 8. Multi-Tenant Isolation

**What it is:** When the same agent infrastructure serves multiple tenants (customers, business units), every layer must enforce isolation.

**Failure modes:**
- Shared vector indexes without tenant filtering → cross-tenant data retrieval
- Memory keyed by user ID without tenant ID → collision across tenants
- Shared model caches returning responses generated for other tenants
- Logs and traces aggregated without tenant partitioning → data exposure

**Must-dos:**
- Embed tenant identifiers in ALL data schemas (memory, RAG indexes, logs)
- Enforce tenant-aware filters at query time in every retrieval path
- Consider per-tenant indexes for highly sensitive data
- Use IAM/resource policies to prevent cross-tenant access even if application logic fails
- Apply full-stack isolation (separate AWS accounts) for highest-sensitivity tenants
- Cost attribution per tenant via tagging

**Sources:**
- [AWS SaaS Tenant Isolation Strategies](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/full-stack-isolation.html)
- [AWS re:Invent: SaaS Generative AI Multi-Tenant Strategies](https://aws.amazon.com/video/watch/e4abbc474a6/)
