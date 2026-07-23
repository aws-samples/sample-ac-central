import React from 'react';

/**
 * CanonicalRecommendation — Shared six-section page template for workload route
 * pages. Renders a consistent structure across all workload quickstarts
 * (conversational, workflow, coding) to function as workload-selection and
 * safety routing layers.
 *
 * The six sections are:
 * 1. Choose this workload when
 * 2. Start with the canonical tutorial
 * 3. Why it fits
 * 4. Choose an alternative when
 * 5. Safety and production boundary
 * 6. Central next steps
 *
 * Usage in MDX:
 *
 * ```mdx
 * import CanonicalRecommendation from '@site/src/components/CanonicalRecommendation';
 *
 * <CanonicalRecommendation
 *   defaultSource={{
 *     url: "/docs/use-cases/conversational",
 *     title: "Conversational Agent Catalog",
 *     description: "Browse maintained conversational agent samples with identity, memory, and streaming built in."
 *   }}
 *   selectionCriteria={[
 *     "Your agent needs to hold multi-turn conversations with users",
 *     "You require identity-scoped memory and session continuity",
 *     "You want streaming responses with tool-calling capabilities"
 *   ]}
 *   fitRationale="This workload matches when your agent's primary interaction model is conversational and you need managed identity, session state, and streaming."
 *   alternatives={[
 *     { condition: "You need an auth-scoped helpdesk", destination: "/docs/use-cases/customer-support", label: "Customer Support sample" },
 *     { condition: "You need operations collaboration", destination: "/docs/use-cases/sre-incident-response", label: "SRE/A2A Incident Response sample" }
 *   ]}
 *   actionRisk={{
 *     summary: "Read-only by default",
 *     details: "The default sample reads data only. Tool-calling alternatives may invoke external APIs or mutate state — review their individual Action_Risk disclosures."
 *   }}
 *   productionReadinessLink="/docs/operate/production-readiness"
 *   nextSteps={[
 *     { label: "Production Readiness checklist", url: "/docs/operate/production-readiness" },
 *     { label: "Multi-tenancy guidance", url: "/docs/agent-platform/multi-tenancy" }
 *   ]}
 * />
 * ```
 *
 * Requirements addressed: Req 4.1
 */

export interface DefaultSource {
  /** URL to the canonical tutorial or catalog page */
  url: string;
  /** Display title for the canonical source */
  title: string;
  /** Brief description of what the canonical source provides */
  description: string;
}

export interface Alternative {
  /** Condition under which a reader should choose this alternative */
  condition: string;
  /** URL to the alternative resource */
  destination: string;
  /** Display label for the alternative */
  label: string;
}

export interface ActionRisk {
  /** One-line summary of the risk profile (e.g., "Read-only by default") */
  summary: string;
  /** Detailed explanation of what actions are performed and any guards */
  details: string;
}

export interface NextStep {
  /** Descriptive outcome-based label for the link */
  label: string;
  /** Relative or absolute URL */
  url: string;
}

export interface CanonicalRecommendationProps {
  /** The primary canonical source to recommend */
  defaultSource: DefaultSource;
  /** Criteria that help the reader decide if this workload fits their use case */
  selectionCriteria: string[];
  /** Rationale explaining why this workload and canonical source fit together */
  fitRationale: string;
  /** Conditional alternatives when the default source is not the best fit */
  alternatives: Alternative[];
  /** Action risk profile disclosure */
  actionRisk: ActionRisk;
  /** Link to the production readiness page */
  productionReadinessLink: string;
  /** Array of next-step links to deeper Central content */
  nextSteps: NextStep[];
}

export default function CanonicalRecommendation({
  defaultSource,
  selectionCriteria,
  fitRationale,
  alternatives,
  actionRisk,
  productionReadinessLink,
  nextSteps,
}: CanonicalRecommendationProps): React.JSX.Element {
  /** Converts backtick-wrapped segments in a string to <code> elements */
  function renderInlineCode(text: string): React.ReactNode {
    const parts = text.split(/`([^`]+)`/);
    return parts.map((part, i) =>
      i % 2 === 1 ? <code key={i}>{part}</code> : part
    );
  }

  return (
    <section className="canonical-recommendation" aria-label="Workload routing guidance">
      {/* Section 1: Choose this workload when */}
      <div className="canonical-recommendation-section">
        <h3>Choose this workload when</h3>
        <ul>
          {selectionCriteria.map((criterion, index) => (
            <li key={index}>{criterion}</li>
          ))}
        </ul>
      </div>

      {/* Section 2: Start with the canonical tutorial */}
      <div className="canonical-recommendation-section">
        <h3>Start with the canonical tutorial</h3>
        <p>
          <a href={defaultSource.url}>
            <strong>{defaultSource.title}</strong>
          </a>
        </p>
        <p>{defaultSource.description}</p>
      </div>

      {/* Section 3: Why it fits */}
      <div className="canonical-recommendation-section">
        <h3>Why it fits</h3>
        <p>{fitRationale}</p>
      </div>

      {/* Section 4: Choose an alternative when */}
      {alternatives.length > 0 && (
        <div className="canonical-recommendation-section">
          <h3>Choose an alternative when</h3>
          <ul>
            {alternatives.map((alt) => (
              <li key={alt.destination}>
                <strong>{alt.condition}</strong> —{' '}
                <a href={alt.destination}>{alt.label}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section 5: Safety and production boundary */}
      <div className="canonical-recommendation-section">
        <h3>Safety and production boundary</h3>
        <p>
          <strong>Action risk:</strong> {actionRisk.summary}
        </p>
        <p>{renderInlineCode(actionRisk.details)}</p>
        <p>
          This sample creates a working prototype.{' '}
          <strong>It is not production-ready.</strong> Before routing real users or
          production data, complete the{' '}
          <a href={productionReadinessLink}>Production Readiness checklist</a>.
        </p>
      </div>

      {/* Section 6: Central next steps */}
      {nextSteps.length > 0 && (
        <div className="canonical-recommendation-section">
          <h3>Central next steps</h3>
          <ul>
            {nextSteps.map((step) => (
              <li key={step.url}>
                <a href={step.url}>{step.label}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
