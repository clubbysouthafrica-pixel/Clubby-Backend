import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Bucket, MSC_Table, MSC_LambdaLayer} from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_ImagesConstructProps {
    api_gateway: MSC_APIGateway;
    layers: {
            jwt_layer: MSC_LambdaLayer;
        };
    club_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    image_bucket: MSC_Bucket;
}

export class MSC_ImagesConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ImagesConstructProps) {
        super(scope, id);

        const generate_profile_presigned_url = new MSC_Lambda(this, `${id}-ProfilePresignedURL`, {
            code: "member/images/generate_profile_presigned_url",
            envVariables: {
                IMAGE_BUCKET_NAME: props.image_bucket.bucketName
            },
            layers: [props.layers.jwt_layer]
        });
        props.image_bucket.grantPut(generate_profile_presigned_url);
        props.image_bucket.grantRead(generate_profile_presigned_url);

        const images_resource = props.api_gateway.root.addResource("images");

        const generate_profile_presigned_url_resource = images_resource.addResource("presignedProfileUrl");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }
        
        addCorsEnabledMethod(generate_profile_presigned_url_resource, generate_profile_presigned_url, methodOptions, undefined, "GET");
    }
}
