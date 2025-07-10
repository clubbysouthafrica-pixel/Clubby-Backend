import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand
} from "@aws-sdk/client-cognito-identity-provider";
import jwt from 'jsonwebtoken';
import { createResponse, deconstructEvent, getItem } from "./function_helpers";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });

export const handler = async (event: any) => {

  const { origin, body, query_string_params } = deconstructEvent(event, false);

  try {

    if (body?.username == null || body?.password == null) {
      return createResponse(400, { message: 'Username and password required.' }, origin);
    }

    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.USER_POOL_CLIENT_ID,
      AuthParameters: {
        USERNAME: body.username,
        PASSWORD: body.password
      }
    });

    const response = await cognitoClient.send(command);
    console.log('Sign-in successful: ', response);

    const idToken = response.AuthenticationResult?.IdToken;
    if (idToken === undefined) {
      return createResponse(500, { message: "Cannot process ID Token." }, origin)
    }
    const decoded: any = jwt.decode(idToken);

    const user = await getItem(
      process.env.USERS_TABLE_NAME as string,
      {
        user_type: process.env.USER_TYPE as string,
        user_id: decoded?.sub
      }
    )

    if (user == null) {
      return createResponse(500, { message: "Cannot fetch User from Users table." }, origin)
    }

    return createResponse(
      200,
      {
        message: "Sign-in successful",
        onboarded: user?.onboarded,
        idToken: response.AuthenticationResult?.IdToken,
        accessToken: response.AuthenticationResult?.AccessToken,
        refreshToken: response.AuthenticationResult?.RefreshToken,
        expiresIn: response.AuthenticationResult?.ExpiresIn,
        tokenType: response.AuthenticationResult?.TokenType
      },
      origin
    );

  } catch (error: any) {
    console.error('Sign-in error: ', error);
    const message = error?.message || "Internal Server Error";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    return createResponse(statusCode, { message }, origin);
  }
};
