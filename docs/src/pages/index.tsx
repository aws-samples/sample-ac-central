import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import CosmicBackground from '../components/CosmicBackground';

// Top row: three capability groups.
const STACK_GROUPS = [
  {
    title: 'Agent Harness',
    items: ['Managed harness', 'Strands Agents SDK', 'Any framework, model, or harness'],
  },
  {
    title: 'Context and Tools',
    items: ['Memory', 'Managed Knowledge Base', 'Web Search', 'Browser', 'Code interpreter', 'Payments'],
  },
  {
    title: 'Optimization',
    items: ['Evaluation', 'Insights', 'Recommendations, A/B testing'],
  },
];

// Environment band.
const STACK_ENVIRONMENT = ['Runtime'];

// Security and governance band.
const STACK_SECURITY = ['Identity', 'Policy', 'Guardrails', 'Observability', 'AWS Agent Registry', 'Gateway'];

const CUSTOMERS = [
  {name: 'Blue Origin', to: '/docs/customer/external/blue-origin'},
  {name: 'Thomson Reuters', to: '/docs/customer/external/thomson-reuters'},
  {name: 'Cox Automotive', to: '/docs/customer/external/cox-automotive'},
  {name: 'Iberdrola', to: '/docs/customer/external/iberdrola'},
  {name: 'AutoScout24', to: '/docs/customer/external/autoscout24'},
  {name: 'BGL', to: '/docs/customer/external/bgl'},
  {name: 'Rede Mater Dei', to: '/docs/customer/external/rede-mater-dei'},
];

function HeroSection() {
  return (
    <section className="landing-hero">
      <CosmicBackground />
      <div className="landing-hero__content">
        <h1 className="landing-hero__title">
          <span>AgentCore</span> Central
        </h1>
        <p className="landing-hero__subtitle">
          Learn, build, and operate agents on <strong>Amazon Bedrock AgentCore</strong>.
          Reference architectures, multi-agent patterns, and workload playbooks — in one place.
        </p>
        <div className="landing-hero__actions">
          <Link className="landing-hero__cta landing-hero__cta--primary" to="/docs/get-started/overview">
            Get Started
          </Link>
          <Link
            className="landing-hero__cta landing-hero__cta--secondary"
            to="https://github.com/awslabs/agentcore-samples/tree/main/02-use-cases"
            target="_blank"
            rel="noopener noreferrer">
            GitHub samples
          </Link>
        </div>
      </div>
    </section>
  );
}

function TilesSection() {
  return (
    <section className="landing-stack">
      <h2 className="landing-tiles__heading">Which agent are you building?</h2>
      <p className="landing-tiles__subheading">
        Start with the workload closest to your use case — you can combine them later.
      </p>

      <div className="landing-tiles__grid">
        <Link to="/docs/workloads/conversational/overview" className="landing-tile">
          <div className="tile-heading"><span className="tile-icon tile-icon-svg tile-icon--chat" aria-hidden="true" /><h3>Conversational Agents</h3></div>
          <p className="landing-tile__desc">
            Customer-facing chat agents with memory, identity, and guardrails. Move from prototype to production with enterprise security built in.
          </p>
          <p className="landing-tile__bestfor"><span>Best for</span> support, copilots, and Q&amp;A</p>
          <span className="landing-tile__arrow">Explore →</span>
        </Link>

        <Link to="/docs/workloads/workflow/overview" className="landing-tile">
          <div className="tile-heading"><span className="tile-icon tile-icon-svg tile-icon--runtime" aria-hidden="true" /><h3>Workflow Agents</h3></div>
          <p className="landing-tile__desc">
            Async agents triggered by tickets, emails, webhooks, and system events. Automate workflows with policy gates and human-in-the-loop escalation.
          </p>
          <p className="landing-tile__bestfor"><span>Best for</span> ticket triage and back-office automation</p>
          <span className="landing-tile__arrow">Explore →</span>
        </Link>

        <Link to="/docs/workloads/coding/overview" className="landing-tile">
          <div className="tile-heading"><span className="tile-icon tile-icon-svg tile-icon--terminal" aria-hidden="true" /><h3>Coding Agents</h3></div>
          <p className="landing-tile__desc">
            IDE and CI-driven agents for code generation, refactor, and review. Long-running tasks in a sandboxed Code Interpreter runtime.
          </p>
          <p className="landing-tile__bestfor"><span>Best for</span> code review and CI agents</p>
          <span className="landing-tile__arrow">Explore →</span>
        </Link>
      </div>

    </section>
  );
}

function StackSection() {
  return (
    <section className="landing-stack-band">
      <span className="landing-platform__eyebrow">Ready to scale?</span>
      <h2 className="landing-tiles__heading">Build your agent platform</h2>
      <p className="landing-tiles__subheading">
        Unify agents in production under one governed, secure platform — everything you need to ship
        agents at scale, built on AgentCore.
      </p>

      <div className="stack-diagram">
        <div className="stack-diagram__brand">Amazon Bedrock AgentCore</div>

        <div className="stack-diagram__groups">
          {STACK_GROUPS.map((group) => (
            <div key={group.title} className="stack-group">
              <h3 className="stack-group__title">{group.title}</h3>
              <ul className="stack-group__items">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="stack-band-row stack-band-row--centered">
          <span className="stack-band-row__label">Environment</span>
          <div className="stack-band-row__chips">
            {STACK_ENVIRONMENT.map((item) => (
              <span key={item} className="stack-service-chip">{item}</span>
            ))}
          </div>
        </div>

        <div className="stack-band-row">
          <span className="stack-band-row__label">Security and Governance</span>
          <div className="stack-band-row__chips">
            {STACK_SECURITY.map((item) => (
              <span key={item} className="stack-service-chip">{item}</span>
            ))}
          </div>
        </div>

        <p className="stack-diagram__footer">
          Build, deploy and operate highly capable agents securely, at scale using any framework and model.
        </p>
      </div>

      <div className="landing-platform__actions">
        <Link className="landing-hero__cta landing-hero__cta--primary" to="/docs/agent-platform/overview">
          Explore the platform
        </Link>
      </div>
    </section>
  );
}

function CustomersSection() {
  return (
    <section className="landing-customers">
      <h2 className="landing-tiles__heading">Trusted in production</h2>
      <p className="landing-tiles__subheading">
        Teams across healthcare, energy, media, and automotive run agents on AgentCore today.
      </p>

      <div className="landing-customers__strip">
        {CUSTOMERS.map((customer) => (
          <Link key={customer.name} to={customer.to} className="landing-customer-chip">
            {customer.name}
          </Link>
        ))}
      </div>

      <div className="landing-customers__more">
        <Link to="/docs/customer/overview">See all reference architectures →</Link>
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
        <CustomersSection />
      </main>
    </Layout>
  );
}
