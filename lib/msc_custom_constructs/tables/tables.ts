import { AttributeType } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { MSC_Table } from "../../msc_service_constructs"

interface MSC_TablesProps {

}

export class MSC_TablesConstruct extends Construct {
    public readonly users_table: MSC_Table;
    public readonly club_member_table: MSC_Table;
    public readonly club_admin_table: MSC_Table;
    public readonly club_table: MSC_Table;
    public readonly billing_table: MSC_Table;
    public readonly registration_form_table: MSC_Table;
    public readonly transactions_table: MSC_Table;
    public readonly registrations_table: MSC_Table;
    public readonly club_reporting_table: MSC_Table;
    constructor(scope: Construct, id: string, props: MSC_TablesProps) {
        super(scope, `${id}-Tables`);

        this.club_table = new MSC_Table(this, `${id}-Club`, {
            partitionKey: { "club_account_id": "STRING" },
            gsi: [
                {
                    indexName: "ClubFromEmailIndex",
                    partitionKey: { name: "club_from_email", type: AttributeType.STRING }
                },
                {
                    indexName: "ClubNameIndex",
                    partitionKey: { name: "club_name", type: AttributeType.STRING }
                }
            ]
        });

        this.billing_table = new MSC_Table(this, `${id}-MonthlyBilling`, {
            partitionKey: { "club_account_id": "STRING" },
            sortKey: { "year_month": "STRING" },
            gsi: [{
                indexName: "ClubAccountIDIndex",
                partitionKey: { name: "club_account_id", type: AttributeType.STRING }
            }]
        });

        this.users_table = new MSC_Table(this, `${id}-Users`, {
            partitionKey: { "user_type": "STRING" },
            sortKey: { "user_id": "STRING" }
        });

        this.club_member_table = new MSC_Table(this, `${id}-ClubMember`, {
            partitionKey: { "user_id": "STRING" },
            sortKey: { "club_account_id": "STRING" },
            gsi: [{
                indexName: "ClubAccountIDIndex",
                partitionKey: { name: "club_account_id", type: AttributeType.STRING }
            }]
        });

        this.club_admin_table = new MSC_Table(this, `${id}-ClubAdmin`, {
            partitionKey: { "user_id": "STRING" },
            sortKey: { "club_account_id": "STRING" }
        });

        this.registration_form_table = new MSC_Table(this, `${id}-RegistrationForms`, {
            partitionKey: { "club_account_id": "STRING" },
            sortKey: { "field_id": "STRING" }
        });

        this.transactions_table = new MSC_Table(this, `${id}-Transaction`, {
            partitionKey: { "club_account_id": "STRING" },
            sortKey: { "transaction_id": "STRING" },
            gsi: [{
                indexName: "UserIDIndex",
                partitionKey: { name: "club_account_id", type: AttributeType.STRING },
                sortKey: { name: "user_id", type: AttributeType.STRING }
            }]
        })

        this.registrations_table = new MSC_Table(this, `${id}-Registrations`, {
            partitionKey: { "user_id": "STRING" },
            sortKey: { "registration_id": "STRING" },
            gsi: [{
                indexName: "ClubAccountIDIndex",
                partitionKey: { name: "club_account_id", type: AttributeType.STRING }
            }]
        })

        this.club_reporting_table = new MSC_Table(this, `${id}-ClubReporting`, {
            partitionKey: {"club_account_id": "STRING"},
            sortKey: { "year_month": "STRING" }
        })
    }
}
