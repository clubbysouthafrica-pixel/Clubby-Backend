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
  storage_requests_table: MSC_Table;
  storage_table: MSC_Table;
  club_table: MSC_Table;
  layers: {
    jwt_layer: MSC_LambdaLayer;
  };
  transactions_table: MSC_Table;
}

export class MSC_StorageRequestConstruct extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: MSC_StorageRequestConstructProps,
  ) {
    super(scope, id);

    const update_storage_request = new MSC_Lambda(
      this,
      `${id}-UpdateStorageRequest`,
      {
        code: "admin_features/storage/update_storage_request",
        envVariables: {
          STORAGE_TABLE_NAME: props.storage_table.tableName,
          STORAGE_REQUESTS_TABLE: props.storage_requests_table.tableName,
          TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
        },
        permissions: {
          [props.transactions_table.tableArn]: ["dynamodb:UpdateItem"],
          [props.storage_requests_table.tableArn]: [
            "dynamodb:PutItem",
            "dynamodb:GetItem",
            "dynamodb:UpdateItem",
          ],
          [props.storage_table.tableArn]: [
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
          ],
        },
        layers: [props.layers.jwt_layer],
      },
    );

    const list_storage_requests = new MSC_Lambda(
      this,
      `${id}-ListStorageRequests`,
      {
        code: "admin_features/storage/list_storage_requests",
        envVariables: {
          STORAGE_REQUESTS_TABLE: props.storage_requests_table.tableName,
          CLUB_TABLE_NAME: props.club_table.tableName,
        },
        permissions: {
          [props.storage_requests_table.tableArn]: [
            "dynamodb:Query",
            "dynamodb:Scan",
          ],
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

    const update_storage_request_resource = storage_resource.addResource(
      "updateStorageRequest",
    );
    const list_storage_requests_resource = storage_resource.addResource(
      "listStorageRequests",
    );

    const methodOptions: MethodOptions = {
      methodResponses: [],
      authorizationType: AuthorizationType.CUSTOM,
      authorizer: props.token_authorizer,
    };

    addCorsEnabledMethod(
      update_storage_request_resource,
      update_storage_request,
      methodOptions,
      undefined,
      "PUT",
    );
    addCorsEnabledMethod(
      list_storage_requests_resource,
      list_storage_requests,
      methodOptions,
      undefined,
      "GET",
    );
  }
}
