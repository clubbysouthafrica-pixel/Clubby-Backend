import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand
} from "@aws-sdk/client-cognito-identity-provider";
import jwt from 'jsonwebtoken';

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });

const allowedOrigins = [
  "http://localhost:5173"
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
      "Access-Control-Allow-Methods": "OPTIONS,POST",
      "Access-Control-Allow-Headers": "Content-Type,X-Requested-With",
      "Access-Control-Allow-Credentials": "true"
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

    if (idToken) {
      const decoded: any = jwt.decode(idToken);
      console.log("User ID (sub):", decoded?.sub);
      console.log("Email:", decoded?.email);
    }

    return createResponse(
      200,
      {
        message: "Sign-in successful",
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
