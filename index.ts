import { DescribeInstancesCommand, DescribeTagsCommand, EC2Client } from "@aws-sdk/client-ec2";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fromEnv } from "@aws-sdk/credential-providers";
import type { Handler } from "aws-lambda";
import type { Resource } from "@aws-sdk/client-resource-explorer-2";
import path from "path";
import { ignoreTags } from "./constants";
import { send_message } from "./utility";

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

export const handler: Handler = async (event, context): Promise<string> => {
    const { skipNotify } = event;

    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: path.posix.join('delete-candidates', getThisMonth().toISOString().slice(0, 10), 'EC2 Instance', 'resources.json'),
    });

    const { Body } = await s3Client.send(command);
    if (Body) {
        const json: ResourceDict = JSON.parse(await Body.transformToString());

        const ec2message = await ec2list(json);
        console.log(ec2message);
        if (!skipNotify) {
            await send_message(ec2message);
        }
    }

    return context.logStreamName;
}

const ec2list = async (json: ResourceDict): Promise<string> => {
    let message = '';
    let empty_tag_list = '# タグ無し削除\n';
    let remove_list = '# 月末削除\n';
    let over_list = '# 期限超過削除\n';
    let error_list = '# エラー日付削除\n';

    let removeIds: { [K: string]: string[] } = {};

    // タグ無し削除
    for (const r of json.emptyTag.sort((a, b) => (a.Region ?? '') >= (b.Region ?? '') ? 1 : -1)) {
        const region: string = r.Region ?? '';
        let id: string = r.Arn ?? '';
        // arnの末尾`i-[0-9a-z]{8,17}`を取得
        const match = id.match(/i-[0-9a-z]{8,17}$/);
        if (match) id = match[0];
        
        if (!removeIds[region]) removeIds[region] = [];
        removeIds[region].push(id);
    }

    for (const entries of Object.entries(removeIds)) {
        const region = entries[0];
        const command = new DescribeInstancesCommand({
        "InstanceIds": [...entries[1]],
        });
        const ec2Client = new EC2Client({
            credentials: fromEnv(),
            region: region,
        });
        try {
            const res = await ec2Client.send(command);
            res.Reservations?.forEach(r =>
                r.Instances?.forEach(i => {
                    const tags = i.Tags;
                    // Nameタグのみのリソース
                    if (tags?.every(t => ignoreTags.includes(t?.Key ?? ''))) {
                        const id = i.InstanceId ?? '';
                        const name = tags.find(t => t?.Key === 'Name')?.Value ?? '';
                        empty_tag_list += 
`  削除:
- instance-id: ${id}
  - Name: ${name}
  - Region: ${region}\n`;
                    }
                })
            );
        } catch (error) {
            if ((error as any).errorType === 'InvalidInstanceID.NotFound') {
                empty_tag_list += 
`  削除済\n`;
            } else {
                console.error(error);
            }
        };
    }

    message += empty_tag_list;
    removeIds = {};

    // 月末削除
    remove_list += '  todo: 月末削除の処理を追加\n';
    message += remove_list;
    removeIds = {};

    // 期限超過削除
    over_list += '  todo: 期限超過削除の処理を追加\n';
    message += over_list;
    removeIds = {};

    // エラー日付削除
    error_list += '  todo: エラー日付削除の処理を追加\n';
    message += error_list;


    return message;
}