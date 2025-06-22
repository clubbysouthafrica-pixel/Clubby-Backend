import { Construct } from "constructs";
import { MSC_LambdaLayer } from "../../msc_service_constructs"

interface MSC_LayersProps {}

export class MSC_Layers extends Construct {
    public readonly jwt_layer: MSC_LambdaLayer;
    public readonly jwks_rsa_layer: MSC_LambdaLayer;
    constructor(scope: Construct, id: string, props: MSC_LayersProps) {
        super(scope, `${id}-LambdaLayers`);

        this.jwt_layer = new MSC_LambdaLayer(this, `${id}-JWT`, {
            code: "jwt_code",
            description: "JWT Lambda Layer"
        });

        this.jwks_rsa_layer = new MSC_LambdaLayer(this, `${id}-JWKS`, {
            code: "jwks-rsa_code",
            description: "JKS-RSA Lambda Layer"
        });
    }
}
