import { Construct } from 'constructs';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';

interface MSC_TablePros {
    partitionKey: Record<string, AttributeType>;
    sortKey?: Record<string, AttributeType>;
    billingMode?: BillingMode;
}

export class MSC_Table extends Table {
  constructor(scope: Construct, id: string, props: MSC_TablePros) {

    const partitionKeyName = Object.keys(props.partitionKey)[0]
    const sortKeyName = props.sortKey ? Object.keys(props.sortKey)[0] : undefined;

    super(scope, `${id}-Table`, {
      tableName: `${id}-Table`,
      partitionKey: { name: partitionKeyName, type: props.partitionKey[partitionKeyName] },
      sortKey: sortKeyName ? { name: sortKeyName, type: props.sortKey![sortKeyName] } : undefined,
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}