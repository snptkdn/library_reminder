# Backend API

This directory contains the Hono backend application that runs on AWS Lambda.

## Deployment

This API is not meant to be deployed manually. It is part of a larger project and is deployed via the AWS CDK stack defined in the `../iac` directory.

The CDK stack is responsible for building the TypeScript code, creating the Lambda function, and setting up the API Gateway.
