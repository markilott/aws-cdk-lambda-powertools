import { DynamoDB } from 'aws-sdk';
import { Logger, injectLambdaContext } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics';
import { Tracer, captureLambdaHandler } from '@aws-lambda-powertools/tracer';
import middy from '@middy/core';
import { ItemAttributes } from 'types';

const tableName = process.env.TABLE_NAME;

const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

const docClient = tracer.captureAWSClient(new DynamoDB.DocumentClient({
    region: process.env.AWS_REGION,
}));

/** Event Props */
type EventProps = {
    context: {
        requestId: string,
    },
    params: {
        itemId?: string,
        correlationId?: string,
        throwError?: boolean,
    }
};

/** Write Data Result */
type FunctionResult = {
    success: boolean,
    requestId: string,
    correlationId: string,
    data: {
        count: number,
        items: ItemAttributes[]
    },
};

/**
 * Delete a record from the item table
 */
const lambdaHandler = async (event: EventProps): Promise<FunctionResult> => {
    const { params, context } = event;
    const { requestId } = context;
    const {
        itemId,
        correlationId,
        throwError,
    } = params;
    let statusCode = 500;
    const errorMessage = 'Internal Handler Error';

    if (correlationId) {
        tracer.putAnnotation('correlationId', correlationId);
        logger.appendKeys({ correlationId });
        metrics.addMetadata('correlationId', correlationId);
    }
    try {
        if (!tableName) { throw new Error('Missing required env variables'); }

        // Simulate a 500 error
        if (throwError) { throw new Error('You asked me to throw an error'); }

        // Get records from DynamoDb
        const allItems = (!correlationId)
            // Usually not a good idea to scan but we are keeping this simple
            ? (await docClient.scan({
                TableName: tableName,
            }).promise()).Items as ItemAttributes[]
            // Or filter by correlationId
            : (await docClient.query({
                TableName: tableName,
                IndexName: 'CorrelationId',
                KeyConditionExpression: 'CorrelationId = :id',
                ExpressionAttributeValues: {
                    ':id': correlationId,
                },
            }).promise()).Items as ItemAttributes[];
        if (!allItems?.length) {
            statusCode = 400;
            throw new Error('No items found');
        }
        // Return all records or the specific itemId
        const items = (itemId)
            ? allItems.filter((item) => item.ItemId === itemId)
            : allItems;

        return {
            success: true,
            requestId,
            correlationId: correlationId || '',
            data: {
                count: items.length,
                items,
            },
        };
    } catch (err) {
        if (!(err instanceof Error)) { throw err; }
        metrics.addDimension('function_name', process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown');
        if (statusCode === 400) {
            logger.warn(errorMessage, { data: params });
            metrics.addMetric('WARNING', MetricUnits.Count, 1);
        } else {
            logger.error(err.message, err);
            metrics.addMetric('ERROR', MetricUnits.Count, 1);
        }
        // Set error message string for API Gateway to parse
        err.message = JSON.stringify({
            statusCode,
            message: err.message,
            requestId,
        });
        throw err;
    }
};

// PowerTools handler
export const handler = middy(lambdaHandler)
    .use(captureLambdaHandler(tracer))
    .use(injectLambdaContext(logger, { clearState: true }))
    .use(logMetrics(metrics, { captureColdStartMetric: true }));
