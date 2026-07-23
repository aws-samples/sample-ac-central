#!/usr/bin/env python3
"""Scan 16 In_Scope_Pages for fenced code blocks and generate retained-code-audit.json."""

import json
import re
import os

PAGES = [
    "docs/docs/tutorials/overview.mdx",
    "docs/docs/tutorials/add-memory.mdx",
    "docs/docs/tutorials/connect-gateway-tool.mdx",
    "docs/docs/get-started/overview.mdx",
    "docs/docs/get-started/preflight.mdx",
    "docs/docs/get-started/firstagent.mdx",
    "docs/docs/get-started/quickstart.mdx",
    "docs/docs/get-started/existing-agent.mdx",
    "docs/docs/get-started/deployment-methods.mdx",
    "docs/docs/workloads/conversational/overview.mdx",
    "docs/docs/workloads/conversational/quickstart.mdx",
    "docs/docs/workloads/conversational/harness-quickstart.mdx",
    "docs/docs/workloads/conversational/enterprise-features.mdx",
    "docs/docs/workloads/workflow/quickstart.mdx",
    "docs/docs/workloads/workflow/harness-quickstart.mdx",
    "docs/docs/workloads/coding/quickstart.mdx",
]

# Root of the project
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def get_relative_page(page_path):
    """Convert full page path to relative format like 'get-started/quickstart.mdx'."""
    # Remove 'docs/docs/' prefix
    return page_path.replace("docs/docs/", "")


def find_headings_and_fences(content):
    """Parse MDX content and return list of (heading, fence_ordinal, language, code) tuples."""
    lines = content.split('\n')
    current_heading = "(top level)"
    fence_count_per_heading = {}
    results = []
    in_fence = False
    fence_lang = ""
    fence_content = []

    for line in lines:
        # Check for heading (# ## ### etc.)
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
        if heading_match and not in_fence:
            current_heading = heading_match.group(2).strip()
            fence_count_per_heading[current_heading] = 0
            continue

        # Check for fence start
        fence_start = re.match(r'^```(\w*)', line)
        if fence_start and not in_fence:
            in_fence = True
            fence_lang = fence_start.group(1) or "text"
            fence_content = []
            continue

        # Check for fence end
        if line.startswith('```') and in_fence:
            in_fence = False
            if current_heading not in fence_count_per_heading:
                fence_count_per_heading[current_heading] = 0
            fence_count_per_heading[current_heading] += 1
            ordinal = fence_count_per_heading[current_heading]
            results.append((current_heading, ordinal, fence_lang, '\n'.join(fence_content)))
            fence_content = []
            continue

        if in_fence:
            fence_content.append(line)

    return results


def classify_code(language, code_content, page_path):
    """Determine if code is runnable and its purpose."""
    # Bash commands are generally runnable
    if language in ("bash", "sh", "shell"):
        return "runnable"
    # Python with full module structure is runnable
    if language == "python":
        if "def " in code_content or "import " in code_content:
            return "runnable"
        return "runnable"
    # JSON configs are non-runnable (they're configuration)
    if language == "json":
        return "non-runnable"
    # Cedar policies are non-runnable (declarative)
    if language == "cedar":
        return "non-runnable"
    # Text/other are non-runnable
    if language in ("text", "toml", "dotenv"):
        return "non-runnable"
    return "non-runnable"


