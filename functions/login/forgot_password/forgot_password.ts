import {
  CognitoIdentityProviderClient,
  ForgotPasswordCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { createResponse, deconstructEvent } from "./function_helpers";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });

export const handler = async (event: any) => {

  const { origin, body, query_string_params } = deconstructEvent(event, false);

  try {

    if (body?.username == null) {
      return createResponse(400, { message: 'Username required.' }, origin);
    }

    const command = new ForgotPasswordCommand({
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: body.username,
    });

    const response = await cognitoClient.send(command);
    console.log('Forgot password successful: ', response);

    return createResponse(
      200,
      {
        message: "Password reset code sent.",
        deliveryMedium: response.CodeDeliveryDetails?.DeliveryMedium,
        destination: response.CodeDeliveryDetails?.Destination
      },
      origin
    );

  } catch (error: any) {
    console.error('Forgot password error: ', error);
    const message = error?.message || "Internal Server Error";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    return createResponse(statusCode, { message }, origin);
  }
};
