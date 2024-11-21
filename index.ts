import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fromEnv } from "@aws-sdk/credential-providers";
import type { Handler } from "aws-lambda";
import path from "path";

const bucket = process.env.S3_BUCKET ?? '';
const client = new S3Client({
    credentials: fromEnv(),
})

const getThisMonth = (): Date => {
    const now = new Date();
    // UTC -> JST
    now.setHours(now.getUTCHours() + 9, 59, 59, 999);
    // 今月末の日付に変更
    now.setMonth(now.getMonth() + 1);
    now.setDate(0);
    return now;
}

export const handler: Handler = async (event, context): Promise<string> => {
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: path.posix.join('delete-candidates', getThisMonth().toISOString().slice(0, 10), 'resources.json'),
    });

    const { Body } = await client.send(command);
    if (Body) {
        console.dir(JSON.parse(await Body.transformToString()), { depth: 3 });
    }

    return context.logStreamName;
}