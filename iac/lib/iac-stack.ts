import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as iam from 'aws-cdk-lib/aws-iam';

export class IacStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Stack Parameters for Secrets ---
    const vapidPublicKey = new cdk.CfnParameter(this, 'VapidPublicKey', {
      type: 'String',
      description: 'The VAPID public key for web push notifications.',
      noEcho: true,
    });

    const vapidPrivateKey = new cdk.CfnParameter(this, 'VapidPrivateKey', {
      type: 'String',
      description: 'The VAPID private key for web push notifications.',
      noEcho: true,
    });

    const vapidEmail = new cdk.CfnParameter(this, 'VapidEmail', {
      type: 'String',
      description: 'The email address for VAPID (mailto:).',
      default: 'mailto:admin@example.com'
    });

    // --- Frontend Hosting (Secure Pattern) ---

    // S3 Bucket to host the static React app (kept private)
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // This is the default, but explicit is better
    });

    // CloudFront Origin Access Identity to allow CloudFront to securely access the S3 bucket
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity');
    siteBucket.grantRead(originAccessIdentity);

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket, { originAccessIdentity }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
    });

    // --- Backend API ---

    // DynamoDB Table for books
    const booksTable = new dynamodb.Table(this, 'BooksTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'bookId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // DynamoDB Table for Push Subscription
    const subscriptionTable = new dynamodb.Table(this, 'SubscriptionTable', {
        partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda Function for the Hono backend
    const backendFunction = new NodejsFunction(this, 'BackendFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      entry: path.join(__dirname, '../../backend/src/index.ts'),
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        BOOKS_TABLE_NAME: booksTable.tableName,
        SUBSCRIPTION_TABLE_NAME: subscriptionTable.tableName,
        VAPID_PUBLIC_KEY: vapidPublicKey.valueAsString,
        VAPID_PRIVATE_KEY: vapidPrivateKey.valueAsString,
        BEDROCK_REGION: this.region, // Pass the stack's region to the Lambda
        VAPID_EMAIL: vapidEmail.valueAsString,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Grant Lambda permissions to access DynamoDB tables
    booksTable.grantReadWriteData(backendFunction);
    subscriptionTable.grantReadWriteData(backendFunction);

    // Grant Lambda permissions to invoke Bedrock
    backendFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'], // For production, scope this down to the specific model ARN
    }));

    // API Gateway (HTTP API)
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowHeaders: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowOrigins: [`https://${distribution.distributionDomainName}`], // Restrict to CloudFront URL
      },
    });

    const integration = new HttpLambdaIntegration('LambdaIntegration', backendFunction);

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration,
    });

    // --- Notification Scheduler ---

    // IAM Role for the Scheduler to invoke the Lambda function
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
        assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });

    backendFunction.grantInvoke(schedulerRole); // Grant invoke permission to the role

    // EventBridge Scheduler to trigger notifications
    new scheduler.CfnSchedule(this, 'MorningSchedule', {
        flexibleTimeWindow: { mode: 'OFF' },
        scheduleExpression: 'cron(0 9 * * ? *)', // 9:00 AM
        scheduleExpressionTimezone: 'Asia/Tokyo',
        target: {
            arn: backendFunction.functionArn,
            roleArn: schedulerRole.roleArn,
            input: JSON.stringify({ source: 'morning_schedule' }),
        },
    });
    new scheduler.CfnSchedule(this, 'EveningSchedule', {
        flexibleTimeWindow: { mode: 'OFF' },
        scheduleExpression: 'cron(0 7 * * ? *)', // 7:00 AM
        scheduleExpressionTimezone: 'Asia/Tokyo',
        target: {
            arn: backendFunction.functionArn,
            roleArn: schedulerRole.roleArn,
            input: JSON.stringify({ source: 'evening_schedule' }),
        },
    });


    // --- Outputs ---
    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'ApiUrl', {
        value: httpApi.url!,
    });
  }
}
