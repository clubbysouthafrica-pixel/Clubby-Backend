import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { createResponse, deconstructEvent } from "./function_helpers";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });


export const handler = async (event: any) => {
  
  const { origin, body, query_string_params } = deconstructEvent(event);

  try {

    if (body?.username == null || body?.confirmation_code == null || body?.new_password == null) {
      return createResponse(400, { message: 'Username required.' }, origin);
    }

    const command = new ConfirmForgotPasswordCommand({
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: body.username,
      ConfirmationCode: body.confirmation_code,
      Password: body.new_password,
    });

    const response = await cognitoClient.send(command);
    console.log('Reset password successful: ', response);

    return createResponse(
      200,
      {
        message: "Password has been successfully reset.",
      },
      origin
    );

  } catch (error: any) {
    console.error('Password reset error: ', error);
    const message = error?.message || "Internal Server Error";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    return createResponse(statusCode, { message }, origin);
  }
};
