import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import {
    CustomFunction, CustomDynamoTable, CustomApi, ToolsLayer,
} from '@demo/constructs';
import { DemoStackProps } from 'types';
import { AttributeType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';

/**
 * Deploys the application including API and Lambda backend.
 * API Url is output for use in testing.
 */
export class ApplicationStack extends Stack {
    /** Output the API for use in the workflow stack */
    api: RestApi;

    /** Custom Functions */
    functions: CustomFunction[];

    /** Custom Table */
    colourTable: CustomDynamoTable;

    /** Custom API */
    customApi: CustomApi;

    /**
     * @param {Construct} scope
     * @param {string} id
     * @param {DemoStackProps} props
     */
    constructor(scope: Construct, id: string, props: DemoStackProps) {
        super(scope, id, props);

        const {
            svcName = 'ToolsDemo',
            functionOptions,
        } = props;

        // Data Table ==============================================
        const tableName = 'ToolsDemoTable';
        this.colourTable = new CustomDynamoTable(this, 'DataTable', {
            tableName,
            partitionKey: 'ItemId',
        });
        const { table } = this.colourTable;
        table.addGlobalSecondaryIndex({
            indexName: 'CorrelationId',
            partitionKey: { name: 'CorrelationId', type: AttributeType.STRING },
            sortKey: { name: 'ItemId', type: AttributeType.STRING },
            projectionType: ProjectionType.ALL,
        });

        // Lambda Function Common Props ===========================

        // Tools Layer
        /**
         * Lambda Layer including the PowerTools modules.
         * We could install PowerTools modules from the AWS shared layer:
         * new LayerVersion.fromLayerVersionArn(this, 'ToolsLayer', `arn:aws:lambda:${this.region}:094274105915:layer:AWSLambdaPowertoolsTypeScript:4`);
         * However we are creating our own here to include middy and moment.
         */
        const toolsLayer = new ToolsLayer(this, 'ToolsLayer', { svcName }).layerVersion;

        const lambdaDefaultProps = {
            svcName,
            powerToolsOptions: {
                logEvent: functionOptions?.logEvent ?? true,
                logLevel: functionOptions?.logLevel || 'DEBUG',
            },
            environment: {
                TABLE_NAME: tableName,
            },
            toolsLayer,
        };
        this.functions = [];

        // API Gateway ============================================
        const customApi = new CustomApi(this, 'Api', {
            restApiName: 'ToolsDemoApi',
            description: 'The PowerTools Demo API',
        });
        const { api, methodProps, integrationProps } = customApi;
        this.api = api;
        this.customApi = customApi;

        // API Functions and Methods ==============================================

        // Create/Update function
        const createDataFnc = new CustomFunction(this, 'CreateFnc', {
            ...lambdaDefaultProps,
            description: `${svcName} Create and Update Testing`,
            label: 'CreateFnc',
            entry: `${__dirname}/../lambda/create-data/index.ts`,
            functionProps: {
                timeout: 5,
            },
        });
        table.grantWriteData(createDataFnc.function);
        this.functions.push(createDataFnc);

        const createInteg = new LambdaIntegration(createDataFnc.function, {
            ...integrationProps,
            requestTemplates: {
                'application/json': `{
                    "params": {
                        "itemId": $input.json('$.itemId'),
                        "isRed": $input.json('$.isRed'),
                        "isBlue": $input.json('$.isBlue'),
                        "surpriseMe": $input.json('$.surpriseMe'),
                        "correlationId": $input.json('$.correlationId'),
                        "throwError": $input.json('$.throwError')
                    },
                    "context": {
                        "requestId" : "$context.requestId",
                        "httpMethod" : "$context.httpMethod"
                    }
                }`,
            },
        });
        // Create
        api.root.addMethod('POST', createInteg, { ...methodProps });
        // Update
        api.root.addMethod('PUT', createInteg, { ...methodProps });

        // Read function
        const readDataFnc = new CustomFunction(this, 'ReadFnc', {
            ...lambdaDefaultProps,
            description: `${svcName} Read Testing`,
            label: 'ReadFnc',
            entry: `${__dirname}/../lambda/read-data/index.ts`,
            functionProps: {
                timeout: 3,
            },
        });
        table.grantReadData(readDataFnc.function);
        this.functions.push(readDataFnc);

        const readInteg = new LambdaIntegration(readDataFnc.function, {
            ...integrationProps,
            requestTemplates: {
                'application/json': `{
                    "params": {
                        "itemId": "$input.params('itemId')",
                        "correlationId": "$input.params('correlationId')"
                    },
                    "context": {
                        "requestId" : "$context.requestId",
                        "httpMethod" : "$context.httpMethod"
                    }
                }`,
            },
            requestParameters: {
                'integration.request.querystring.itemId': 'method.request.querystring.itemId',
                'integration.request.querystring.correlationId': 'method.request.querystring.correlationId',
            },
        });
        // Get items
        api.root.addMethod('GET', readInteg, {
            ...methodProps,
            requestParameters: {
                'method.request.querystring.itemId': false,
                'method.request.querystring.correlationId': false,
            },
        });

        // Delete function
        const deleteDataFnc = new CustomFunction(this, 'DeleteFnc', {
            ...lambdaDefaultProps,
            description: `${svcName} Delete Testing`,
            label: 'DeleteFnc',
            entry: `${__dirname}/../lambda/delete-data/index.ts`,
            functionProps: {
                timeout: 5,
            },
        });
        table.grantWriteData(deleteDataFnc.function);
        this.functions.push(deleteDataFnc);

        const deleteInteg = new LambdaIntegration(deleteDataFnc.function, {
            ...integrationProps,
            requestTemplates: {
                'application/json': `{
                    "params": {
                        "itemId": $input.json('$.itemId'),
                        "correlationId": $input.json('$.correlationId')
                    },
                    "context": {
                        "requestId" : "$context.requestId",
                        "httpMethod" : "$context.httpMethod"
                    }
                }`,
            },
        });
        api.root.addMethod('DELETE', deleteInteg, { ...methodProps });
    }
}
