import { Construct } from "constructs";
import { MSC_Lambda, MSC_Queue, MSC_Table } from "../../../msc_service_constructs";
import { TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_InternalInfraBillingConstructProps {
    billing_queue: MSC_Queue;
    layers: MSC_Layers;
}

export class MSC_InternalInfraBillingConstruct extends Construct {
    public readonly billing_table: MSC_Table;
    constructor(scope: Construct, id: string, props: MSC_InternalInfraBillingConstructProps) {
        super(scope, id);

        this.billing_table = new MSC_Table(this, id, {
            partitionKey: { "club_account_id": "STRING" },
        });

        const update_billing = new MSC_Lambda(this, `${id}-UpdateBilling`, {
            code: "internal_infra/billing/update_billing",
            envVariables: {
                BILLING_TABLE_NAME: this.billing_table.tableName
            },
            permissions: {
                [this.billing_table.tableArn]: [
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
