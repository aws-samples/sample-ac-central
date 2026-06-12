import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import CosmicBackground from '../components/CosmicBackground';

function HeroSection() {
  return (
    <section className="landing-hero">
      <CosmicBackground />
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

        <Link to="/docs/workloads/workflow" className="landing-tile">
          <span className="landing-tile__icon">⚡</span>
          <h3 className="landing-tile__title">Workflow Agents</h3>
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
        <Link to="/docs/agent-platform/overview" className="landing-tile landing-tile--wide">
          <span className="landing-tile__icon">🔀</span>
          <h3 className="landing-tile__title">Build Your Agent Platform</h3>
          <p className="landing-tile__desc">
            AI agents are in production — handling support, automating workflows, generating code, and orchestrating complex processes. Scale your deployments with Agent Platform built with AgentCore.
          </p>
          <span className="landing-tile__arrow">→</span>
        </Link>
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
      </main>
    </Layout>
  );
}
