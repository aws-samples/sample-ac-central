# Infrastructure-as-Code Strategy for AgentCore

## Summary

AgentCore supports three first-class deployment methods: the AgentCore CLI (which wraps CDK), native CDK/CloudFormation, and Terraform. All are officially supported. The CLI is the fastest path to prototype; CDK/CloudFormation and Terraform serve teams with existing IaC estates.

---

## Verified Facts

### 1. AgentCore CLI uses AWS CDK under the hood

> "The AgentCore CLI is a command-line tool that scaffolds agent projects, deploys them to Amazon Bedrock AgentCore Runtime, and invokes them. The CLI uses the AWS CDK to deploy resources."

- Source: [Get started with AgentCore CLI (Python)](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-cli.html)
- Source: [Get started with AgentCore CLI (TypeScript)](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-cli-typescript.html)
- Prerequisites include installing AWS CDK.
- `agentcore deploy` synthesizes CDK apps → CloudFormation stacks → AWS resources.
- The `agentcore.json` field `"managedBy": "CDK"` confirms this relationship.
- The CLI scaffolds a `agentcore/cdk/` directory containing CDK infrastructure code.

### 2. Official CloudFormation resource types exist

Namespace: `AWS::BedrockAgentCore::*`

Full list of resource types (from [CloudFormation Template Reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_BedrockAgentCore.html)):

- `AWS::BedrockAgentCore::ApiKeyCredentialProvider`
- `AWS::BedrockAgentCore::Browser`
- `AWS::BedrockAgentCore::BrowserCustom`
- `AWS::BedrockAgentCore::BrowserProfile`
- `AWS::BedrockAgentCore::CodeInterpreterCustom`
- `AWS::BedrockAgentCore::Dataset`
- `AWS::BedrockAgentCore::Evaluator`
- `AWS::BedrockAgentCore::Gateway`
- `AWS::BedrockAgentCore::GatewayTarget`
- `AWS::BedrockAgentCore::Harness`
- `AWS::BedrockAgentCore::Memory`
- `AWS::BedrockAgentCore::OAuth2CredentialProvider`
- `AWS::BedrockAgentCore::OnlineEvaluationConfig`
- `AWS::BedrockAgentCore::PaymentConnector`
- `AWS::BedrockAgentCore::PaymentCredentialProvider`
- `AWS::BedrockAgentCore::Policy`
- `AWS::BedrockAgentCore::PolicyEngine`
- `AWS::BedrockAgentCore::Runtime`
- `AWS::BedrockAgentCore::RuntimeEndpoint`
- `AWS::BedrockAgentCore::WorkloadIdentity`

### 3. Official Terraform support exists

HashiCorp AWS Provider resources:

| Resource | Registry Link |
|----------|--------------|
| `aws_bedrockagentcore_gateway` | [registry.terraform.io](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/bedrockagentcore_gateway) |
| `aws_bedrockagentcore_agent_runtime` | [registry.terraform.io](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/bedrockagentcore_agent_runtime) |
| `aws_bedrockagentcore_agent_runtime_endpoint` | [registry.terraform.io](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/bedrockagentcore_agent_runtime_endpoint) |

Requires AWS provider >= 6.28.0. Community example: [Caylent blog — RAG chatbot with AgentCore + Terraform](https://caylent.com/blog/building-a-secure-rag-application-with-amazon-bedrock-agentcore-and-terraform).

### 4. Stable CDK constructs

Module: `aws-cdk-lib/aws-bedrockagentcore` (stable)
Alpha module: `aws_cdk.aws_bedrock_agentcore_alpha` (Policy construct only)

Available constructs: Runtime, RuntimeEndpoint, AgentRuntimeArtifact, NetworkConfiguration, Observability, Gateway, GatewayTarget, GatewayAuthorizer, GatewayCredentialProvider, Interceptor, BrowserCustom, CodeInterpreterCustom, Memory, MemoryStrategy, OnlineEvaluationConfig, Evaluator, EvaluatorSelector, OAuth2CredentialProvider, ApiKeyCredentialProvider, WorkloadIdentity.

Source: [CDK API reference](https://docs.aws.amazon.com/cdk/api/v2/python/aws_cdk.aws_bedrock_agentcore_alpha/README.html)

### 5. Customer case studies don't disclose IaC choice

BGL, Thomson Reuters, AutoScout24, and Iberdrola all confirm use of AgentCore Runtime. None specify which deployment tool they used. We cannot claim "customers use Terraform" or "customers use CDK" without evidence.

---

## Decision framework for the site

| Audience | Recommended path | Rationale |
|----------|-----------------|-----------|
| **Individual dev / small team, new project** | AgentCore CLI | Fastest path. Scaffolds everything. No CDK knowledge needed. |
| **Team already using CDK** | CDK constructs directly | CLI generates CDK anyway. Skip the wrapper, use constructs in your existing stacks. |
| **Team already using Terraform** | Terraform AWS provider | Official resources available. Use alongside other infra. |
| **Team using CloudFormation templates** | CloudFormation resource types | Full resource coverage. Use in existing templates/StackSets. |
| **Graduating from CLI prototype to production** | Eject to CDK or Terraform | Take the generated CDK stack, customize it, integrate into CI/CD. |

---

## Implications for site content

1. **get-started/quickstart.mdx** — Keep CLI as the default. It's correct and fast.
2. **NEW: get-started/deployment-methods.mdx** — Add a page that presents the full picture. No one should feel the CLI is the ONLY way.
3. **Workload quickstarts** — Use CLI. But add a note: "This quickstart uses the AgentCore CLI. For CDK, Terraform, or CloudFormation deployment, see [Deployment Methods](/docs/get-started/deployment-methods)."
4. **Reference/agentcore-json.mdx** — Already explains the `managedBy: "CDK"` field. Link to the new deployment-methods page.
5. **Don't create full CDK/Terraform quickstart duplicates** — just link to official AWS docs and the Terraform registry examples. Follow the "reference, don't duplicate" principle.
