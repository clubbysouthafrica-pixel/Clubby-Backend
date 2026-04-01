import {
  AdminGetUserCommand,
  type AdminGetUserCommandOutput,
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  UserNotFoundException
} from "@aws-sdk/client-cognito-identity-provider";
import { createResponse, deconstructEvent } from "./function_helpers";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });

export async function userExists(username: string): Promise<AdminGetUserCommandOutput | null> {
  try {
    return await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: process.env.USER_POOL_ID!,
        Username: username.toLowerCase(),
      })
    );
  } catch (error: any) {
    if (
      error instanceof UserNotFoundException ||
      error?.name === "UserNotFoundException"
    ) {
      return null;
    }

    throw error;
  }
}

export const handler = async (event: any) => {

  const { origin, body, query_string_params } = deconstructEvent(event, false);

  try {

    if (body?.username == null) {
      return createResponse(400, { message: 'Username required.' }, origin);
    }

    const username = body.username.toLowerCase();

    const existingUser = await userExists(username);

    if (existingUser == null) {
      return createResponse(404, { message: 'User not found.' }, origin);
    }

    if (existingUser.UserStatus === 'FORCE_CHANGE_PASSWORD') {
      return createResponse(
        411,
        {
          message: 'This account is still using temporary credentials. Please sign in using the temporary credentials provided in the email with the subject "Your Clubby Account Has Been Created". If you cannot locate that email, you may request a new one using the button below.'
        },
        origin
      );
    }

    const command = new ForgotPasswordCommand({
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: username,
    });

    const response = await cognitoClient.send(command);
    console.log('Forgot password successful: ', response);

    return createResponse(
      200,
      {
        message: `Password reset code sent to ${username}.`,
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
