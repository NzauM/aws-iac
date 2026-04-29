import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

export class CapstoneStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Define SSM parameter for greeting config
    const configParam = new ssm.StringParameter(this, 'GreetingParameter', {
      parameterName: '/app/config/greeting',
      stringValue: 'Hello, Welcome to Capstone!, Update during build',
      description: 'Greeting message for the application',
    });

    const lambdaFunction = new lambda.Function(this, 'ReadConfigFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      description:"A Lambda function to read SSM parameters",
      code: lambda.Code.fromInline(`
        const  {SSMClient, GetParameterCommand} = require('@aws-sdk/client-ssm')
        
        exports.handler = async (event) => {
          const client = new SSMClient({ region: process.env.AWS_REGION });
          const command = new GetParameterCommand({ Name: '/app/config/greeting' });
          const response = await client.send(command);
          console.log('The greeting is: ',response.Parameter.Value)
          return { greeting: response.Parameter.Value };
        };
      `),
    });


    lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [configParam.parameterArn],
    }));

    const invokeTask = new tasks.LambdaInvoke(this, 'LambdaFnInvoker', {
      lambdaFunction,
      outputPath:'$.Payload',
    });


    const errorHandler = new sfn.Pass(this, 'ErrorHandler', {
      result: sfn.Result.fromObject({ error: 'Lambda invocation failed' }),
      resultPath: '$.errorInfo',
    });

    invokeTask.addCatch(errorHandler, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    const successState = new sfn.Succeed(this, 'SuccessState');

    const definition = invokeTask.next(successState);

    new sfn.StateMachine(this, 'CapstoneStateMachine', {
      definition,
      stateMachineName: 'CapstoneStateMachine',
    });

    
  }
}
