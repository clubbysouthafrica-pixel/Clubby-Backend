import { Construct } from 'constructs';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
import { marshall } from '@aws-sdk/util-dynamodb';

interface MSC_GSI {
    indexName: string;
    partitionKey: { name: string, type: AttributeType };
    sortKey?: { name: string, type: AttributeType };
}

interface MSC_TablePros {
    partitionKey: Record<string, "STRING" | "NUMBER">;
    sortKey?: Record<string, "STRING" | "NUMBER">;
    billingMode?: BillingMode;
    removalPolicy?: RemovalPolicy;
    gsi?: MSC_GSI[];
}

export class MSC_Table extends Table {
    constructor(scope: Construct, id: string, props: MSC_TablePros) {

        const partitionKeyName = Object.keys(props.partitionKey)[0];
        const sortKeyName = props.sortKey ? Object.keys(props.sortKey)[0] : undefined;

        const partitionKeyValue = props.partitionKey[partitionKeyName] === "STRING" ?
            AttributeType.STRING : AttributeType.NUMBER;

        let sortKey: { name: string; type: AttributeType } | undefined = undefined;

        if (sortKeyName) {
            const sortKeyValue = props.sortKey![sortKeyName] === "STRING" ?
                AttributeType.STRING : AttributeType.NUMBER;

            sortKey = { name: sortKeyName, type: sortKeyValue };
        }

        super(scope, `${id}-Table`, {
            tableName: `${id}-Table`,
            partitionKey: { name: partitionKeyName, type: partitionKeyValue },
            sortKey: sortKey,
            billingMode: props.billingMode ?? BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.removalPolicy ?? RemovalPolicy.DESTROY,
        });

        props.gsi?.forEach(gsi => {
            this.addGlobalSecondaryIndex({
                indexName: gsi.indexName,
                partitionKey: gsi.partitionKey,
                sortKey: gsi?.sortKey ?? undefined
            })
        })
    }
}
