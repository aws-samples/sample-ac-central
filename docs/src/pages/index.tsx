import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import ThemedImage from '@theme/ThemedImage';

function HeroSection() {
  return (
    <section className="landing-hero">
      <div className="landing-hero__content">
        <h1 className="landing-hero__title">
          <span>AgentCore</span> Central
        </h1>
        <p className="landing-hero__subtitle">
          Your hub for building production-grade agents on{' '}
          <strong>Amazon Bedrock AgentCore</strong>
        </p>
      </div>
    </section>
  );
}

function TilesSection() {
  return (
    <section className="landing-stack">
      <h2 className="landing-tiles__heading">AgentCore, Your Way</h2>
      <p className="landing-tiles__subheading">
        From first API call to production: choose your agent workload type, integrate your tooling, and scale with confidence.
      </p>

      <div className="landing-tiles__grid">
        <Link to="/docs/workloads/conversational" className="landing-tile">
          <span className="landing-tile__icon">💬</span>
          <h3 className="landing-tile__title">Conversational Agents</h3>
          <p className="landing-tile__desc">
            Customer-facing chat agents with memory, identity, and guardrails. Move from prototype to production with enterprise security built in.
          </p>
          <span className="landing-tile__arrow">→</span>
        </Link>

        <Link to="/docs/workloads/automation" className="landing-tile">
          <span className="landing-tile__icon">⚡</span>
          <h3 className="landing-tile__title">Automation Agents</h3>
          <p className="landing-tile__desc">
            Async agents triggered by tickets, emails, webhooks, and system events. Automate workflows with confidence scoring and HITL escalation.
          </p>
          <span className="landing-tile__arrow">→</span>
        </Link>

        <Link to="/docs/workloads/coding" className="landing-tile">
          <span className="landing-tile__icon">💻</span>
          <h3 className="landing-tile__title">Coding Agents</h3>
          <p className="landing-tile__desc">
            IDE and CI-driven agents for code generation, refactor, and review. Long-running tasks in a sandboxed Code Interpreter runtime.
          </p>
          <span className="landing-tile__arrow">→</span>
        </Link>
      </div>

      <div className="landing-tiles__wide">
        <Link to="/docs/patterns/overview" className="landing-tile landing-tile--wide">
          <span className="landing-tile__icon">🔀</span>
          <h3 className="landing-tile__title">AgentCore Platform &amp; Architecture Patterns</h3>
          <p className="landing-tile__desc">
            Multi-agent patterns — single agent, agents-as-tools, graph, swarm, workflow, A2A, HITL, and more. With selection guide and execution-path comparison.
          </p>
          <span className="landing-tile__arrow">→</span>
        </Link>
      </div>
    </section>
  );
}

function StackSection() {
  return (
    <section className="landing-stack">
      <h2 className="landing-stack__heading">The AgentCore Stack</h2>
      <div className="landing-stack__image">
        <ThemedImage
          alt="AgentCore Platform"
          sources={{
            light: useBaseUrl('/img/agentcore-platform.svg'),
            dark: useBaseUrl('/img/agentcore-platform-dark.svg'),
          }}
        />
      </div>
    </section>
  );
}

export default function Home(): React.JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="Home"
      description={siteConfig.tagline}>
      <main className="landing-page">
        <HeroSection />
        <TilesSection />
        <StackSection />
      </main>
    </Layout>
  );
}
