import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway, MSC_Cognito, MSC_LambdaLayer } from '../../msc_service_constructs';
import {
    MSC_InternalInfraClubConstruct,
    MSC_InternalInfraClubAdminConstruct,
    MSC_InternalInfraUserConstruct,
} from "./constructs";
import { MSC_Table } from "../../msc_service_constructs";

export interface MSC_InternalInfraStackProps extends StackProps {
    club_table: MSC_Table;
    users_table: MSC_Table;
    club_admin_table: MSC_Table;
    admin_pool: MSC_Cognito;
}

export class MSC_InternalInfraStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_InternalInfraStackProps) {
        super(scope, id, props);

        const jwt_layer = new MSC_LambdaLayer(this, `${id}-JWT`, {
            code: "jwt_code",
            description: "JWT Lambda Layer"
        });

        const api_gateway = new MSC_APIGateway(this, id, {
            domain: "internal-infra",
            cert_arn: process.env.INTERNAL_INFRA_CERT_ARN as string
        });

        new MSC_InternalInfraUserConstruct(this, `${id}-User`, {
            admin_pool: props.admin_pool,
            api_gateway: api_gateway,
            layers: {
                jwt_layer: jwt_layer
            },
            users_table: props.users_table
        });

        new MSC_InternalInfraClubConstruct(this, `${id}-Club`, {
            api_gateway: api_gateway,
            club_table: props.club_table,
            layers: {
                jwt_layer: jwt_layer
            }
        });

        new MSC_InternalInfraClubAdminConstruct(this, `${id}-ClubAdmin`, {
            api_gateway: api_gateway,
            club_admin_table: props.club_admin_table,
            club_table: props.club_table,
            users_table: props.users_table,
            layers: {
                jwt_layer: jwt_layer
            }
        });
    }
}