import { StackProps } from 'aws-cdk-lib';

/** Log Levels */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/** DynamoDb Item Attributes */
export type ItemAttributes = {
    /** Primary Key */
    ItemId: string,
    /** Item Colour */
    Colour: string,
    /** Correlation Id for Logging */
    CorrelationId: string,
    /** Last Updated Time (ISO 8601 String) */
    UpdateTime: string,
    /** Expiry Time (TTL) */
    ExpiryTime: number,
};

/**
 * Application Stack Props.
 * All are optional.
 */
export interface DemoStackProps extends StackProps {
    /**
     * Service Name for use in resource names,
     * and in the log and metric namespaces.
     * @default 'ToolsDemo''
     */
    svcName?: string,

    /**
     * Function Defaults.
     */
    functionOptions?: {
        /**
         * Debug Level.
         * @default 'DEBUG'
         */
        logLevel?: LogLevel,

        /**
         * Log Lambda Event.
         * @default true,
         */
        logEvent?: boolean,
    }
}