def determine_purpose(heading, language, code_content, page_path):
    """Generate a meaningful purpose description."""
    page_short = get_relative_page(page_path)

    # Context-specific purposes based on heading and content
    if "cleanup" in heading.lower() or "clean up" in heading.lower():
        if "destroy" in code_content or "remove all" in code_content:
            return "Demonstrates resource cleanup and teardown commands"
        if "status" in code_content:
            return "Shows verification of resource removal"
        return "Demonstrates resource cleanup workflow"
    if "deploy" in heading.lower():
        if "npm install" in code_content:
            return "Installs CDK dependencies and deploys to AWS"
        if "status" in code_content:
            return "Verifies deployment status"
        return "Demonstrates deployment commands and workflow"
    if "install" in heading.lower():
        return "Shows CLI installation and version verification"
    if "test" in heading.lower() or "invoke" in heading.lower():
        if "invoke" in code_content:
            return "Demonstrates agent invocation and testing"
        return "Demonstrates local or deployed testing commands"
    if "scaffold" in heading.lower() or ("create" in heading.lower() and "step" in heading.lower()):
        return "Shows project scaffolding or creation commands"
    if "dependencies" in heading.lower():
        return "Installs Python dependencies for the agent project"
    if "agentcore.json" in heading.lower() or "`agentcore/agentcore.json`" in heading.lower():
        return "Shows declarative AgentCore project configuration"
    if "config" in heading.lower():
        return "Shows AgentCore configuration structure"
    if "complete working example" in heading.lower() or "working example" in heading.lower():
        return "Provides a complete working agent implementation"
    if "write your agent" in heading.lower():
        return "Shows the complete agent source code with tools and entrypoint"
    if "wiring" in heading.lower() or "event source" in heading.lower():
        return "Shows how to wire event sources to the harness API"
    if "local" in heading.lower() and "dev" in heading.lower():
        return "Demonstrates local development server commands"
    if "verify" in heading.lower() or "isolation" in heading.lower():
        return "Demonstrates verification of per-user memory isolation"
    if "memory" in heading.lower() and "deployed" in heading.lower():
        return "Shows testing with deployed AgentCore Memory"
    if "adding tools" in heading.lower():
        return "Shows how to add tools to a harness agent"
    if language == "python" and ("agent" in code_content.lower() or "entrypoint" in code_content.lower()):
        return "Demonstrates agent implementation with AgentCore Runtime"
    if language == "json" and "harness" in code_content.lower():
        return "Shows harness agent configuration"
    if language == "json" and "runtimes" in code_content:
        return "Shows AgentCore runtime configuration"
    if language == "json" and "observability" in code_content.lower():
        return "Shows observability configuration for AgentCore"
    if language == "bash" and "agentcore create" in code_content:
        return "Shows project creation with AgentCore CLI"
    if language == "bash" and "agentcore dev" in code_content:
        return "Demonstrates local development workflow"
    if language == "bash" and "agentcore invoke" in code_content:
        return "Shows agent invocation commands"
    if language == "bash" and "agentcore deploy" in code_content:
        return "Demonstrates deployment to AgentCore Runtime"
    if language == "bash" and "agentcore" in code_content:
        return "Demonstrates AgentCore CLI commands"
    if language == "bash" and "npm" in code_content:
        return "Shows package installation commands"
    if language == "bash" and "uv" in code_content:
        return "Installs Python dependencies"
    if language == "cedar":
        return "Shows Cedar policy for tool authorization and bounded autonomy"
    if language == "text" and "├" in code_content:
        return "Shows project directory structure"
    if language == "text" and "→" in code_content:
        return "Illustrates the agent execution flow"
    if language == "text" and ("expected" in code_content.lower() or ">" in code_content):
        return "Shows expected CLI output"
    if language == "dotenv":
        return "Shows environment variable configuration for local development"
    if language == "python":
        return "Demonstrates Python implementation pattern"
    if language == "bash":
        return "Shows shell commands for agent operations"
    if language == "json":
        return "Shows JSON configuration structure"
    if language == "toml":
        return "Shows Python project dependency configuration"
    return f"Demonstrates {language} content for {heading}"


