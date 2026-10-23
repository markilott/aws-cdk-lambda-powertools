import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import middy from '@middy/core';

const tableName = process.env.TABLE_NAME;

/** Instantiate the PowerTools instances */
const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

/** Wrap the AWS client in the tracer */
const docClient = DynamoDBDocumentClient.from(tracer.captureAWSv3Client(new DynamoDBClient({
    region: process.env.AWS_REGION,
})));

/** Event Props */
type EventProps = {
    context: {
        requestId: string,
        httpMethod: string,
    },
    params: {
        itemId: string,
        correlationId?: string,
        throwError?: boolean,
    }
};

/** Write Data Result */
type FunctionResult = {
    success: boolean,
    requestId: string,
    correlationId: string,
};

/**
 * Delete a record from the item table
 */
const lambdaHandler = async (event: EventProps): Promise<FunctionResult> => {
    const { params, context } = event;
    const { requestId, httpMethod } = context;
    const {
        itemId,
        correlationId = requestId,
        throwError,
    } = params;
    let statusCode = 500;
    const errorMessage = 'Internal Handler Error';

    /**
     * Add a correlationId (tracking code).
     * correlationId will be included with all logs, metrics and traces
     * and will be searchable/filterable in the CloudWatch console.
     */
    tracer.putAnnotation('correlationId', correlationId);
    logger.appendKeys({ correlationId });
    metrics.addMetadata('correlationId', correlationId);
    try {
        if (!tableName) { throw new Error('Missing required env variables'); }

        // Simulate a 500 error
        if (throwError) { throw new Error('You asked me to throw an error'); }

        // Update type
        if (httpMethod !== 'DELETE') { throw new Error('Invalid method'); }

        if (!itemId) {
            statusCode = 400;
            throw new Error('itemId is required');
        }

        // Create/update the record in DynamoDb
        try {
            await docClient.send(new DeleteCommand({
                TableName: tableName,
                Key: { ItemId: itemId },
            }));
        } catch (err) {
            if (err instanceof Error && err.name === 'ResourceNotFoundException') {
                statusCode = 400;
                throw new Error(`${itemId} does not exist`, { cause: err });
            }
            throw err;
        }
        logger.debug(`Deleted Item: ${itemId}`);

        return {
            success: true,
            requestId,
            correlationId,
        };
    } catch (err) {
        if (!(err instanceof Error)) { throw err; }

        /** Adding the function_name dimension to match the default used in the PowerTools cold start metric */
        metrics.addDimension('function_name', process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown');

        if (statusCode === 400) {
            /** Add WARN level log and metric count for client errors */
            logger.warn(errorMessage, { data: params });
            metrics.addMetric('WARNING', MetricUnit.Count, 1);
        } else {
            /** Add ERROR level log and metric count for internal errors */
            logger.error(err.message, err);
            metrics.addMetric('ERROR', MetricUnit.Count, 1);
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

/** Wrap the handler with middy and inject PowerTools */
export const handler = middy(lambdaHandler)
    .use(captureLambdaHandler(tracer))
    /** resetKeys resets the correlationId for each invocation */
    .use(injectLambdaContext(logger, { resetKeys: true }))
    .use(logMetrics(metrics, { captureColdStartMetric: true }));
