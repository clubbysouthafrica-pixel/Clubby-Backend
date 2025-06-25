import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway, MSC_Queue } from '../../msc_service_constructs';
import {
    MSC_InternalInfraBillingConstruct,
    MSC_InternalInfraClubConstruct,
    MSC_InternalInfraClubAdminConstruct
} from "./constructs";
import { MSC_Table } from "../../msc_service_constructs";
import { MSC_Layers } from '../lambda_layers';

export interface MSC_InternalInfraStackProps extends StackProps {
    club_table: MSC_Table;
    users_table: MSC_Table;
    club_admin_table: MSC_Table;
    billing_queue: MSC_Queue;
    layers: MSC_Layers;
}

export class MSC_InternalInfraStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_InternalInfraStackProps) {
        super(scope, id, props);

        const api_gateway = new MSC_APIGateway(this, id, {
            domain: "internal-infra",
            cert_arn: process.env.INTERNAL_INFRA_CERT_ARN as string
        });


        const internal_infra_billing_construct = new MSC_InternalInfraBillingConstruct(this, `${id}-Billing`, {
            billing_queue: props.billing_queue,
            layers: props.layers
        });

        new MSC_InternalInfraClubConstruct(this, `${id}-Club`, {
            api_gateway: api_gateway,
            club_table: props.club_table,
            billing_table: internal_infra_billing_construct.billing_table,
            layers: props.layers
        });

        new MSC_InternalInfraClubAdminConstruct(this, `${id}-ClubAdmin`, {
            api_gateway: api_gateway,
            club_admin_table: props.club_admin_table,
            club_table: props.club_table,
            users_table: props.users_table,
            layers: props.layers
        });
    }
}