import React from 'react';

/**
 * CanonicalLink — Shared editorial pattern for tutorial pages that link out
 * to a canonical upstream source. Renders five consistent sections:
 *
 * 1. Start with the canonical tutorial
 * 2. Choose an alternative when
 * 3. What Central adds
 * 4. Prototype boundary
 * 5. Next steps
 *
 * Usage in MDX:
 *
 * ```mdx
 * import CanonicalLink from '@site/src/components/CanonicalLink';
 *
 * <CanonicalLink
 *   canonicalUrl="https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html"
 *   canonicalTitle="Amazon Bedrock AgentCore Memory documentation"
 *   alternativeCondition="you need a non-AWS memory backend or a custom vector store"
 *   centralValue="workload-fit guidance, architecture trade-offs, and production-readiness checklists"
 *   prototypeBoundary="This tutorial creates a working prototype. Before routing real users or data, complete the Production Readiness checklist."
 *   nextSteps={[
 *     { label: 'Production Readiness checklist', url: '/docs/operate/production-readiness' },
 *     { label: 'Multi-tenancy guidance', url: '/docs/agent-platform/multi-tenancy' },
 *   ]}
 * />
 * ```
 *
 * Requirements addressed: Req 5.1, 5.2
 */

export interface NextStep {
  /** Descriptive outcome-based label for the link */
  label: string;
  /** Relative or absolute URL */
  url: string;
}

export interface CanonicalLinkProps {
  /** Absolute URL of the upstream canonical tutorial or guide */
  canonicalUrl: string;
  /** Descriptive title for the canonical source (used as link text) */
  canonicalTitle: string;
  /** Condition under which a reader should choose an alternative source */
  alternativeCondition: string;
  /** What Central uniquely provides beyond the canonical source */
  centralValue: string;
  /** Statement defining what is prototype vs production-ready */
  prototypeBoundary: string;
  /** Array of next-step links to related Central content */
  nextSteps: NextStep[];
}

export default function CanonicalLink({
  canonicalUrl,
  canonicalTitle,
  alternativeCondition,
  centralValue,
  prototypeBoundary,
  nextSteps,
}: CanonicalLinkProps): React.JSX.Element {
  return (
    <section className="canonical-link-pattern" aria-label="Canonical source guidance">
      <div className="canonical-link-section">
        <h3>Start with the canonical tutorial</h3>
        <p>
          Follow the{' '}
          <a href={canonicalUrl} target="_blank" rel="noopener noreferrer">
            {canonicalTitle}
          </a>{' '}
          for the authoritative setup procedure. Return here for Central-specific guidance
          after completing the upstream steps.
        </p>
      </div>

      <div className="canonical-link-section">
        <h3>Choose an alternative when</h3>
        <p>{alternativeCondition}</p>
      </div>

      <div className="canonical-link-section">
        <h3>What Central adds</h3>
        <p>
          Beyond the canonical procedure, this page provides {centralValue}.
        </p>
      </div>

      <div className="canonical-link-section">
        <h3>Prototype boundary</h3>
        <p>{prototypeBoundary}</p>
      </div>

      {nextSteps.length > 0 && (
        <div className="canonical-link-section">
          <h3>Next steps</h3>
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
