import { Construct } from 'constructs';
import { Architecture, Code, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';

interface MSC_LambdaLayerProps {
    code: string;
    runtime?: Runtime[];
    architecture?: Architecture[];
    description?: string
}

export class MSC_LambdaLayer extends LayerVersion {
    constructor(scope: Construct, id: string, props: MSC_LambdaLayerProps) {

        super(scope, `${id}-LambdaLayer`, {
            code: Code.fromAsset(`./layer-code/${props.code}`),
            compatibleRuntimes: props.runtime ?? [Runtime.NODEJS_20_X],
            compatibleArchitectures: props.architecture ?? [Architecture.X86_64],
            description: props.description ?? undefined
        });
    }
}
