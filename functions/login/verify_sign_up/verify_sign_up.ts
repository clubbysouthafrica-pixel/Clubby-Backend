import {
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand
} from "@aws-sdk/client-cognito-identity-provider";

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
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
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
