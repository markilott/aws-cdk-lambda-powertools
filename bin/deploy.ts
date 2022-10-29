/**
 * Will deploy into the current default CLI account.
 *
 * Deployment:
 * cdk deploy --all
 */

import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { ApplicationStack, StepFunctionStack, DashboardStack } from '../src/stacks';
import { options } from '../config';

const app = new App();

// use account details from default AWS CLI credentials:
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;

// Create API Stack stack
const apiStack = new ApplicationStack(app, 'ToolsDemoStack', {
    description: 'Lambda PowerTools Demo Stack',
    env: { account, region },
    ...options,
});

// Create Test Workflow stack
new StepFunctionStack(app, 'ToolsWorkflowStack', {
    description: 'Lambda PowerTools StepFunction Test Stack',
    env: { account, region },
    api: apiStack.api,
    ...options,
});

// Create Dashboard stack
new DashboardStack(app, 'ToolsDashboardStack', {
    description: 'Lambda PowerTools Dashboard Stack',
    env: { account, region },
    demoApi: apiStack.customApi,
    functions: apiStack.functions,
    colourTable: apiStack.colourTable,
    ...options,
});
