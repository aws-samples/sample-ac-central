import React from 'react';
import {useLocation} from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const GITLAB_ISSUE_URL = 'https://gitlab.aws.dev/agentcore-gtm/agentcore-central/-/issues/new';

export default function FeedbackLink(): JSX.Element {
  const location = useLocation();
  const {siteConfig} = useDocusaurusContext();

  const pageUrl = `${siteConfig.url}${location.pathname}`;
  const title = encodeURIComponent('Feedback: ');
  const body = encodeURIComponent(`**Page:** ${pageUrl}\n\n---\n\n<!-- Describe your feedback below -->\n\n`);

  const href = `${GITLAB_ISSUE_URL}?issue[title]=${title}&issue[description]=${body}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="navbar__item navbar__link navbar-feedback-link"
    >
      Feedback
    </a>
  );
}
