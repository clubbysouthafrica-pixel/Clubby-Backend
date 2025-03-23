import * as cdk from 'aws-cdk-lib';
import { UserPool, UserPoolClient, AccountRecovery, } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class MSC_Cognito extends UserPool {
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, `${id}-UserPool`, {
      userPoolName: `${id}-UserPool`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
    });

    this.userPoolClient = new UserPoolClient(this, `${id}-UserPoolClient`, {
      userPool: this,
      userPoolClientName: `${id}-UserPoolClient`,
      authFlows: {
        userPassword: true,
      },
      preventUserExistenceErrors: true,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
    });
  }
}