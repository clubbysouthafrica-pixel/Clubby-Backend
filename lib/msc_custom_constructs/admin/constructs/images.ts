import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Bucket} from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_ImagesConstructProps {
    api_gateway: MSC_APIGateway;
    layers: MSC_Layers;
    token_authorizer: TokenAuthorizer;
    image_bucket: MSC_Bucket;
}

export class MSC_ImagesConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ImagesConstructProps) {
        super(scope, id);

        const upload_cover_img = new MSC_Lambda(this, `${id}-UploadCover`, {
            code: "admin/images/upload_cover",
            envVariables: {
                IMAGE_BUCKET_NAME: props.image_bucket.bucketName
            },
            permissions: {
                [`${props.image_bucket.bucketArn}/*`]: [
                    "s3:PutObject"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const images_resource = props.api_gateway.root.addResource("images");

        const upload_cover_img_resource = images_resource.addResource("uploadCover");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(upload_cover_img_resource, upload_cover_img, methodOptions, undefined, "PUT");
    }
}
