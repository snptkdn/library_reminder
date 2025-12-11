import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { cors } from 'hono/cors';
import { jwt, sign } from 'hono/jwt';
import type { JwtVariables } from 'hono/jwt';
import { setCookie, deleteCookie } from 'hono/cookie';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, BatchWriteCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { compareSync, hashSync } from 'bcryptjs';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import * as webpush from 'web-push';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

type Variables = JwtVariables & {
    user: {
        id: string;
    }
}

const app = new Hono<{ Variables: Variables }>();
const logger = pino();

// --- CORS Middleware ---

// --- Hardcoded Credentials & Config ---
const USERNAME = 'user';
const PASSWORD_HASH = hashSync('password', 10);
const JWT_SECRET = process.env.JWT_SECRET;
// VAPID keys must be provided as environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set as environment variables.');
}

webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// --- AWS Clients ---
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const bedrockClient = new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION || 'us-east-1' });
const booksTableName = process.env.BOOKS_TABLE_NAME!;
const subscriptionTableName = process.env.SUBSCRIPTION_TABLE_NAME!;

// --- Zod Schemas ---
const loginSchema = z.object({ username: z.string(), password: z.string() });
const subscriptionSchema = z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

const bedrockResponseSchema = z.object({
    content: z.array(z.object({
        text: z.string()
    })).min(1)
});

// --- API Routes ---

app.get('/', (c) => c.text('Hello! The API is running.'));

app.post('/login', zValidator('json', loginSchema), async (c) => {
    const { username, password } = c.req.valid('json');

    if (username !== USERNAME || !compareSync(password, PASSWORD_HASH)) {
        return c.json({ success: false, message: 'Invalid credentials' }, 401);
    }

    // --- JWT Generation ---
    const payload = {
        sub: 'defaultUser', // subject
        iat: Math.floor(Date.now() / 1000), // issued at
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // expires in 7 days
    };

    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET is not set');
    }
    const token = await sign(payload, JWT_SECRET);

    // --- Set Cookie ---
    setCookie(c, 'token', token, {
        path: '/',
        httpOnly: true,
        secure: true, // Only send over HTTPS
        sameSite: 'None', // Required for cross-site requests
        maxAge: 60 * 60 * 24 * 7, // 1 week
    });


    return c.json({ success: true, message: 'Logged in' });
});

app.post('/logout', (c) => {
    deleteCookie(c, 'token');
    return c.json({ success: true });
});

// --- Authenticated Routes ---

// JWT Middleware
app.use('/api/*', async (c, next) => {
    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET is not set');
    }
    const middleware = jwt({
        secret: JWT_SECRET,
        cookie: 'token',
    });
    return middleware(c, next);
});

// Add user to context
app.use('/api/*', async (c, next) => {
    const payload = c.get('jwtPayload');
    if (payload && payload.sub) {
        c.set('user', { id: payload.sub });
    }
    await next();
});


app.get('/api/me', (c) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ user: null }, 404);
    }
    return c.json({ user });
});

app.get('/api/books', async (c) => {
    const user = c.get('user');
    const command = new ScanCommand({ TableName: booksTableName, FilterExpression: "userId = :userId", ExpressionAttributeValues: { ":userId": user.id } });
    const { Items } = await docClient.send(command);
    return c.json(Items);
});

app.delete('/api/books/:bookId', async (c) => {
    const user = c.get('user');
    const { bookId } = c.req.param();
    const command = new DeleteCommand({
        TableName: booksTableName,
        Key: {
            userId: user.id,
            bookId: bookId,
        },
    });
    await docClient.send(command);
    return c.json({ success: true });
});

app.post('/api/subscribe', zValidator('json', subscriptionSchema), async (c) => {
    const user = c.get('user');
    const subscription = c.req.valid('json');
    const command = new PutCommand({
        TableName: subscriptionTableName,
        Item: { userId: user.id, subscription },
    });
    await docClient.send(command);
    return c.json({ success: true }, 201);
});