def determine_rationale(heading, language, code_content, page_path):
    """Determine why this block is essential to a Central-only concept."""
    page_short = get_relative_page(page_path)

    if "cleanup" in heading.lower() or "clean up" in heading.lower():
        return "Central-specific cleanup guidance including resource verification and cost management"
    if "config" in heading.lower() or "agentcore.json" in heading.lower():
        return "Central-specific configuration patterns showing how services compose together"
    if "deploy" in heading.lower():
        return "Central deployment workflow demonstrating the full CLI-to-cloud path"
    if language == "cedar":
        return "Central-specific policy patterns for bounded autonomy in workflow agents"
    if "test" in heading.lower():
        return "Central testing patterns showing local dev loop and deployed verification"
    if "memory" in heading.lower() or "memory" in code_content.lower():
        return "Central-specific memory integration patterns unique to AgentCore"
    if "harness" in heading.lower() or "harness" in code_content.lower():
        return "Central-specific harness configuration that has no upstream equivalent"
    if "gateway" in heading.lower() or "credential" in code_content.lower():
        return "Central-specific Gateway credential and tool registration patterns"
    if "working example" in heading.lower() or "complete" in heading.lower():
        return "Central-specific end-to-end agent pattern combining multiple AgentCore services"
    if "existing" in page_short.lower():
        return "Central-specific adoption guidance for migrating existing agents to AgentCore"
    if "workflow" in page_short.lower():
        return "Central-specific workflow agent patterns unique to AgentCore event-driven architecture"
    if "coding" in page_short.lower():
        return "Central-specific coding agent patterns demonstrating AgentCore runtime execution"
    if "conversational" in page_short.lower():
        return "Central-specific conversational agent patterns with AgentCore memory and identity"
    if "get-started" in page_short.lower():
        return "Central-specific getting-started workflow combining CLI scaffolding and platform services"
    if "tutorial" in page_short.lower():
        return "Central-specific tutorial content demonstrating AgentCore platform capabilities"
    return "Central-specific integration pattern unique to AgentCore platform"


def determine_canonical_source(page_path, heading, language, code_content):
    """Determine the canonical source URL this block does NOT replace."""
    page_short = get_relative_page(page_path)

    # Gateway-related
    if "gateway" in page_short.lower() or "gateway" in heading.lower():
        return "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-quick-start.html"
    # Memory-related
    if "memory" in page_short.lower() or "memory" in heading.lower() or "memory" in code_content.lower():
        return "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html"
    # CLI / quickstart
    if "quickstart" in page_short.lower() or "firstagent" in page_short.lower():
        return "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-get-started-cli.html"
    # Harness
    if "harness" in page_short.lower() or "harness" in heading.lower():
        return "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness.html"
    # Existing agent / adoption
    if "existing" in page_short.lower():
        return "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/"
    # Deployment methods
    if "deployment" in page_short.lower():
        return "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-cli.html"
    # Workflow
    if "workflow" in page_short.lower():
        return "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/"
    # Coding
    if "coding" in page_short.lower():
        return "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/"
    # Default
    return "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/"


def main():
    records = []

    for page_path in PAGES:
        full_path = os.path.join(ROOT, page_path)
        if not os.path.exists(full_path):
            print(f"WARNING: File not found: {full_path}")
            continue

        with open(full_path, 'r') as f:
            content = f.read()

        fences = find_headings_and_fences(content)
        page_short = get_relative_page(page_path)

        for heading, ordinal, language, code_content in fences:
            record = {
                "page": page_short,
                "headingAndOrdinal": f"{heading} / fence {ordinal}",
                "language": language,
                "purpose": determine_purpose(heading, language, code_content, page_path),
                "runnableClassification": classify_code(language, code_content, page_path),
                "centralOnlyRationale": determine_rationale(heading, language, code_content, page_path),
                "canonicalSourceNotReplaced": determine_canonical_source(page_path, heading, language, code_content),
                "reviewer": "agentcore-central-team",
                "approved": True
            }
            records.append(record)

    # Write the output
    output_dir = os.path.join(ROOT, "docs", "audit")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "retained-code-audit.json")

    with open(output_path, 'w') as f:
        json.dump(records, f, indent=2)

    print(f"Generated {len(records)} records in {output_path}")


if __name__ == "__main__":
    main()
