import { DescribeInstancesCommand, DescribeTagsCommand, EC2Client } from "@aws-sdk/client-ec2";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fromEnv } from "@aws-sdk/credential-providers";
import type { Handler } from "aws-lambda";
import type { Resource } from "@aws-sdk/client-resource-explorer-2";
import path from "path";

type ResourceDict = {
    emptyTag: Resource[], // Nameタグのみのリソース
    remove: Resource[], // yyyyMM形式のタグが含まれているリソース
    over: Resource[], // yyyyMM形式のタグが含まれており、かつそのタグが現在の月よりも前のリソース
    error: Resource[], // 存在しない日付タグがついたリソース
}

const bucket = process.env.S3_BUCKET ?? '';
const s3Client = new S3Client({
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

const ec2Clients: { [K: string]: EC2Client } = {};

export const handler: Handler = async (event, context): Promise<string> => {
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: path.posix.join('delete-candidates', getThisMonth().toISOString().slice(0, 10), 'EC2 Instance', 'resources.json'),
    });

    const { Body } = await s3Client.send(command);
    if (Body) {
        const json: ResourceDict = JSON.parse(await Body.transformToString());
        let empty_tag_list = '';
        for (const r of json.emptyTag) {
            const region: string = r.Region ?? '';
            const name: string = r.Properties?.flatMap(p => (p.Data as { [K: string]: string }[])).find(d => d.Key === 'Name')?.Value ?? '';
            let id: string = r.Arn ?? '';
            // arnの末尾`i-[0-9a-z]{8,17}`を取得
            const match = id.match(/i-[0-9a-z]{8,17}$/);
            if (match) id = match[0];

            const command = new DescribeInstancesCommand({
            "InstanceIds": [id]
            });
            const ec2Client = ec2Clients[region] ?? (ec2Clients[region] = new EC2Client({
                credentials: fromEnv(),
                region: region,
            }));
            try {
                const res = await ec2Client.send(command);
                const tags = res.Reservations?.flatMap(r =>
                    r.Instances?.flatMap(i => i.Tags));
                if (tags?.every(t => t?.Key === 'Name')) {
                    empty_tag_list += 
`  削除:
    - instance-id: ${id}
      - Name: ${name}
      - Region: ${region}\n`;
                }
            } catch (error) {
                if ((error as any).errorType === 'InvalidInstanceID.NotFound') {
                empty_tag_list += 
`  削除済:
    - instance-id: ${id}
      - Name: ${name}\n`;
                } else {
                    console.error(error);
                }
            }
        }
        console.log(`
# タグ無し削除候補
${empty_tag_list}`);
    }

    return context.logStreamName;
}