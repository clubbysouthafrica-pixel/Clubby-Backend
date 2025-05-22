import {
  CognitoIdentityProviderClient,
  SignUpCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { createResponse } from "./helpers";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });
const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export const handler = async (event: any) => {
  console.log(`EVENT @ ${new Date()}: `, event);
  const origin = event.headers.origin;
  console.log(`Called by origin: ${origin}`)

  try {
    const body = JSON.parse(event.body);

    if (process.env.ADMIN_TOKEN != null) {
      if (body?.admin_token == null || body.admin_token !== process.env.ADMIN_TOKEN) {
        return createResponse(400, { message: 'Not authorized for admin signup.' }, origin);
      }
    }

    if (body?.username == null || body?.password == null) {
      return createResponse(400, { message: 'Username and password required.' }, origin);
    }

    const cognitoCommand = new SignUpCommand({
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: body.username,
      Password: body.password,
      UserAttributes: [
        { Name: 'email', Value: body.username },
      ],
    });

    const cognitoResponse: any = await cognitoClient.send(cognitoCommand);
    console.log('Signup successful:', cognitoResponse);

    const dynamodbCommand = new PutItemCommand({
      TableName: process.env.USERS_TABLE_NAME,
      Item: {
        "user_type": { S: process.env.USER_TYPE as string },
        "user_id": { S: body.username },
        "onboarded": { BOOL: false }
      }
    });
    const dynamodbResponse = await dynamodbClient.send(dynamodbCommand);
    console.log('User added to table successfully: ', dynamodbResponse)

    if (process.env.ADMIN_TOKEN != null) {
      return createResponse(
        200,
        {
          message: "Sign up successful. Remember to authenticate the admin in Cognito.",
          deliveryDetails: cognitoResponse.CodeDeliveryDetails
        },
        origin
      );
    }

    return createResponse(
      200,
      {
        message: "Sign up successful. Please check your email for a verification code.",
        deliveryDetails: cognitoResponse.CodeDeliveryDetails
      },
      origin
    );
  } catch (error: any) {
    console.error('Signup error:', error);
    const message = error?.message || "Internal Server Error";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    return createResponse(statusCode, { message }, origin);
  }
};
