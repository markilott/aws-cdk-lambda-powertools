import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import {
    Color, GaugeWidget, IWidget, TextWidget,
} from 'aws-cdk-lib/aws-cloudwatch';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
    RestApi, EndpointType, JsonSchemaType, JsonSchemaVersion, PassthroughBehavior,
    MethodLoggingLevel, LogGroupLogDestination, AccessLogFormat, AccessLogField,
    MethodOptions, LambdaIntegrationOptions,
} from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

type CustomApiProps = {
    /** Api Name */
    restApiName: string,
    /** Api Description */
    description: string,
};

/**
 * Creates a DynamoDB table with standard settings.
 */
export class CustomApi extends Construct {
    /** API construct */
    api: RestApi;

    /** Default Method Option Props */
    methodProps: MethodOptions;

    /** Lambda Default Integration Props */
    integrationProps: LambdaIntegrationOptions;

    /** Dashboard Widgets */
    dashboardWidgets: IWidget[];

    /**
     * @param {Construct} scope
     * @param {string} id
     * @param {CustomApiProps} props
     */
    constructor(scope: Construct, id: string, props: CustomApiProps) {
        super(scope, id);

        const {
            restApiName,
            description,
        } = props;

        // API Gateway ============================================
        const api = new RestApi(this, 'DemoApi', {
            restApiName,
            description,
            deployOptions: {
                stageName: 'v1',
                description: 'V1 Deployment',
                /**
                 * Enable tracing and logging in JSON format for the API.
                 */
                tracingEnabled: true,
                accessLogDestination: new LogGroupLogDestination(new LogGroup(this, 'AccessLog', {
                    retention: RetentionDays.ONE_MONTH,
                    removalPolicy: RemovalPolicy.DESTROY,
                })),
                accessLogFormat: AccessLogFormat.custom(JSON.stringify({
                    requestTime: AccessLogField.contextRequestTime(),
                    requestTimeEpoch: AccessLogField.contextRequestTimeEpoch(),
                    requestId: AccessLogField.contextRequestId(),
                    extendedRequestId: AccessLogField.contextExtendedRequestId(),
                    sourceIp: AccessLogField.contextIdentitySourceIp(),
                    method: AccessLogField.contextHttpMethod(),
                    resourcePath: AccessLogField.contextResourcePath(),
                    traceId: AccessLogField.contextXrayTraceId(),
                })),
                /**
                 * Execution logs.
                 * Only required for debugging.
                 * Creates an additional log group that we cannot control.
                 */
                loggingLevel: MethodLoggingLevel.OFF,
                /**
                 * Enable Details Metrics. Additional costs incurred
                 * Creates metrics at the method level.
                 */
                metricsEnabled: false,
            },
            endpointTypes: [EndpointType.REGIONAL],
        });
        this.api = api;
        new CfnOutput(this, 'apiUrl', {
            description: 'API URL',
            value: api.url,
        });

        // Lambda integration props for API methods
        this.integrationProps = {
            proxy: false,
            integrationResponses: [
                {
                    statusCode: '200',
                    responseTemplates: {
                        'application/json': '$input.body',
                    },
                },
                {
                    selectionPattern: '.*:4\\d{2}.*',
                    statusCode: '400',
                    responseTemplates: {
                        'application/json': `
                            #set ($errorMessageObj = $util.parseJson($input.path('$.errorMessage')))
                            {
                                "errorMessage" : "$errorMessageObj.message",
                                "requestId" : "$errorMessageObj.requestId"
                            }`,
                    },
                },
                {
                    selectionPattern: '.*:5\\d{2}.*',
                    statusCode: '500',
                    responseTemplates: {
                        'application/json': `
                            #set ($errorMessageObj = $util.parseJson($input.path('$.errorMessage')))
                            {
                                "errorMessage" : "Internal Error",
                                "requestId" : "$errorMessageObj.requestId"
                            }`,
                    },
                },
            ],
            passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
        };

        // Response model for Method Responses
        const jsonResponseModel = api.addModel('JsonResponse', {
            contentType: 'application/json',
            schema: {
                schema: JsonSchemaVersion.DRAFT7,
                title: 'JsonResponse',
                type: JsonSchemaType.OBJECT,
                properties: {
                    state: { type: JsonSchemaType.STRING },
                    greeting: { type: JsonSchemaType.STRING },
                },
            },
        });

        // Default method responses
        this.methodProps = {
            methodResponses: [
                {
                    statusCode: '200',
                    responseModels: {
                        'application/json': jsonResponseModel,
                    },
                },
                {
                    statusCode: '400',
                    responseModels: {
                        'application/json': jsonResponseModel,
                    },
                },
                {
                    statusCode: '500',
                    responseModels: {
                        'application/json': jsonResponseModel,
                    },
                },
            ],
        };

        // CloudWatch Metrics ====================================
        const integrationLatencyMetricAvg = api.metricIntegrationLatency({
            label: `${restApiName} Integration Latency Avg`,
            statistic: 'avg',
            dimensionsMap: {
                ApiName: restApiName,
            },
            color: Color.PURPLE,
        });
        const integrationLatencyMetricMax = api.metricIntegrationLatency({
            label: `${restApiName} Integration Latency Max`,
            statistic: 'max',
            dimensionsMap: {
                ApiName: restApiName,
            },
            color: Color.RED,
        });
        const integrationLatencyMetricMin = api.metricIntegrationLatency({
            label: `${restApiName} Integration Latency Min`,
            statistic: 'min',
            dimensionsMap: {
                ApiName: restApiName,
            },
            color: Color.GREEN,
        });

        // Dashboard Widgets
        const headerWidget = new TextWidget({
            markdown: `## ${restApiName} Metrics`,
            width: 24,
            height: 1,
        });
        const integrationLatencyAvgGauge = new GaugeWidget({
            title: `${restApiName} Average Integration Latency`,
            metrics: [integrationLatencyMetricAvg],
            leftYAxis: {
                min: 0,
                max: 29000,
            },
            height: 6,
        });
        const integrationLatencyMaxGauge = new GaugeWidget({
            title: `${restApiName} Max Integration Latency`,
            metrics: [integrationLatencyMetricMax],
            leftYAxis: {
                min: 0,
                max: 29000,
            },
            height: 6,
        });
        const integrationLatencyMinGauge = new GaugeWidget({
            title: `${restApiName} Min Integration Latency`,
            metrics: [integrationLatencyMetricMin],
            leftYAxis: {
                min: 0,
                max: 29000,
            },
            height: 6,
        });

        // Export all widgets for dashboard
        this.dashboardWidgets = [
            headerWidget,
            integrationLatencyAvgGauge,
            integrationLatencyMinGauge,
            integrationLatencyMaxGauge,
        ];
    }
}
