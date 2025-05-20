import { Construct } from "constructs";
import { MSC_Table } from "../../msc_service_constructs"

interface MSC_TablesProps {

}

export class MSC_TablesConstruct extends Construct {
    public readonly club_account_table: MSC_Table;
    public readonly users_table: MSC_Table;
    public readonly club_users_table: MSC_Table;
    constructor(scope: Construct, id: string, props: MSC_TablesProps) {
        super(scope, `${id}-Tables`);

        this.club_account_table = new MSC_Table(this, `${id}-ClubAccount`, {
            partitionKey: {"club_name": "STRING"},
            sortKey: {"club_account_id": "STRING"}
        });

        this.users_table = new MSC_Table(this, `${id}-Users`, {
            partitionKey: {"user_type": "STRING"},
            sortKey: {"user_id": "STRING"}
        })

        this.club_users_table = new MSC_Table(this, `${id}-ClubUsers`, {
            partitionKey: {"user_id": "STRING"},
            sortKey: {"club_account_id": "STRING"}
        })
    }
}
