import { LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { LogLevel } from 'types';

/** PowerTools Env Variables */
export type PowerToolsEnvProps = {
    /**
     * Sets service name used for tracing namespace, metrics dimension and structured logging
     * @default 'service_undefined'
     * */
    POWERTOOLS_SERVICE_NAME?: string,
    /**
     * Sets namespace used for metrics
     * @default null
     * */
    POWERTOOLS_METRICS_NAMESPACE?: string,
    /**
     * Explicitly enables/disables tracing
     * @default 'true'
     * */
    POWERTOOLS_TRACE_ENABLED?: 'true' | 'false',
    /**
     * Captures Lambda or method return as metadata.
     * @default 'true'
     * */
    POWERTOOLS_TRACER_CAPTURE_RESPONSE?: 'true' | 'false',
    /**
     * Captures Lambda or method exception as metadata.
     * @default 'true'
     * */
    POWERTOOLS_TRACER_CAPTURE_ERROR?: 'true' | 'false',
    /**
     * Captures HTTP(s) requests as segments.
     * @default 'true'
     * */
    POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS?: 'true' | 'false',
    /**
     * Logs incoming event
     * @default 'false'
     * */
    POWERTOOLS_LOGGER_LOG_EVENT?: 'true' | 'false',
    /**
     * Debug log sampling rate. Zero means all events.
     * @default '0'
     * */
    POWERTOOLS_LOGGER_SAMPLE_RATE?: string,
    /**
     * Sets logging level
     * @default 'INFO'
     * */
    LOG_LEVEL?: LogLevel,
};

export type CustomFunctionProps = {
    /** Parent service name */
    svcName: string,

    /** Function description */
    description?: string,

    /**
     * Function Label.
     * Used in logs and widgets because
     * we generate a less friendly function
     * name by default.
     */
    label?: string,

    /**
     * Code entry point.
     * Eg: `${__dirname}/../lambda/my-function/index.ts`
     */
    entry: string,

    /**
     * Layer containing PowerTools modules.
     * If not included a layer will be created.
     */
    toolsLayer?: LayerVersion,

    /** Add other layers if required */
    layers?: LayerVersion[],

    /**
     * Env variables.
     * PowerTools and env name are included by default.
     */
    environment?: {
        [key: string]: string,
    },

    /** Function props */
    functionProps?: {
        /**
         * Function memory size
         * @default 128
         */
        memorySize?: number,
        /**
         * Function timeout in seconds
         * @default 10
         */
        timeout?: number,
        /**
         * Function log retention in days
         * @default 30
         */
        logRetention?: number,
    },

    /**
     * PowerTools options
     */
    powerToolsOptions?: {
        /**
         * Log level.
         * @default 'INFO'
         */
        logLevel?: LogLevel,
        /**
         * Log the event
         * @default false
         */
        logEvent?: boolean
        /**
         * Metrics Namespace.
         * @default: 'DemoNamespace
         */
        metricsNamespace?: string,
    }
};
