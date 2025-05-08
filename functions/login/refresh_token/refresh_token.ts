import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand
} from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });

const allowedOrigins = [
  "https://localhost:3000"
];

const createResponse = (statusCode: number, data: object, origin: string) => {
  const allowOrigin = allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0];

  const response = {
    statusCode: statusCode,
    body: JSON.stringify(data),
    headers: {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET,POST",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  };
  console.log(`RESPONSE @ ${new Date()}: `, response);
  return response;
};

export const handler = async (event: any) => {
  console.log(`EVENT @ ${new Date()}: `, event);
  const origin = event.headers.origin;
  console.log(`Called by origin: ${origin}`)

  try {
    const body = JSON.parse(event.body);

    if (body?.refreshToken == null) {
      return createResponse(400, { message: 'Refresh token required.' }, origin);
    }

    const command = new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: process.env.USER_POOL_CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: body.refreshToken,
      }
    });

    const response = await cognitoClient.send(command);
    console.log('Refresh successful: ', response);

    return createResponse(
      200,
      {
        message: "Refresh successful",
        accessToken: response.AuthenticationResult?.AccessToken,
        idToken: response.AuthenticationResult?.IdToken,
        expiresIn: response.AuthenticationResult?.ExpiresIn,
      },
      origin
    );

  } catch (error: any) {
    console.error('Refresh error: ', error);
    const message = error?.message || "Internal Server Error";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    return createResponse(statusCode, { message }, origin);
  }
};
