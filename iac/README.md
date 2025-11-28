# Infrastructure as Code (IaC)

This directory contains the AWS CDK project for deploying the entire application stack.

## Deployment

Before deploying, make sure you have authenticated with your AWS account.

The stack requires VAPID keys for the PWA push notifications. You can generate a new pair using the following command:

```bash
npx web-push generate-vapid-keys
```

Once you have the keys, you can deploy the stack using the `cdk deploy` command, passing the keys as parameters.

**Example Deployment Command:**

```bash
cdk deploy --parameters VapidPublicKey='YOUR_PUBLIC_KEY' --parameters VapidPrivateKey='YOUR_PRIVATE_KEY'
```

You can also provide a `VapidEmail` parameter:

```bash
cdk deploy --parameters VapidPublicKey='...' --parameters VapidPrivateKey='...' --parameters VapidEmail='mailto:your-email@example.com'
```

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
