import React from 'react';
import clsx from 'clsx';
import {useLocation} from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

// Fallback used only if customFields.issueUrl is missing (should not happen in a
// normal build, since docusaurus.config.ts always sets a default).
const DEFAULT_ISSUE_URL = 'https://github.com/aws-samples/sample-ac-central/issues/new';

interface FeedbackLinkProps {
  // Docusaurus passes `mobile: true` when rendering inside the mobile sidebar menu.
  mobile?: boolean;
  // Docusaurus passes onClick in the mobile menu to close the drawer after selection.
  onClick?: () => void;
}

export default function FeedbackLink({mobile, onClick}: FeedbackLinkProps): JSX.Element {
  const location = useLocation();
  const {siteConfig} = useDocusaurusContext();

  const issueUrl = (siteConfig.customFields?.issueUrl as string) || DEFAULT_ISSUE_URL;

  const pageUrl = `${siteConfig.url}${location.pathname}`;
  const titleText = 'Feedback: ';
  const bodyText = `**Page:** ${pageUrl}\n\n---\n\n<!-- Describe your feedback below -->\n\n`;

  // GitHub and GitLab prefill new issues with different query parameters.
  const isGitLab = issueUrl.includes('gitlab');
  const params = isGitLab
    ? `issue[title]=${encodeURIComponent(titleText)}&issue[description]=${encodeURIComponent(bodyText)}`
    : `title=${encodeURIComponent(titleText)}&body=${encodeURIComponent(bodyText)}`;

  const href = `${issueUrl}?${params}`;

  if (mobile) {
    return (
      <li className="menu__list-item">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="menu__link navbar-feedback-link"
          onClick={onClick}
        >
          Feedback
        </a>
      </li>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx('navbar__item', 'navbar__link', 'navbar-feedback-link')}
    >
      Feedback
    </a>
  );
}
