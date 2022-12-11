import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DemoStackProps } from 'types';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import {
    StateMachine, Condition, Choice, Succeed, Fail, Pass, JsonPath, Chain, TaskInput,
} from 'aws-cdk-lib/aws-stepfunctions';
import { CallApiGatewayRestApiEndpoint, HttpMethod } from 'aws-cdk-lib/aws-stepfunctions-tasks';

interface StepFunctionStackProps extends DemoStackProps {
    api: RestApi,
}

/**
 * Deploys a StepFunction workflow to test the application
 * functions and generate logs.
 */
export class StepFunctionStack extends Stack {
    /**
     * @param {Construct} scope
     * @param {string} id
     * @param {StepFunctionStackProps} props
     */
    constructor(scope: Construct, id: string, props: StepFunctionStackProps) {
        super(scope, id, props);

        const { api } = props;

        // StepFunction Catch props for Lambda tasks
        const lambdaCatchProps = {
            resultPath: '$.error',
            errors: ['States.ALL'],
        };

        // Completed successfully
        const success = new Succeed(this, 'Success', { comment: 'Completed successfully' });

        // Failed
        const failed = new Fail(this, 'Failed', { comment: 'Execution failed' });

        // Get the Item Result
        const getItems = new CallApiGatewayRestApiEndpoint(this, 'GetItems', {
            comment: 'Get items',
            api,
            stageName: api.deploymentStage.stageName,
            apiPath: '/',
            queryParameters: TaskInput.fromObject({
                'correlationId.$': 'States.Array($.correlationId)',
            }),
            method: HttpMethod.GET,
            resultSelector: { 'result.$': '$.ResponseBody.data' },
            resultPath: '$',
        })
            .addCatch(failed, lambdaCatchProps)
            .next(success);

        // Check iterations remaining
        const iterationsRemaining = Condition.numberGreaterThan('$.count.remaining', 0);
        const countCheck = new Choice(this, 'CountChoice', {
            comment: 'Check for remaining iteration count',
        });

        // Reduce the iteration count after create/update
        const reduceCount = new Pass(this, 'ReduceCount', {
            comment: 'Reduce the iteration count',
            parameters: {
                remaining: JsonPath.mathAdd(JsonPath.numberAt('$.count.remaining'), -1),
            },
            resultPath: '$.count',
        }).next(countCheck);

        // Delete an item after a failed update
        const deleteItem = new CallApiGatewayRestApiEndpoint(this, 'DeleteItem', {
            comment: 'Delete item',
            api,
            stageName: api.deploymentStage.stageName,
            apiPath: '/',
            method: HttpMethod.DELETE,
            requestBody: TaskInput.fromObject({
                'itemId.$': '$.result.itemId',
                'correlationId.$': '$.correlationId',
            }),
            resultPath: JsonPath.DISCARD,
        })
            .addCatch(reduceCount, lambdaCatchProps)
            .next(reduceCount);

        // Update an item
        const updateItem = new CallApiGatewayRestApiEndpoint(this, 'UpdateItem', {
            comment: 'Update item',
            api,
            stageName: api.deploymentStage.stageName,
            apiPath: '/',
            method: HttpMethod.PUT,
            requestBody: TaskInput.fromObject({
                'itemId.$': '$.result.itemId',
                'correlationId.$': '$.correlationId',
                surpriseMe: true,
            }),
            resultPath: JsonPath.DISCARD,
        })
            .addCatch(deleteItem, lambdaCatchProps)
            .next(reduceCount);

        // Create a new item
        const createItem = new CallApiGatewayRestApiEndpoint(this, 'CreateItem', {
            comment: 'Create new item',
            api,
            stageName: api.deploymentStage.stageName,
            apiPath: '/',
            method: HttpMethod.POST,
            requestBody: TaskInput.fromObject({
                'correlationId.$': '$.correlationId',
                surpriseMe: true,
            }),
            resultSelector: { 'itemId.$': '$.ResponseBody.requestId' },
            resultPath: '$.result',
        })
            .addCatch(reduceCount, lambdaCatchProps)
            .next(updateItem);

        // Pass state to set the iteration count and correlationId
        const startPass = new Pass(this, 'StartPass', {
            comment: 'Set the Id and Iteration Number',
            parameters: {
                total: 20,
                count: { remaining: 20 },
                result: { itemId: '' },
                'correlationId.$': '$$.Execution.Name',
            },
            resultPath: '$',
        }).next(createItem);

        // Count check choice
        countCheck
            .when(iterationsRemaining, createItem)
            .otherwise(getItems);

        // The StepFunction state machine
        const stateMachine = new StateMachine(this, 'TestWorkflow', {
            stateMachineName: 'TestLogDemoFunctions',
            definition: Chain.start(startPass),
            timeout: Duration.minutes(15),
            tracingEnabled: true,
        });

        new CfnOutput(this, 'StartMachineCli', {
            description: 'CLI command to start execution',
            value: `aws stepfunctions start-execution --state-machine-arn "arn:aws:states:${this.region}:${this.account}:stateMachine:${stateMachine.stateMachineName}"`,
        });
    }
}
