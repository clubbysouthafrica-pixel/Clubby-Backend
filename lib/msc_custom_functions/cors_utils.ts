import { LambdaIntegration, MethodOptions, PassthroughBehavior, MockIntegration, AuthorizationType } from "aws-cdk-lib/aws-apigateway";
import { MSC_Lambda } from "../msc_service_constructs/msc_lambda";

export function addCorsEnabledMethod(
  resource: any,
  lambda: MSC_Lambda,
  methodOptions: MethodOptions,
  origin = `${process.env.ALLOWED_ORIGIN}`,
  method = 'POST'
) {
  const integration = new LambdaIntegration(lambda, {
    integrationResponses: ['200', '400', '500'].map((statusCode) => ({
      statusCode,
      responseParameters: {
        'method.response.header.Access-Control-Allow-Origin': `'${origin}'`,
        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,Authorization'",
        'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,POST,GET,PUT,DELETE'",
        'method.response.header.Access-Control-Allow-Credentials': "'true'",
      },
    })),
  });

  const methodResponses = ['200', '400', '500'].map((statusCode) => ({
    statusCode,
    responseParameters: {
      'method.response.header.Access-Control-Allow-Origin': true,
      'method.response.header.Access-Control-Allow-Headers': true,
      'method.response.header.Access-Control-Allow-Methods': true,
      'method.response.header.Access-Control-Allow-Credentials': true,
    },
  }));

  resource.addMethod(method, integration, {
    ...methodOptions,
    methodResponses,
  });

  addCorsOptions(resource, origin);
}

export function addCorsOptions(resource: any, origin = `${process.env.ALLOWED_ORIGIN}`) {
  resource.addMethod(
    'OPTIONS',
    new MockIntegration({
      integrationResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Headers':
              "'Content-Type,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,Authorization'",
            'method.response.header.Access-Control-Allow-Origin': `'${origin}'`,
            'method.response.header.Access-Control-Allow-Credentials': "'true'",
            'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,POST,GET,PUT,DELETE'",
          },
        },
      ],
      passthroughBehavior: PassthroughBehavior.NEVER,
      requestTemplates: {
        'application/json': '{"statusCode": 200}',
      },
    }),
    {
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
      ],
    }
  );
}
