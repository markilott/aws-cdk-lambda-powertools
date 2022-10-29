import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
    Color, SingleValueWidget, TextWidget, IWidget,
} from 'aws-cdk-lib/aws-cloudwatch';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

type CustomDynamoTableProps = {
    /** Table Partition Key */
    partitionKey: string,
    /** Optional Sort Key */
    sortKey?: string,
    /** Table Name */
    tableName: string,
    /** Retain the table on stack deletion */
    retainTable?: boolean,
    /**
     * Enable TTL Field (ExpiryTime)
     * @default true
     */
    enableTtl?: boolean,
};

/**
 * Creates a DynamoDB table with standard settings.
 */
export class CustomDynamoTable extends Construct {
    table: Table;

    /** Dashboard Widgets */
    dashboardWidgets: IWidget[];

    /**
     * @param {Construct} scope
     * @param {string} id
     * @param {CustomDynamoTableProps} props
     */
    constructor(scope: Construct, id: string, props: CustomDynamoTableProps) {
        super(scope, id);

        const {
            partitionKey,
            sortKey,
            tableName,
            retainTable,
            enableTtl = true,
        } = props;

        // DynamoDb Table =====================================
        const table = new Table(this, tableName, {
            tableName,
            billingMode: BillingMode.PAY_PER_REQUEST,
            partitionKey: { name: partitionKey, type: AttributeType.STRING },
            sortKey: (sortKey) ? { name: sortKey, type: AttributeType.STRING } : undefined,
            removalPolicy: (retainTable) ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
            timeToLiveAttribute: (enableTtl) ? 'ExpiryTime' : undefined,
        });
        this.table = table;

        // Metrics ===========================================
        const writeMetric = table.metricConsumedWriteCapacityUnits({
            label: 'Write Capacity Units',
            dimensionsMap: {
                TableName: tableName,
            },
            statistic: 'sum',
            period: Duration.minutes(15),
            color: Color.BROWN,
        });
        const readMetric = table.metricConsumedReadCapacityUnits({
            label: 'Read Capacity Units',
            dimensionsMap: {
                TableName: tableName,
            },
            statistic: 'sum',
            period: Duration.minutes(15),
            color: Color.PURPLE,
        });

        // Dashboard Widgets
        const headerWidget = new TextWidget({
            markdown: `## ${tableName} Metrics`,
            width: 24,
            height: 1,
        });
        const readCapacity = new SingleValueWidget({
            title: `${tableName} Read Capacity`,
            metrics: [readMetric],
            sparkline: true,
            height: 4,
            width: 6,
        });
        const writeCapacity = new SingleValueWidget({
            title: `${tableName} Write Capacity`,
            metrics: [writeMetric],
            sparkline: true,
            height: 4,
            width: 6,
        });
        this.dashboardWidgets = [
            headerWidget,
            readCapacity,
            writeCapacity,
        ];
    }
}
