import { Construct } from "constructs";
import {
  MSC_Lambda,
  MSC_APIGateway,
  MSC_Table,
  MSC_LambdaLayer,
} from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import {
  AuthorizationType,
  MethodOptions,
  TokenAuthorizer,
} from "aws-cdk-lib/aws-apigateway";

interface MSC_StorageRequestConstructProps {
  api_gateway: MSC_APIGateway;
  token_authorizer: TokenAuthorizer;
  storage_table: MSC_Table;
  storage_request_table: MSC_Table;
  orders_table: MSC_Table;
  transactions_table: MSC_Table;
  club_table: MSC_Table;
  layers: {
    jwt_layer: MSC_LambdaLayer;
  };
}

export class MSC_StorageRequestConstruct extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: MSC_StorageRequestConstructProps,
  ) {
    super(scope, id);

    const create_storage_request = new MSC_Lambda(
      this,
      `${id}-CreateStorageRequest`,
      {
        code: "member/storage/create_storage_request",
        envVariables: {
          STORAGE_TABLE_NAME: props.storage_table.tableName,
          STORAGE_REQUESTS_TABLE: props.storage_request_table.tableName,
          TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
          ORDER_TABLE_NAME: props.orders_table.tableName,
        },
        permissions: {
          [props.storage_request_table.tableArn]: ["dynamodb:PutItem"],
          [props.storage_table.tableArn]: ["dynamodb:PutItem", "dynamodb:UpdateItem"],
          [props.orders_table.tableArn]: ["dynamodb:PutItem"],
          [props.transactions_table.tableArn]: ["dynamodb:PutItem"],
          [props.club_table.tableArn]: ["dynamodb:GetItem"],
        },
        layers: [props.layers.jwt_layer],
      },
    );

    // Use existing 'storage' resource if already added by another construct
    const existingStorage = props.api_gateway.root.getResource("storage");
    const storage_resource = existingStorage
      ? existingStorage
      : props.api_gateway.root.addResource("storage");

    const create_storage_resource = storage_resource.addResource(
      "createStorageRequest",
    );

    const methodOptions: MethodOptions = {
      methodResponses: [],
      authorizationType: AuthorizationType.CUSTOM,
      authorizer: props.token_authorizer,
    };

    addCorsEnabledMethod(
      create_storage_resource,
      create_storage_request,
      methodOptions,
      undefined,
      "POST",
    );
  }
}
