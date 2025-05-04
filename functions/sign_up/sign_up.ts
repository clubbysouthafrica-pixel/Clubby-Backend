import {
  CognitoIdentityProviderClient,
  SignUpCommand
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

    if (body?.username == null || body?.password == null || body?.email == null ) {
      return createResponse(400, { message: 'Bad request' }, origin);
    }

    const command = new SignUpCommand({
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: body.username,
      Password: body.password,
      UserAttributes: [
        { Name: 'email', Value: body.email },
      ],
    });

    const response = await cognitoClient.send(command);
    console.log('Signup successful:', response);

    return createResponse(200, { message: "Success" }, origin);
  } catch (error) {
    console.error('Signup error:', error);
    return createResponse(500, { message: error }, origin);
  }
};
