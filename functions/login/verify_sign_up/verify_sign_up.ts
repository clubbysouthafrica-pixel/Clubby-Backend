import {
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { createResponse, deconstructEvent } from "./function_helpers";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });

export const handler = async (event: any) => {
  
  const { origin, body, query_string_params } = deconstructEvent(event, false);

  try {

    if (body?.username == null || body?.confirmation_code == null) {
      return createResponse(400, { message: 'Username and confirmation code required.' }, origin);
    }

    const command = new ConfirmSignUpCommand({
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: body.username,
      ConfirmationCode: body.confirmation_code
    });

    const response = await cognitoClient.send(command);
    console.log('Verification successful:', response);

    return createResponse(200, { message: "Success" }, origin);
  } catch (error: any) {
    console.error('Verification error:', error);
    const message = error?.message || "Internal Server Error";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    return createResponse(statusCode, { message }, origin);
  }
};
