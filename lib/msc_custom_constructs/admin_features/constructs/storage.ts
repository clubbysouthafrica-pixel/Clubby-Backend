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

interface MSC_StorageConstructProps {
  api_gateway: MSC_APIGateway;
  token_authorizer: TokenAuthorizer;
  storage_table: MSC_Table;
  club_table: MSC_Table;
  layers: {
    jwt_layer: MSC_LambdaLayer;
  };
}

export class MSC_StorageConstruct extends Construct {
  constructor(scope: Construct, id: string, props: MSC_StorageConstructProps) {
    super(scope, id);

    const create_storage = new MSC_Lambda(this, `${id}-CreateStorage`, {
      code: "admin_features/storage/create_storage",
      envVariables: {
        STORAGE_TABLE: props.storage_table.tableName,
      },
      permissions: {
        [props.storage_table.tableArn]: [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
        ],
      },
      layers: [props.layers.jwt_layer],
    });

    const list_storage = new MSC_Lambda(this, `${id}-ListStorage`, {
      code: "admin_features/storage/list_storage",
      envVariables: {
        STORAGE_TABLE: props.storage_table.tableName,
        CLUB_TABLE_NAME: props.club_table.tableName,
      },
      permissions: {
        [props.storage_table.tableArn]: ["dynamodb:Query"],
        [props.club_table.tableArn]: ["dynamodb:GetItem"],
      },
      layers: [props.layers.jwt_layer],
    });

    const remove_storage = new MSC_Lambda(this, `${id}-RemoveStorage`, {
      code: "admin_features/storage/remove_storage",
      envVariables: {
        STORAGE_TABLE: props.storage_table.tableName,
        CLUB_TABLE_NAME: props.club_table.tableName,
      },
      permissions: {
        [props.storage_table.tableArn]: ["dynamodb:DeleteItem"],
        [props.club_table.tableArn]: ["dynamodb:GetItem"],
      },
      layers: [props.layers.jwt_layer],
    });

    // Use existing 'storage' resource if already added by another construct
    const existingStorage = props.api_gateway.root.getResource("storage");
    const storage_resource = existingStorage
      ? existingStorage
      : props.api_gateway.root.addResource("storage");

    const create_storage_resource =
      storage_resource.addResource("createStorage");
    const list_storage_resource = storage_resource.addResource("listStorage");
    const remove_storage_resource =
      storage_resource.addResource("removeStorage");

    const methodOptions: MethodOptions = {
      methodResponses: [],
      authorizationType: AuthorizationType.CUSTOM,
      authorizer: props.token_authorizer,
    };

    addCorsEnabledMethod(
      create_storage_resource,
      create_storage,
      methodOptions,
      undefined,
      "POST",
    );
    addCorsEnabledMethod(
      list_storage_resource,
      list_storage,
      methodOptions,
      undefined,
      "GET",
    );
    addCorsEnabledMethod(
      remove_storage_resource,
      remove_storage,
      methodOptions,
      undefined,
      "DELETE",
    );
  }
}
