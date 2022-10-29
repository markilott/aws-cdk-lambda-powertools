import { Construct } from 'constructs';
import { AssetCode, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';

type ToolsLayerProps = {
    svcName: string,
};

/**
 * Create a Lambda layer with the PowerTools npm modules.
 */
export class ToolsLayer extends Construct {
    /** Lambda Layer */
    layerVersion: LayerVersion;

    /**
     * @param {Construct} scope
     * @param {string} id
     * @param {ToolsLayerProps} props
     */
    constructor(scope: Construct, id: string, props: ToolsLayerProps) {
        super(scope, id);

        const { svcName } = props;

        this.layerVersion = new LayerVersion(this, `${svcName}ToolsLayer`, {
            compatibleRuntimes: [Runtime.NODEJS_16_X],
            code: AssetCode.fromAsset(`${__dirname}/../../layers/powertools`),
            description: `${svcName} Tools Shared Layer`,
            layerVersionName: `${svcName}-tools`,
        });
    }
}
