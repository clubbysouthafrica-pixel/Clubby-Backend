import { Construct } from "constructs";
import { MSC_Lambda, MSC_Queue, MSC_Table } from "../../../msc_service_constructs";
import { TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_BillingConstructProps {
    billing_queue: MSC_Queue;
    layers: MSC_Layers;
}

export class MSC_BillingConstruct extends Construct {
    public readonly token_authorizer: TokenAuthorizer;
    constructor(scope: Construct, id: string, props: MSC_BillingConstructProps) {
        super(scope, id);

        const billing_table = new MSC_Table(this, id, {
            partitionKey: { "club_account_id": "STRING" },
        });

        // const add_club_to_billing = new MSC_Lambda(this, `${id}-AddClubBilling`, {
        //     code: "billing/add_club_billing",
        //     envVariables: {
        //         BILLING_TABLE_NAME: billing_table.tableName
        //     },
        //     permissions: {
        //         [billing_table.tableArn]: [
        //             "dynamodb:PutItem"
        //         ]
        //     }
        // });

        const update_billing = new MSC_Lambda(this, `${id}-UpdateBilling`, {
            code: "billing/update_billing",
            envVariables: {
                BILLING_TABLE_NAME: billing_table.tableName
            },
            permissions: {
                [billing_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });
        update_billing.addEventSource(new SqsEventSource(props.billing_queue, {
            batchSize: 1
        }));
    }
}
