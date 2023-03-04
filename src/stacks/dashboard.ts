import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { QueryDefinition, QueryString } from 'aws-cdk-lib/aws-logs';
import {
    Color, Dashboard, GraphWidget, GraphWidgetView, LegendPosition, Metric, Row, SingleValueWidget, TextWidget,
} from 'aws-cdk-lib/aws-cloudwatch';
import { DemoStackProps } from 'types';
import { CustomFunction, CustomDynamoTable, CustomApi } from '@demo/constructs';
import { CfnGroup } from 'aws-cdk-lib/aws-xray';

interface DashboardStackProps extends DemoStackProps {
    /** Demo API inc Dashboard widgets */
    demoApi: CustomApi;

    /** Custom Functions */
    functions: CustomFunction[];

    /** Custom Table */
    colourTable: CustomDynamoTable;

    /** Demo Data StepFunction */
    dataStepFunctionWidgets: (TextWidget | SingleValueWidget)[];
}

/**
 * Creates the metrics and CloudWatch Dashboard for the application.
 */
export class DashboardStack extends Stack {
    /**
     * @param {Construct} scope
     * @param {string} id
     * @param {DashboardStackProps} props
     */
    constructor(scope: Construct, id: string, props: DashboardStackProps) {
        super(scope, id, props);

        const {
            svcName = 'ToolsDemo',
            functions, colourTable, demoApi, dataStepFunctionWidgets,
        } = props;

        // CloudWatch Log Insights =============================================
        // These appear as saved queries in Log Insights

        // All of the function log groups
        const logGroups = functions.map((fnc) => fnc.logGroup);

        // WARN query
        new QueryDefinition(this, 'WarnLevel', {
            queryDefinitionName: `${svcName}_WarnLevel`,
            queryString: new QueryString({
                fields: ['@timestamp', '@message'],
                sort: '@timestamp desc',
                limit: 20,
                filterStatements: ['level = "WARN"'],
            }),
            logGroups,
        });

        // ERROR query
        new QueryDefinition(this, 'ErrorLevel', {
            queryDefinitionName: `${svcName}_ErrorLevel`,
            queryString: new QueryString({
                fields: ['@timestamp', '@message'],
                sort: '@timestamp desc',
                limit: 20,
                filterStatements: ['level = "ERROR" or @message like /Uncaught Exception.*/'],
            }),
            logGroups,
        });

        // WARN query with correlationId filter
        new QueryDefinition(this, 'WarnLevelCorrelationId', {
            queryDefinitionName: `${svcName}_WarnLevel_CorrelationId`,
            queryString: new QueryString({
                fields: ['@timestamp', '@message'],
                sort: '@timestamp desc',
                limit: 20,
                filterStatements: ['level = "WARN" and correlationId = "enter_id"'],
            }),
            logGroups,
        });

        // ERROR query with correlationId filter
        new QueryDefinition(this, 'ErrorLevelCorrelationId', {
            queryDefinitionName: `${svcName}_ErrorLevel_CorrelationId`,
            queryString: new QueryString({
                fields: ['@timestamp', '@message'],
                sort: '@timestamp desc',
                limit: 20,
                filterStatements: ['level = "ERROR" and correlationId = "enter_id"'],
            }),
            logGroups,
        });

        // X-Ray Group ===========================================================
        // Filter the Service Map and Traces in X-Ray
        new CfnGroup(this, 'ServiceGroup', {
            filterExpression: `annotation.Service = "${svcName.toUpperCase()}"`,
            groupName: svcName,
            insightsConfiguration: {
                insightsEnabled: true,
                notificationsEnabled: false,
            },
        });

        // CloudWatch Dashboard ==================================================
        const metricsSvcName = svcName.toUpperCase();
        const dashboard = new Dashboard(this, 'DemoDashboard', {
            dashboardName: `${svcName}_Dashboard`,
        });
        // Service Stats from custom metrics
        const header = new TextWidget({
            markdown: `## ${svcName} Results`,
            width: 24,
            height: 1,
        });
        const colourWidget = new GraphWidget({
            title: 'Colour Selections',
            width: 12,
            height: 6,
            view: GraphWidgetView.BAR,
            stacked: true,
            setPeriodToTimeRange: true,
            legendPosition: LegendPosition.HIDDEN,
            left: [
                new Metric({
                    metricName: 'RED',
                    namespace: 'DemoNamespace',
                    label: 'Red',
                    dimensionsMap: {
                        service: metricsSvcName,
                        feature: 'colourPicker',
                    },
                    statistic: 'sum',
                    color: Color.RED,
                }),
                new Metric({
                    metricName: 'BLUE',
                    namespace: 'DemoNamespace',
                    label: 'Blue',
                    dimensionsMap: {
                        service: metricsSvcName,
                        feature: 'colourPicker',
                    },
                    statistic: 'sum',
                    color: Color.BLUE,
                }),
                new Metric({
                    metricName: 'PURPLE',
                    namespace: 'DemoNamespace',
                    label: 'Purple',
                    dimensionsMap: {
                        service: metricsSvcName,
                        feature: 'colourPicker',
                    },
                    statistic: 'sum',
                    color: Color.PURPLE,
                }),
                new Metric({
                    metricName: 'BLACK',
                    namespace: 'DemoNamespace',
                    label: 'Black',
                    dimensionsMap: {
                        service: metricsSvcName,
                        feature: 'colourPicker',
                    },
                    statistic: 'sum',
                    color: '#000000',
                }),
            ],
        });
        dashboard.addWidgets(new Row(header, colourWidget));

        // DynamoDb Table Widgets from CustomTable construct
        dashboard.addWidgets(new Row(...colourTable.dashboardWidgets));

        // API Gateway Widgets from CustomApi construct
        dashboard.addWidgets(new Row(...demoApi.dashboardWidgets));

        // Function Stats from CustomFunction construct
        const rows = functions.map((fnc) => new Row(...fnc.dashboardWidgets));
        rows.forEach((row) => {
            dashboard.addWidgets(row);
        });

        // Demo data StepFunction stats
        dashboard.addWidgets(new Row(...dataStepFunctionWidgets));
    }
}
