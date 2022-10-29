import { AWSError, DynamoDB } from 'aws-sdk';
import { Logger, injectLambdaContext } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics';
import { Tracer, captureLambdaHandler } from '@aws-lambda-powertools/tracer';
import middy from '@middy/core';

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
            await docClient.delete({
                TableName: tableName,
                Key: { ItemId: itemId },
            }).promise();
        } catch (err) {
            const error = err as AWSError;
            if (error.name === 'ResourceNotFoundException') {
                statusCode = 400;
                throw new Error(`${itemId} does not exist`);
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
