import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import middy from '@middy/core';
import { DateTime } from 'luxon';
import { ItemAttributes } from 'types';

const tableName = process.env.TABLE_NAME;
const logExpiry = Number(process.env.LOG_EXPIRY_IN_DAYS) || 30;

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
        itemId?: string,
        isRed?: boolean,
        isBlue?: boolean,
        surpriseMe?: boolean,
        correlationId?: string,
        throwError?: boolean,
    }
};

/** Write Data Result */
type FunctionResult = {
    success: boolean,
    requestId: string,
    itemId: string,
    correlationId: string,
    colour: string,
};

/**
 * Write a record to the DynamoDb table and create CloudWatch Logs.
 * This function is used for the Create and Update methods.
 */
const lambdaHandler = async (event: EventProps): Promise<FunctionResult> => {
    const { params, context } = event;
    const { requestId, httpMethod } = context;
    const {
        surpriseMe,
        correlationId = requestId,
    } = params;
    let statusCode = 500;
    let errorMessage = 'Internal Handler Error';

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
        const throwError = (surpriseMe) ? Math.random() < 0.1 : params.throwError;
        if (throwError) { throw new Error('You asked me to throw an error'); }

        // Update type
        if (httpMethod !== 'POST' && httpMethod !== 'PUT') { throw new Error('Invalid method'); }
        const createRecord = (httpMethod === 'POST');

        // New item or update
        if (!createRecord && !params.itemId) {
            statusCode = 400;
            throw new Error('itemId is required for an update');
        }
        if (createRecord && params.itemId) {
            statusCode = 400;
            throw new Error('Do not specify itemId when creating a new item');
        }
        const itemId = params.itemId || requestId;

        // Set random colours if requested
        const isRed = (surpriseMe) ? Math.random() < 0.5 : params.isRed;
        const isBlue = (surpriseMe) ? Math.random() < 0.5 : params.isBlue;
        let colour = (isRed) ? 'RED' : 'BLUE';

        // Check for valid colour
        if (!isRed && !isBlue) {
            errorMessage = 'Missing colour choice';
            colour = 'BLACK';
            statusCode = 400;
        }
        if (isRed && isBlue) {
            errorMessage = 'Invalid colour choices';
            colour = 'PURPLE';
            statusCode = 400;
        }
        logger.info('Colour', { data: colour });

        /**
         * Write the item colour to a custom metric.
         * This metric will have the "feature" dimension in addition to defaults.
         */
        const colourMetric = metrics.singleMetric();
        colourMetric.addDimension('feature', 'colourPicker');
        colourMetric.addMetric(colour, MetricUnit.Count, 1);

        // Throw an error for logging warnings
        if (colour === 'BLACK' || colour === 'PURPLE') { throw new Error(errorMessage); }

        // DynamoDb record
        const item: ItemAttributes = {
            ItemId: itemId,
            UpdateTime: DateTime.now().toISO() ?? '',
            CorrelationId: correlationId,
            Colour: colour,
            ExpiryTime: DateTime.now().plus({ days: logExpiry }).toUnixInteger(),
        };
        logger.debug('DynamoDb Item', { data: item });

        // Create/update the record in DynamoDb
        try {
            await docClient.send(new PutCommand({
                TableName: tableName,
                Item: item,
                ConditionExpression: (createRecord) ? 'attribute_not_exists(ItemId)' : 'attribute_exists(ItemId)',
            }));
        } catch (err) {
            if (err instanceof Error) {
                if (!createRecord && (err.name === 'ResourceNotFoundException' || err.name === 'ConditionalCheckFailedException')) {
                    statusCode = 400;
                    throw new Error(`${itemId} does not exist`, { cause: err });
                }
                if (err.name === 'ConditionalCheckFailedException') {
                    statusCode = 400;
                    throw new Error(`${itemId} already exists`, { cause: err });
                }
            }
            throw err;
        }

        return {
            success: true,
            colour,
            requestId,
            itemId,
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