app.post('/api/upload', async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const imageBase64 = body.image; // Assuming image is sent as a base64 encoded string

    const prompt = `This is an image of a library lending list. Extract all book information and output it in the following JSON format.
    IMPORTANT: Output ONLY the raw JSON string. Do NOT wrap it in markdown code blocks (like \`\`\`json). Do not add any conversational text.
    {
      "books": [
        {
          "title": "Book Title",
          "lending_date": "YYYY-MM-DD",
          "due_date": "YYYY-MM-DD"
        }
      ]
    }`;

    const bedrockCommand = new InvokeModelCommand({
        modelId: process.env.BEDROCK_MODEL_ID!, // Use environment variable for Model ID / Inference Profile ARN
        contentType: 'application/json',
        body: JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 2000,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
                    { type: 'text', text: prompt }
                ]
            }]
        }),
    });

    try {
        const response = await bedrockClient.send(bedrockCommand);
        const responseBody = new TextDecoder().decode(response.body);
        logger.info({ bedrockResponse: responseBody }, 'Received response from Bedrock');

        const parsedBedrockResponse = bedrockResponseSchema.parse(JSON.parse(responseBody));
        let jsonString = parsedBedrockResponse.content[0].text;

        // Extract the JSON part from the markdown-like response
        const match = jsonString.match(/{[\s\S]*}/);
        if (!match) {
            throw new Error("Could not find a valid JSON object in the Bedrock response.");
        }
        const extractedJson = match[0];

        const parsedResult = JSON.parse(extractedJson);
        logger.info({ parsedResult }, 'Parsed Bedrock response');

        if (!parsedResult.books || !Array.isArray(parsedResult.books)) {
            throw new Error("Invalid format from Bedrock");
        }

        const putRequests = parsedResult.books.map(book => ({
            PutRequest: {
                Item: {
                    userId: user.id,
                    bookId: uuidv4(),
                    title: book.title,
                    lendingDate: book.lending_date,
                    dueDate: book.due_date,
                },
            },
        }));

        if (putRequests.length > 0) {
            const batchWriteCommand = new BatchWriteCommand({
                RequestItems: { [booksTableName]: putRequests },
            });
            await docClient.send(batchWriteCommand);
        }

        return c.json({ success: true, count: putRequests.length });

    } catch (error) {
        logger.error(error, 'Error processing image with Bedrock or saving to DynamoDB');
        return c.json({ error: 'Failed to process image' }, 500);
    }
});


// This function will be triggered by EventBridge
const handleScheduledNotification = async () => {
    logger.info('Running scheduled notification check...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const tomorrowStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

    try {
        // Find books due today or tomorrow
        const booksCommand = new ScanCommand({
            TableName: booksTableName,
            FilterExpression: 'dueDate = :today or dueDate = :tomorrow',
            ExpressionAttributeValues: { ':today': todayStr, ':tomorrow': tomorrowStr },
        });
        const { Items: booksToNotify } = await docClient.send(booksCommand);

        if (!booksToNotify || booksToNotify.length === 0) {
            logger.info('No books due for notification.');
            return;
        }

        // Get the user's push subscription using a more efficient GetCommand
        const getSubCommand = new GetCommand({
            TableName: subscriptionTableName,
            Key: { userId: 'defaultUser' },
        });
        const { Item: subscriptionItem } = await docClient.send(getSubCommand);

        if (!subscriptionItem || !subscriptionItem.subscription) {
            logger.info('User has not subscribed for notifications or subscription is invalid.');
            return;
        }
        const subscription = subscriptionItem.subscription;

        for (const book of booksToNotify) {
            const notificationPayload = JSON.stringify({
                title: 'Book Return Reminder',
                body: `Your book "${book.title}" is due on ${book.dueDate}.`,
            });
            await webpush.sendNotification(subscription, notificationPayload);
            logger.info({ book: { title: book.title, dueDate: book.dueDate } }, 'Sent book return reminder');
        }
    } catch (error) {
        logger.error(error, 'Error sending notifications');
    }
};

// Extend the handler to check for EventBridge events
export const handler = async (event, context) => {
    if (event.source === 'morning_schedule') {
        await handleScheduledNotification();
        return { statusCode: 200, body: 'Scheduled task executed.' };
    }
    // Otherwise, handle as an API Gateway request
    return handle(app)(event, context);
};
